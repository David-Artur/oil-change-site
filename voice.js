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
    var nm = Number(store("nr")); nrMode = nm >= 0 && nm <= 3 && store("nr") !== null ? nm : 2;   // У254: по умолчанию «обычно»
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
        '<button class="btn green vc-ptt" type="button" id="vc-fix" hidden>🔊 Нажми — вернуть звук</button>' +   // 2026-10-21: iPhone после фона
        '<div class="vc-nr"><button class="vc-chip" type="button" id="vc-nr"></button><span class="vc-nr-hint">🎧 лучше в наушниках — не будет эха</span></div>' +
        (window.VPSound ? '<div class="vc-snd"><button class="vc-chip" type="button" id="vc-snd"></button><input type="range" id="vc-sndvol" min="0" max="100" aria-label="Громкость звуков мира">' +
          '<span class="vc-nr-hint" id="vc-sndnow"></span></div>' : "") +   // У290: звучащие точки
        '<div id="vc-peers" class="vc-peers"></div>' +
        '<div class="vc-tools"><button class="vc-chip vc-check" type="button" id="vc-check" title="Проверить сервер, ретранслятор голоса и микрофон">🔧 Проверить связь</button></div>' +
        '<div class="vc-report" id="vc-report"' + (reportHtml ? "" : " hidden") + '>' + reportHtml + '</div>' +
        '<p class="vc-hint">' + HINT + '</p>';
    }
    box.innerHTML = h + "</div>";
    if (!on) { $("vc-join").onclick = join; return; }
    $("vc-check").onclick = check;
    $("vc-fix").onclick = fixTap;
    $("vc-mic").onclick = function () { micOn = !micOn; applyMic(); ctl(); };
    $("vc-mode").onclick = function () { ptt = !ptt; store("ptt", ptt ? "1" : "0"); applyMic(); ctl(); };
    $("vc-leave").onclick = function () { leave(true); };
    $("vc-nr").onclick = function () {   // У254: выкл → тихо → обычно → шумно; новый режим — заново послушать тишину 2 с
      nrMode = (nrMode + 1) % 4; store("nr", String(nrMode));
      if (gate) gate.port.postMessage({mode: nrMode, recal: true});
      ctl();
    };
    if (window.VPSound && $("vc-snd")) {   // У290: «🎵 Звуки мира» — музыка мест и фразы жителей
      var sb = $("vc-snd"), sv = $("vc-sndvol");
      var sl = function () { sb.textContent = VPSound.enabled() ? "🎵 Звуки мира: вкл" : "🔕 Звуки мира: выкл"; sb.classList.toggle("off", !VPSound.enabled()); sv.disabled = !VPSound.enabled(); };
      sv.value = Math.round(VPSound.volume() * 100); sl();
      sb.onclick = function () { VPSound.toggle(); sl(); if (VPSound.enabled() && VPSound.unlock) VPSound.unlock(); };
      $("vc-sndnow").onclick = function () { if (VPSound.unlock) VPSound.unlock(); };   // У297: радио на iPhone — по нажатию
      sv.oninput = function () { VPSound.volume(sv.value / 100); };
      $("vc-sndnow").textContent = VPSound.now() || "";
    }
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
    var nr = $("vc-nr");
    if (nr) {
      nr.textContent = gate ? "🔇 Шумодав: " + NR_NAMES[nrMode] : "Шумодав недоступен";
      nr.disabled = !gate;
      nr.classList.toggle("off", !gate || nrMode === 0);
      nr.title = gate ? "Срезает гул и шум между фразами; эхо — тише, пока говорит собеседник. Нажми: выкл → тихо → обычно → шумно (в шумной комнате — «шумно»)"
        : "Этот браузер не умеет шумодав — работает обычное шумоподавление браузера";
    }
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
    try { if (window.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance(" ")); } catch (e) { }   // У290: iPhone — голос жителей разрешается только по нажатию
    var AC = window.AudioContext || window.webkitAudioContext;
    ctx = AC ? new AC() : null;   // создаём по нажатию — иначе телефон не даст играть звук
    navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}}).then(function (s) {
      local = s;
      sendStream = local;
      if (ctx) {
        try { ctx.resume(); } catch (e) { }
        analyser = ctx.createAnalyser(); analyser.fftSize = 512;
        ctx.createMediaStreamSource(local).connect(analyser);
      }
      return buildGate().catch(function () { sendStream = local; gate = null; });   // не вышло — голос как раньше, без шумодава
    }).then(function () {
      if (!local) return;
      on = true; lastState = null;
      joinedAt = Date.now(); lastOk = 0; rtts = []; badAt = 0; reportHtml = "";
      applyMic();
      try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (w) { wakeLock = w; }).catch(function () { }); } catch (e) { }
      draw();
      startTicker();
      meter();
      if (window.VPSound && ctx) VPSound.start({ctx: ctx, api: opt.api});   // У290: звучащие точки — тем же звуком, что и голоса
      mediaSession(true);
    }).catch(function () {
      m.textContent = "Нет доступа к микрофону. Разреши его в настройках браузера для daviart.com и нажми ещё раз.";
    });
  }

  // ---------------------------------------------------------------- У254: шумодав
  // Цепочка: микрофон → срез гула ниже 120 Гц (вентилятор, стол) → шумовой порог (AudioWorklet, работает и в свёрнутой вкладке) → собеседникам.
  // Первые 2 с порог слушает тишину и запоминает уровень шума, дальше медленно подстраивается; пропускает звук, только когда ты говоришь
  // громче шума (открытие ~5 мс, закрытие через 0,4 с — слова не обрезаются). Пока собеседник говорит — твой микрофон тише (×0,35), чтобы его
  // голос из твоих динамиков не возвращался ему эхом. Режимы: выкл / тихо / обычно / шумно (во сколько раз громче шума надо говорить).
  var NR_NAMES = ["выкл", "тихо", "обычно", "шумно"];
  var nrMode = 2, gate = null, gateOpen = false, sendStream = null, ducked = false;
  var GATE_SRC = "class G extends AudioWorkletProcessor{constructor(){super();this.mode=2;this.duck=false;this.t0=currentTime;this.cal=[];this.floor=0.003;this.g=0;this.open=-9;this.last=0;" +
    "this.port.onmessage=e=>{const d=e.data;if('mode' in d)this.mode=d.mode;if('duck' in d)this.duck=d.duck;if(d.recal){this.t0=currentTime;this.cal=[];}}}" +
    "process(i,o){const a=i[0]&&i[0][0],out=o[0];if(!a||!out||!out[0])return true;let s=0;for(let k=0;k<a.length;k++)s+=a[k]*a[k];const r=Math.sqrt(s/a.length);" +
    "if(currentTime-this.t0<2){this.cal.push(r);if(this.cal.length%16==0){const c=this.cal.slice().sort((x,y)=>x-y);this.floor=Math.max(0.0005,c[Math.floor(c.length*0.6)])}}" +
    "const K=[0,2,3,4.5][this.mode],MIN=[0,0.006,0.01,0.018][this.mode],th=Math.max(this.floor*K,MIN);" +
    "if(this.mode===0||r>th)this.open=currentTime;else if(currentTime-this.t0>=2)this.floor=this.floor*0.9995+r*0.0005;" +
    "const want=(this.mode===0||currentTime-this.open<0.4)?(this.duck?0.35:1):0;this.g+=(want-this.g)*(want>this.g?0.5:0.03);" +
    "for(let c=0;c<out.length;c++){const b=out[c];for(let k=0;k<b.length;k++)b[k]=a[k]*this.g}" +
    "if(currentTime-this.last>0.08){this.last=currentTime;this.port.postMessage({open:want>0.5,lvl:r,th:th})}return true}}registerProcessor('vp-gate',G)";

  function buildGate() {
    if (!ctx || !ctx.audioWorklet || !window.AudioWorkletNode) return Promise.reject(new Error("no worklet"));
    var c0 = ctx, url = URL.createObjectURL(new Blob([GATE_SRC], {type: "text/javascript"}));
    var ready = ctx.__vpGate ? Promise.resolve() : ctx.audioWorklet.addModule(url).then(function () { c0.__vpGate = true; });   // второй раз (новый микрофон) — модуль уже есть
    return ready.then(function () {
      var src = ctx.createMediaStreamSource(local);
      var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 120; hp.Q.value = 0.7;
      gate = new AudioWorkletNode(ctx, "vp-gate", {numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1]});
      var dest = ctx.createMediaStreamDestination();
      src.connect(hp); hp.connect(gate); gate.connect(dest);
      gate.port.onmessage = function (e) { gateOpen = !!e.data.open; };
      gate.port.postMessage({mode: nrMode});
      sendStream = dest.stream;
    });
  }

  // ---------------------------------------------------------------- У292 (владелец 2026-10-20): эхо в пещерах
  // Голоса собеседников → (как раньше) в динамики + в «пещеру»: короткий отзвук от стен (0,23 и 0,41 с) и гулкий хвост (свёртка ~2 с).
  // Громкость «пещеры» — VPSound.cave() (насколько ты под землёй, по рельефу карты), меняется плавно; на поверхности — 0, эха нет.
  var cave = null;
  function caveBus() {
    if (!ctx) return null;
    if (cave && cave.ctx === ctx) return cave.in;
    var inp = ctx.createGain(), wet = ctx.createGain(), lp = ctx.createBiquadFilter(), conv = ctx.createConvolver();
    var d1 = ctx.createDelay(1), d2 = ctx.createDelay(1), fb = ctx.createGain();
    wet.gain.value = 0; lp.type = "lowpass"; lp.frequency.value = 2600;
    var len = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var a = ir.getChannelData(ch); for (var i = 0; i < len; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < ctx.sampleRate * 0.012 ? 0 : 1); }
    conv.buffer = ir;
    d1.delayTime.value = 0.23; d2.delayTime.value = 0.41; fb.gain.value = 0.32;
    inp.connect(lp); lp.connect(conv); conv.connect(wet);
    lp.connect(d1); d1.connect(fb); fb.connect(d2); d2.connect(wet); d2.connect(fb); d1.connect(wet);
    wet.connect(ctx.destination);
    cave = {ctx: ctx, in: inp, wet: wet};
    return inp;
  }
  function caveLevel() {
    if (!ctx || !cave || cave.ctx !== ctx) return;
    var c = window.VPSound && VPSound.cave ? VPSound.cave() : 0;
    cave.wet.gain.setTargetAtTime(c * 0.35, ctx.currentTime, 1.2);   // владелец: «небольшое эхо»
  }

  // ---------------------------------------------------------------- У323 (владелец 2026-10-23): под водой — глухо и с бульканьем
  // «Полностью погружаемся под воду — чтобы практически не было слышно собеседника, бульканье, глухо». Сервер (VPLand /api/voice)
  // присылает water: голова под водой у тебя (j.water) и у каждого собеседника (pe.water). Под водой ты ИЛИ он — его голос идёт
  // через фильтр ~400 Гц (глухо), ×0.2, звук медленно «плавает» (общий LFO по частоте фильтра); пока он говорит — пузырьки.
  // Свой голос под водой — тоже пузырьки (только у себя). Вход/выход плавные (~0,3 с).
  var water = null, meWater = false, bubbleAt = 0;
  function OPEN() { return Math.min(20000, ctx.sampleRate / 2 - 200); }   // «фильтр открыт» — не выше половины частоты дискретизации
  function waterShared() {
    if (water && water.ctx === ctx) return water;
    var lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.type = "sine"; lfo.frequency.value = 0.6; depth.gain.value = 0;
    lfo.connect(depth); lfo.start();
    water = {ctx: ctx, depth: depth};
    return water;
  }
  function waterNode() {
    var w = waterShared(), lp = ctx.createBiquadFilter(), out = ctx.createGain();
    lp.type = "lowpass"; lp.frequency.value = OPEN(); lp.Q.value = 2.5;
    w.depth.connect(lp.frequency);
    lp.connect(out);
    return {lp: lp, out: out, on: false};
  }
  function waterApply(p) {
    if (!p.water || !ctx) return;
    var u = !!(meWater || p.wet);
    if (u === p.water.on) return;
    p.water.on = u;
    var t = ctx.currentTime;
    p.water.lp.frequency.cancelScheduledValues(t);
    p.water.lp.frequency.setTargetAtTime(u ? 420 : OPEN(), t, u ? 0.08 : 0.12);
    p.water.out.gain.setTargetAtTime(u ? 0.2 : 1, t, 0.1);
  }
  function waterTick() {
    if (!ctx) return;
    var any = meWater;
    Object.keys(peers).forEach(function (n) { var p = peers[n]; waterApply(p); if (p.wet) any = true; });
    var w = waterShared();
    w.depth.gain.setTargetAtTime(any ? 140 : 0, ctx.currentTime, 0.2);   // «плавание» только когда кто-то под водой
    // пузырьки (штук в секунду): говорит собеседник под водой — 3, ты под водой и слышишь говорящего сверху — 1, говоришь сам под водой — 3.
    // Опросы идут неровно (0,4 с … пачками) — считаем по прошедшему времени и раскладываем на этот же отрезок вперёд
    var now = Date.now(), dt = Math.min(1, Math.max(0, (now - (bubbleAt || now)) / 1000)), rate = 0;
    bubbleAt = now;
    Object.keys(peers).forEach(function (k) {
      var p = peers[k];
      if (p.speaking && p.d != null && !p.muted && (meWater || p.wet) && p.pc && p.pc.connectionState === "connected") rate += meWater && !p.wet ? 1 : 3;
    });
    if (meWater && gateOpen && micOn) rate += 3;
    var n = Math.floor(rate * dt + Math.random());
    if (!rate) n = 0;
    for (var i = 0; i < n; i++) bubble(ctx.currentTime + 0.02 + Math.random() * Math.max(0.2, dt), meWater ? 0.05 : 0.035);
  }
  function bubble(at, vol) {   // один «бульк»: синус с быстрым подъёмом частоты, короткая огибающая
    try {
      var o = ctx.createOscillator(), g = ctx.createGain(), f0 = 180 + Math.random() * 260, dur = 0.05 + Math.random() * 0.07;
      o.type = "sine";
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f0 * (2.2 + Math.random() * 1.6), at + dur);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol * (0.5 + Math.random()), at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(at); o.stop(at + dur + 0.02);
    } catch (e) { }
  }

  function setDuck(v) { if (gate && v !== ducked) { ducked = v; gate.port.postMessage({duck: v}); } }

  function leave(tell) {
    on = false;
    gate = null; gateOpen = false; sendStream = null; ducked = false;
    peerTalkSrv = false; lastTalk = 0; if (musicDucked) { musicDucked = false; if (window.VPSound) VPSound.duck(false); }   // Б37
    stopTicker(); polling = false; checking = false; micPeak = -1;
    Object.keys(peers).forEach(drop);
    if (local) local.getTracks().forEach(function (t) { t.stop(); });
    local = null;
    if (window.VPSound) VPSound.stop();
    mediaSession(false);
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
  // 2026-10-21 (владелец: «сайт грузит процессор»): 20 раз в секунду (было — каждый кадр, 60–120), буфер — один на всё время
  var meterBuf = null;
  function meter() {
    if (!on) return;
    var lvl = 0;
    if (analyser && !document.hidden) {
      var a = meterBuf && meterBuf.length === analyser.fftSize ? meterBuf : (meterBuf = new Uint8Array(analyser.fftSize));
      analyser.getByteTimeDomainData(a);
      var sum = 0;
      for (var i = 0; i < a.length; i++) { var v = (a[i] - 128) / 128; sum += v * v; }
      lvl = Math.sqrt(sum / a.length);
    }
    var live = micOn && (!ptt || pttDown);
    speaking = live && (gate && nrMode > 0 ? gateOpen : lvl > 0.035);   // с шумодавом «говорю» = звук реально уходит
    if (micPeak >= 0 && live) micPeak = Math.max(micPeak, lvl);   // идёт проверка микрофона
    var bar = $("vc-level"), mt = $("vc-meter");
    // 2026-10-21 (владелец: «кабинет грузит процессор»): полоска перерисовывалась 20 раз/с с плавным переходом — ~5% CPU.
    // Теперь 20 ступенек и только при смене ступеньки; слой полоски — у видеокарты (will-change в CSS), без перехода
    var q = live ? Math.round(Math.min(1, lvl * 4) * 20) / 20 : 0;
    if (bar && bar.__q !== q) { bar.__q = q; bar.style.transform = "scaleX(" + q + ")"; }
    if (mt && mt.classList.contains("talk") !== speaking) mt.classList.toggle("talk", speaking);
    duckTick();
    setTimeout(meter, 50);
  }

  // Б37 (владелец 2026-10-24: «музыка перебивает, когда мне говорят или я говорю»): музыка клуба тише, пока кто-то рядом говорит
  // (по живому звуку входящего голоса — мгновенно) или говоришь сам; держим тихо ещё DUCK_HOLD после последнего слова — без «прыжков».
  var DUCK_HOLD = 1200, lastTalk = 0, musicDucked = false, peerTalkSrv = false, peerBuf = null;
  function peerTalking() {
    var hit = false;
    Object.keys(peers).forEach(function (n) {
      var p = peers[n];
      if (hit || !p.an || p.muted || p.d == null || !p.gain || p.gain.gain.value < 0.03) return;
      var a = peerBuf && peerBuf.length === p.an.fftSize ? peerBuf : (peerBuf = new Uint8Array(p.an.fftSize));
      p.an.getByteTimeDomainData(a);
      var s = 0; for (var i = 0; i < a.length; i++) { var v = (a[i] - 128) / 128; s += v * v; }
      if (Math.sqrt(s / a.length) > 0.02) hit = true;
    });
    return hit;
  }
  function duckTick() {
    var now = Date.now();
    if (speaking || peerTalkSrv || peerTalking()) lastTalk = now;
    var d = now - lastTalk < DUCK_HOLD;
    if (d !== musicDucked) { musicDucked = d; if (window.VPSound) VPSound.duck(d); }
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
    // У244: с кем связь установлена — сервер ставит ✔ в панели игры, только если связь есть у обоих
    var linked = Object.keys(peers).filter(function (n) { var p = peers[n]; return p.pc && p.pc.connectionState === "connected"; });
    opt.api("/voice", {action: "poll", speaking: speaking, linked: linked}).then(function (j) {
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
          p.d = pe.d; p.seen = now; p.speaking = pe.speaking; p.wet = !!pe.water;   // У323: собеседник под водой
          if (pe.sid && p.sid && pe.sid !== p.sid && p.pc) closePc(p);   // собеседник переподключился — старое соединение мёртвое
          if (pe.sid) p.sid = pe.sid;
          if (p.pc && p.pc.connectionState !== "connected" && p.made && now - p.made > STUCK_MS) closePc(p);   // «соединяюсь» дольше 90 с — заново
          if (!p.pc && myName < pe.name) call(pe.name);   // звонит тот, чей ник «меньше» — без встречных звонков
          if (p.pc && p.pc.connectionState === "connected") p.waitFrom = 0; else if (!p.waitFrom) p.waitFrom = now;
          volume(p);
        });
        // 2026-10-18 (владелец): сервер его не прислал (другой мир, умер → лобби, ушёл далеко) — сразу не слышно и не в списке;
        // само соединение держим GONE_MS, чтобы вернулся без нового «соединяюсь»
        var here = {};
        (j.peers || []).forEach(function (pe) { here[pe.name] = true; });
        Object.keys(peers).forEach(function (n) {
          var p = peers[n];
          if (now - (p.seen || 0) > GONE_MS) { drop(n); return; }
          if (!here[n] && p.d != null) { p.d = null; p.speaking = false; p.waitFrom = 0; silence(p, true); }
        });
        // У254: собеседник рядом говорит и слышен — свой микрофон приглушаем (без наушников его голос не вернётся ему эхом)
        var talking = Object.keys(peers).some(function (n) { var q = peers[n]; return q.speaking && q.d != null && q.pc && q.pc.connectionState === "connected"; });
        setDuck(nrMode > 0 && talking);
        // У290 → Б37 (2026-10-24): музыка тише, когда говорят тебе ИЛИ говоришь сам; решение — в duckTick() (живой звук + этот флаг сервера как запасной)
        peerTalkSrv = talking;
        caveLevel();   // У292: эхо в пещере
        meWater = !!j.water; waterTick();   // У323: под водой — глухо и пузырьки
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
      if (p.d == null) return;   // сейчас не рядом
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
    var out = sendStream || local;   // У254: собеседникам — звук после шумодава
    out.getAudioTracks().forEach(function (t) { pc.addTrack(t, out); });
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
          var wn = waterNode();   // У323: под водой — глухо (фильтр + тише); над водой фильтр открыт и не слышен
          src.connect(p.gain); p.gain.connect(wn.lp); wn.out.connect(ctx.destination);
          p.an = ctx.createAnalyser(); p.an.fftSize = 256; src.connect(p.an);   // Б37: речь собеседника — по живому звуку, без опроса сервера
          p.water = wn;
          var cb = caveBus(); if (cb) wn.out.connect(cb);   // У292: в пещере — эхо
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
    } else if (d.t === "reset") {   // собеседник не слышит нас — пересоздаём соединение и с этой стороны
      var rp = peers[name];
      if (rp) { closePc(rp); rp.bad = 0; rp.lastBytesAt = 0; if (myName < name) setTimeout(function () { if (on && peers[name] && !peers[name].pc) call(name); }, 1200); }
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
    if (p.d == null) { silence(p, true); return; }   // сервер не говорит, где он, — не слышно (плавно гаснет)
    var g = p.d <= NEAR ? 1 : Math.max(0, 1 - (p.d - NEAR) / Math.max(1, range - NEAR));
    // 2026-10-18: у самого края (до 100 бл.) — очень тихо, но слышно; дальше — тишина
    if (p.muted) { silence(p); return; }   // выключил сам — сразу
    if (p.d > range) { silence(p, true); return; }
    g = 0.03 + 0.97 * g * g;
    // У296 (владелец 2026-10-21): в клубе музыка перебивает всех — хорошо слышно только стоящих рядом (до ~2,5 бл.), к ~12 бл. — едва
    if (window.VPSound && VPSound.room && VPSound.room() === "club") {
      var c = p.d <= 2.5 ? 1 : Math.max(0, 1 - (p.d - 2.5) / 9.5);
      g = Math.min(g, 0.02 + 0.98 * c * c);
    }
    if (p.fading && p.gain && ctx) { p.gain.gain.cancelScheduledValues(ctx.currentTime); p.gain.gain.setValueAtTime(p.gain.gain.value, ctx.currentTime); }
    p.fading = false;   // вернулся в радиус — снова слышно (плавно)
    if (p.gain && ctx) p.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.15);
    else if (p.el) p.el.volume = g;
  }

  // slow — собеседник ушёл (из радиуса, в другой мир, в портал): плавно гаснет ~3 с, а не обрывается (владелец 2026-10-20)
  function silence(p, slow) {
    if (p.gain && ctx) {
      if (slow && p.fading) return;   // уже гаснет — не перезапускать кривую
      p.fading = !!slow;
      p.gain.gain.cancelScheduledValues(ctx.currentTime);
      p.gain.gain.setValueAtTime(p.gain.gain.value, ctx.currentTime);
      p.gain.gain.setTargetAtTime(0, ctx.currentTime, slow ? 0.9 : 0.05);
    } else if (p.el) {
      if (!slow) { p.el.volume = 0; return; }
      var el = p.el, v0 = el.volume, t0 = Date.now(), iv = setInterval(function () {
        var k = Math.min(1, (Date.now() - t0) / 3000); el.volume = Math.max(0, v0 * (1 - k)); if (k >= 1) clearInterval(iv);
      }, 100);
    }
  }

  function closePc(p) {
    if (p.pc) { try { p.pc.close(); } catch (e) { } }
    if (p.gain) { try { p.gain.disconnect(); } catch (e) { } }
    if (p.water) { try { p.water.out.disconnect(); p.water.lp.disconnect(); } catch (e) { } }
    if (p.el) { p.el.srcObject = null; }
    p.pc = null; p.gain = null; p.water = null; p.el = null; p.pending = [];
  }

  function drop(name) { var p = peers[name]; if (p) closePc(p); delete peers[name]; }

  // ---------------------------------------------------------------- 2026-10-21 (владелец): «вышел из вкладки, вернулся — нет музыки или голоса,
  // пишет „подключено“, а ничего не работает» — восстановление при возврате + сторож: звук от собеседника не приходит 10 с — пересоздать связь.
  var hiddenAt = 0, reMic = false, lastFixToast = 0;
  function micTrack() { return local && local.getAudioTracks()[0]; }
  function needTap(show) { var b = $("vc-fix"); if (b) b.hidden = !show; }
  function reacquireMic() {   // iPhone/Safari в фоне останавливает микрофон (track «ended») — взять заново и подменить у всех без разрыва связи
    if (reMic || !on) return; reMic = true;
    navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}}).then(function (s) {
      if (!on) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      if (local) local.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { } });
      local = s; sendStream = local;
      if (ctx) { analyser = ctx.createAnalyser(); analyser.fftSize = 512; ctx.createMediaStreamSource(local).connect(analyser); }
      return buildGate().catch(function () { sendStream = local; gate = null; });
    }).then(function () {
      if (!on || !local) return;
      applyMic();
      var tr = (sendStream || local).getAudioTracks()[0];
      Object.keys(peers).forEach(function (n) {
        var p = peers[n]; if (!p.pc) return;
        p.pc.getSenders().forEach(function (sd) { if (!sd.track || sd.track.kind === "audio") sd.replaceTrack(tr).catch(function () { }); });
      });
    }).catch(function () { needTap(true); }).then(function () { reMic = false; });
  }
  function resetPeer(n, tell) {   // соединение «живое», а звука нет — заново (звонит «меньший» ник, как обычно)
    var p = peers[n]; if (!p) return;
    if (tell) send(n, {t: "reset"});
    closePc(p); p.lastBytes = 0; p.lastBytesAt = 0; p.bad = 0;
    if (myName < n) setTimeout(function () { if (on && peers[n] && !peers[n].pc) call(n); }, 1200);
    if (Date.now() - lastFixToast > 20000) { lastFixToast = Date.now(); opt.toast("♻ Переподключаю голос с " + n + "…"); }
  }
  function audioWatch() {   // раз в 5 с: сколько звука пришло от каждого «подключённого» собеседника рядом
    if (!on || document.visibilityState !== "visible") return;
    Object.keys(peers).forEach(function (n) {
      var p = peers[n];
      if (!p.pc || p.pc.connectionState !== "connected" || p.d == null) { p.bad = 0; p.lastBytesAt = 0; return; }
      p.pc.getStats().then(function (r) {
        var b = 0;
        r.forEach(function (s) { if (s.type === "inbound-rtp" && (s.kind === "audio" || s.mediaType === "audio")) b += s.bytesReceived || 0; });
        if (p.lastBytesAt && b - (p.lastBytes || 0) < 400) p.bad = (p.bad || 0) + 1; else p.bad = 0;   // даже молчание — пакеты идут; 0 байт 10 с — связь мёртвая
        p.lastBytes = b; p.lastBytesAt = Date.now();
        if (p.bad >= 2) resetPeer(n, true);
      }).catch(function () { });
      if (p.el && p.el.paused) { var pl = p.el.play(); if (pl && pl.catch) pl.catch(function () { }); }
    });
    var t = micTrack(); if (t && t.readyState === "ended") reacquireMic();
    if (ctx && ctx.state !== "running") ctx.resume().catch(function () { }).then(function () { needTap(ctx && ctx.state !== "running"); });
  }
  setInterval(audioWatch, 5000);
  function recover() {
    if (!on) return;
    if (ctx && ctx.state !== "running") ctx.resume().then(function () { needTap(ctx.state !== "running"); }).catch(function () { needTap(true); });
    var t = micTrack(); if (!t || t.readyState === "ended") reacquireMic();
    Object.keys(peers).forEach(function (n) {
      var p = peers[n];
      if (p.el && p.el.paused) { var pl = p.el.play(); if (pl && pl.catch) pl.catch(function () { }); }
      if (p.pc && (p.pc.connectionState === "failed" || p.pc.connectionState === "disconnected")) resetPeer(n, true);
      p.bad = 0; p.lastBytesAt = 0;   // сторож начнёт считать заново
    });
    if (window.VPSound && VPSound.unlock) VPSound.unlock();
    try { if (navigator.wakeLock && (!wakeLock || wakeLock.released)) navigator.wakeLock.request("screen").then(function (w) { wakeLock = w; w.addEventListener && w.addEventListener("release", function () { if (wakeLock === w) wakeLock = null; }); }).catch(function () { }); } catch (e) { }
    polling = false; tickPoll();   // сразу узнать, кто рядом
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") { if (hiddenAt) recover(); } else hiddenAt = Date.now();
  });
  window.addEventListener("pageshow", function () { recover(); });
  window.addEventListener("focus", function () { if (on && ctx && ctx.state !== "running") recover(); });
  function fixTap() {   // нажатие — браузер разрешает вернуть звук и микрофон
    needTap(false);
    if (ctx) ctx.resume().catch(function () { });
    var t = micTrack(); if (!t || t.readyState === "ended") reacquireMic();
    Object.keys(peers).forEach(function (n) { var p = peers[n]; if (p.el) { var pl = p.el.play(); if (pl && pl.catch) pl.catch(function () { }); } });
    if (window.VPSound && VPSound.unlock) VPSound.unlock();
  }
  function mediaSession(on2) {   // Android/ПК: «плеер» на экране блокировки — система реже усыпляет вкладку
    try {
      if (!("mediaSession" in navigator)) return;
      if (!on2) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = "none"; return; }
      navigator.mediaSession.metadata = new MediaMetadata({title: "Голос и звуки мира", artist: "DaviArt Craft", album: "daviart.com",
        artwork: [{src: "img/favicon-192.png", sizes: "192x192", type: "image/png"}]});
      navigator.mediaSession.playbackState = "playing";
      navigator.mediaSession.setActionHandler("pause", function () { micOn = false; applyMic(); ctl(); });
      navigator.mediaSession.setActionHandler("play", function () { micOn = true; applyMic(); ctl(); fixTap(); });
    } catch (e) { }
  }

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
    })).then(function (l) { var o = {}; l.forEach(function (x) { o[x[0]] = x[1]; }); return {on: on, me: myName, inGame: lastState && lastState.inGame, peers: o, nr: NR_NAMES[nrMode], gate: !!gate, open: gateOpen, duck: ducked}; });
  }
  window.VPVoice = {mount: mount, active: function () { return on; }, stats: stats, range: function () { return range; },
    __dbg: function () { var t = micTrack(); return {ctx: ctx && ctx.state, mic: t ? t.readyState : null, micId: t ? t.id : null, gate: !!gate, on: on}; },   // для теста
    __stopMic: function () { var t = micTrack(); if (t) { t.stop(); t.dispatchEvent(new Event("ended")); } },
    __suspend: function () { return ctx ? ctx.suspend() : null; }};
})();
