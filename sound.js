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
    end: {root: 59, bpm: 48, chords: [[0, 4, 7, 11, 18], [2, 6, 9, 13, 18]], scale: [0, 2, 4, 6, 7, 9, 11], pad: "sine", cut: 3000, arp: 0.5, arpOct: 2, bell: true, fb: 0.6},
    // У291: ночной клуб — хаус 124 уд/мин: бочка на каждую долю, хэт на «и», хлопок на 2 и 4, бас на «и», аккорды-стабы
    club: {root: 57, bpm: 124, chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 9], [-5, -2, 2, 5]], scale: [0, 3, 5, 7, 10], pad: "sawtooth", cut: 1800, arp: 0.3, arpOct: 1, house: "house", fb: 0.22, padVol: 0.012},
    // У295: заказ трека у DJ — диско (бас октавами, открытый хэт, струнные стабы) и чилл (медленно, мягкие аккорды, бочка на 1 и 3)
    club_disco: {root: 60, bpm: 118, chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5]], scale: [0, 2, 4, 7, 9], pad: "sawtooth", cut: 2600, arp: 0.25, arpOct: 1, house: "disco", fb: 0.2, padVol: 0.014},
    club_chill: {root: 55, bpm: 88, chords: [[0, 4, 7, 11, 14], [-3, 0, 4, 7, 11], [-7, -3, 0, 4, 7], [-5, -1, 2, 5, 9]], scale: [0, 2, 4, 7, 9], pad: "triangle", cut: 1400, arp: 0.4, arpOct: 1, house: "chill", fb: 0.35, padVol: 0.02}
  };
  PRESETS.club_house = PRESETS.club;
  // 2026-10-21 (владелец: «чтобы играло и в свёрнутой вкладке»): таймеры — из фонового потока (Worker). Обычные таймеры свёрнутая вкладка
  // замедляет до раза в минуту — музыка рвалась; таймеры Worker идут как надо. Нет Worker — обычные таймеры.
  var WT = (function () {
    try {
      var w = new Worker(URL.createObjectURL(new Blob(["var t={};onmessage=function(e){var d=e.data;if(d.c){clearInterval(t[d.id]);delete t[d.id]}else t[d.id]=setInterval(function(){postMessage(d.id)},d.ms)}"], {type: "text/javascript"})));
      var cb = {}, n = 0;
      w.onmessage = function (e) { var f = cb[e.data]; if (f) f(); };
      return {set: function (f, ms) { var id = ++n; cb[id] = f; w.postMessage({id: id, ms: ms}); return id; },
        clear: function (id) { if (id == null || !cb[id]) return; delete cb[id]; w.postMessage({id: id, c: 1}); }};
    } catch (e) { return null; }
  })();
  function setInterval(f, ms) { return WT ? WT.set(f, ms) : window.setInterval(f, ms); }
  function clearInterval(id) { if (WT) WT.clear(id); else window.clearInterval(id); }
  var uw = null, uwG = null, underW = false;   // У323: фильтр «под водой» после master
  var cfg = null, ctx = null, api = null, master = null, on = false, timer = null, pos = null, posAt = 0, gens = {}, talk = {}, ducked = false;
  var enabled = pref("on") !== "0", vol = pref("vol") == null ? 0.7 : Math.max(0, Math.min(1, +pref("vol"))), nowTxt = "", speakingNpc = null;
  function pref(k, v) { try { if (v === undefined) return localStorage.getItem("daviart.sound." + k); localStorage.setItem("daviart.sound." + k, v); } catch (e) { return null; } }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function start(o) {
    if (on || !o || !o.ctx) return;
    ctx = o.ctx; api = o.api; on = true;
    master = ctx.createGain(); master.gain.value = 0;
    // У323 (владелец 2026-10-23): под водой всё глухо — звук мира через фильтр, над водой он открыт и не слышен
    uw = ctx.createBiquadFilter(); uw.type = "lowpass"; uw.Q.value = 1.5; uw.frequency.value = Math.min(20000, ctx.sampleRate / 2 - 200);
    uwG = ctx.createGain(); master.connect(uw); uw.connect(uwG); uwG.connect(ctx.destination); underW = false;
    if (!cfg) fetch("sounds.json?v=1", {cache: "no-cache"}).then(function (r) { return r.json(); }).then(function (j) { cfg = j; clubZone(); }).catch(function () { });
    timer = setInterval(tick, 1000); tick();
    clubT = setInterval(clubZone, 15000); clubZone(); [1200, 2500, 4000, 6000, 9000].forEach(function (ms) { setTimeout(clubZone, ms); });   // У321: 6 проб часов на старте (берётся самая быстрая)
  }
  // У291: клуб — где он построен, сервер сам говорит в публичном /api/players (VPLand 0.9.20, поле club); нет поля — клуба нет, музыки тоже
  // 2026-10-21 (владелец: «рассинхрон — каждый слышит свой трек»): часы для плейлиста — СЕРВЕРНЫЕ (поле t в /api/players), а не часы устройства:
  // сдвиг = t − середина запроса; из проб берём ту, где запрос был быстрее всего (точнее), старые пробы «стареют».
  var clubT = null, club = null, clk = {off: null, rtt: 1e9, at: 0}, zoneAt = 0;
  function serverNow() { return Date.now() + (clk.off || 0); }
  // У321: задержка вывода звука (буфер браузера + звуковая карта/Bluetooth): то, что слышно сейчас, — позиция трека «минус lat»
  function outLat() { var l = ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0; return isFinite(l) ? Math.max(0, Math.min(0.5, l)) : 0; }
  function clubZone() {
    var t0 = Date.now(); zoneAt = t0;
    fetch("https://mc.daviart.com/api/players", {cache: "no-store"}).then(function (r) { return r.json(); }).then(function (j) {
      var t1 = Date.now(), rtt = t1 - t0;
      if (j && typeof j.t === "number" && rtt < 5000) {
        // У321: проба «стареет» на 1 мс за 10 с (часы устройства уходят не быстрее ~0.1 мс/с); было 1 мс за 60 мс — любая новая проба
        // вытесняла точную, и сдвиг часов прыгал на десятки мс
        var aged = clk.rtt + (t1 - clk.at) / 10000;
        if (clk.off == null || rtt <= aged) { clk.off = j.t - (t0 + t1) / 2; clk.rtt = rtt; clk.at = t1; }
      }
      if (!j || typeof j.t !== "number") return;   // сбойный ответ — клуб не «исчезает» (музыка не обрывается)
      club = j.club && j.club.world ? j.club : null; applyClub();
    }).catch(function () { });
  }
  function applyClub() {
    if (!cfg) return;
    cfg.zones = (cfg.zones || []).filter(function (z) { return z.id !== "club"; });
    // У298 (владелец 2026-10-21: «договорились — только скачанная музыка»): в клубе играют ТОЛЬКО свои треки с нашего сайта (music/…).
    // Радио убрано: если сервер ещё присылает старые жанры радио (record/soma — до VPLand 0.9.22), играем свой хаус / чилл.
    var genre = club && /^(own|house|disco|chill|record|soma)$/.test(club.genre || "") ? club.genre : "house";
    // 2026-10-22 (владелец: «в клубе — только наши сгенерированные треки, всё остальное удалить»): хаус/диско/чилл (Kevin MacLeod)
    // с сайта удалены — любой жанр от DJ играет наши треки (own), пока кнопки жанров не убраны из VPLand
    genre = "own";
    var GN = {own: "наши треки", house: "хаус", disco: "диско", chill: "чилл"};
    // 2026-10-22 (VPLand 0.9.29): own — наши треки; какие именно — выбирают у DJ (club.tracks), играют вперемешку с плавными переходами
    // У313 (VPLand 0.9.33): сервер сам ведёт расписание (club.now/next/queue — заказы у DJ) → плейлист «own» читает его на каждом шаге;
    // нет расписания (старый сервер) — как раньше: выбранные треки вперемешку по серверным часам
    var list = genre === "own" ? (club && club.now ? "own" : "own:" + (club && club.tracks && club.tracks.length ? club.tracks.join(",") : "")) : genre;
    // У373: y1/y2 — высота зала (клуб в горе: кто ходит по поверхности над ним — не «внутри»); нет полей (старый сервер) — без высоты
    if (club) cfg.zones.push({id: "club", world: club.world, x1: club.x1, z1: club.z1, x2: club.x2, z2: club.z2, y1: club.y1, y2: club.y2, preset: "list_" + list,
      // треки сведены громко — 0.32 ≈ громкость остальной музыки
      // 2026-10-22 владелец: «самое громкое — между 4 колонн (танцпол); за колоннами — 65% громкости (владелец: «давай до 65 процентов»)»: танцпол — центр клуба ±5.5 бл.
      peak: {x1: (club.x1 + club.x2) / 2 - 5.5, x2: (club.x1 + club.x2) / 2 + 5.5, z1: (club.z1 + club.z2) / 2 - 5.5, z2: (club.z1 + club.z2) / 2 + 5.5}, offPeak: 0.65,
      stage: {x: (club.x1 + club.x2) / 2, z: club.z2 - 1.5}, wet: 0.35,   // сцена DJ — у южной стены (дверь — север); отзвук зала
      // 2026-10-25 владелец: «по холму над клубом иногда слышно — не нравится»: клуб в горе (есть туннель в sounds.json) — снаружи слышно
      // только через туннель, сквозь толщу горы — почти сразу тишина (fade 3 вместо 30)
      vol: 0.32, exclusive: true, fade: (cfg.tunnels || []).some(function (t) { return t.zone === "club" && t.world === club.world; }) ? 3 : 30, title: "DaviArt Holy Club · " + GN[genre] + (club.party ? " · вечеринка!" : "")});
  }
  function stop() {
    on = false; clearInterval(timer); timer = null; clearInterval(clubT); clubT = null;
    Object.keys(gens).forEach(function (k) { gens[k].kill(); }); gens = {};
    if (Z) { Z.decks.forEach(function (d) { try { d.el.pause(); } catch (e) { } }); Z = null; }
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { }
    cfStop();   // У375
    ckStop();   // треск костра (запись-петля)
    mnStop();   // У390: штольня
    master = null; ctx = null; pos = null; nowTxt = ""; speakingNpc = null;
  }
  function tick() {
    if (!on) return;
    api("/home", {action: "live", since: 9e15}).then(function (j) {
      if (!on) return;
      // 2026-10-21 (владелец: «музыка время от времени прерывается»): один пустой/сбойный ответ сервера раньше = «ушёл из клуба» → музыка
      // гасла и начиналась заново. Теперь прежнее место держится 12 с — пропадает, только если игрока правда нет так долго.
      var np = j && j.online && j.me && j.me.worldId ? {w: j.me.worldId, x: j.me.x, y: j.me.y, z: j.me.z, yaw: j.me.yaw || 0} : null;
      if (np) { pos = np; posAt = Date.now(); } else if (Date.now() - posAt > 12000) pos = null;
      waterCheck(!!(j && j.me && (j.me.water || j.water)));   // У323: поле water — VPLand 0.9.37+; нет поля — над водой
      caveCheck();
      update();
    });
  }

  // ---------------------------------------------------------------- пещера (владелец 2026-10-20: «в пещерах — эхо в голосовом чате»)
  // Высота поверхности — из рельефа карты (dem z=0: 1 пиксель = 1 блок, как у компаса). Ниже поверхности на 4+ блока — пещера: эхо тем сильнее,
  // чем глубже (полное — с 14 бл.). Ад — пещера всегда, лобби и Энд — нет.
  var DEM = "https://david-artur.github.io/daviart-map/dem/", MPB = 40075016.686 / (512 * Math.pow(2, 18)), dem = {}, cave = 0;
  function demTile(w, tx, tz) {
    var k = w + ":" + tx + ":" + tz;
    if (dem[k] !== undefined) return dem[k];
    dem[k] = null;   // грузится
    var img = new Image(); img.crossOrigin = "anonymous";
    img.onload = function () {
      try {
        var c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        var g = c.getContext("2d"); g.drawImage(img, 0, 0); dem[k] = {d: g.getImageData(0, 0, img.width, img.height).data, w: img.width};
      } catch (e) { dem[k] = false; }
    };
    img.onerror = function () { dem[k] = false; };
    img.src = DEM + encodeURIComponent(w) + "/0/" + tx + "_" + tz + ".png";
    return null;
  }
  function ground(w, x, z) {
    var tx = Math.floor(x / 512), tz = Math.floor(z / 512), t = demTile(w, tx, tz);
    if (!t) return null;
    var i = ((Math.floor(z) - tz * 512) * t.w + (Math.floor(x) - tx * 512)) * 4, d = t.d;
    return ((d[i] * 256 + d[i + 1] + d[i + 2] / 256) - 32768) / MPB;
  }
  // У323: голова под водой — музыка и звуки мира глухие (фильтр ~350 Гц) и тише; вынырнул — плавно открываются
  function waterCheck(w) {
    if (!uw || !ctx || w === underW) return;
    underW = w;
    var t = ctx.currentTime;
    uw.frequency.cancelScheduledValues(t);
    uw.frequency.setTargetAtTime(w ? 350 : Math.min(20000, ctx.sampleRate / 2 - 200), t, w ? 0.08 : 0.15);
    uwG.gain.setTargetAtTime(w ? 0.45 : 1, t, 0.12);
  }
  // расстояние от игрока до помещения-зоны: 0 — внутри; У373: если сервер дал высоту зала (y1..y2, ±1 блок) — считается и по высоте
  function zoneDist(z, p) {
    if (!p || p.w !== z.world) return Infinity;
    var ex = Math.max(z.x1 - p.x, 0, p.x - z.x2), ez = Math.max(z.z1 - p.z, 0, p.z - z.z2);
    var ey = z.y1 != null && z.y2 != null && p.y != null ? Math.max(z.y1 - 1 - p.y, 0, p.y - z.y2 - 1) : 0;
    return Math.hypot(ex, ey, ez);
  }
  // ---------------------------------------------------------------- У373 (владелец 2026-10-25): туннель к клубу
  // «Идём по туннелю к клубу — слышно клуб большим длинным эхом и басом, ближе — громче; у двери почти громко, но с пещерным эхом;
  // зашли — нормально и чётко». Туннель — sounds.json → tunnels (коробка x/y/z, вход from → дверь to по оси z, pre — «чуть слышно» перед
  // коробкой). Срабатывает, только если клуб (из /api/players) в том же мире, что и туннель. p — путь от входа (0) до двери (1):
  // громкость и фильтр — по экспоненте (ровно «на слух»: каждый шаг — одинаковая прибавка в дБ), эхо и бас — линейно.
  function tunnelAt(z) {
    if (!pos || !cfg || !cfg.tunnels || pos.y == null) return null;
    for (var i = 0; i < cfg.tunnels.length; i++) {
      var t = cfg.tunnels[i];
      if (t.zone !== z.id || t.world !== z.world || t.world !== pos.w) continue;
      var lo = Math.min(t.z1, t.z2), hi = Math.max(t.z1, t.z2), pre = t.pre || 0, dir = t.to >= t.from ? 1 : -1;
      var edge = dir > 0 ? lo - pre : hi + 1 + pre;   // где «чуть слышно» кончается (со стороны входа)
      if (pos.x < t.x1 || pos.x > t.x2 + 1 || pos.y < t.y1 || pos.y > t.y2 + 1) continue;
      if (pos.z < Math.min(edge, lo) || pos.z > Math.max(edge, hi + 1)) continue;
      var V = t.vol || [0.15, 0.7], C = t.cut || [300, 1800], W = t.wet || [0.6, 0.4], B = t.bass || [6, 3];
      var p = Math.max(0, Math.min(1, (pos.z - t.from) / (t.to - t.from)));
      var k = V[0] * Math.pow(V[1] / V[0], p), near = 1;
      var before = (t.from - pos.z) * dir;   // ещё не дошёл до входа (луг у портала) — чуть слышно, к краю — тишина
      if (before > 0) { near = Math.max(0, 1 - before / (Math.abs(t.from - edge) || 1)); k = V[0] * near * near; }
      return {p: p, k: k, cut: C[0] * Math.pow(C[1] / C[0], p), wet: W[0] + (W[1] - W[0]) * p, bass: B[0] + (B[1] - B[0]) * p,
        zk: near * (0.7 + 0.3 * p), dx: (t.x1 + t.x2 + 1) / 2, dz: t.to + 0.5};
    }
    return null;
  }
  function caveCheck() {
    var c = 0;
    var inRoom = pos && cfg && (cfg.zones || []).some(function (z) { return zoneDist(z, pos) === 0; });
    if (pos && pos.y != null && !inRoom) {   // в клубе крыша высокая — это не пещера
      if (pos.w === "vp_nether") c = 0.7;
      else if (pos.w !== "world_lobby" && pos.w !== "world_the_end") {
        var h = ground(pos.w, pos.x, pos.z);
        if (h != null) { var depth = h - pos.y; c = depth <= 4 ? 0 : Math.min(1, (depth - 4) / 10); }
        else c = cave;   // плитка ещё грузится — как было
      }
    }
    cave = c;
  }
  // 2026-10-25 владелец: «если я начинаю говорить — голос бродяг не должен утихать; приглушение — только в клубе»
  function inClubZone() { return !!(pos && cfg && (cfg.zones || []).some(function (z) { return zoneDist(z, pos) === 0; })); }
  function level() { return enabled ? vol * (ducked && inClubZone() ? 0.15 : 1) : 0; }   // Б37: под разговор ≈ −16 дБ (было ×0.35 ≈ −9 дБ — голос тонул)
  function update() {
    if (!master || !ctx) return;
    master.gain.setTargetAtTime(level(), ctx.currentTime, 0.4);
    if (!cfg) return;
    var txt = [], zoneK = 0;
    // У291: зоны-помещения (клуб): внутри — своя музыка в полную силу и только она; снаружи у стен — тише и глуше (за 10 бл. — тишина)
    (cfg.zones || []).forEach(function (z) {
      var de = zoneDist(z, pos), tn = de > 0 ? tunnelAt(z) : null;   // У373: в туннеле к клубу — своя «пещерная» подача
      // владелец 2026-10-20: «снаружи клуба слышно дальше, но не сильно; зашёл — включается нормальная музыка»: у стены 30% и глухо,
      // дальше — тише и ещё глуше, за z.fade блоков (30) — тишина
      // У380: z.near (изба Бабы Яги) — у стен почти в полную силу и не глухо, к z.fade (10–15 бл.) — тишина
      var fo = Math.max(0, 1 - de / (z.fade || 30)), k = de === 0 ? 1 : tn ? tn.k : (z.near ? 1 : 0.3) * Math.pow(fo, z.near ? 1.3 : 1.5), g = gens["z:" + z.id];
      if (k > 0.002 && enabled) {
        if (g && g.preset !== z.preset) { if (g.retire) g.retire(); else g.fade(); g = null; }   // DJ сменил жанр — старое плавно уходит, новое входит
        if (!g) {
          var lid = z.preset.indexOf("list_") === 0 ? z.preset.slice(5) : null;
          g = gens["z:" + z.id] = lid ? new Playlist(lid) : new Gen(PRESETS[z.preset] || PRESETS.club); g.preset = z.preset;
        }
        // внутри: на танцполе (z.peak) — 100%, за колоннами — z.offPeak (переход за 2 блока)
        if (de === 0 && z.peak && pos) {
          var pe = Math.hypot(Math.max(z.peak.x1 - pos.x, 0, pos.x - z.peak.x2), Math.max(z.peak.z1 - pos.z, 0, pos.z - z.peak.z2));
          k *= 1 - (1 - (z.offPeak || 0.8)) * Math.min(1, pe / 5);   // 2026-10-25: переход танцпол → за колоннами за 5 бл. (было 2)
        }
        // 2026-10-22 владелец: «3D-стерео в клубе» — внутри звук идёт со сцены (z.stage): повернул голову — сцена слева/справа
        // (не больше ±0.55, чтобы не уходило в одно ухо), + отзвук зала; снаружи — как было (со стороны клуба, глухо)
        var inPan = de === 0 && z.stage && pos ? pan(z.stage.x, z.stage.z) * 0.65 : 0;
        // У373: в туннеле — звук со стороны двери клуба (не больше ±0.43 — гул туннеля в обоих ушах), глухо, с басом и пещерным эхом
        if (tn) g.set(z.vol * k, pan(tn.dx, tn.dz) * 0.5, tn.cut, 0, tn);
        else g.set(z.vol * k, de === 0 ? inPan : pan((z.x1 + z.x2) / 2, (z.z1 + z.z2) / 2), de === 0 ? 20000 : z.near ? Math.max(2500, 16000 - de * 1000) : Math.max(350, 1100 - de * 25), de === 0 || z.near ? (z.wet || 0) : 0);
        // в туннеле музыка спавна Пограничья почти не слышна (гора), жители молчат
        if (z.exclusive) zoneK = Math.max(zoneK, de === 0 ? 1 : tn ? tn.zk : Math.min(0.8, k * 2.5));
        if (tn) txt.push("🎵 музыка клуба из туннеля"); else txt.push((de === 0 ? "🪩 " : "🔉 ") + (z.title || z.id) + (de === 0 && g.preset && g.preset.indexOf("list_") === 0 && nowTrack ? " · " + nowTrack : ""));
      } else if (g && g.usesZone && enabled && Date.now() - (g.zeroAt || (g.zeroAt = Date.now())) < 8000) {
        g.set(0, 0, 20000);   // плейлист: вышел на миг (телепорт, сбой позиции) — тишина, но трек не сбрасываем 8 с
      } else if (g) { g.fade(); delete gens["z:" + z.id]; }
      if (g && k > 0.002) g.zeroAt = 0;
    });
    (cfg.music || []).forEach(function (m) {
      var d = pos && pos.w === m.world ? Math.hypot(pos.x - m.x, pos.z - m.z) : Infinity, g = gens[m.id];
      if (d < m.radius * 1.1 && enabled) {
        if (!g) g = gens[m.id] = new Gen(PRESETS[m.preset] || PRESETS.lobby);
        var k = d < m.radius * 0.3 ? 1 : Math.max(0, 1 - (d - m.radius * 0.3) / (m.radius * 0.7));
        // 2026-10-25 владелец: «вышел из туннеля на спавн — звук резко-резко растёт; пусть громче всего у самого портала, дальше тише,
        // переходы плавные»: falloff "smooth" — без «полки» полной громкости, громкость плавно падает от центра (портал) до края
        if (m.falloff === "smooth") k = Math.sqrt(Math.pow(Math.max(0, 1 - d / m.radius), 2.4));
        k *= 1 - Math.min(1, zoneK);   // в клубе музыка спавна не слышна
        g.set(m.vol * k * k, d < 6 ? 0 : pan(m.x, m.z), null, m.falloff === "smooth" ? 2.0 : null);
        if (k > 0.05) txt.push("🎵 " + (m.title || m.id));
      } else if (g) { g.fade(); delete gens[m.id]; }
    });
    // жители: ближайший в радиусе — иногда говорит (в клубе и у его стен — молчат, не перебивают музыку)
    var best = null, bd = 1e9;
    if (pos && enabled && window.speechSynthesis && zoneK < 0.3) (cfg.speech || []).forEach(function (n) {
      if (n.world !== pos.w) return;
      var d = Math.hypot(pos.x - n.x, pos.z - n.z);
      if (d < n.radius && d < bd) { bd = d; best = n; }
    });
    if (best) {
      txt.push("🗣 " + best.name);
      var t = talk[best.id] || (talk[best.id] = {next: Date.now() + 2500, last: -1});
      if (Date.now() > t.next && !speechSynthesis.speaking) say(best, bd, t);
    }
    campfire(zoneK, txt);   // У375: голоса у «Костра бродяг»
    mines(zoneK, txt);      // У390: звуки штольни Деда Окака
    if (cave > 0.15) txt.push("🕳 пещера — эхо");
    if (underW) txt.push("🌊 под водой");
    if (radioBlocked && Object.keys(gens).some(function (k) { return gens[k].play; })) txt.push("▶ нажми сюда — включить радио");   // У297: iPhone
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

  // ---------------------------------------------------------------- У375 (владелец 2026-10-25): голоса у «Костра бродяг»
  // Бродяги у костра (Святые земли, −36 −25) говорят по очереди по ОБЩЕМУ расписанию: campfire-talk.json (scripts/campfire/gen_campfire_talk.py) —
  // сцены (анекдот, байка, песня, перепалка) по кругу, реплика = mp3 нейросетевого голоса (voice/campfire/), длина в мс. Что звучит сейчас —
  // только от часов: (часы сервера − epoch) mod круг. Сервер (VPNpc 0.4.19 CampfireTalk.at) тем же расчётом показывает пузырь над говорящим,
  // сайт — играет его mp3 со стороны говорящего (часы сервера — t из /api/players, как у плейлиста клуба). Слышно в радиусе fire.radius (16 бл.):
  // громкость и «глухость» — по расстоянию до говорящего, сторона — по повороту головы. Пришёл посреди реплики — с того же места.
  var CF = null, cfAt = 0, cf = null, cfKey = null, cfTo = null, cfNow = null, cfG = 0, cfPre = null;
  function talkAt(T, ms) {   // ТО ЖЕ, что CampfireTalk.at (Java): целые мс, реплика → тишина gapMs, сцена → пауза pauseMs
    if (!T || !T.scenes) return null;
    if (T.cyc == null) { T.cyc = 0; T.scenes.forEach(function (s) { s.lines.forEach(function (l) { T.cyc += l.ms + T.gapMs; }); T.cyc += s.pauseMs; }); }
    if (!(T.cyc > 0)) return null;
    var d = ms - T.epoch, c = Math.floor(d / T.cyc), t = d - c * T.cyc, base = ms - t;
    for (var si = 0; si < T.scenes.length; si++) {
      var s = T.scenes[si];
      for (var li = 0; li < s.lines.length; li++) {
        var l = s.lines[li];
        if (t < l.ms) return {s: si, i: li, l: l, start: base, end: base + l.ms, key: c + ":" + si + ":" + li};
        if (t < l.ms + T.gapMs) return null;
        t -= l.ms + T.gapMs; base += l.ms + T.gapMs;
      }
      if (t < s.pauseMs) return null;
      t -= s.pauseMs; base += s.pauseMs;
    }
    return null;
  }
  function cfGraph() {   // свой <audio> → фильтр (даль) → панорама → громкость → master (вода, общая громкость, приглушение под голос)
    if (cf && cf.ctx === ctx) return cf;
    cfStop();
    var el = new Audio(); el.preload = "auto";
    var g = {ctx: ctx, el: el, src: ctx.createMediaElementSource(el), lp: ctx.createBiquadFilter(), g: ctx.createGain(), pn: ctx.createStereoPanner ? ctx.createStereoPanner() : null};
    g.lp.type = "lowpass"; g.lp.frequency.value = 16000; g.g.gain.value = 0;
    g.src.connect(g.lp); if (g.pn) { g.lp.connect(g.pn); g.pn.connect(g.g); } else g.lp.connect(g.g); g.g.connect(master);
    return (cf = g);
  }
  function cfStop() {
    if (cfTo) { clearTimeout(cfTo); cfTo = null; }
    if (cf) { try { cf.el.pause(); cf.g.disconnect(); } catch (e) { } }
    cf = null; cfKey = null; cfNow = null;
  }
  function cfPlay(w) {   // реплика w — с того места, где она сейчас у всех (по часам сервера; + задержка вывода звука)
    // У378: музыка (l.music) — один mp3 на всю пьесу; у песни строчки текста — отдельные реплики расписания с cont (тот же файл) и at (мс от начала):
    // файл уже играет — просто следующая строчка; пришли посреди песни — тот же файл с нужного места
    var file = w && (w.l.file || w.l.cont);
    if (!file || !ctx) return;
    var g = cfGraph(), off = (w.l.at || 0) / 1000, at = off + (serverNow() - w.start) / 1000 + outLat();
    if (w.l.music && g.file === file && !g.el.paused && !g.el.ended) { cfKey = w.key; cfNow = w; return; }
    if (!w.l.music && at > w.l.ms / 1000 - 0.6) return;
    cfKey = w.key; cfNow = w; g.file = file; cfMusic = !!w.l.music;
    w = {l: {file: file, ms: w.l.ms}, start: w.start - off * 1000, key: w.key};
    // Б48: громкость — сразу, а не с ближайшего обновления позиции (раньше первое слово звучало на нуле). Пропуск вперёд — только если
    // пришли посреди реплики; опоздание на загрузку mp3 (< 0.6 с) не догоняем перемоткой — иначе съедалось первое слово.
    var join = at > 0.6;
    try { g.g.gain.cancelScheduledValues(ctx.currentTime); g.g.gain.setValueAtTime(cfG, ctx.currentTime); } catch (e) { }
    g.el.src = (CF.dir || "voice/campfire/") + w.l.file;
    var seek = function () { try { if (join) g.el.currentTime = (serverNow() - w.start) / 1000 + outLat(); } catch (e) { } };
    g.el.onloadedmetadata = seek; playEl(g.el);
  }
  function campfire(zoneK, txt) {
    // нет расписания — пробуем раз в минуту; есть — перечитываем раз в 10 мин (новые сцены приходят без перезагрузки страницы; на сервере — /npc reload)
    if (Date.now() - cfAt > (CF ? 600000 : 60000)) {
      cfAt = Date.now();
      fetch("campfire-talk.json?t=" + Math.floor(Date.now() / 600000), {cache: "no-cache"}).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.scenes && (!CF || JSON.stringify(j.scenes) !== JSON.stringify(CF.scenes) || j.epoch !== CF.epoch)) { CF = j; cfKey = null; }
      }).catch(function () { });
    }
    var F = CF && CF.fire, MR = Math.max(F ? F.radius : 0, (CF && CF.musicRadius) || 0);   // У378: музыка слышна дальше голосов (~40 бл.)
    var df = F && pos && pos.w === F.world ? Math.hypot(pos.x - F.x, pos.z - F.z) : Infinity;
    crackle(enabled && zoneK <= 0.3 ? df : Infinity, F);   // У378: треск костра — всегда, громче вблизи
    var far = !F || !pos || pos.w !== F.world || !enabled || zoneK > 0.3 || df > MR + 2;
    if (far) { if (cf && !cf.el.paused) { cf.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3); setTimeout(function () { if (cf && cfNow === null) cf.el.pause(); }, 1200); } cfKey = null; cfNow = null; return; }
    var now = serverNow(), w = talkAt(CF, now);
    if (w && w.key !== cfKey) cfPlay(w);
    if (!w) cfNow = null;
    // следующая реплика — ровно в её начало (обновление позиции — раз в секунду, ждать его — опоздать до секунды)
    var nx = talkAt(CF, now + 1000);
    if (!cfTo && nx && nx.key !== cfKey && nx.start > now) cfTo = setTimeout(function () { cfTo = null; if (on && CF) cfPlay(talkAt(CF, serverNow() + 30)); }, nx.start - now);
    // следующую реплику — в кэш браузера заранее (за ~4 с), чтобы она стартовала без задержки загрузки
    var pre = talkAt(CF, now + 4000);
    if (pre && pre.l.file && pre.l.file !== cfPre && (!pre.l.music || df < MR)) { cfPre = pre.l.file; try { var pa = new Audio(); pa.preload = "auto"; pa.src = (CF.dir || "voice/campfire/") + pre.l.file; } catch (e) { } }
    // Б48: хвост реплики доигрывает до конца mp3 (раньше громкость гасла по расписанию — последнее слово обрезалось раньше времени)
    var playing = cf && !cf.el.paused && !cf.el.ended;
    if (w && !w.l.music && !playing) cfMusic = false;
    var who = cfNow && CF.speakers[cfNow.l.who], sx = who && !cfMusic ? who.x : F.x, sz = who && !cfMusic ? who.z : F.z;
    var d = Math.hypot(pos.x - sx, pos.z - sz, pos.y != null && F.y != null ? (pos.y - F.y) * 0.7 : 0);
    // голос — до fire.radius (16 бл.); музыка — из точки костра до musicRadius: вблизи (≤ 6 бл.) полная, к краю тихо
    var k = cfMusic ? (d < 6 ? 1 : Math.max(0, 1 - (d - 6) / (MR - 6))) : (d < 3 ? 1 : Math.max(0, 1 - (d - 3) / (F.radius - 3)));
    cfG = (cfMusic ? 0.75 : 0.9) * Math.pow(k, cfMusic ? 1.4 : 1.6) * (1 - Math.min(1, zoneK));
    if (cf) {
      var t = ctx.currentTime;
      cf.g.gain.setTargetAtTime(cfNow || playing ? cfG : 0, t, 0.6);
      cf.lp.frequency.setTargetAtTime(16000 - (cfMusic ? 10000 : 13000) * (1 - k), t, 0.2);
      if (cf.pn) cf.pn.pan.setTargetAtTime(d < 1.5 ? 0 : pan(sx, sz) * (cfMusic ? 0.5 : 0.7), t, 0.2);
    }
    txt.push("🔥 Костёр бродяг" + (cfMusic && (cfNow || playing) && k > 0 ? " · 🎸 музыка" : who && k > 0 ? " · 🗣 " + who.name : ""));
  }
  // У378: треск костра, громкость — по расстоянию до огня (R = 22 бл., та же кривая k, плавно ~1.5 с).
  // 2026-10-25 (владелец: «звуки костра кривые… сделай реалистичнее, может скачать»): вместо синтеза в браузере — настоящая запись
  // камина sfx/campfire-loop.mp3 (PagDev, OpenGameArt, CC0 — docs/sounds-licenses.md), бесшовная петля 27 с.
  // Играет как AudioBuffer с loop (а не <audio loop>: у mp3 в <audio> на стыке петли пауза-щелчок) → панорама к костру → громкость → master.
  // Не загрузилась / не декодировалась — треска просто нет (повтор попытки раз в минуту), без ошибок. Треск заметно тише голосов бродяг.
  var ck = null, cfMusic = false, ckBuf = null, ckTry = 0, CK_VOL = 0.6;   // петля −24.5 LUFS × 0.6 ≈ −29 у огня; голоса −18 LUFS × 0.9 — треск ~10 дБ тише
  function ckLoad() {
    if (ckTry > Date.now()) return;
    ckTry = Date.now() + 60000;
    var c = ctx;
    fetch("sfx/campfire-loop.mp3?v=1").then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.arrayBuffer(); }).then(function (a) {
      return new Promise(function (ok, no) { var p = c.decodeAudioData(a, ok, no); if (p && p.catch) p.catch(no); });
    }).then(function (b) { if (c === ctx && b) ckBuf = {ctx: c, b: b}; }).catch(function () { });
  }
  function ckStop() {
    if (ck) { try { ck.src.stop(); } catch (e) { } try { ck.g.disconnect(); } catch (e) { } }
    ck = null;
  }
  function crackle(d, F) {
    var R = 22, k = d < R ? Math.pow(1 - Math.max(0, d - 2) / (R - 2), 2) : 0;
    if (k <= 0) { if (ck && ck.ctx === ctx) ck.g.gain.setTargetAtTime(0, ctx.currentTime, 0.5); return; }
    if (!ckBuf || ckBuf.ctx !== ctx) { ckLoad(); return; }
    if (!ck || ck.ctx !== ctx) {
      ckStop();
      var src = ctx.createBufferSource(), pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      src.buffer = ckBuf.b; src.loop = true;
      ck = {ctx: ctx, src: src, pn: pn, g: ctx.createGain()}; ck.g.gain.value = 0;
      if (pn) { src.connect(pn); pn.connect(ck.g); } else src.connect(ck.g);
      ck.g.connect(master);
      src.start(0, Math.random() * ckBuf.b.duration);   // у каждого игрока — своё место петли
    }
    var t = ctx.currentTime;
    ck.g.gain.setTargetAtTime(CK_VOL * k, t, 1.5);
    if (ck.pn && F && pos) ck.pn.pan.setTargetAtTime(d < 1.5 ? 0 : pan(F.x, F.z) * 0.6, t, 0.2);
  }

  // ---------------------------------------------------------------- У390 (владелец 2026-10-25): звуки штольни Деда Окака
  // «В шахте — прикольные звуки шахты». sounds.json → mines (scripts/sounds/build_sounds.py): коробка туннеля, ось from (вход) → to (глубина),
  // точка входа mouth. Фон — запись-петля sfx/mine-bg.mp3 (низкий ветер штольни, 30 с, AudioBuffer loop — как треск костра): в туннеле
  // громко (к глубине громче), снаружи — только через вход (до radius бл., высота считается вдвое — с горы над штольней не слышно), у стен
  // вплотную — чуть-чуть (rock бл.); плавно, setTargetAtTime 2 с. Одиночные (капли, далёкая кирка, скрип балок, вагонетка, камешки) — раз в
  // every[0..1] с из случайной точки туннеля: сторона — по повороту головы, громкость и «глухость» — по расстоянию, своя высота
  // (playbackRate 0.9–1.1) и громкость, пещерное эхо (свёртка + отражения, как у туннеля клуба, только короче — туннель маленький).
  // Записи — CC0 (docs/sounds-licenses.md). Не загрузились — тишина, повтор раз в минуту. Всё тише голосов (фон ≈ −31 LUFS, одиночные ≤ −26).
  var MN = {}, mnBuf = {}, mnTry = 0, mnFxG = null, mnNext = 0, mnLast = null;
  function mnLoad(m) {
    if (mnTry > Date.now()) return;
    mnTry = Date.now() + 60000;
    var c = ctx;
    [m.bg].concat((m.sfx || []).map(function (s) { return s.f; })).forEach(function (f) {
      if (!f || (mnBuf[f] && mnBuf[f].ctx === c)) return;
      mnBuf[f] = {ctx: c, b: null};
      fetch("sfx/" + f + "?v=1").then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.arrayBuffer(); }).then(function (a) {
        return new Promise(function (ok, no) { var p = c.decodeAudioData(a, ok, no); if (p && p.catch) p.catch(no); });
      }).then(function (b) { if (c === ctx && b && mnBuf[f]) mnBuf[f].b = b; }).catch(function () { delete mnBuf[f]; });
    });
  }
  function mnGot(f) { var b = f && mnBuf[f]; return b && b.ctx === ctx && b.b ? b.b : null; }
  function mnFx() {   // пещерное эхо штольни: тёмный хвост 1.6 с + отражения от стен 0.07/0.13 с → master
    if (mnFxG && mnFxG.ctx === ctx) return mnFxG;
    var cin = ctx.createBiquadFilter(), out = ctx.createGain();
    cin.type = "lowpass"; cin.frequency.value = 1600; out.gain.value = 0.24; out.connect(master);   /* владелец: «в три раза меньше», потом «увеличь в два раза» — 0.24 */   // 2026-10-25 владелец: «эхо в шахте слишком сильное — слегонца» (0.6 → 0.35, хвост 1.6 → 0.9 с)
    try {
      var cv = ctx.createConvolver(), len = Math.floor(ctx.sampleRate * 0.9), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (var c = 0; c < 2; c++) { var ch = ir.getChannelData(c); for (var s = 0; s < len; s++) ch[s] = (Math.random() * 2 - 1) * Math.pow(1 - s / len, 2.6) * (s < ctx.sampleRate * 0.015 ? 0 : 1); }
      cv.buffer = ir; cin.connect(cv); cv.connect(out);
      var e1 = ctx.createDelay(1), e2 = ctx.createDelay(1), efb = ctx.createGain(), eg = ctx.createGain();
      e1.delayTime.value = 0.07; e2.delayTime.value = 0.13; efb.gain.value = 0.15; eg.gain.value = 0.2;
      cin.connect(e1); e1.connect(eg); e1.connect(efb); efb.connect(e2); e2.connect(eg); e2.connect(efb); eg.connect(out);
    } catch (e) { }
    return (mnFxG = {ctx: ctx, send: cin});
  }
  function mnStop() {
    Object.keys(MN).forEach(function (id) { var b = MN[id]; try { b.src.stop(); } catch (e) { } try { b.g.disconnect(); } catch (e) { } });
    MN = {}; mnFxG = null; mnNext = 0;
  }
  // где игрок относительно штольни m: k — громкость фона 0..1, inT — в туннеле, cut — фильтр «из-за угла» для звуков снаружи
  function mineAt(m) {
    if (!pos || pos.w !== m.world || pos.y == null) return {k: 0};
    var X = m.axis === "z" ? "z" : "x", M = m.mouth || [m.x1, m.y1, m.z1], R = m.radius || 20, rk = m.rock || 3;
    var inT = pos.x >= m.x1 - 0.3 && pos.x <= m.x2 + 1.3 && pos.z >= m.z1 - 0.3 && pos.z <= m.z2 + 1.3 && pos.y >= m.y1 - 1 && pos.y <= m.y2 + 1;
    var p = Math.max(0, Math.min(1, (pos[X] - m.from) / ((m.to - m.from) || 1)));
    if (inT) return {k: 0.75 + 0.25 * p, inT: true, p: p, cut: 20000};
    var dm = Math.hypot(pos.x - M[0], (pos.y - M[1]) * 2, pos.z - M[2]);   // высота — вдвое: над входом, на горе — быстро тишина
    var km = dm < R ? 0.6 * Math.pow(1 - dm / R, 2) : 0;
    var db = Math.hypot(Math.max(m.x1 - pos.x, 0, pos.x - m.x2 - 1), Math.max(m.y1 - 1 - pos.y, 0, pos.y - m.y2 - 1), Math.max(m.z1 - pos.z, 0, pos.z - m.z2 - 1));
    var kr = db < rk ? 0.25 * (1 - db / rk) : 0;   // сквозь толщу горы — только вплотную к стенам
    var k = Math.max(km, kr);
    return {k: k, inT: false, dm: dm, cut: 600 + 9000 * Math.min(1, k / 0.6)};
  }
  function minePoint(m, t) {   // точка на оси туннеля (t: 0 — вход, 1 — глубина), поперёк — случайно
    var X = m.axis === "z" ? "z" : "x", a = m.from + (m.to - m.from) * t, pt = {y: m.y1 + 1};
    pt[X] = a;
    if (X === "x") pt.z = rnd(m.z1 + 0.3, m.z2 + 0.7); else pt.x = rnd(m.x1 + 0.3, m.x2 + 0.7);
    return pt;
  }
  function mineShot(m, st, zoneK) {
    var list = (m.sfx || []).filter(function (s) { return mnGot(s.f); });
    if (!list.length) return;
    var pick = function () { var tot = 0, r, i; list.forEach(function (s) { tot += s.w || 1; }); r = Math.random() * tot;
      for (i = 0; i < list.length; i++) { r -= list[i].w || 1; if (r <= 0) return list[i]; } return list[list.length - 1]; };
    var s = pick(); if (s.f === mnLast && list.length > 1) s = pick();   // тот же звук два раза подряд — реже
    mnLast = s.f;
    var b = mnGot(s.f), M = m.mouth || [m.x1, m.y1, m.z1];
    var p0 = minePoint(m, s.k === "pick" ? rnd(0.8, 1) : s.k === "cart" ? (Math.random() < 0.5 ? 1 : 0.15) : rnd(0.1, 1));
    var p1 = s.k === "cart" ? minePoint(m, p0[m.axis === "z" ? "z" : "x"] === m.to ? 0.15 : 1) : p0;   // вагонетка едет вдоль туннеля
    if (s.k === "cart") p1[m.axis === "z" ? "x" : "z"] = p0[m.axis === "z" ? "x" : "z"];
    var dist = function (q) { return st.inT ? Math.hypot(pos.x - q.x, pos.y - q.y, pos.z - q.z) : Math.hypot(q.x - M[0], q.y - M[1], q.z - M[2]); };
    var d = dist(p0), att = 1 / (1 + d / 6) * (st.inT ? 1 : Math.min(1, st.k / 0.6));
    var g = (m.sfxVol || 0.5) * (s.v || 1) * att * rnd(0.7, 1) * (1 - Math.min(1, zoneK));
    if (g < 0.008) return;
    var t = ctx.currentTime, rate = rnd(0.9, 1.1), dur = b.duration / rate;
    var src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), gn = ctx.createGain(), pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    var dry = ctx.createGain(), snd = ctx.createGain(), w = Math.min(0.26, 0.1 + d / 60);
    src.buffer = b; src.playbackRate.value = rate;
    lp.type = "lowpass";
    var cut = Math.max(1800, 16000 / (1 + d / 10));
    if (s.k === "pick") cut = Math.min(cut, 2600);   // кирка — далеко, в глубине: глухо
    lp.frequency.value = Math.min(cut, st.cut || 20000);
    gn.gain.value = g; dry.gain.value = 1 - w; snd.gain.value = w;
    src.connect(lp); lp.connect(gn);
    var head = gn;
    if (pn) { gn.connect(pn); head = pn;
      var pa = function (q) { return st.inT ? (Math.hypot(pos.x - q.x, pos.z - q.z) < 1.5 ? 0 : pan(q.x, q.z) * 0.75) : pan(M[0], M[2]) * 0.6; };
      pn.pan.setValueAtTime(pa(p0), t);
      if (p1 !== p0) pn.pan.linearRampToValueAtTime(pa(p1), t + dur);
    }
    head.connect(dry); dry.connect(master); head.connect(snd); snd.connect(mnFx().send);
    src.onended = function () { try { gn.disconnect(); dry.disconnect(); snd.disconnect(); if (pn) pn.disconnect(); } catch (e) { } };
    src.start(t);
  }
  function mines(zoneK, txt) {
    (cfg.mines || []).forEach(function (m) {
      var st = mineAt(m), on2 = enabled && st.k > 0 && zoneK < 1, bg = MN[m.id], t = ctx.currentTime;
      if (on2) mnLoad(m);
      if (on2 && !bg && mnGot(m.bg)) {
        var src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        src.buffer = mnGot(m.bg); src.loop = true; lp.type = "lowpass"; lp.frequency.value = 20000; g.gain.value = 0;
        src.connect(lp); if (pn) { lp.connect(pn); pn.connect(g); } else lp.connect(g); g.connect(master);
        src.start(0, Math.random() * src.buffer.duration);   // у каждого игрока — своё место петли
        bg = MN[m.id] = {src: src, lp: lp, g: g, pn: pn, zeroAt: 0};
      }
      if (bg) {
        var k = on2 ? st.k * (1 - Math.min(1, zoneK)) : 0;
        bg.g.gain.setTargetAtTime((m.vol || 0.5) * k, t, 2.0);
        bg.lp.frequency.setTargetAtTime(st.cut || 20000, t, 1.0);
        if (bg.pn) bg.pn.pan.setTargetAtTime(st.inT || !pos || !m.mouth ? 0 : pan(m.mouth[0], m.mouth[2]) * 0.5, t, 0.5);
        if (k > 0) bg.zeroAt = 0;
        else if (!bg.zeroAt) bg.zeroAt = Date.now();
        else if (Date.now() - bg.zeroAt > 15000) { try { bg.src.stop(); bg.g.disconnect(); } catch (e) { } delete MN[m.id]; }   // ушёл давно — петлю остановить
      }
      // одиночные — только в туннеле и у входа
      if (on2 && st.k > 0.08 && zoneK < 0.3) {
        if (!mnNext) mnNext = Date.now() + rnd(1.5, 5) * 1000;
        else if (Date.now() >= mnNext) { var ev = m.every || [4, 15]; mnNext = Date.now() + rnd(ev[0], ev[1]) * 1000; mineShot(m, st, zoneK); }
      } else mnNext = 0;
      if (on2 && st.k > 0.05) txt.push("⛏ " + (m.title || m.id));
    });
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
    var hit = null;
    function burst(t, d, g, type, f) {   // короткий шум: хэт / хлопок
      if (!hit) { var n = ctx.sampleRate * 0.5; hit = ctx.createBuffer(1, n, ctx.sampleRate); var a = hit.getChannelData(0); for (var i = 0; i < n; i++) a[i] = Math.random() * 2 - 1; }
      var s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), e = ctx.createGain();
      s.buffer = hit; fl.type = type; fl.frequency.value = f; e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.001, t + d);
      s.connect(fl); fl.connect(e); e.connect(out); s.start(t); s.stop(t + d + 0.02);   // мимо эха — сухо
    }
    function kick(t, g) {
      var k = ctx.createOscillator(), kg = ctx.createGain(); k.type = "sine";
      k.frequency.setValueAtTime(130, t); k.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      kg.gain.setValueAtTime(g, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.32); k.connect(kg); kg.connect(out); k.start(t); k.stop(t + 0.35);
    }
    function playStep(s, t) {
      var bar = Math.floor(s / 8), ch = p.chords[bar % p.chords.length], beat = s % 8;
      if (p.house === "disco") {   // У295: диско — бочка на долю, открытый хэт на «и», бас октавами каждую восьмую, струнные стабы
        if (beat % 2 === 0) kick(t, 0.28);
        if (beat % 2 === 1) burst(t, 0.18, 0.08, "highpass", 6000);
        if (beat === 2 || beat === 6) burst(t, 0.12, 0.1, "bandpass", 1800);
        note(hz(p.root + ch[0] - 24 + (beat % 2 ? 12 : 0)), t, dur8 * 0.8, "sawtooth", 0.06, 0.005, dur8 * 0.4, 700);
        if (beat === 0 || beat === 4) ch.forEach(function (iv) { [-8, 8].forEach(function (det) { var o = note(hz(p.root + iv + 12), t, dur8 * 3.5, "sawtooth", 0.009, 0.03, dur8 * 2, 3200); o.detune.value = det; }); });
        if (Math.random() < p.arp) note(hz(p.root + p.scale[Math.floor(Math.random() * p.scale.length)] + 24), t, dur8 * 0.9, "triangle", 0.02, 0.003, dur8 * 0.6, 4000);
        return;
      }
      if (p.house === "chill") {   // У295: чилл — бочка на 1 и 3, мягкий хлопок на 2 и 4, тёплые аккорды, редкие ноты
        if (beat === 0 || beat === 4) kick(t, 0.2);
        if (beat === 2 || beat === 6) burst(t, 0.2, 0.05, "bandpass", 1200);
        if (beat % 2 === 1 && Math.random() < 0.6) burst(t, 0.04, 0.03, "highpass", 8000);
        if (beat === 0) { ch.forEach(function (iv) { note(hz(p.root + iv), t, dur8 * 7.8, p.pad, p.padVol, dur8 * 0.6, dur8 * 3, 1600); });
          note(hz(p.root + ch[0] - 12), t, dur8 * 3.5, "sine", 0.1, 0.02, dur8 * 1.5, 500); }
        if (beat === 5) note(hz(p.root + ch[0] - 12 + 7), t, dur8 * 2.5, "sine", 0.07, 0.02, dur8, 500);
        if (Math.random() < p.arp * 0.5) note(hz(p.root + p.scale[Math.floor(Math.random() * p.scale.length)] + 12), t, dur8 * 2.5, "sine", 0.035, 0.01, dur8 * 2, 3000);
        return;
      }
      if (p.house) {   // У291: клуб (хаус)
        if (beat % 2 === 0) kick(t, 0.32);
        if (beat % 2 === 1) burst(t, 0.06, 0.09, "highpass", 7000);
        if (beat === 2 || beat === 6) burst(t, 0.16, 0.12, "bandpass", 1500);
        if (beat % 2 === 1) note(hz(p.root + ch[0] - 24 + (beat === 7 ? 12 : 0)), t, dur8 * 0.9, "sawtooth", 0.07, 0.005, dur8 * 0.5, 500);
        if (beat === 0 || beat === 3 || (beat === 6 && bar % 2)) ch.forEach(function (iv) { note(hz(p.root + iv), t, dur8 * 0.8, "sawtooth", 0.022, 0.005, dur8 * 0.6, 2600); });
        if (Math.random() < p.arp) note(hz(p.root + p.scale[Math.floor(Math.random() * p.scale.length)] + 24), t, dur8 * 0.7, "square", 0.012, 0.003, dur8 * 0.5, 3500);
        if (beat === 0 && bar % 4 === 0) ch.forEach(function (iv) { note(hz(p.root + iv + 12), t, dur8 * 30, "sine", p.padVol || 0.012, dur8 * 6, dur8 * 8); });
        return;
      }
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
    var muff = ctx.createBiquadFilter(); muff.type = "lowpass"; muff.frequency.value = 20000;   // «за стеной» — глуше
    if (pn) { out.disconnect(); out.connect(muff); muff.connect(pn); } else { out.disconnect(); out.connect(muff); muff.connect(master); }
    this.set = function (g, pv, cut, tc) {   // tc — плавность громкости, с (по умолчанию 0.8; музыка спавна «smooth» — 2)
      // 2026-10-25 владелец: «переходы громкости плавнее» — 0.8 → 2 с
      if (!ctx) return; out.gain.setTargetAtTime(g, ctx.currentTime, tc || 2.0); if (pn) pn.pan.setTargetAtTime(pv, ctx.currentTime, 0.3);
      muff.frequency.setTargetAtTime(cut || 20000, ctx.currentTime, 0.5);
    };
    // ушёл из зоны / в портал — плавно гаснет ~3–4 с (владелец 2026-10-20: «не резко, а плавно потухает»)
    this.fade = function () { if (!ctx) return; out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(0, ctx.currentTime, 1.1); setTimeout(self.kill, 6500); };
    this.kill = function () { alive = false; clearInterval(iv); srcs.forEach(function (s) { try { s.stop(); } catch (e) { } }); try { out.disconnect(); } catch (e) { } };
  }

  // ---------------------------------------------------------------- общий проигрыватель музыки клуба (радио убрано 2026-10-21 — только свои треки)
  // 2026-10-22 (владелец: «в клубе музыка не должна останавливаться — один трек понемногу накладывается на другой, чтобы затухание было
  // незаметно»): две «деки» (<audio>) — пока одна доигрывает конец трека, другая уже начинает следующий (перекрытие XF с, «равная
  // мощность»: sin/cos — общая громкость на стыке не проседает). Деки общие для всех жанров: на iPhone звук разрешается нажатием
  // для конкретного элемента — разрешили, дальше играют обе. Смена жанра у DJ — старое плавно уходит за CHANGE_FADE с, новое входит.
  var XF = 8, CHANGE_FADE = 4;
  var radioBlocked = false, Z = null;
  function zplayer() {
    if (Z && Z.ctx === ctx && Z.master === master) return Z;
    if (Z) Z.decks.forEach(function (d) { try { d.el.pause(); d.el.removeAttribute("src"); d.el.load(); } catch (e) { } });
    var out = ctx.createGain(), muff = ctx.createBiquadFilter(), pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    // У373: shelf — подъём баса в туннеле (вне туннеля 0 дБ — звук не меняется); dry — доля «прямого» звука (в туннеле меньше — больше эха)
    var shelf = ctx.createBiquadFilter(), dry = ctx.createGain();
    out.gain.value = 0; muff.type = "lowpass"; muff.frequency.value = 20000;   // громкость по расстоянию → «за стеной» → бас → лево/право → master
    shelf.type = "lowshelf"; shelf.frequency.value = 160; shelf.gain.value = 0; dry.gain.value = 1;
    out.connect(muff); muff.connect(shelf); if (pn) { shelf.connect(pn); pn.connect(dry); } else shelf.connect(dry); dry.connect(master);
    // 2026-10-22 владелец («в клубе иное звучание… 3D-стерео»): внутри — отзвук зала (свёртка со сгенерированным хвостом ~1.8 с), доля — wet
    var wet = ctx.createGain(); wet.gain.value = 0;
    try {
      var conv = ctx.createConvolver(), len = Math.floor(ctx.sampleRate * 1.8), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (var c = 0; c < 2; c++) { var ch = ir.getChannelData(c); for (var s = 0; s < len; s++) ch[s] = (Math.random() * 2 - 1) * Math.pow(1 - s / len, 3); }
      conv.buffer = ir; (pn || shelf).connect(conv); conv.connect(wet); wet.connect(master);
    } catch (e) { }
    // У373: пещерное эхо туннеля — длинный тёмный хвост (свёртка 2.8 с, слышно ~2–2.5 с) + отражения от стен 0.29 и 0.47 с с повтором; доля — cwet
    var cwet = ctx.createGain(); cwet.gain.value = 0;
    try {
      var cin = ctx.createBiquadFilter(), cconv = ctx.createConvolver(), clen = Math.floor(ctx.sampleRate * 2.8), cir = ctx.createBuffer(2, clen, ctx.sampleRate);
      cin.type = "lowpass"; cin.frequency.value = 1400;
      for (var c2 = 0; c2 < 2; c2++) { var cc = cir.getChannelData(c2); for (var s2 = 0; s2 < clen; s2++) cc[s2] = (Math.random() * 2 - 1) * Math.pow(1 - s2 / clen, 2.2) * (s2 < ctx.sampleRate * 0.02 ? 0 : 1); }
      cconv.buffer = cir;
      var e1 = ctx.createDelay(1), e2 = ctx.createDelay(1), efb = ctx.createGain(), eg = ctx.createGain();
      e1.delayTime.value = 0.29; e2.delayTime.value = 0.47; efb.gain.value = 0.38; eg.gain.value = 0.5;
      (pn || shelf).connect(cin); cin.connect(cconv); cconv.connect(cwet);
      cin.connect(e1); e1.connect(eg); e1.connect(efb); efb.connect(e2); e2.connect(eg); e2.connect(efb); eg.connect(cwet);
      cwet.connect(master);
    } catch (e) { }
    Z = {ctx: ctx, master: master, out: out, muff: muff, pn: pn, wet: wet, shelf: shelf, dry: dry, cwet: cwet, tun: false, owner: null, decks: []};
    for (var i = 0; i < 2; i++) {
      var el = new Audio(); el.crossOrigin = "anonymous"; el.setAttribute("playsinline", ""); el.preload = "auto"; el.preservesPitch = true;
      var g = ctx.createGain(); g.gain.value = 0; g.connect(out);
      var sk = ctx.createGain(); sk.connect(g);   // У321: «мягкая перемотка» — короткое затухание вокруг перескока, без щелчка
      try { ctx.createMediaElementSource(el).connect(sk); } catch (e) { }
      Z.decks.push({el: el, g: g, sk: sk, key: null, gone: 0, lastAt: -1, still: 0, kick: 0, seekAt: 0, err: null});
    }
    return Z;
  }
  function deckOff(d) { d.key = null; d.gone = 0; try { d.g.gain.cancelScheduledValues(ctx.currentTime); d.g.gain.setValueAtTime(0, ctx.currentTime); d.el.pause(); d.el.playbackRate = 1; } catch (e) { } }
  function playEl(el) { var pr = el.play(); if (pr && pr.catch) pr.then(function () { radioBlocked = false; }).catch(function (e) { if (e && e.name === "NotAllowedError") radioBlocked = true; }); }

  // ---------------------------------------------------------------- У298: свои треки клуба — лежат на нашем сайте (music/<плейлист>/), без чужих серверов
  // Позиция — по СЕРВЕРНЫМ часам: у всех в клубе один и тот же трек в одном и том же месте. 2026-10-22: порядок — вперемешку, но у всех
  // одинаковый (перемешивание по номеру круга), на стыке кругов один трек два раза подряд не играет.
  // Жанры house/disco/chill — Kevin MacLeod (incompetech.com, CC BY 4.0); own — наши треки (выбор у DJ, VPLand 0.9.29: club.tracks).
  var lists = {}, listAt = {}, nowTrack = "";
  function loadList(name) {
    if (lists[name] !== undefined) return lists[name];
    lists[name] = null; listAt[name] = Date.now();
    fetch("music/" + name + "/playlist.json?t=" + Math.floor(Date.now() / 60000), {cache: "no-cache"}).then(function (r) { return r.json(); }).then(function (j) { lists[name] = j; }).catch(function () { lists[name] = false; });
    return null;
  }
  // 2026-10-21 (владелец: «прерывается — сделай прогрузку музыки наперёд»): трек скачивается ЦЕЛИКОМ в память заранее (и следующий — пока
  // играет текущий), играет из памяти — интернет больше не может «оборвать» его посреди песни; перемотка для подстройки — мгновенная.
  var blobs = {}, blobOrder = [];
  function fetchBlob(file) {
    if (blobs[file]) return blobs[file].p;
    var b = blobs[file] = {url: null};
    b.p = fetch("music/" + file, {cache: "force-cache"}).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(function (bl) { b.url = URL.createObjectURL(bl); return b.url; })
      .catch(function () { delete blobs[file]; return null; });
    blobOrder.push(file);
    for (var i = 0; blobOrder.length > 5 && i < blobOrder.length; ) {   // в памяти — не больше 5 треков; играющие и качающийся не трогаем
      var f = blobOrder[i], o = blobs[f];
      if (o && (!o.url || (Z && Z.decks.some(function (d) { return d.el.src === o.url; })))) { i++; continue; }
      blobOrder.splice(i, 1);
      if (o) { URL.revokeObjectURL(o.url); delete blobs[f]; }
    }
    return b.p;
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shuffled(n, seed) {
    var a = [], i, r = (seed >>> 0) || 1;
    for (i = 0; i < n; i++) a.push(i);
    for (i = n - 1; i > 0; i--) { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; var j = r % (i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function Playlist(spec) {   // spec: "house" или "own:holy-club,track2" (наши треки — выбранные у DJ)
    var self = this, P = zplayer(), k0 = spec.indexOf(":"), name = k0 < 0 ? spec : spec.slice(0, k0);
    var ids = k0 < 0 ? null : spec.slice(k0 + 1).split(",").filter(Boolean);
    self.alive = true; self.usesZone = true; self.__seeks = 0; P.owner = self;
    var born = Date.now(), waitFrom = 0, cache = null, cur = null, curKey = null;
    // смена жанра / набора треков: то, что играло, плавно уходит, новое входит на свободной деке
    P.decks.forEach(function (d) {
      if (!d.key || d.key === "old") return;
      d.key = "old"; d.gone = Date.now() + CHANGE_FADE * 1000 + 500;
      d.g.gain.cancelScheduledValues(ctx.currentTime); d.g.gain.setTargetAtTime(0, ctx.currentTime, CHANGE_FADE / 4);
    });
    function tracks() {
      var pl = loadList(name);
      if (!pl) return null;
      if (cache && cache.pl === pl) return cache.tr;
      // у DJ выбрали трек, которого в загруженном списке ещё нет (только что добавили) — перечитать список (не чаще раза в минуту)
      if (ids && ids.some(function (id) { return !pl.tracks.some(function (t) { return t.id === id; }); }) && Date.now() - listAt[name] > 60000) {
        delete lists[name]; loadList(name);
      }
      var tr = ids ? pl.tracks.filter(function (t) { return ids.indexOf(t.id) >= 0; }) : pl.tracks;
      if (!tr.length) tr = pl.tracks;
      cache = {pl: pl, tr: tr};
      return tr.length ? tr : null;
    }
    function order(c, n) {
      if (n < 3) return n === 2 ? [0, 1] : [0];
      var h = hash(spec), o = shuffled(n, h ^ Math.imul(c, 2654435761)), prev = shuffled(n, h ^ Math.imul(c - 1, 2654435761));
      if (o[0] === prev[n - 1]) { var t = o[0]; o[0] = o[1]; o[1] = t; }   // стык кругов — не тот же трек ещё раз
      return o;
    }
    // У313 (владелец 2026-10-22: «нажал пластинку — заказал эту песню как следующую»): расписание СЕРВЕРА — now {id, start, len, by}
    // (start — серверные мс), prev (его хвост звучит на стыке), next {id, start}, xf. Заказ играет после текущего с тем же плавным
    // переходом. Не сходится (нет трека в списке, время явно не то) — null: тогда старое «вперемешку».
    function sched() {
      var S = club, pl = lists[name];
      if (ids || !S || !S.now || !S.now.id || !pl || !pl.tracks) return null;
      var byId = {};
      pl.tracks.forEach(function (t) { byId[t.id] = t; });
      var T = function (e) { return e && e.id && byId[e.id] ? byId[e.id] : null; };
      var sn = serverNow(), cur = S.now, prv = S.prev, nxt = S.next;
      if (nxt && nxt.start && sn >= nxt.start) { prv = cur; cur = nxt; nxt = null; }   // ответ сервера устарел — переход уже был
      var ct = T(cur);
      if (!ct) { if (Date.now() - listAt[name] > 60000) { delete lists[name]; loadList(name); } return null; }   // новый трек — перечитать список
      var clen = cur.len || ct.length, at = (sn - cur.start) / 1000;
      if (!(at > -5 && at < clen + 30)) return null;
      var pt = T(prv), xf = S.xf || XF;
      if (pt) xf = Math.max(1, Math.min(xf, (prv.start + (prv.len || pt.length) * 1000 - cur.start) / 1000));   // хвост предыдущего
      xf = Math.min(xf, clen / 3);
      var a0 = Math.max(0, at), x = Math.min(1, a0 / xf);
      var res = [{key: "s|" + cur.id + "|" + cur.start, tr: ct, at: a0, gain: a0 < xf ? Math.sin(x * Math.PI / 2) : 1, by: cur.by || ""}];
      if (a0 < xf && pt) {
        var pat = (sn - prv.start) / 1000;
        if (pat < (prv.len || pt.length) - 0.2) res.push({key: "s|" + prv.id + "|" + prv.start, tr: pt, at: pat, gain: Math.cos(x * Math.PI / 2)});
      }
      res.next = T(nxt) || ct; res.sched = true; res.nextStart = nxt && nxt.start ? nxt.start : 0;
      return res;
    }
    function plan(tr) {   // что звучит сейчас у всех: основной трек и (на стыке) хвост предыдущего; + какой следующий
      var sp = sched();
      if (sp) return sp;
      var n = tr.length, xf = Math.min(XF, Math.min.apply(null, tr.map(function (t) { return t.length; })) / 3), T = 0;
      tr.forEach(function (t) { T += t.length - xf; });
      var now = serverNow() / 1000, c = Math.floor(now / T), t = now - c * T, o = order(c, n), s = 0, k = 0;
      while (k < n - 1 && t >= s + tr[o[k]].length - xf) { s += tr[o[k]].length - xf; k++; }
      var at = t - s, x = Math.min(1, at / xf);
      var res = [{key: spec + "|" + c + ":" + k, tr: tr[o[k]], at: at, gain: at < xf ? Math.sin(x * Math.PI / 2) : 1}];
      if (at < xf) {
        var pc = k > 0 ? c : c - 1, po = k > 0 ? o : order(c - 1, n), pk = k > 0 ? k - 1 : n - 1, pt = tr[po[pk]];
        res.push({key: spec + "|" + pc + ":" + pk, tr: pt, at: pt.length - xf + at, gain: Math.cos(x * Math.PI / 2)});
      }
      var no = k < n - 1 ? o : order(c + 1, n);
      res.next = tr[no[k < n - 1 ? k + 1 : 0]];
      return res;
    }
    function find(key) { var tr = tracks(); if (!tr) return null; var p = plan(tr); for (var i = 0; i < p.length; i++) if (p[i].key === key) return p[i]; return null; }
    function load(d, w) {
      var bb = blobs[w.tr.file], key = w.key;
      d.key = key; d.gone = 0; d.still = 0; d.lastAt = -1; d.kick = Date.now(); d.err = null;
      d.g.gain.cancelScheduledValues(ctx.currentTime); d.g.gain.setValueAtTime(0, ctx.currentTime);
      d.el.playbackRate = 1;
      d.el.src = bb && bb.url ? bb.url : "music/" + w.tr.file;   // не успел скачаться — играет потоком
      var seek = function () { if (d.key !== key) return; try { var ww = find(key); if (ww) { d.el.currentTime = Math.max(0, ww.at + outLat() + 0.05); d.seekAt = Date.now(); } } catch (e) { } };
      d.el.addEventListener("loadedmetadata", seek, {once: true});
      playEl(d.el);
    }
    // подстройка (2026-10-21, «прерывисто, по кругу»): пока грузится — не трогаем. Пауза/завис (телефон усыпил вкладку) — запустить заново.
    // У321 (владелец 2026-10-23: «светомузыка в такт» — свет в игре идёт по серверным часам): держим ~0.05 с вместо ~0.3 с.
    // Цель — то, что СЛЫШНО (позиция − задержка вывода), = серверное время трека. Ошибка сглаживается; плавно: скорость 1 + ошибка/1.5 с
    // (не больше ±3%, голос не «плывёт» — preservesPitch); до 8 мс — ровно 1 (без постоянного растяжения звука); перескок — только если
    // разошлось > 0.6 с (не чаще раза в 4 с), мягко: деку на 60 мс приглушить → перемотать → вернуть.
    var SYNC_DEAD = 0.008, SYNC_TAU = 1.5, SYNC_MAX = 0.03, SYNC_JUMP = 0.6;
    function softSeek(d, to) {
      var g = d.sk.gain, t = ctx.currentTime, el = d.el;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.06);
      setTimeout(function () {
        try { el.currentTime = to; } catch (e) { }
        var done = false, up = function () { if (done || !ctx) return; done = true; var t2 = ctx.currentTime; g.cancelScheduledValues(t2); g.setValueAtTime(0, t2); g.linearRampToValueAtTime(1, t2 + 0.08); };
        el.addEventListener("seeked", up, {once: true}); window.setTimeout(up, 400);
      }, 70);
    }
    function sync(d, w) {
      var el = d.el, now = Date.now();
      if (el.ended) return;
      if (now - d.kick > 5000 && !radioBlocked && document.visibilityState === "visible") {
        if (el.paused) { d.kick = now; playEl(el); return; }
        if (!el.seeking && el.currentTime === d.lastAt) { if (++d.still >= 12) { d.still = 0; try { el.load(); } catch (e) { } load(d, w); return; } } else d.still = 0;
      }
      d.lastAt = el.currentTime;
      if (el.paused || el.seeking || el.readyState < 3) return;
      if (now - d.seekAt < 600) return;   // перемотка ещё «садится»
      var lat = outLat(), raw = w.at + lat - el.currentTime;   // > 0 — отстаём
      d.err = d.err == null || Math.abs(raw - d.err) > 0.3 ? raw : d.err * 0.5 + raw * 0.5;
      var df = d.err;
      if (Math.abs(raw) > SYNC_JUMP && now - d.seekAt > 4000 && w.at < w.tr.length - 2) {
        d.seekAt = now; d.err = null; self.__seeks++; el.playbackRate = 1; softSeek(d, w.at + lat + 0.07);   // +70 мс — пока идёт приглушение
      } else {
        var r = Math.abs(df) < SYNC_DEAD ? 1 : 1 + Math.max(-SYNC_MAX, Math.min(SYNC_MAX, df / SYNC_TAU));
        r = Math.round(r * 1000) / 1000;
        if (el.playbackRate !== r) el.playbackRate = r;
      }
    }
    function step() {
      if (!self.alive || P.owner !== self || !ctx) return;
      var now = Date.now();
      P.decks.forEach(function (d) { if (d.key === "old" && now > d.gone) deckOff(d); });
      var tr = tracks();
      if (!tr) return;
      if (clk.off == null && now - born < 4000) return;   // сначала — серверные часы
      var want = plan(tr), main = want[0];
      var playing = P.decks.some(function (d) { return d.key && d.key !== "old"; });
      // ещё ничего не играет — ждём (до 8 с), пока трек скачается целиком: дальше играет из памяти, без обрывов
      if (!playing && !(blobs[main.tr.file] && blobs[main.tr.file].url) && now - (waitFrom || (waitFrom = now)) < 8000) { fetchBlob(main.tr.file); return; }
      waitFrom = 0;
      want.forEach(function (w) {
        if (P.decks.some(function (x) { return x.key === w.key; })) return;
        if (w !== main && (w.gain < 0.05 || now - born < 10000)) return;   // хвост: почти не слышно / только что сменили жанр (деки заняты уходящим) — не начинаем
        var d = P.decks.filter(function (x) { return !x.key; })[0] || P.decks.filter(function (x) { return x.key === "old"; })[0]
          || P.decks.filter(function (x) { return want.every(function (y) { return y.key !== x.key; }); })[0];
        if (d) load(d, w);
      });
      P.decks.forEach(function (d) {
        if (!d.key || d.key === "old") return;
        var w = null;
        want.forEach(function (y) { if (y.key === d.key) w = y; });
        if (!w) {   // переход кончился — трек отыграл своё (громкость уже ~0); расписание поменялось на ходу — плавно уводим
          if (d.g.gain.value > 0.05) { d.key = "old"; d.gone = now + CHANGE_FADE * 1000 + 500; d.g.gain.cancelScheduledValues(ctx.currentTime); d.g.gain.setTargetAtTime(0, ctx.currentTime, CHANGE_FADE / 4); }
          else deckOff(d);
          return;
        }
        d.g.gain.setTargetAtTime(w.gain, ctx.currentTime, 0.2);
        sync(d, w);
      });
      if (main.key !== curKey) {
        var was = curKey; curKey = main.key; cur = main.tr;
        nowTrack = "♪ " + (cur.author ? cur.author + " — " : "") + cur.title + (main.by ? " (заказ " + main.by + ")" : "") + (/^CC/.test(cur.license || "") ? " (" + cur.license.replace(/ [\d.]+$/, "") + ")" : "");
        if (want.sched && was) setTimeout(clubZone, 1500);   // У313: переход был — сразу узнать новый «следующий»
      }
      // У313: за 25 с до перехода — спрашивать сервер чаще (раз в 3 с): заказ «следующим» фиксируется за 10 с до стыка
      if (want.sched && want.nextStart && want.nextStart - serverNow() < 25000 && Date.now() - zoneAt > 3000) clubZone();
      fetchBlob(want.next.file);   // следующий трек — заранее
    }
    var iv = setInterval(step, 500);
    step();
    self.__state = function () {   // для теста
      var tr = tracks(), p = tr ? plan(tr) : [];
      return {title: nowTrack, off: clk.off, seeks: self.__seeks, owner: P.owner === self, sched: !!(p && p.sched),
        want: p.map(function (w) { return {key: w.key, file: w.tr.file, at: +w.at.toFixed(2), gain: +w.gain.toFixed(3)}; }),
        lat: outLat(), rtt: clk.rtt,
        decks: P.decks.map(function (d) {
          var w = null; p.forEach(function (y) { if (y.key === d.key) w = y; });
          // err — слышимая позиция минус серверная (с), в тот же миг
          return {key: d.key, at: +d.el.currentTime.toFixed(3), err: w && !d.el.paused ? +(d.el.currentTime - outLat() - w.at).toFixed(4) : null,
            gain: +d.g.gain.value.toFixed(3), paused: d.el.paused, rate: d.el.playbackRate, src: d.el.src ? d.el.src.slice(-30) : ""};
        })};
    };
    // tn (У373) — туннель {wet, bass}: пещерное эхо и бас; нет — обычный звук (эха туннеля нет, бас ровный, «сухая» доля 1)
    self.set = function (g, pv, cut, wv, tn) {
      if (!ctx || P.owner !== self) return;
      var t = ctx.currentTime, sw = !!tn !== P.tun, ft = sw ? 0.6 : tn ? 0.8 : 1.0;   // 2026-10-25: плавнее (было 0.12/0.35/0.5)   // смена «туннель ↔ клуб» — фильтр и эхо за ~0.4 с, плавно, без щелчка
      P.tun = !!tn;
      P.out.gain.setTargetAtTime(g, t, 2.0); if (P.pn) P.pn.pan.setTargetAtTime(pv, t, 0.6);
      P.muff.frequency.setTargetAtTime(cut || 20000, t, ft);
      if (P.wet) P.wet.gain.setTargetAtTime(wv || 0, t, sw ? 0.6 : 1.5);   // вход свёртки уже после громкости out
      P.shelf.gain.setTargetAtTime(tn ? tn.bass : 0, t, ft);
      P.dry.gain.setTargetAtTime(tn ? 1 - tn.wet : 1, t, ft);
      P.cwet.gain.setTargetAtTime(tn ? tn.wet : 0, t, ft);
    };
    // ушёл из клуба / портал — плавно гаснет ~3–4 с (владелец 2026-10-20)
    self.fade = function () { if (!ctx || P.owner !== self) return; P.out.gain.cancelScheduledValues(ctx.currentTime); P.out.gain.setTargetAtTime(0, ctx.currentTime, 1.1); setTimeout(self.kill, 6500); };
    self.retire = function () { self.alive = false; clearInterval(iv); };   // DJ сменил жанр: деки забирает новый плейлист (старое уходит плавно)
    self.kill = function () { self.retire(); if (P.owner === self) { P.decks.forEach(deckOff); P.owner = null; } };
    // нажатие (iPhone): разрешить звук обеим декам — свободную коротко запускаем без звука (её громкость 0) и сразу на паузу
    self.play = function () {
      P.decks.forEach(function (d) {
        if (d.key && d.key !== "old") { playEl(d.el); return; }
        if (d.key) return;
        var tr = tracks(), f = tr ? tr[0].file : null;
        if (!f) return;
        if (!d.el.src) d.el.src = (blobs[f] && blobs[f].url) || "music/" + f;
        var pr = d.el.play();
        if (pr && pr.then) pr.then(function () { if (!d.key) d.el.pause(); }).catch(function () { });
      });
    };
  }

  window.VPSound = {
    // iPhone/Safari: радио можно запустить только по нажатию — кнопка «🎵» в панели голоса вызывает unlock()
    unlock: function () { Object.keys(gens).forEach(function (k) { if (gens[k].play) gens[k].play(); }); },
    radioBlocked: function () { return radioBlocked; },
    start: start, stop: stop,
    // Б37: стихает быстро (τ 0,03 с ≈ 80 мс), возвращается плавно (τ 0,25 с ≈ 0,8 с); удержание между словами — в voice.js
    duck: function (v) { if (v !== ducked) { ducked = v; if (master && ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(level(), ctx.currentTime, v ? 0.03 : 0.25); } } },
    toggle: function () { enabled = !enabled; pref("on", enabled ? "1" : "0"); if (!enabled) { try { speechSynthesis.cancel(); } catch (e) { } } update(); return enabled; },
    volume: function (v) { if (v != null) { vol = Math.max(0, Math.min(1, v)); pref("vol", String(vol)); update(); } return vol; },
    enabled: function () { return enabled; },
    __setCfg: function (j) { cfg = j; },   // для тестовой страницы
    __el: function () { return Z ? Z.decks[0].el : null; },   // для теста восстановления после паузы
    __fx: function () {   // У373, для теста: параметры графа музыки клуба сейчас
      if (!Z || !ctx) return null; var r = function (v) { return Math.round(v * 1000) / 1000; };
      return {out: r(Z.out.gain.value), cut: Math.round(Z.muff.frequency.value), bass: r(Z.shelf.gain.value), dry: r(Z.dry.gain.value), cave: r(Z.cwet.gain.value),
        hall: r(Z.wet.gain.value), pan: Z.pn ? r(Z.pn.pan.value) : 0, room: window.VPSound.room(), now: nowTxt};
    },
    __zone: function () { var g = gens["z:club"]; return g && g.__state ? g.__state() : null; },   // для теста синхронизации
    // У375, для тестов: расписание костра (talkAt — то же, что VPNpc CampfireTalk.at) и что играет сейчас
    __talkAt: function (T, ms) { return talkAt(T, ms); },
    __cf: function () { return {key: cfKey, file: cfNow ? cfNow.l.file : null, playing: !!(cf && !cf.el.paused), at: cf ? +cf.el.currentTime.toFixed(2) : null,
      gain: cf ? +cf.g.gain.value.toFixed(3) : null, srvNow: serverNow(), off: clk.off}; },
    __setPos: function (p) { pos = p; posAt = Date.now(); update(); },
    // У390, для теста: штольни — где игрок (k фона), громкость петли сейчас, сколько записей загружено
    __mine: function () { if (!cfg || !ctx) return null; return (cfg.mines || []).map(function (m) { var st = mineAt(m), b = MN[m.id];
      return {id: m.id, k: +st.k.toFixed(3), inT: !!st.inT, bg: b ? +b.g.gain.value.toFixed(3) : null,
        loaded: [m.bg].concat((m.sfx || []).map(function (s) { return s.f; })).filter(mnGot).length, next: mnNext ? mnNext - Date.now() : 0}; }); },
    cave: function () { return on ? cave : 0; },   // 0..1 — насколько ты в пещере (voice.js — эхо голосов)
    // У296: в каком помещении-зоне ты сейчас (клуб) — voice.js: в клубе музыка «съедает» голоса, слышно только стоящих рядом
    room: function () {
      if (!on || !pos || !cfg) return null;
      var z = (cfg.zones || []).filter(function (z) { return zoneDist(z, pos) === 0; })[0];
      return z && enabled ? z.id : null;
    },

    now: function () { return nowTxt; }
  };
})();
