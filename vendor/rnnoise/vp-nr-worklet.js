/* У401 (владелец 2026-10-25): автошумоподавление голоса — «изоляция голоса» для голосового чата daviart.com (voice.js).
 * AudioWorklet: микрофон → RNNoise (нейросеть xiph/rnnoise, BSD-3; сборка wasm — vendor/rnnoise/rnnoise*.wasm) → авто-гейт → собеседникам.
 * RNNoise работает на 48 кГц кадрами по 480 сэмплов (10 мс); если AudioContext не 48 кГц — линейный ресемпл туда и обратно.
 * Авто-гейт (без режимов): открывается только на речь — вероятность голоса (VAD) от RNNoise выше порога, порог сам растёт с шумом фона;
 * держится 350 мс после последнего слова (окончания не режутся). Клики клавиатуры/мыши и стуки (резкий короткий импульс < ~60–80 мс без
 * устойчивой вероятности голоса) гейт не открывают. Кулер/вентилятор (ровный шум) — вычищает RNNoise + постоянная оценка фона.
 * Нет wasm или телефон не тянет (обработка кадра дольше половины его длительности) — RNNoise выключается, работает гейт по уровню
 * (а voice.js включает обычное шумоподавление браузера). Сообщения в voice.js: {ready, rnn} при старте, {open, lvl, vad, rnn, cpu} раз в 80 мс,
 * {overload: true} — перегрузка. Из voice.js: {duck: true|false} — пока говорит собеседник, свой микрофон ×0.35 (против эха).
 * Задержка: ~9 мс буфер кадров + ~10 мс внутри RNNoise. */
(function () {
  "use strict";
  var FRAME = 480, SR48 = 48000, HOLD = 0.35, TICK = 0.08;

  function Resampler(rIn, rOut) { this.step = rIn / rOut; this.pos = 0; this.prev = 0; }
  // линейная интерполяция «на лету»: каждый входной сэмпл → 0..n выходных (между prev и x)
  Resampler.prototype.push = function (x, sink) {
    var pos = this.pos, prev = this.prev, step = this.step;
    while (pos < 1) { sink(prev + (x - prev) * pos); pos += step; }
    this.pos = pos - 1; this.prev = x;
  };

  function Ring(n) { this.b = new Float32Array(n); this.r = 0; this.w = 0; this.n = 0; }
  Ring.prototype.put = function (v) { if (this.n >= this.b.length) { this.r = (this.r + 1) % this.b.length; this.n--; } this.b[this.w] = v; this.w = (this.w + 1) % this.b.length; this.n++; };
  Ring.prototype.get = function () { var v = this.b[this.r]; this.r = (this.r + 1) % this.b.length; this.n--; return v; };

  function rms(a, n) { var s = 0; for (var i = 0; i < n; i++) s += a[i] * a[i]; return Math.sqrt(s / n); }

  // ---- RNNoise из wasm (emscripten-сборка без своего js-клея: три импорта env — пишем сами)
  function loadRnn(bytes) {
    var mem = null;
    var env = {
      emscripten_memcpy_big: function (d, s, n) { var u = new Uint8Array(mem.buffer); u.copyWithin(d, s, s + n); },
      emscripten_resize_heap: function (size) {
        try { var need = size - mem.buffer.byteLength; if (need > 0) mem.grow(Math.ceil(need / 65536)); return 1; } catch (e) { return 0; }
      },
      __assert_fail: function () { throw new Error("rnnoise assert"); }
    };
    return WebAssembly.instantiate(bytes, {env: env, wasi_snapshot_preview1: {}}).then(function (r) {
      var ex = (r.instance || r).exports;
      mem = ex.memory;
      if (ex.emscripten_stack_init) ex.emscripten_stack_init();
      if (ex.__wasm_call_ctors) ex.__wasm_call_ctors();
      var st = ex.rnnoise_create(0), pin = ex.malloc(FRAME * 4), pout = ex.malloc(FRAME * 4);
      if (!st || !pin || !pout) throw new Error("rnnoise create");
      var hin = null, hout = null, buf = null;
      return {
        // in/out — Float32Array(480) в шкале ±1; возвращает вероятность голоса 0..1
        run: function (inp, out) {
          if (buf !== mem.buffer) { buf = mem.buffer; hin = new Float32Array(buf, pin, FRAME); hout = new Float32Array(buf, pout, FRAME); }
          for (var i = 0; i < FRAME; i++) hin[i] = inp[i] * 32768;
          var v = ex.rnnoise_process_frame(st, pout, pin);
          for (var j = 0; j < FRAME; j++) out[j] = hout[j] / 32768;
          return v;
        },
        free: function () { try { ex.rnnoise_destroy(st); } catch (e) { } }
      };
    });
  }

  // ---- ядро: кадры 480 @ 48 кГц → RNNoise → решение гейта
  function Core(sr) {
    this.sr = sr;
    this.rnn = null; this.useRnn = false;
    this.fin = new Float32Array(FRAME); this.fn = 0; this.fout = new Float32Array(FRAME);
    this.t = 0;                 // время в секундах (по кадрам)
    this.floorIn = 0.003;       // фон на входе (до RNNoise)
    this.floorOut = 0.0005;     // фон после RNNoise
    this.floorLvl = 0.003;      // фон для гейта по уровню (без RNNoise)
    this.prevIn = 0;
    this.run = 0;               // кадров подряд «похоже на голос»
    this.openUntil = -1;        // гейт открыт до этого времени (удержание)
    this.isOpen = false;
    this.transUntil = -1;       // после резкого импульса (клик/стук) — строже
    this.vadMax = 0; this.lvl = 0;
    this.cpuMs = 0; this.cpuN = 0; this.cpuAvg = 0; this.overload = false;
    this.frameGain = 0;         // решение гейта на этот кадр (0/1)
  }
  Core.prototype.frame = function () {
    var x = this.fin, y = this.fout, vad = 0, t0 = 0;
    var rIn = rms(x, FRAME);
    if (this.useRnn) {
      t0 = Date.now();
      try { vad = this.rnn.run(x, y); } catch (e) { this.useRnn = false; y.set(x); vad = -1; }
      var dt = Date.now() - t0;
      this.cpuMs += dt; this.cpuN++;
      if (this.cpuN >= 200) {   // 2 с
        this.cpuAvg = this.cpuMs / this.cpuN; this.cpuMs = 0; this.cpuN = 0;
        if (this.cpuAvg > 5) { this.useRnn = false; this.overload = true; }   // кадр 10 мс, а обработка > 5 мс — телефон не тянет
      }
    } else { y.set(x); vad = -1; }
    var rOut = rms(y, FRAME), now = this.t;
    // фон: быстро вниз, медленно вверх (минимум-трекинг) — подстраивается под кулер, улицу и т.п.
    var quiet = vad >= 0 ? vad < 0.3 : true;
    this.floorIn = rIn < this.floorIn ? this.floorIn * 0.9 + rIn * 0.1 : quiet ? this.floorIn * 0.995 + rIn * 0.005 : this.floorIn * 1.0002;
    this.floorOut = rOut < this.floorOut ? this.floorOut * 0.9 + rOut * 0.1 : quiet ? this.floorOut * 0.995 + rOut * 0.005 : this.floorOut * 1.0002;
    if (this.floorIn < 1e-5) this.floorIn = 1e-5;
    if (this.floorOut < 1e-6) this.floorOut = 1e-6;
    // резкий импульс: вход прыгнул > 14 дБ за 10 мс — 90 мс строгих условий (клик, стук, щелчок мыши)
    if (rIn > this.prevIn * 5 && rIn > this.floorIn * 4) this.transUntil = now + 0.09;
    this.prevIn = rIn;
    // порог голоса растёт с шумом фона: тихо (-60 дБ) — 0.5, очень шумно (-25 дБ) — 0.8
    var nDb = 20 * Math.log(this.floorIn) / Math.LN10, k = Math.max(0, Math.min(1, (nDb + 60) / 35));
    var thOn = 0.5 + 0.3 * k, thHold = thOn - 0.3;
    var voiced, keep;
    if (vad >= 0) {
      var loud = rOut > Math.max(this.floorOut * 3, 0.0015);
      voiced = vad >= thOn && loud;
      keep = vad >= thHold && rOut > Math.max(this.floorOut * 2, 0.001);
    } else {   // без RNNoise — по уровню (как старый шумодав «обычно»): фон — среднее по закрытым кадрам, а не минимум (кулер «гуляет»)
      this.floorLvl += (rIn - this.floorLvl) * (now < 1.5 ? 0.05 : this.isOpen ? 0.0005 : rIn > this.floorLvl ? 0.01 : 0.03);   // первые 1,5 с — быстро узнать фон
      var th = Math.max(this.floorLvl * 2.5, 0.006);
      voiced = rIn > th; keep = rIn > th * 0.7;
    }
    var trans = now < this.transUntil;
    if (trans && (vad < 0 || vad < thOn)) keep = false;   // клики между фразами не продлевают удержание
    this.run = voiced ? this.run + 1 : 0;
    var need = trans ? 7 : 2;   // обычно 20 мс голоса подряд; сразу после импульса — 70 мс
    if (this.run >= need) this.openUntil = now + HOLD;
    else if (this.isOpen && keep) this.openUntil = Math.max(this.openUntil, now + HOLD);
    this.isOpen = now < this.openUntil;
    this.frameGain = this.isOpen ? 1 : 0;
    if (vad > this.vadMax) this.vadMax = vad;
    this.lvl = Math.max(this.lvl, this.isOpen ? rOut : 0);
    this.t += FRAME / SR48;
  };

  if (typeof AudioWorkletProcessor === "undefined") { if (typeof module !== "undefined") module.exports = {Core: Core, Resampler: Resampler, loadRnn: loadRnn}; return; }

  class VPNr extends AudioWorkletProcessor {
    constructor(o) {
      super();
      var po = (o && o.processorOptions) || {};
      var sr = sampleRate;
      this.core = new Core(sr);
      this.duck = false; this.g = 0; this.last = 0;
      this.up = sr === SR48 ? null : new Resampler(sr, SR48);
      this.down = sr === SR48 ? null : new Resampler(SR48, sr);
      this.q = new Ring(8192); this.qg = new Ring(8192);   // выход (после RNNoise) и решение гейта на каждый сэмпл
      this.prefill = sr === SR48 ? 448 : Math.ceil(FRAME * sr / SR48) + 136;
      this.primed = false;
      var self = this;
      this.port.onmessage = function (e) { var d = e.data || {}; if ("duck" in d) self.duck = !!d.duck; if (d.noRnn) self.core.useRnn = false; if (d.testOverload) { self.core.useRnn = false; self.core.overload = true; } };
      if (po.wasm && typeof WebAssembly !== "undefined") {
        loadRnn(po.wasm).then(function (r) { self.core.rnn = r; self.core.useRnn = true; self.port.postMessage({ready: true, rnn: true}); },
          function (er) { self.port.postMessage({ready: true, rnn: false, err: String(er && er.message || er)}); });
      } else this.port.postMessage({ready: true, rnn: false});
      var c = this.core, q = this.q, qg = this.qg, dn = this.down;
      this.sinkOut = function (v) { q.put(v); qg.put(c.frameGain); };
      this.sink48 = function (v) {   // сэмпл в 48 кГц → кадр
        c.fin[c.fn++] = v;
        if (c.fn === FRAME) {
          c.fn = 0; c.frame();
          var y = c.fout;
          if (dn) { for (var i = 0; i < FRAME; i++) dn.push(y[i], self.sinkOut); }
          else for (var j = 0; j < FRAME; j++) { q.put(y[j]); qg.put(c.frameGain); }
        }
      };
    }
    process(inputs, outputs) {
      var a = inputs[0] && inputs[0][0], out = outputs[0], c = this.core;
      if (!out || !out[0]) return true;
      var n = out[0].length, o = out[0];
      if (a) {
        if (this.up) for (var i = 0; i < a.length; i++) this.up.push(a[i], this.sink48);
        else for (var k = 0; k < a.length; k++) this.sink48(a[k]);
      }
      if (!this.primed && this.q.n >= this.prefill) this.primed = true;
      var duck = this.duck ? 0.35 : 1;
      for (var s = 0; s < n; s++) {
        var v = 0, want = 0;
        if (this.primed && this.q.n > 0) { v = this.q.get(); want = this.qg.get() * duck; }
        else if (this.primed) this.primed = false;   // опустело (не должно) — заново набрать запас
        this.g += (want - this.g) * (want > this.g ? 0.02 : 0.0015);   // открытие ~1 мс, закрытие ~15 мс (после удержания 350 мс)
        o[s] = v * this.g;
      }
      for (var ch = 1; ch < out.length; ch++) out[ch].set(o);
      if (currentTime - this.last >= TICK) {
        this.last = currentTime;
        this.port.postMessage({open: c.isOpen, lvl: c.lvl, vad: c.vadMax, rnn: c.useRnn, cpu: c.cpuAvg, floor: c.floorIn});
        c.vadMax = 0; c.lvl = 0;
        if (c.overload) { c.overload = false; this.port.postMessage({overload: true}); }
      }
      return true;
    }
  }
  registerProcessor("vp-nr", VPNr);
})();
