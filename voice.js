/* Голосовой чат «рядом» (У236) — вкладка «Голос» личного кабинета DaviArt Craft.
 * Сервер (VPLand /api/voice) говорит, кто из подключённых рядом в игре и на каком расстоянии, и передаёт «рукопожатия» WebRTC.
 * Звук идёт напрямую между браузерами (Opus), громкость каждого собеседника — по расстоянию в игре. Ничего не записывается.
 * Подключение: window.VPVoice.mount(элемент, {api: fn(path, body) → Promise<json>, toast: fn(msg, bad)}). */
(function () {
  "use strict";
  var POLL_MS = 400, GONE_MS = 4000, NEAR = 4;
  var box = null, opt = null;
  var on = false, pollT = null, myName = "", range = 32, iceServers = [{urls: "stun:stun.l.google.com:19302"}];
  var ctx = null, local = null, analyser = null, speaking = false, micOn = true, ptt = false, pttDown = false;
  var peers = {};      // ник → {pc, gain, el, d, seen, speaking, muted, pending: [ICE], made}
  var lastState = null, wakeLock = null;

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
    var h = '<div class="card cab-card vc-card' + (compact ? " vc-compact" : "") + '"><h2>🎤 Голосовой чат</h2>' + (compact
      ? (on ? "" : '<p class="cab-meta">Говори с теми, кто рядом в игре (до ' + range + ' бл.). У подключённых — 🎤 над головой.</p>')
      : '<p class="cab-meta">Говори с игроками, которые <b>рядом с тобой в игре</b> и тоже подключились (у них <b>🎤 над головой</b>). ' +
        'Чем дальше — тем тише, дальше ' + range + ' блоков и в другом мире — не слышно. Играй на компьютере, а голос — с телефона или в этом же браузере. Ничего не записывается.</p>');
    if (!on) {
      h += '<div class="cab-row"><button class="btn green' + (compact ? " vc-big" : "") + '" type="button" id="vc-join">🎤 Подключиться к голосу</button></div>' +
        '<p class="cab-meta" id="vc-msg">Браузер спросит разрешение на микрофон — нажми «Разрешить». Лучше в наушниках.</p>';
    } else {
      h += '<div class="vc-status"><span class="vc-dot ' + (lastState && lastState.inGame ? "on" : "") + '"></span><span id="vc-where">' + esc(where()) + '</span></div>' +
        '<div class="vc-me"><div class="vc-meter"><i id="vc-level"></i></div><span id="vc-me-state"></span></div>' +
        '<div class="cab-row vc-ctl">' +
        '<button class="btn ' + (micOn ? "" : "red") + '" type="button" id="vc-mic">' + (micOn ? "🎤 Микрофон включён" : "🔇 Микрофон выключен") + '</button>' +
        '<button class="btn" type="button" id="vc-mode">' + (ptt ? "Режим: нажми и говори" : "Режим: говорю всегда") + '</button>' +
        '<button class="btn" type="button" id="vc-leave">Отключиться</button></div>' +
        (ptt ? '<button class="btn gold vc-ptt" type="button" id="vc-ptt">Держи — и говори</button>' : "") +
        (compact ? "" : '<h3 class="don-sub">Рядом с тобой</h3>') + '<div id="vc-peers"></div>' +
        '<p class="cab-meta">Не сворачивай браузер и не блокируй экран — иначе телефон может выключить микрофон.</p>';
    }
    box.innerHTML = h + "</div>";
    if (!on) { $("vc-join").onclick = join; return; }
    $("vc-mic").onclick = function () { micOn = !micOn; applyMic(); draw(); };
    $("vc-mode").onclick = function () { ptt = !ptt; store("ptt", ptt ? "1" : "0"); applyMic(); draw(); };
    $("vc-leave").onclick = function () { leave(true); };
    var b = $("vc-ptt");
    if (b) {
      var down = function (e) { e.preventDefault(); pttDown = true; applyMic(); b.classList.add("on"); };
      var up = function (e) { e.preventDefault(); pttDown = false; applyMic(); b.classList.remove("on"); };
      b.addEventListener("pointerdown", down); b.addEventListener("pointerup", up); b.addEventListener("pointerleave", up); b.addEventListener("pointercancel", up);
    }
    drawPeers();
  }

  function where() {
    if (!lastState) return "Подключаюсь…";
    if (!lastState.inGame) return "Ты сейчас не в игре — зайди на сервер daviart.com, и голос заработает (" + (lastState.connected || 0) + " подключено)";
    return "В игре: " + (lastState.world || "") + " · подключено к голосу: " + (lastState.connected || 0);
  }

  function drawPeers() {
    var el = $("vc-peers");
    if (!el) return;
    var names = Object.keys(peers).filter(function (n) { return peers[n].d != null; }).sort(function (a, b) { return peers[a].d - peers[b].d; });
    var others = (lastState && lastState.others) || [];   // рядом в игре, но голос не подключили
    if (!names.length && !others.length) { el.innerHTML = '<p class="cab-meta">Рядом в игре никого. Подойди к игрокам — они появятся здесь.</p>'; return; }
    el.innerHTML = names.map(function (n) {
      var p = peers[n], st = p.pc ? p.pc.connectionState : "new";
      var link = st === "connected" ? " · слышит тебя" : st === "failed" ? " · не соединилось" : " · соединяюсь…";
      return '<div class="vc-peer' + (p.speaking ? " talk" : "") + '"><span class="vc-ico">' + (p.speaking ? "🗣" : "🎤") + '</span><b>' + esc(n) + '</b>' +
        '<span class="cab-meta">' + Math.round(p.d) + ' бл.' + link + '</span>' +
        '<button class="btn small" type="button" data-mute="' + esc(n) + '">' + (p.muted ? "🔇 Не слышу" : "🔊 Слышу") + "</button></div>";
    }).join("") + others.slice().sort(function (a, b) { return a.d - b.d; }).map(function (o) {
      return '<div class="vc-peer off"><span class="vc-ico">🔇</span><b>' + esc(o.name) + '</b><span class="cab-meta">' + Math.round(o.d) +
        ' бл. · не подключён к голосу — не слышит тебя</span></div>';
    }).join("") + (others.length && !names.length ? '<p class="cab-meta">Позови их: пусть откроют кабинет → «🎤 Голос» → «Подключиться».</p>' : "");
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
      applyMic();
      try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (w) { wakeLock = w; }).catch(function () { }); } catch (e) { }
      draw();
      poll();
      meter();
    }).catch(function () {
      m.textContent = "Нет доступа к микрофону. Разреши его в настройках браузера для daviart.com и нажми ещё раз.";
    });
  }

  function leave(tell) {
    on = false;
    clearTimeout(pollT);
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
    var bar = $("vc-level"), st = $("vc-me-state");
    if (bar) bar.style.width = Math.min(100, Math.round(lvl * 400)) + "%";
    if (st) st.textContent = !micOn ? "микрофон выключен" : ptt && !pttDown ? "держи кнопку, чтобы говорить" : speaking ? "тебя слышно" : "говори — тебя услышат рядом";
    requestAnimationFrame(meter);
  }

  // ---------------------------------------------------------------- опрос сервера
  function poll() {
    if (!on) return;
    opt.api("/voice", {action: "poll", speaking: speaking}).then(function (j) {
      if (!on) return;
      if (!j || !j.ok) {
        if (j && j.offline) { lastState = {inGame: false, connected: 0}; var w = $("vc-where"); if (w) w.textContent = "Сервер не отвечает — переподключаюсь…"; }
        else { opt.toast((j && j.message) || "Голосовой чат недоступен.", true); leave(false); return; }
      } else {
        var first = !lastState;
        lastState = j; myName = j.me; range = j.range || range;
        if (j.ice && j.ice.length) iceServers = j.ice;
        (j.signals || []).forEach(onSignal);
        var now = Date.now();
        (j.peers || []).forEach(function (pe) {
          var p = peers[pe.name] || (peers[pe.name] = {pending: [], muted: false});
          p.d = pe.d; p.seen = now; p.speaking = pe.speaking;
          if (!p.pc && myName < pe.name) call(pe.name);   // звонит тот, чей ник «меньше» — без встречных звонков
          volume(p);
        });
        Object.keys(peers).forEach(function (n) { if (now - (peers[n].seen || 0) > GONE_MS) drop(n); });
        if (first) draw(); else { var w2 = $("vc-where"); if (w2) w2.textContent = where(); var dot = box.querySelector(".vc-dot"); if (dot) dot.className = "vc-dot" + (j.inGame ? " on" : ""); drawPeers(); }
      }
      pollT = setTimeout(poll, POLL_MS);
    });
  }

  function send(to, data) { opt.api("/voice", {action: "signal", to: to, data: data}); }

  // ---------------------------------------------------------------- WebRTC
  function makePc(name) {
    var p = peers[name] || (peers[name] = {pending: [], muted: false});
    if (p.pc) return p;
    var pc = new RTCPeerConnection({iceServers: iceServers});
    p.pc = pc;
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
      drawPeers();
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
    g = p.muted ? 0 : g * g;
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
  window.VPVoice = {mount: mount, active: function () { return on; }, stats: stats};
})();
