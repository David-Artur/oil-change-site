/* Голосовой чат «рядом» (У236) — вкладка «Голос» личного кабинета DaviArt Craft.
 * Сервер (VPLand /api/voice) говорит, кто из подключённых рядом в игре и на каком расстоянии, и передаёт «рукопожатия» WebRTC.
 * Звук идёт напрямую между браузерами (Opus), громкость каждого собеседника — по расстоянию в игре. Ничего не записывается.
 * Подключение: window.VPVoice.mount(элемент, {api: fn(path, body) → Promise<json>, toast: fn(msg, bad)}). */
(function () {
  "use strict";
  var POLL_MS = 400, GONE_MS = 60000, NEAR = 4, STUCK_MS = 90000;   // 2026-10-18: телефон/VPN шлёт опросы пачками раз в 25–30 с — терпеливее
  var box = null, opt = null;
  var on = false, pollT = null, myName = "", range = 100, iceServers = [{urls: "stun:stun.l.google.com:19302"}];
  var ctx = null, local = null, analyser = null, speaking = false, micOn = true, ptt = false, pttDown = false;
  var peers = {};      // ник → {pc, gain, el, d, seen, speaking, muted, pending: [ICE], made}
  var lastState = null, wakeLock = null;
  // У240: понятный статус связи и проверка «меня слышно?»
  var FAIL_MS = 60000, GAP_MS = 8000;
  var joinedAt = 0, lastOk = 0, rtts = [], badAt = 0, badLen = 0, checking = false, micPeak = -1, reportHtml = "";
  var HINT = 'Не подключается или долго «соединяюсь»? У некоторых операторов и в некоторых странах такая связь блокируется — <b>попробуй включить VPN</b>.';

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  function $(id) { return document.getElementById(id); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem("daviart.voice." + k); localStorage.setItem("daviart.voice." + k, v); } catch (e) { return null; } }

  function mount(el, o) {
    box = el; opt = o;
    ptt = store("ptt") === "1";
    draw();
  }

  function draw() {
    if (!box) return;
    var compact = opt && opt.compact;   // «Главная» (home.js): коротко
    var h = '<div class="card cab-card vc-card' + (compact ? " vc-compact" : "") + (on ? " vc-on" : "") + '"><h2>🎤 Голосовой чат</h2>';
    if (!on) {
      h += (compact ? '<p class="cab-meta">Говори с теми, кто рядом в игре (до ' + range + ' бл.). У подключённых — 🎤 над головой.</p>'
          : '<p class="cab-meta">Говори с игроками, которые <b>рядом с тобой в игре</b> и тоже подключились (у них <b>🎤 над головой</b>). ' +
            'Чем дальше — тем тише, дальше ' + range + ' блоков и в другом мире — не слышно. Ничего не записывается.</p>') +
        '<div class="cab-row"><button class="btn green' + (compact ? " vc-big" : "") + '" type="button" id="vc-join">🎤 Подключиться к голосу</button></div>' +
        '<p class="cab-meta" id="vc-msg">Браузер спросит разрешение на микрофон — нажми «Разрешить». Лучше в наушниках.</p>' +
        '<p class="vc-hint">' + HINT + '</p>';
    } else {
      // 2026-10-18 (владелец): компактно и без «дрыганья» — подписи не меняются при разговоре, всё фиксированной ширины/высоты
      h += '<div class="vc-bar"><span class="vc-dot"></span><span class="vc-where" id="vc-where"></span></div>' +
        '<div class="vc-health wait" id="vc-health">⏳ Подключаюсь к серверу…</div>' +
        '<div class="vc-row">' +
        '<button class="vc-ib" type="button" id="vc-mic"></button>' +
        '<div class="vc-meter" id="vc-meter"><i id="vc-level"></i></div>' +
        '<button class="vc-chip" type="button" id="vc-mode"></button>' +
        '<button class="vc-chip" type="button" id="vc-leave" title="Отключиться от голоса">Выйти</button></div>' +
        '<button class="btn gold vc-ptt" type="button" id="vc-ptt"' + (ptt ? "" : " hidden") + '>Держи — и говори</button>' +
        '<div id="vc-peers" class="vc-peers"></div>' +
        '<div class="vc-tools"><button class="vc-chip vc-check" type="button" id="vc-check" title="Проверить сервер, ретранслятор голоса и микрофон">🔧 Проверить связь</button></div>' +
        '<div class="vc-report" id="vc-report"' + (reportHtml ? "" : " hidden") + '>' + reportHtml + '</div>' +
        '<p class="vc-hint">' + HINT + '</p>';
    }
    box.innerHTML = h + "</div>";
    if (!on) { $("vc-join").onclick = join; return; }
    $("vc-check").onclick = check;
    $("vc-mic").onclick = function () { micOn = !micOn; applyMic(); ctl(); };
    $("vc-mode").onclick = function () { ptt = !ptt; store("ptt", ptt ? "1" : "0"); applyMic(); ctl(); };
    $("vc-leave").onclick = function () { leave(true); };
    var b = $("vc-ptt");
    var down = function (e) { e.preventDefault(); pttDown = true; applyMic(); b.classList.add("on"); };
    var up = function (e) { e.preventDefault(); pttDown = false; applyMic(); b.classList.remove("on"); };
    b.addEventListener("pointerdown", down); b.addEventListener("pointerup", up); b.addEventListener("pointerleave", up); b.addEventListener("pointercancel", up);
    peersHtml = null;
    ctl(); status(); drawPeers(); health();
  }

  // кнопки — меняем только их вид, без перерисовки панели
  function ctl() {
    var m = $("vc-mic"), md = $("vc-mode"), pb = $("vc-ptt");
    if (!m) return;
    m.textContent = micOn ? "🎤" : "🔇"; m.classList.toggle("off", !micOn); m.title = micOn ? "Микрофон включён — нажми, чтобы выключить" : "Микрофон выключен — нажми, чтобы включить";
    md.textContent = ptt ? "Рация" : "Всегда"; md.title = ptt ? "Говоришь, пока держишь кнопку (нажми — говорить всегда)" : "Микрофон слушает всегда (нажми — режим рации)";
    pb.hidden = !ptt;
  }

  function status() {
    var w = $("vc-where"), d = box && box.querySelector(".vc-dot");
    if (!w) return;
    var t = where();
    if (w.textContent !== t) w.textContent = t;
    if (d) d.className = "vc-dot" + (lastState && lastState.inGame ? " on" : "");
  }

  function where() {
    if (!lastState) return "Подключаюсь…";
    if (!lastState.inGame) return "Не в игре — зайди на daviart.com";
    return (lastState.world || "В игре") + " · в голосе: " + (lastState.connected || 0);
  }

  var peersHtml = null;
  function drawPeers() {
    var el = $("vc-peers");
    if (!el) return;
    var names = Object.keys(peers).filter(function (n) { return peers[n].d != null; }).sort(function (a, b) { return peers[a].d - peers[b].d; });
    var others = (lastState && lastState.others) || [];   // рядом в игре, но голос не подключили
    var h;
    if (!names.length && !others.length) h = '<p class="cab-meta vc-empty">Рядом в игре никого.</p>';
    else h = names.map(function (n) {
      var p = peers[n], st = p.pc ? p.pc.connectionState : "new";
      var wait = p.waitFrom ? Math.floor((Date.now() - p.waitFrom) / 5000) * 5 : 0;   // шагом 5 с — строка не мигает каждую секунду
      var link = st === "connected" ? "🟢 связь есть" : wait * 1000 >= FAIL_MS ? "❌ нет связи — VPN?" : "⏳ соединяюсь" + (wait >= 5 ? " " + wait + " с" : "");
      return '<div class="vc-peer' + (p.speaking ? " talk" : "") + '"><span class="vc-ico">🎤</span><b>' + esc(n) + '</b>' +
        '<span class="vc-pm">' + Math.round(p.d) + " бл. · " + link + "</span>" +
        '<button class="vc-chip vc-mute" type="button" data-mute="' + esc(n) + '" title="' + (p.muted ? "Не слышишь его — нажми, чтобы слышать" : "Нажми, чтобы не слышать") + '">' + (p.muted ? "🔇" : "🔊") + "</button></div>";
    }).join("") + others.slice().sort(function (a, b) { return a.d - b.d; }).map(function (o) {
      return '<div class="vc-peer off"><span class="vc-ico">🔇</span><b>' + esc(o.name) + '</b><span class="vc-pm">' + Math.round(o.d) + " бл. · без голоса</span></div>";
    }).join("");
    if (h === peersHtml) return;   // ничего не изменилось — не трогаем (не «дрыгается»)
    peersHtml = h;
    el.innerHTML = h;
    Array.prototype.forEach.call(el.querySelectorAll("[data-mute]"), function (b) {
      b.onclick = function () { var p = peers[b.getAttribute("data-mute")]; if (p) { p.muted = !p.muted; volume(p); drawPeers(); } };
    });
  }

  // ---------------------------------------------------------------- подключение
  function join() {
    var m = $("vc-msg");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.RTCPeerConnection) {
      m.textContent = "Этот браузер не умеет голосовой чат. Открой кабинет в Chrome, Safari или Firefox."; return;
    }
    m.textContent = "Жду разрешение на микрофон…";
    var AC = window.AudioContext || window.webkitAudioContext;
    ctx = AC ? new AC() : null;   // создаём по нажатию — иначе телефон не даст играть звук
    navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}}).then(function (s) {
      local = s;
      if (ctx) {
        try { ctx.resume(); } catch (e) { }
        analyser = ctx.createAnalyser(); analyser.fftSize = 512;
        ctx.createMediaStreamSource(local).connect(analyser);
      }
      on = true; lastState = null;
      joinedAt = Date.now(); lastOk = 0; rtts = []; badAt = 0; reportHtml = "";
      applyMic();
      try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (w) { wakeLock = w; }).catch(function () { }); } catch (e) { }
      draw();
      startTicker();
      meter();
    }).catch(function () {
      m.textContent = "Нет доступа к микрофону. Разреши его в настройках браузера для daviart.com и нажми ещё раз.";
    });
  }

  function leave(tell) {
    on = false;
    stopTicker(); polling = false; checking = false; micPeak = -1;
    Object.keys(peers).forEach(drop);
    if (local) local.getTracks().forEach(function (t) { t.stop(); });
    local = null;
    if (ctx) { try { ctx.close(); } catch (e) { } ctx = null; }
    if (wakeLock) { try { wakeLock.release(); } catch (e) { } wakeLock = null; }
    if (tell) opt.api("/voice", {action: "leave"});
    draw();
  }

  function applyMic() {
    if (!local) return;
    var en = micOn && (!ptt || pttDown);
    local.getAudioTracks().forEach(function (t) { t.enabled = en; });
  }

  // уровень своего голоса: полоска + «говорю» (сервер зажигает 🎤 зелёным над головой)
  function meter() {
    if (!on) return;
    var lvl = 0;
    if (analyser) {
      var a = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(a);
      var sum = 0;
      for (var i = 0; i < a.length; i++) { var v = (a[i] - 128) / 128; sum += v * v; }
      lvl = Math.sqrt(sum / a.length);
    }
    var live = micOn && (!ptt || pttDown);
    speaking = live && lvl > 0.035;
    if (micPeak >= 0 && live) micPeak = Math.max(micPeak, lvl);   // идёт проверка микрофона
    var bar = $("vc-level"), mt = $("vc-meter");
    if (bar) bar.style.transform = "scaleX(" + (live ? Math.min(1, lvl * 4) : 0).toFixed(3) + ")";   // без смены ширины блока — ничего не сдвигается
    if (mt && mt.classList.contains("talk") !== speaking) mt.classList.toggle("talk", speaking);
    requestAnimationFrame(meter);
  }

  // ---------------------------------------------------------------- опрос сервера
  // 2026-10-18: опрос по тикам фонового Web Worker — в свёрнутой вкладке/на фоне браузер почти не замедляет его (обычный setTimeout — до раза в минуту)
  var ticker = null, polling = false, lastPoll = 0;
  function startTicker() {
    stopTicker();
    try {
      var src = "setInterval(function(){postMessage(1)}," + POLL_MS + ")";
      ticker = new Worker(URL.createObjectURL(new Blob([src], {type: "text/javascript"})));
      ticker.onmessage = tickPoll;
    } catch (e) { ticker = setInterval(tickPoll, POLL_MS); }
    tickPoll();
  }
  function stopTicker() {
    if (!ticker) return;
    if (ticker.terminate) ticker.terminate(); else clearInterval(ticker);
    ticker = null;
  }
  function tickPoll() {
    if (!on) return;
    health();   // и когда ответ завис — строка статуса покажет, сколько секунд нет связи
    if (polling && Date.now() - lastPoll < 15000) return;   // ответ ещё не пришёл (повис — через 15 с пробуем снова)
    polling = true; lastPoll = Date.now();
    poll();
  }

  function poll() {
    if (!on) return;
    var t0 = Date.now();
    opt.api("/voice", {action: "poll", speaking: speaking}).then(function (j) {
      if (!on) return;
      if (j && !j.offline) {   // сервер ответил (даже ошибкой) — связь до него есть
        var tn = Date.now(), prev = lastOk || joinedAt;
        if (tn - prev > GAP_MS) { badAt = tn; badLen = tn - prev; }   // был обрыв: запомнить на минуту
        lastOk = tn;
        rtts.push(tn - t0); if (rtts.length > 10) rtts.shift();
      }
      if (!j || !j.ok) {
        if (j && j.offline) { lastState = {inGame: false, connected: 0}; var w = $("vc-where"); if (w) w.textContent = "Сервер не отвечает — переподключаюсь…"; }
        else if (j && (j.status === 401 || /закрыт|выключен/.test(j.message || ""))) { opt.toast(j.message || "Голосовой чат недоступен.", true); leave(false); return; }
        else { var w3 = $("vc-where"); if (w3) w3.textContent = "Переподключаюсь…"; }   // разовая ошибка сервера — не выкидываем из голоса
      } else {
        var first = !lastState;
        lastState = j; myName = j.me; range = j.range || range;
        if (j.ice && j.ice.length) iceServers = j.ice;
        (j.signals || []).forEach(onSignal);
        var now = Date.now();
        (j.peers || []).forEach(function (pe) {
          var p = peers[pe.name] || (peers[pe.name] = {pending: [], muted: false});
          p.d = pe.d; p.seen = now; p.speaking = pe.speaking;
          if (pe.sid && p.sid && pe.sid !== p.sid && p.pc) closePc(p);   // собеседник переподключился — старое соединение мёртвое
          if (pe.sid) p.sid = pe.sid;
          if (p.pc && p.pc.connectionState !== "connected" && p.made && now - p.made > STUCK_MS) closePc(p);   // «соединяюсь» дольше 90 с — заново
          if (!p.pc && myName < pe.name) call(pe.name);   // звонит тот, чей ник «меньше» — без встречных звонков
          if (p.pc && p.pc.connectionState === "connected") p.waitFrom = 0; else if (!p.waitFrom) p.waitFrom = now;
          volume(p);
        });
        Object.keys(peers).forEach(function (n) { if (now - (peers[n].seen || 0) > GONE_MS) drop(n); });
        if (first) draw(); else { status(); drawPeers(); }
      }
      polling = false;
    });
  }

  // ---------------------------------------------------------------- У240: статус связи одной строкой
  function health() {
    var el = $("vc-health");
    if (!el) return;
    var now = Date.now(), gap = now - (lastOk || joinedAt), t, cls;
    var failed = [], linked = 0;
    Object.keys(peers).forEach(function (n) {
      var p = peers[n];
      if (p.pc && p.pc.connectionState === "connected") linked++;
      else if (p.waitFrom && now - p.waitFrom >= FAIL_MS) failed.push(n);
    });
    var avg = rtts.length ? rtts.reduce(function (a, b) { return a + b; }, 0) / rtts.length : 0;
    if (!lastOk && gap < 10000) { t = "⏳ Подключаюсь к серверу…"; cls = "wait"; }
    else if (gap > GAP_MS) {
      t = "⚠ Нет ответа от сервера уже " + Math.round(gap / 1000) + " с — похоже, твой интернет режет связь. Попробуй VPN или другой интернет (Wi-Fi ↔ мобильный).";
      cls = "bad";
    } else if (failed.length) {
      t = "⚠ Не удаётся соединиться: " + failed.join(", ") + ". У кого-то из вас блокируется связь — попробуйте включить VPN.";
      cls = "bad";
    } else if (badAt && now - badAt < 60000) {
      t = "⚠ Связь с сервером рвётся (был обрыв на " + Math.round(badLen / 1000) + " с). Если голос пропадает — попробуй VPN или другой интернет.";
      cls = "warn";
    } else if (avg > 2500) {
      t = "⚠ Связь с сервером медленная (ответ " + (avg / 1000).toFixed(1) + " с) — голос может запаздывать. Если плохо — попробуй VPN.";
      cls = "warn";
    } else {
      t = "✅ Связь с сервером в порядке" + (linked ? " · соединён с " + linked : "");
      cls = "ok";
    }
    if (el.textContent !== t) el.textContent = t;
    if (el.className !== "vc-health " + cls) el.className = "vc-health " + cls;
  }

  // ---------------------------------------------------------------- У240: «🔧 Проверить связь»
  function within(ms, pr) { return Promise.race([pr, new Promise(function (r) { setTimeout(function () { r(null); }, ms); })]); }

  function report(rows, sum) {
    reportHtml = rows.map(function (r) { return "<div>" + r + "</div>"; }).join("") + (sum ? '<div class="sum">' + sum + "</div>" : "");
    var el = $("vc-report");
    if (el) { el.innerHTML = reportHtml; el.hidden = false; }
  }

  function checkServer() {   // 5 запросов подряд, на каждый — не дольше 8 с
    var n = 0, ok = 0, worst = 0;
    function one() {
      var t0 = Date.now();
      return within(8000, opt.api("/me")).then(function (j) {
        var dt = Date.now() - t0;
        if (j && !j.offline) { ok++; worst = Math.max(worst, dt); }
        else worst = Math.max(worst, dt);
        return ++n < 5 ? one() : null;
      });
    }
    return one().then(function () {
      if (ok === 5 && worst < 3000) return {state: "ok", txt: "✅ Сервер отвечает (до " + (worst / 1000).toFixed(1) + " с)"};
      if (ok > 0) return {state: "bad", txt: "⚠ Сервер отвечает с перебоями: " + ok + " из 5, до " + Math.round(worst / 1000) + " с"};
      // сервер молчит — а интернет вообще есть? (сайт daviart.com лежит на другом хостинге)
      return within(8000, fetch("img/favicon-32.png?ping=" + Date.now(), {cache: "no-store"}).then(function (r) { return r.ok; }, function () { return false; }))
        .then(function (net) { return {state: net ? "down" : "nonet", txt: net ? "❌ Сервер не отвечает тебе" : "❌ Нет интернета"}; });
    });
  }

  function checkRelay() {   // получится ли адрес на ретрансляторе голоса (TURN) — через него голос идёт, если напрямую нельзя
    var turn = iceServers.filter(function (s) { return /^turns?:/.test([].concat(s.urls)[0] || ""); });
    if (!turn.length || !window.RTCPeerConnection) return Promise.resolve({state: "skip", txt: "— Ретранслятор голоса: нет данных"});
    return new Promise(function (res) {
      var pc, done = false;
      function fin(ok) {
        if (done) return; done = true;
        try { pc.close(); } catch (e) { }
        res(ok ? {state: "ok", txt: "✅ Ретранслятор голоса доступен"} : {state: "bad", txt: "⚠ Ретранслятор голоса недоступен — твоя сеть его блокирует"});
      }
      try {
        pc = new RTCPeerConnection({iceServers: turn, iceTransportPolicy: "relay"});
        pc.createDataChannel("check");
        pc.onicecandidate = function (e) { if (e.candidate && / typ relay /.test(e.candidate.candidate)) fin(true); };
        pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).catch(function () { fin(false); });
        setTimeout(function () { fin(false); }, 9000);
      } catch (e) { fin(false); }
    });
  }

  function checkMic() {   // 5 с слушаем свой микрофон: двигалась ли полоска
    if (!micOn) return Promise.resolve({state: "bad", txt: "⚠ Микрофон выключен — нажми 🎤"});
    micPeak = 0;
    return new Promise(function (r) { setTimeout(r, 5000); }).then(function () {
      var peak = micPeak; micPeak = -1;
      if (peak > 0.035) return {state: "ok", txt: "✅ Микрофон ловит твой голос"};
      return {state: "bad", txt: ptt ? "⚠ Голоса не было — в режиме «Рация» держи кнопку и скажи что-нибудь"
        : "⚠ Микрофон молчит — скажи что-нибудь вслух во время проверки; если полоска не двигается — проверь разрешение микрофона для daviart.com"};
    });
  }

  function check() {
    if (checking || !on) return;
    checking = true;
    var b = $("vc-check"); if (b) b.disabled = true;
    var rows = ["⏳ Сервер…", "⏳ Ретранслятор голоса…", "⏳ Микрофон — <b>скажи что-нибудь вслух</b>…"];
    report(rows, "");
    var parts = [checkServer(), checkRelay(), checkMic()];
    parts.forEach(function (pr, i) { pr.then(function (r) { rows[i] = r.txt; if (checking) report(rows, ""); }); });
    Promise.all(parts).then(function (r) {
      var srv = r[0].state, relay = r[1].state, mic = r[2].state, sum;
      if (srv === "nonet") sum = "Итог: у тебя пропал интернет.";
      else if (srv === "down") sum = "Итог: сервер тебе не отвечает. Если у друзей кабинет работает — блокирует твоя сеть: включи VPN или смени интернет. Если ни у кого не работает — напиши админу.";
      else if (srv === "bad") sum = "Итог: связь до сервера у тебя рвётся — скорее всего, мешает провайдер. Включи VPN или смени интернет (Wi-Fi ↔ мобильный).";
      else if (relay === "bad") sum = "Итог: сервер в порядке, но твоя сеть может не пропускать голос. Если с кем-то долго «соединяюсь» — включи VPN.";
      else if (mic === "bad") sum = "Итог: связь в порядке — проверь микрофон.";
      else sum = "Итог: у тебя всё в порядке ✅ Если кого-то не слышно — проблема у него: пусть тоже нажмёт «Проверить связь».";
      checking = false;
      report(rows, sum);
      var bb = $("vc-check"); if (bb) bb.disabled = false;
    });
  }

  function send(to, data) { opt.api("/voice", {action: "signal", to: to, data: data}); }

  // ---------------------------------------------------------------- WebRTC
  function makePc(name) {
    var p = peers[name] || (peers[name] = {pending: [], muted: false});
    if (p.pc) return p;
    var pc = new RTCPeerConnection({iceServers: iceServers});
    p.pc = pc; p.made = Date.now();
    local.getTracks().forEach(function (t) { pc.addTrack(t, local); });
    pc.onicecandidate = function (e) { if (e.candidate) send(name, {t: "ice", c: e.candidate}); };
    pc.ontrack = function (e) {
      var s = e.streams[0];
      if (!p.el) { p.el = new Audio(); p.el.autoplay = true; p.el.setAttribute("playsinline", ""); }
      p.el.srcObject = s;
      if (ctx) {
        p.el.muted = true;   // Chrome: поток должен «играть» в элементе, а слышим через WebAudio (громкость по расстоянию работает и на iPhone)
        try {
          var src = ctx.createMediaStreamSource(s);
          p.gain = ctx.createGain();
          src.connect(p.gain); p.gain.connect(ctx.destination);
        } catch (er) { p.el.muted = false; p.gain = null; }
      }
      var pl = p.el.play(); if (pl && pl.catch) pl.catch(function () { });
      volume(p);
    };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === "connected") p.waitFrom = 0;
      drawPeers(); health();
      if (pc.connectionState === "failed") {   // переподключиться через 3 с (звонит снова «меньший» ник)
        setTimeout(function () { if (peers[name] && peers[name].pc === pc) { closePc(peers[name]); if (myName < name) call(name); } }, 3000);
      }
    };
    return p;
  }

  function call(name) {
    var p = makePc(name);
    p.pc.createOffer().then(function (o) { return p.pc.setLocalDescription(o); })
      .then(function () { send(name, {t: "offer", sdp: p.pc.localDescription}); }).catch(function () { });
  }

  function onSignal(s) {
    if (!local) return;
    var name = s.from, d = s.data || {};
    if (d.t === "offer") {
      var p = peers[name];
      if (p && p.pc && p.pc.signalingState !== "stable") closePc(p);   // встречный/повторный звонок — начинаем заново
      p = makePc(name);
      p.pc.setRemoteDescription(d.sdp).then(function () { flush(p); return p.pc.createAnswer(); })
        .then(function (a) { return p.pc.setLocalDescription(a); })
        .then(function () { send(name, {t: "answer", sdp: p.pc.localDescription}); }).catch(function () { });
    } else if (d.t === "answer") {
      var q = peers[name];
      if (q && q.pc && q.pc.signalingState === "have-local-offer") q.pc.setRemoteDescription(d.sdp).then(function () { flush(q); }).catch(function () { });
    } else if (d.t === "ice") {
      var r = peers[name];
      if (!r || !r.pc) return;
      if (r.pc.remoteDescription) r.pc.addIceCandidate(d.c).catch(function () { });
      else r.pending.push(d.c);
    }
  }

  function flush(p) { var l = p.pending.splice(0); l.forEach(function (c) { p.pc.addIceCandidate(c).catch(function () { }); }); }

  // громкость по расстоянию: до 4 блоков — полная, к краю слышимости — тише, дальше — тишина
  function volume(p) {
    if (p.d == null) return;
    var g = p.d <= NEAR ? 1 : Math.max(0, 1 - (p.d - NEAR) / Math.max(1, range - NEAR));
    // 2026-10-18: у самого края (до 100 бл.) — очень тихо, но слышно; дальше — тишина
    g = p.muted || p.d > range ? 0 : 0.03 + 0.97 * g * g;
    if (p.gain && ctx) p.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.15);
    else if (p.el) p.el.volume = g;
  }

  function closePc(p) {
    if (p.pc) { try { p.pc.close(); } catch (e) { } }
    if (p.gain) { try { p.gain.disconnect(); } catch (e) { } }
    if (p.el) { p.el.srcObject = null; }
    p.pc = null; p.gain = null; p.el = null; p.pending = [];
  }

  function drop(name) { var p = peers[name]; if (p) closePc(p); delete peers[name]; }

  window.addEventListener("pagehide", function () { if (on) leave(true); });
  // для проверки (тест/админ в консоли браузера): состояние соединений и сколько звука пришло
  function stats() {
    return Promise.all(Object.keys(peers).map(function (n) {
      var p = peers[n];
      if (!p.pc) return Promise.resolve([n, {state: "none", d: p.d}]);
      return p.pc.getStats().then(function (r) {
        var bytes = 0;
        r.forEach(function (s) { if (s.type === "inbound-rtp" && (s.kind === "audio" || s.mediaType === "audio")) bytes += s.bytesReceived || 0; });
        return [n, {state: p.pc.connectionState, d: p.d, bytes: bytes, gain: p.gain ? p.gain.gain.value : (p.el ? p.el.volume : null)}];
      });
    })).then(function (l) { var o = {}; l.forEach(function (x) { o[x[0]] = x[1]; }); return {on: on, me: myName, inGame: lastState && lastState.inGame, peers: o}; });
  }
  window.VPVoice = {mount: mount, active: function () { return on; }, stats: stats, range: function () { return range; }};
})();
