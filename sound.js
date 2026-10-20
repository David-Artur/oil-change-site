/* У290 — «звучащие точки» в голосовом чате «рядом» (идея владельца 2026-10-20).
 * Пока ты в голосе, у мест играет своя музыка (генерируется прямо в браузере — своя, без файлов и чужих треков), а жители рядом говорят
 * свои реплики (голос браузера). Громкость — по расстоянию в игре, сторона (лево/право) — по повороту головы; когда кто-то говорит в
 * голосе — звуки тише. Точки — sounds.json (scripts/sounds/build_sounds.py). Позиция — /api/home live (как у компаса), раз в секунду.
 * Подключение (voice.js): VPSound.start({ctx: AudioContext, api: fn}), VPSound.stop(), VPSound.duck(bool), VPSound.toggle(), VPSound.volume(0..1). */
(function () {
  "use strict";
  // ---------------------------------------------------------------- пресеты музыки: лад, аккорды (полутоны от тоники), темп, тембры
  var PRESETS = {
    lobby: {root: 60, bpm: 58, chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 7]], scale: [0, 2, 4, 7, 9], pad: "sine", cut: 1300, arp: 0.32, arpOct: 1, bell: true, bass: true, fb: 0.45},
    holy: {root: 62, bpm: 72, chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], scale: [0, 2, 4, 7, 9], pad: "triangle", cut: 2200, arp: 0.55, arpOct: 1, bell: true, bass: true, fb: 0.38},
    valley: {root: 55, bpm: 84, chords: [[0, 4, 7], [-2, 2, 5], [5, 9, 12], [0, 4, 7]], scale: [0, 2, 4, 5, 7, 9, 10], pad: "triangle", cut: 1600, arp: 0, flute: 0.6, bass: true, fb: 0.3},
    frontier: {root: 57, bpm: 76, chords: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]], scale: [0, 2, 3, 5, 7, 9, 10], pad: "sawtooth", cut: 850, arp: 0.35, arpOct: 0, drum: true, bass: true, fb: 0.3},
    wastes: {root: 38, bpm: 40, chords: [[0, 7, 13], [0, 6, 12]], scale: [0, 1, 5, 6], pad: "sawtooth", cut: 420, arp: 0.08, arpOct: 1, wind: 0.5, drone: true, fb: 0.5},
    nether: {root: 40, bpm: 52, chords: [[0, 3, 7], [1, 5, 8]], scale: [0, 1, 3, 5, 7, 8], pad: "sawtooth", cut: 600, arp: 0.2, arpOct: 1, drum: true, crackle: 0.35, drone: true, fb: 0.35},
    end: {root: 59, bpm: 48, chords: [[0, 4, 7, 11, 18], [2, 6, 9, 13, 18]], scale: [0, 2, 4, 6, 7, 9, 11], pad: "sine", cut: 3000, arp: 0.5, arpOct: 2, bell: true, fb: 0.6}
  };
  var cfg = null, ctx = null, api = null, master = null, on = false, timer = null, pos = null, gens = {}, talk = {}, ducked = false;
  var enabled = pref("on") !== "0", vol = pref("vol") == null ? 0.7 : Math.max(0, Math.min(1, +pref("vol"))), nowTxt = "", speakingNpc = null;
  function pref(k, v) { try { if (v === undefined) return localStorage.getItem("daviart.sound." + k); localStorage.setItem("daviart.sound." + k, v); } catch (e) { return null; } }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function start(o) {
    if (on || !o || !o.ctx) return;
    ctx = o.ctx; api = o.api; on = true;
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    if (!cfg) fetch("sounds.json?v=1", {cache: "no-cache"}).then(function (r) { return r.json(); }).then(function (j) { cfg = j; }).catch(function () { });
    timer = setInterval(tick, 1000); tick();
  }
  function stop() {
    on = false; clearInterval(timer); timer = null;
    Object.keys(gens).forEach(function (k) { gens[k].kill(); }); gens = {};
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { }
    master = null; ctx = null; pos = null; nowTxt = ""; speakingNpc = null;
  }
  function tick() {
    if (!on) return;
    api("/home", {action: "live", since: 9e15}).then(function (j) {
      if (!on) return;
      pos = j && j.online && j.me && j.me.worldId ? {w: j.me.worldId, x: j.me.x, z: j.me.z, yaw: j.me.yaw || 0} : null;
      update();
    });
  }
  function level() { return enabled ? vol * (ducked ? 0.35 : 1) : 0; }
  function update() {
    if (!master || !ctx) return;
    master.gain.setTargetAtTime(level(), ctx.currentTime, 0.4);
    if (!cfg) return;
    var txt = [];
    (cfg.music || []).forEach(function (m) {
      var d = pos && pos.w === m.world ? Math.hypot(pos.x - m.x, pos.z - m.z) : Infinity, g = gens[m.id];
      if (d < m.radius * 1.1 && enabled) {
        if (!g) g = gens[m.id] = new Gen(PRESETS[m.preset] || PRESETS.lobby);
        var k = d < m.radius * 0.3 ? 1 : Math.max(0, 1 - (d - m.radius * 0.3) / (m.radius * 0.7));
        g.set(m.vol * k * k, d < 6 ? 0 : pan(m.x, m.z));
        if (k > 0.05) txt.push("🎵 " + (m.title || m.id));
      } else if (g) { g.fade(); delete gens[m.id]; }
    });
    // жители: ближайший в радиусе — иногда говорит
    var best = null, bd = 1e9;
    if (pos && enabled && window.speechSynthesis) (cfg.speech || []).forEach(function (n) {
      if (n.world !== pos.w) return;
      var d = Math.hypot(pos.x - n.x, pos.z - n.z);
      if (d < n.radius && d < bd) { bd = d; best = n; }
    });
    if (best) {
      txt.push("🗣 " + best.name);
      var t = talk[best.id] || (talk[best.id] = {next: Date.now() + 2500, last: -1});
      if (Date.now() > t.next && !speechSynthesis.speaking) say(best, bd, t);
    }
    nowTxt = txt.join(" · ");
    var el = document.getElementById("vc-sndnow"); if (el) el.textContent = nowTxt || (pos ? "здесь тихо" : "звуки — когда ты в игре");
  }
  function pan(x, z) {   // Minecraft: yaw 0 — на юг (+z), растёт по часовой (вправо)
    var to = Math.atan2(-(x - pos.x), z - pos.z) * 180 / Math.PI, rel = (to - pos.yaw) * Math.PI / 180;
    return Math.max(-0.85, Math.min(0.85, Math.sin(rel) * 0.85));
  }
  var ruVoice = null;
  function voice() {
    if (ruVoice) return ruVoice;
    var vs = speechSynthesis.getVoices() || [];
    ruVoice = vs.filter(function (v) { return /^ru/i.test(v.lang); })[0] || null;
    return ruVoice;
  }
  function say(n, d, t) {
    var i; do { i = Math.floor(Math.random() * n.lines.length); } while (n.lines.length > 1 && i === t.last);
    t.last = i; t.next = Date.now() + rnd((n.every || [18, 40])[0], (n.every || [18, 40])[1]) * 1000;
    var u = new SpeechSynthesisUtterance(n.lines[i]);
    var v = voice(); if (v) u.voice = v; u.lang = "ru-RU";
    u.pitch = n.pitch || 1; u.rate = n.rate || 1;
    u.volume = Math.max(0.05, Math.min(1, level() * 1.3 * (1 - d / n.radius * 0.7)));
    speakingNpc = n.name; u.onend = function () { speakingNpc = null; };
    try { speechSynthesis.speak(u); } catch (e) { }
  }

  // ---------------------------------------------------------------- генератор: пэд-аккорды, бас, перебор/колокольчики, «флейта», ударные, ветер
  function Gen(p) {
    var self = this, out = ctx.createGain(), pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    out.gain.value = 0;
    var bus = ctx.createGain(), dl = ctx.createDelay(2), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
    dl.delayTime.value = 60 / p.bpm * 0.75; fb.gain.value = p.fb || 0.35; lp.type = "lowpass"; lp.frequency.value = 2400;
    bus.connect(out); bus.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(out);
    if (pn) { out.connect(pn); pn.connect(master); } else out.connect(master);
    var step = 0, nextT = ctx.currentTime + 0.15, dur8 = 60 / p.bpm / 2, alive = true, srcs = [];
    function note(f, t, d, type, g, att, rel, cut) {
      var o = ctx.createOscillator(), e = ctx.createGain(), fl = ctx.createBiquadFilter();
      o.type = type; o.frequency.value = f; fl.type = "lowpass"; fl.frequency.value = cut || p.cut;
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + att); e.gain.setValueAtTime(g, t + Math.max(att, d - rel)); e.gain.linearRampToValueAtTime(0, t + d);
      o.connect(fl); fl.connect(e); e.connect(bus); o.start(t); o.stop(t + d + 0.05);
      return o;
    }
    function noise(g, cut, q) {   // ветер / треск — бесконечный шум через фильтр
      var len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), a = b.getChannelData(0);
      for (var i = 0; i < len; i++) a[i] = Math.random() * 2 - 1;
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), e = ctx.createGain();
      s.buffer = b; s.loop = true; f.type = "bandpass"; f.frequency.value = cut; f.Q.value = q; e.gain.value = g;
      s.connect(f); f.connect(e); e.connect(bus); s.start(); srcs.push(s);
      return {f: f, e: e};
    }
    var wind = p.wind ? noise(p.wind * 0.25, 500, 0.7) : null, crack = p.crackle ? noise(p.crackle * 0.12, 2500, 2) : null;
    var droneO = null;
    if (p.drone) { droneO = ctx.createOscillator(); var dg = ctx.createGain(), df = ctx.createBiquadFilter(); droneO.type = "sawtooth"; droneO.frequency.value = hz(p.root - 12);
      df.type = "lowpass"; df.frequency.value = 220; dg.gain.value = 0.05; droneO.connect(df); df.connect(dg); dg.connect(bus); droneO.start(); srcs.push(droneO); }
    function playStep(s, t) {
      var bar = Math.floor(s / 8), ch = p.chords[bar % p.chords.length], beat = s % 8;
      if (beat === 0) {   // пэд на такт
        ch.forEach(function (iv, k) { [-6, 6].forEach(function (det) { var o = note(hz(p.root + iv), t, dur8 * 8.2, p.pad, 0.028, dur8 * 2.5, dur8 * 3); o.detune.value = det + k; }); });
        if (p.bass) note(hz(p.root + ch[0] - 12), t, dur8 * 7.5, "triangle", 0.09, 0.08, dur8 * 2, 600);
      }
      if (p.bass && beat === 4) note(hz(p.root + ch[0] - 12 + (Math.random() < 0.5 ? 7 : 0)), t, dur8 * 3.5, "triangle", 0.06, 0.05, dur8, 600);
      if (p.arp && Math.random() < p.arp) {
        var pool = ch.concat(p.scale), iv = pool[Math.floor(Math.random() * pool.length)];
        var f = hz(p.root + iv + 12 * (p.arpOct || 1) + (Math.random() < 0.25 ? 12 : 0));
        if (p.bell) { note(f, t, dur8 * 3, "sine", 0.05, 0.005, dur8 * 2.8, 5000); note(f * 2.01, t, dur8 * 1.5, "sine", 0.012, 0.005, dur8 * 1.4, 6000); }
        else note(f, t, dur8 * 1.6, "triangle", 0.045, 0.01, dur8 * 1.2);
      }
      if (p.flute && beat % 2 === 0 && Math.random() < p.flute) {   // «пастушья дудочка» — с вибрато
        var fi = p.scale[Math.floor(Math.random() * p.scale.length)], ff = hz(p.root + fi + 12);
        var o = note(ff, t, dur8 * (Math.random() < 0.3 ? 3.5 : 1.8), "sine", 0.05, 0.04, dur8 * 0.8, 3000);
        var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5; lg.gain.value = ff * 0.012; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur8 * 4);
      }
      if (p.drum && (beat === 0 || beat === 4 || (beat === 6 && Math.random() < 0.3))) {   // мягкий барабан
        var k = ctx.createOscillator(), kg = ctx.createGain(); k.type = "sine";
        k.frequency.setValueAtTime(110, t); k.frequency.exponentialRampToValueAtTime(42, t + 0.25);
        kg.gain.setValueAtTime(0.18, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.35); k.connect(kg); kg.connect(bus); k.start(t); k.stop(t + 0.4);
      }
      if (wind && beat === 0) wind.f.frequency.setTargetAtTime(rnd(300, 900), t, dur8 * 4);
    }
    var iv = setInterval(function () {
      if (!alive || !ctx) return;
      if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;   // вкладка спала — не наверстываем пачкой
      while (nextT < ctx.currentTime + 0.7) { playStep(step, nextT); nextT += dur8; step++; }
    }, 250);
    this.set = function (g, pv) { if (!ctx) return; out.gain.setTargetAtTime(g, ctx.currentTime, 0.8); if (pn) pn.pan.setTargetAtTime(pv, ctx.currentTime, 0.3); };
    this.fade = function () { if (!ctx) return; out.gain.setTargetAtTime(0, ctx.currentTime, 0.8); setTimeout(self.kill, 4000); };
    this.kill = function () { alive = false; clearInterval(iv); srcs.forEach(function (s) { try { s.stop(); } catch (e) { } }); try { out.disconnect(); } catch (e) { } };
  }

  window.VPSound = {
    start: start, stop: stop,
    duck: function (v) { if (v !== ducked) { ducked = v; if (master && ctx) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.3); } },
    toggle: function () { enabled = !enabled; pref("on", enabled ? "1" : "0"); if (!enabled) { try { speechSynthesis.cancel(); } catch (e) { } } update(); return enabled; },
    volume: function (v) { if (v != null) { vol = Math.max(0, Math.min(1, v)); pref("vol", String(vol)); update(); } return vol; },
    enabled: function () { return enabled; },
    now: function () { return nowTxt; }
  };
})();
