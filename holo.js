/* Компас 3D — свой движок (владелец 2026-10-20: «горы на переднем плане, которые встают перед камерой, — полупрозрачные или
 * невидимые, задний план всегда видно; горы не понижать — переделай движок»). Раньше — MapLibre (рельеф там сплошной).
 * three.js r128 (cdnjs). Плитки и рельеф — те же, что у карты мира (GitHub Pages daviart-map): tiles/<мир>/<lv>/<x>_<y>.webp — цвет,
 * dem/<мир>/<lv>/<x>_<y>.png — высоты (terrarium, 1 точка = 1 блок на lv 0; lv −1…−5 — уменьшенные). Горы ×2 от уровня моря (62).
 * Сквозной передний план: в шейдере всё, что между камерой и точкой, на которую смотрим, и попадает в «конус взгляда», рисуется сеточкой
 * (часть точек пропускается — видно, что за ним); задний план — сплошной. Ты, игроки, «С» — поверх всего.
 * Управление — как у объёмной модели: 1 палец — двигать; 2 пальца — щипок (масштаб), повернуть (крутить), вверх-вниз (наклон);
 * мышь: тянуть — двигать, правая кнопка — крутить и наклонять, колёсико — масштаб. Пока не трогали — следует за персонажем;
 * сдвинули/повернули — стоит до center() («⌖ Центр»).
 * VPHolo.create(контейнер, {onFree(free)}) → {update(s), center(), zoomBy(k), resize(), pinching(), destroy()};
 * s = {world, myWorld, x, y, z, yaw, spawn: [x, z], radius, northUp, players: [{name, dx, dz, dy, clan, friend}]}. */
(function () {
  "use strict";
  var BASE = "https://david-artur.github.io/daviart-map/";
  var LIB = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
  var MPB = 40075016.686 / (512 * Math.pow(2, 18)), SEA = 62, EXAG = 2, FOV = 50;
  var loading = null, updated = 0;

  function lib() {
    if (window.THREE) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (ok, bad) { var s = document.createElement("script"); s.src = LIB; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
    return loading;
  }
  function ey(h) { return SEA + (h - SEA) * EXAG; }   // высота блока → высота в сцене (горы ×2 от уровня моря)
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  var POI_ICON = {home: "⌂", "clan-home": "⚑", "clan-point": "⚑", claim: "■", "claim-member": "■", mark: "●", spawn: "✦", portal: "◎"};   // У289: флаги клана
  var markersP = null;   // markers.json (приваты и зоны у точки прибытия всех миров) — один раз
  function markers() {
    if (!markersP) markersP = fetch(BASE + "markers.json?t=" + Math.floor(Date.now() / 600000)).then(function (r) { return r.json(); }).catch(function () { return {worlds: {}}; });
    return markersP;
  }

  var VS = [
    "varying vec2 vUv; varying vec3 vW; varying vec3 vN;",
    "void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);",
    "  gl_Position = projectionMatrix * viewMatrix * w; }"].join("\n");
  var FS = [
    "uniform sampler2D map; uniform vec3 cam; uniform vec3 tgt; uniform float cone; uniform vec3 light;",
    "varying vec2 vUv; varying vec3 vW; varying vec3 vN;",
    // 2026-10-21 (владелец: «компас грузит процессор»): сетка Байера 4×4 — формулой, без массива и цикла на каждый пиксель
    "float b2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }",
    "float bayer(vec2 p) { return b2(0.5 * p) * 0.25 + b2(p); }",
    "void main() {",
    "  vec4 c = texture2D(map, vUv); if (c.a < 0.5) discard;",
    "  vec3 d = tgt - cam; float L = length(d); vec3 f = d / L; vec3 v = vW - cam; float t = dot(v, f);",
    "  float off = length(v - f * t);",
    // сквозной — только то, что поднимается выше линии взгляда камера → ты (горы, скалы); ровная земля перед тобой — обычная
    // (2026-10-20: раньше прозрачной была и земля под линией взгляда — сквозь неё виднелся тёмный фон, «чёрная тень»)
    "  vec3 P = cam + f * t;",
    "  if (t > 0.0 && t < L - 3.0 && off < cone * t + 6.0 && vW.y > P.y - 1.5) {",
    "    float k = clamp((L - 3.0 - t) / 12.0, 0.0, 1.0) * clamp(1.0 - off / (cone * t + 6.0), 0.0, 1.0);",
    "    if (bayer(gl_FragCoord.xy) < 0.25 + 0.6 * k) discard; }",
    "  float sh = 0.72 + 0.38 * max(dot(normalize(vN), light), 0.0);",
    "  gl_FragColor = vec4(c.rgb * sh, 1.0); }"].join("\n");

  function create(box, opts) {
    opts = opts || {};
    var el = document.createElement("div"); el.className = "holo";
    el.innerHTML = '<div class="holo-map"></div><div class="holo-ov"></div><div class="holo-ring"></div><div class="holo-n">С</div>' +
      '<div class="holo-tilt">☝ двигай · ✌ щипок — масштаб, поверни — крути · наклон — полоска сбоку ▲▼</div><div class="holo-load">Загружаю 3D…</div>';
    box.appendChild(el);
    var ov = el.querySelector(".holo-ov");
    var R3 = null, scene, camera, renderer, group, uni = null, dead = false, dirty = true;
    var world = null, origin = [0, 0], tiles = {}, last = null, follow = true, mkGroup = null, claimLabels = [];
    // приваты — полупрозрачные коробки с рамкой (как на старой карте BlueMap: личный — зелёный, клан — жёлтый, видно сквозь рельеф),
    // зоны у точки прибытия — кольца (без PvP — красное, ничего не ломается — оранжевое, дальше можно приватить — синее)
    function buildMarkers() {
      if (!R3 || !world) return;
      var T = R3, w0 = world;
      if (mkGroup) { scene.remove(mkGroup); mkGroup.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); mkGroup = null; }
      claimLabels = [];
      markers().then(function (j) {
        if (dead || world !== w0) return;
        var w = (j.worlds || {})[world] || {}, g = new T.Group();
        (w.claims || []).forEach(function (c) {
          var b = c.b, yy = c.y || [60, 80], col = c.c ? 0xeab308 : 0x22c55e;
          var sx = b[2] - b[0], sz = b[3] - b[1], y0 = ey(yy[0]), y1 = ey(yy[1]);
          var geo = new T.BoxGeometry(sx, Math.max(1, y1 - y0), sz);
          var box = new T.Mesh(geo, new T.MeshBasicMaterial({color: col, transparent: true, opacity: 0.16, depthTest: false, depthWrite: false}));
          var cx = (b[0] + b[2]) / 2 - origin[0], cz = (b[1] + b[3]) / 2 - origin[1], cy = (y0 + y1) / 2;
          box.position.set(cx, cy, cz); box.renderOrder = 10;
          var edge = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({color: col, transparent: true, opacity: 0.95, depthTest: false}));
          edge.position.copy(box.position); edge.renderOrder = 11;
          g.add(box); g.add(edge);
          claimLabels.push({n: c.o ? c.n + " — " + c.o : c.n, clan: !!c.c, x: (b[0] + b[2]) / 2, z: (b[1] + b[3]) / 2, top: y1 + 1});
        });
        var z = w.zone;
        if (z) [[z.safe, 0xef4444], [z.protect, 0xf59e0b], [z.public, 0x3b82f6]].forEach(function (r) {
          if (!(r[0] > 0)) return;
          var pts = [];
          for (var i = 0; i <= 128; i++) { var a = i / 128 * Math.PI * 2; pts.push(new T.Vector3(z.x + Math.cos(a) * r[0] - origin[0], ey(66), z.z + Math.sin(a) * r[0] - origin[1])); }
          var ln = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({color: r[1], transparent: true, opacity: 0.95, depthTest: false}));
          ln.renderOrder = 12; g.add(ln);
        });
        mkGroup = g; scene.add(g); dirty = true; forceDraw = true;
      });
    }
    var cam = {x: 0, z: 0, h: 0, pitch: 55, radius: 120};   // точка взгляда (блоки), куда смотрим (0 — север), наклон (0 — сверху), радиус
    try { var p0 = localStorage.getItem("daviart.holo.pitch"); if (p0 != null && isFinite(+p0)) cam.pitch = Math.max(0, Math.min(85, +p0)); } catch (e) { }
    var free = function (on) { if (follow === !on) return; follow = !on; if (opts.onFree) opts.onFree(on); };
    setTimeout(function () { var t = el.querySelector(".holo-tilt"); if (t) t.style.opacity = 0; }, 6000);

    fetch(BASE + "worlds.json?t=" + Math.floor(Date.now() / 300000)).then(function (r) { return r.json(); }).then(function (j) { updated = j.updated || 0; }).catch(function () { })
      .then(lib).then(function () {
        if (dead) return;
        var T = window.THREE;
        renderer = new T.WebGLRenderer({antialias: false, alpha: false});
        renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));   // 2026-10-21: было до 2× — на телефоне втрое больше пикселей, грелся
        renderer.setClearColor(0x1b1712, 1);
        el.querySelector(".holo-map").appendChild(renderer.domElement);
        scene = new T.Scene(); group = new T.Group(); scene.add(group);
        camera = new T.PerspectiveCamera(FOV, 1, 1, 20000);
        uni = {cam: {value: new T.Vector3()}, tgt: {value: new T.Vector3()}, cone: {value: 0.22}, light: {value: new T.Vector3(-0.45, 0.8, -0.35).normalize()}};
        R3 = T;
        window.__vpHolo = {tiles: function () { return tiles; }, cam: cam, origin: function () { return origin; }, world: function () { return world; }, kick: function () { dirty = true; forceDraw = true; }, stale: function () { return stale.length; }};   // отладка
        var l = el.querySelector(".holo-load"); if (l) l.remove();
        resize(); buildMarkers(); loop();
      }).catch(function () { var l = el.querySelector(".holo-load"); if (l) l.textContent = "3D не загрузилось"; });

    // ---------------------------------------------------------------- плитки
    function level() { var r = cam.radius / Math.max(0.35, Math.cos(cam.pitch * Math.PI / 180)); return r <= 260 ? 0 : Math.max(-5, -Math.ceil(Math.log(r / 260) / Math.LN2)); }
    function heightAt(x, z) {   // высота рельефа под точкой (из загруженных плиток), для «куда смотрим»
      var best = null;
      Object.keys(tiles).forEach(function (k) {
        var t = tiles[k]; if (!t.h || best != null) return;
        var u = (x - t.x0) / t.size, v = (z - t.z0) / t.size;
        if (u < 0 || v < 0 || u >= 1 || v >= 1) return;
        best = t.h[Math.floor(v * (t.n - 1)) * t.n + Math.floor(u * (t.n - 1))];
      });
      return best == null ? 70 : best;
    }
    function want() {
      var lv = level(), size = 512 * Math.pow(2, -lv), span = cam.radius * 2.6 + size * 0.5, out = {};
      var x0 = Math.floor((cam.x - span) / size), x1 = Math.floor((cam.x + span) / size), z0 = Math.floor((cam.z - span) / size), z1 = Math.floor((cam.z + span) / size);
      for (var tx = x0; tx <= x1; tx++) for (var tz = z0; tz <= z1; tz++) out[world + ":" + lv + ":" + tx + ":" + tz] = {lv: lv, tx: tx, tz: tz, size: size};
      return out;
    }
    // 2026-10-20: без мигания — ненужные плитки (сменился уровень детализации при зуме/наклоне) не удаляются сразу, а остаются
    // чуть ниже новых, пока все новые не загрузятся (или 5 с); раньше карта на долю секунды пропадала
    var stale = [], staleAt = 0;
    function freeTile(t) { t.dead = true; if (t.mesh) { group.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); if (t.tex) t.tex.dispose(); t.mesh = null; } }
    function sweepStale(force) {
      if (!stale.length) return;
      var ready = Object.keys(tiles).every(function (k) { return tiles[k].mesh || tiles[k].failed; });
      if (!force && !ready && Date.now() - staleAt < 5000) return;
      stale.forEach(freeTile); stale = []; dirty = true; forceDraw = true;
    }
    function syncTiles() {
      if (!R3 || !world) return;
      var w = want();
      Object.keys(tiles).forEach(function (k) {
        if (w[k]) return;
        var t = tiles[k]; delete tiles[k];
        if (!t.mesh) { t.dead = true; return; }
        if (!stale.length) { staleAt = Date.now(); setTimeout(function () { sweepStale(); }, 5100); }
        t.mesh.position.y = -1.5 - stale.length * 0.01; t.mesh.renderOrder = -1; stale.push(t);
      });
      while (stale.length > 160) freeTile(stale.shift());   // при долгом зуме — не копить память
      Object.keys(w).forEach(function (k) { if (!tiles[k]) loadTile(k, w[k]); });
      sweepStale();
    }
    function loadTile(k, d) {
      var T = R3, t = tiles[k] = {x0: d.tx * d.size, z0: d.tz * d.size, size: d.size, n: d.lv === 0 ? 257 : 129};
      var q = "/" + world + "/" + d.lv + "/" + d.tx + "_" + d.tz, v = "?v=" + updated;
      var img = new Image(); img.crossOrigin = "anonymous";
      var demP = fetch(BASE + "dem" + q + ".png" + v).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) { return createImageBitmap(b); })
        .then(function (bm) {
          var c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height;
          var g = c.getContext("2d"); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, bm.width, bm.height);
        }).catch(function () { return null; });
      var texP = new Promise(function (ok) { img.onload = function () { ok(img); }; img.onerror = function () { ok(null); }; img.src = BASE + "tiles" + q + ".webp" + v; });
      Promise.all([demP, texP]).then(function (r) {
        if (t.dead || dead) return;
        if (!r[1]) { t.failed = true; sweepStale(); return; }
        var id = r[0], n = t.n, h = new Float32Array(n * n);
        for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) {
          var hv = 62;
          if (id) {
            var px = Math.min(id.width - 1, Math.round(i / (n - 1) * (id.width - 1))), py = Math.min(id.height - 1, Math.round(j / (n - 1) * (id.height - 1))), o = (py * id.width + px) * 4;
            hv = ((id.data[o] * 256 + id.data[o + 1] + id.data[o + 2] / 256) - 32768) / MPB;
          }
          h[j * n + i] = hv;
        }
        t.h = h;
        var geo = new T.PlaneGeometry(t.size, t.size, n - 1, n - 1);   // в плоскости XY — повернём, чтобы лежала (X — восток, Z — юг)
        var pos = geo.attributes.position;
        for (var idx = 0; idx < pos.count; idx++) {
          var ii = idx % n, jj = Math.floor(idx / n);
          pos.setXYZ(idx, t.x0 + ii / (n - 1) * t.size - origin[0], ey(h[jj * n + ii]), t.z0 + jj / (n - 1) * t.size - origin[1]);
        }
        geo.computeVertexNormals();
        var uv = geo.attributes.uv;
        for (var u2 = 0; u2 < uv.count; u2++) uv.setY(u2, 1 - uv.getY(u2));   // плитка: верх картинки — север
        var tex = new T.Texture(r[1]); tex.magFilter = T.NearestFilter; tex.minFilter = T.LinearMipMapLinearFilter; tex.needsUpdate = true;
        tex.flipY = false;
        var mat = new T.ShaderMaterial({vertexShader: VS, fragmentShader: FS, side: T.DoubleSide,
          uniforms: {map: {value: tex}, cam: uni.cam, tgt: uni.tgt, cone: uni.cone, light: uni.light}});
        t.mesh = new T.Mesh(geo, mat); t.tex = tex;
        group.add(t.mesh); dirty = true; forceDraw = true; sweepStale();
      });
    }

    // ---------------------------------------------------------------- камера и метки
    function place() {
      if (!R3) return;
      var T = R3, ph = cam.pitch * Math.PI / 180, hd = cam.h * Math.PI / 180;
      var fx = Math.sin(hd), fz = -Math.cos(hd);                      // куда смотрим по земле (0 — север, −Z)
      var dist = cam.radius / Math.tan(FOV / 2 * Math.PI / 180) * 0.95;
      var ty = ey(heightAt(cam.x, cam.z));
      var tx = cam.x - origin[0], tz = cam.z - origin[1];
      camera.position.set(tx - fx * dist * Math.sin(ph), ty + dist * Math.cos(ph), tz - fz * dist * Math.sin(ph));
      if (cam.pitch < 3) camera.up.set(fx, 0, fz); else camera.up.set(0, 1, 0);
      camera.lookAt(tx, ty, tz);
      camera.far = dist * 8 + 4000; camera.updateProjectionMatrix();
      uni.cam.value.copy(camera.position); uni.tgt.value.set(tx, ty, tz);
      // «С» на ободе
      var n = el.querySelector(".holo-n"), W = el.clientWidth, a = -cam.h * Math.PI / 180, Rr = W / 2 - 14;
      if (n) { n.style.left = (W / 2 + Math.sin(a) * Rr) + "px"; n.style.top = (el.clientHeight / 2 - Math.cos(a) * Rr - 6) + "px"; }
    }
    var V = null;
    function scr(x, y, z) {   // мир (блоки) → экран (px); null — за камерой
      if (!V) V = new R3.Vector3();
      V.set(x - origin[0], y, z - origin[1]).project(camera);
      if (V.z > 1) return null;
      return [(V.x + 1) / 2 * el.clientWidth, (1 - V.y) / 2 * el.clientHeight];
    }
    var ovEls = {};
    function overlay() {
      var s = last, seen = {};
      if (!s || !R3) return;
      var own = s.world === s.myWorld && s.x != null;
      var put = function (key, cls, html, x, y, z, rot) {
        var p = scr(x, y, z); seen[key] = 1;
        var e = ovEls[key];
        if (!e) { e = ovEls[key] = document.createElement("div"); e.className = cls; e.innerHTML = html; ov.appendChild(e); }
        if (!p) { e.style.display = "none"; return; }
        e.style.display = ""; e.style.left = p[0] + "px"; e.style.top = p[1] + "px";
        if (rot != null) e.style.transform = "translate(-50%,-50%) rotate(" + rot + "deg)";
      };
      if (own) {
        var py = s.y != null ? s.y : heightAt(s.x, s.z);
        // стрелка «ты»: угол на экране — между твоей точкой и точкой на 4 блока вперёд по взгляду
        var yr = s.yaw * Math.PI / 180, ax = s.x - Math.sin(yr) * 4, az = s.z + Math.cos(yr) * 4;
        var a = scr(s.x, ey(py), s.z), b = scr(ax, ey(py), az);
        var rot = a && b ? Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI : 0;
        put("me", "holo-me", "", s.x, ey(py), s.z, rot);
        (s.players || []).forEach(function (p) {
          var ph = py + (p.dy || 0);
          put("p:" + p.name, "holo-p" + (p.clan ? " clan" : p.friend ? " friend" : ""), "<i></i><span>" + esc(p.name) + "</span>", s.x + p.dx, ey(ph) + 2, s.z + p.dz);
        });
        // те же точки, что в 2D: дом, свои приваты, где участник, личные метки, спавн, порталы; метки карты в руке
        (s.pois || []).forEach(function (q, i) {
          put("q:" + q.kind + ":" + i, "holo-poi k-" + q.kind, "<b>" + (POI_ICON[q.kind] || "•") + "</b><span>" + esc(q.label || "") + "</span>", q.x, ey(heightAt(q.x, q.z)) + 1, q.z);
        });
        (s.marks || []).forEach(function (m, i) {
          var ic = m.color ? '<b class="ban" style="background:' + esc(m.color) + '"></b>' : m.type === "red_x" || m.type === "target_x" ? '<b class="x">✕</b>' : "<b>◆</b>";
          put("m:" + i, "holo-poi k-mapmark", ic + "<span>" + esc(m.label || "") + "</span>", m.x, ey(heightAt(m.x, m.z)) + 1, m.z);
        });
      }
      // подписи приватов рядом (коробки — в сцене)
      (claimLabels || []).forEach(function (c, i) {
        if (Math.hypot(c.x - cam.x, c.z - cam.z) > cam.radius * 1.6) return;
        put("c:" + i, "holo-claim" + (c.clan ? " clan" : ""), esc(c.n), c.x, c.top, c.z);
      });
      Object.keys(ovEls).forEach(function (k) { if (!seen[k]) { ovEls[k].remove(); delete ovEls[k]; } });
    }
    // 2026-10-21: рисуем только если камера/метки правда изменились (раньше — каждый кадр, пока ты в игре) и не чаще 30 раз в секунду;
    // свёрнутая вкладка — не рисуем
    var lastKey = "", lastDraw = 0;
    function loop(t) {
      if (dead) return;
      if (dirty && R3 && !document.hidden && !(t && t - lastDraw < 31)) {
        dirty = false;
        var s = last, key = [cam.x.toFixed(2), cam.z.toFixed(2), cam.h.toFixed(1), cam.pitch.toFixed(1), cam.radius.toFixed(1), world, el.clientWidth,
          s ? JSON.stringify([s.players, s.pois, s.marks, s.yaw && Math.round(s.yaw)]) : ""].join("|");
        if (key !== lastKey || forceDraw) { lastKey = key; forceDraw = false; lastDraw = t || 0; place(); syncTiles(); renderer.render(scene, camera); overlay(); }
      }
      requestAnimationFrame(loop);
    }
    var forceDraw = true;
    function resize() {
      if (!renderer) return;
      var w = el.clientWidth || 300, h = el.clientHeight || 300;
      renderer.setSize(w, h, true); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; forceDraw = true;
    }

    // ---------------------------------------------------------------- жесты
    var pts = {}, g0 = null;
    function gstate() {
      var k = Object.keys(pts), a = pts[k[0]], b = pts[k[1]];
      return {mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x)};
    }
    function panBy(dx, dy) {
      var bpp = 2 * cam.radius / (el.clientWidth || 300);   // блоков на пиксель у точки взгляда
      var hd = cam.h * Math.PI / 180, fx = Math.sin(hd), fz = -Math.cos(hd), rx = Math.cos(hd), rz = Math.sin(hd);
      var k = 1 / Math.max(0.35, Math.cos(cam.pitch * Math.PI / 180));
      cam.x += (-dx * rx + dy * fx * k) * bpp; cam.z += (-dx * rz + dy * fz * k) * bpp;
      free(true); dirty = true;
    }
    el.addEventListener("pointerdown", function (e) {
      pts[e.pointerId] = {x: e.clientX, y: e.clientY, b: e.button}; try { el.setPointerCapture(e.pointerId); } catch (x) { }
      if (Object.keys(pts).length === 2) g0 = gstate();
    });
    el.addEventListener("pointermove", function (e) {
      var p = pts[e.pointerId]; if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      var n = Object.keys(pts).length;
      if (n === 1) {
        if (p.b === 2 || e.ctrlKey) { cam.h = (cam.h - dx * 0.4 + 360) % 360; cam.pitch = Math.max(0, Math.min(85, cam.pitch - dy * 0.35)); tiltUi(); free(true); dirty = true; }
        else panBy(dx, dy);
      } else if (n === 2 && g0) {
        var g = gstate();
        if (g0.d > 10 && g.d > 10) cam.radius = Math.max(6, Math.min(3000, cam.radius * g0.d / g.d));
        var da = (g.ang - g0.ang) * 180 / Math.PI; if (da > 180) da -= 360; if (da < -180) da += 360;
        if (Math.abs(da) > 0.3) { cam.h = (cam.h - da + 360) % 360; free(true); }
        cam.pitch = Math.max(0, Math.min(85, cam.pitch - (g.my - g0.my) * 0.35));   // пальцы вверх — сильнее наклон (владелец 2026-10-20)
        tiltUi();
        g0 = g; dirty = true;
      }
    });
    var up = function (e) {
      delete pts[e.pointerId];
      if (Object.keys(pts).length < 2) g0 = null;
      try { localStorage.setItem("daviart.holo.pitch", String(Math.round(cam.pitch))); } catch (x) { }
    };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    // наклон одним пальцем — полоска сбоку компаса: вверх — сильнее наклон (виден горизонт), вниз — вид сверху
    var bar = document.createElement("div"); bar.className = "holo-tiltbar";
    bar.innerHTML = '<span class="tb-up">▲</span><div class="tb-track"><i></i></div><span class="tb-dn">▼</span><b></b>';
    box.appendChild(bar);
    function tiltUi() {
      var k = cam.pitch / 85, i = bar.querySelector(".tb-track i"), b = bar.querySelector("b");
      if (i) i.style.bottom = (k * 100) + "%";
      if (b) b.textContent = Math.round(cam.pitch) + "°";
    }
    var tb = null;
    bar.addEventListener("pointerdown", function (e) { e.preventDefault(); e.stopPropagation(); tb = {y: e.clientY, p: cam.pitch}; try { bar.setPointerCapture(e.pointerId); } catch (x) { } bar.classList.add("on"); });
    bar.addEventListener("pointermove", function (e) {
      if (!tb) return; e.stopPropagation();
      var h = bar.clientHeight || 200;
      cam.pitch = Math.max(0, Math.min(85, tb.p + (tb.y - e.clientY) / h * 85 * 1.2));
      tiltUi(); dirty = true;
    });
    var tbUp = function () { if (!tb) return; tb = null; bar.classList.remove("on"); try { localStorage.setItem("daviart.holo.pitch", String(Math.round(cam.pitch))); } catch (x) { } };
    bar.addEventListener("pointerup", tbUp); bar.addEventListener("pointercancel", tbUp);
    tiltUi();
    el.addEventListener("wheel", function (e) { e.preventDefault(); cam.radius = Math.max(6, Math.min(3000, cam.radius * Math.pow(1.0015, e.deltaY))); dirty = true; }, {passive: false});

    // ---------------------------------------------------------------- данные от компаса
    function apply(s, jump) {
      if (s.world !== world) {   // другой мир — сбросить плитки, новая точка отсчёта
        world = s.world;
        if (group) { Object.keys(tiles).forEach(function (k) { freeTile(tiles[k]); }); stale.forEach(freeTile); }
        Object.keys(tiles).forEach(function (k) { tiles[k].dead = true; });
        tiles = {}; stale = []; jump = true;
        var c0 = s.world === s.myWorld && s.x != null ? [s.x, s.z] : (s.spawn || [0, 0]);
        origin = [Math.round(c0[0] / 512) * 512, Math.round(c0[1] / 512) * 512];
        buildMarkers();
      }
      var own = s.world === s.myWorld && s.x != null;
      if (follow || jump) {
        var c = own ? [s.x, s.z] : (s.spawn || [0, 0]);
        cam.x = c[0]; cam.z = c[1];
        if (own && !s.northUp) cam.h = ((s.yaw + 180) % 360 + 360) % 360;
        else if (s.northUp && follow) cam.h = 0;
        if (jump) cam.radius = s.radius || cam.radius;
      }
      dirty = true;
    }
    return {
      update: function (s) { if (!s || !s.world) return; var jump = !last; last = s; apply(s, jump); },
      center: function () { free(false); if (last) apply(last, true); },
      zoomBy: function (k) { cam.radius = Math.max(6, Math.min(3000, cam.radius * k)); dirty = true; },
      resize: function () { resize(); },
      pinching: function () { },
      destroy: function () { dead = true; bar.remove(); if (renderer) { renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); } el.remove(); }
    };
  }
  window.VPHolo = {create: create};
})();
