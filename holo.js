/* Компас-голограмма (владелец 2026-10-19: «два вида компаса — 2D и 3D; в 3D он наклоняется, виден рельеф впереди, крутится вместе
 * с камерой — как 3D-голограмма карты из планшета в фантастике»). Движок и плитки — те же, что у карты мира (map.js, У280):
 * MapLibre GL, наши плитки tiles/ + рельеф dem/ на GitHub Pages; наш z=0 = зум 18 (1 пиксель = 1 блок).
 * VPHolo.create(контейнер) → {update({world, x, z, yaw, radius, northUp, players:[{name, dx, dz, clan, friend}]}), destroy()}.
 * MapLibre подгружается сам при первом включении (кабинет без голограммы его не грузит). */
(function () {
  "use strict";
  var BASE = "https://david-artur.github.io/daviart-map/";
  var LIB = "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.";
  var Z0 = 18, WPX = 512 * Math.pow(2, Z0), C = WPX / 2, MPB = 40075016.686 / WPX;
  var loading = null, protoOn = false, updated = 0;

  function ll(x, z) {
    var lng = (x + C) / WPX * 360 - 180, n = Math.PI * (1 - 2 * (z + C) / WPX);
    return [lng, 180 / Math.PI * Math.atan(Math.sinh(n))];
  }
  function lib() {
    if (window.maplibregl) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (ok, bad) {
      var css = document.createElement("link"); css.rel = "stylesheet"; css.href = LIB + "css"; document.head.appendChild(css);
      var s = document.createElement("script"); s.src = LIB + "js"; s.onload = ok; s.onerror = bad; document.head.appendChild(s);
    });
    return loading;
  }
  function blank(level) {
    var c = document.createElement("canvas"), dem = level != null;
    c.width = c.height = dem ? 512 : 1;
    if (dem) {
      var v = level * MPB + 32768, R = Math.floor(v / 256), G = Math.floor(v - R * 256), B = Math.floor((v - R * 256 - G) * 256);
      var g = c.getContext("2d"); g.fillStyle = "rgb(" + R + "," + G + "," + B + ")"; g.fillRect(0, 0, 512, 512);
    }
    return new Promise(function (r) { c.toBlob(function (b) { b.arrayBuffer().then(r); }, "image/png"); });
  }
  var BL = {};
  function proto() {
    if (protoOn) return;
    protoOn = true;
    try {
      maplibregl.addProtocol("dav", function (params, abort) {
        var m = params.url.match(/^dav:\/\/(t|d)\/([a-z_]+)\/(\d+)\/(\d+)\/(\d+)$/);
        if (!m) return Promise.reject(new Error("bad url"));
        var z = +m[3], off = Math.pow(2, z - 1), x = +m[4] - off, y = +m[5] - off;
        var url = BASE + (m[1] === "t" ? "tiles/" : "dem/") + m[2] + "/" + (z - Z0) + "/" + x + "_" + y + (m[1] === "t" ? ".webp" : ".png") + "?v=" + updated;
        return fetch(url, {signal: abort.signal}).then(function (r) {
          if (r.ok) return r.arrayBuffer().then(function (d) { return {data: d}; });
          var k = m[1] === "t" ? "t" : (m[2] === "world_the_end" ? "e" : "s");
          BL[k] = BL[k] || blank(k === "t" ? null : k === "e" ? 0 : 62);
          return BL[k].then(function (d) { return {data: d}; });
        });
      });
    } catch (e) { /* уже зарегистрирован картой мира на этой странице */ }
  }
  function style(w) {
    return {version: 8,
      sources: {
        t: {type: "raster", tiles: ["dav://t/" + w + "/{z}/{x}/{y}"], tileSize: 512, minzoom: 13, maxzoom: 19},
        d: {type: "raster-dem", tiles: ["dav://d/" + w + "/{z}/{x}/{y}"], tileSize: 512, encoding: "terrarium", minzoom: 13, maxzoom: 18}
      },
      layers: [{id: "bg", type: "background", paint: {"background-color": "#1b1712"}},
        {id: "t", type: "raster", source: "t", paint: {"raster-resampling": "nearest", "raster-fade-duration": 0}}]};
  }

  function create(box) {
    var el = document.createElement("div"); el.className = "holo";
    el.innerHTML = '<div class="holo-map"></div><div class="holo-ring"></div><div class="holo-n">С</div><div class="holo-me"></div>' +
      '<div class="holo-tilt">↕ проведи вверх-вниз — наклон</div><div class="holo-load">Загружаю 3D-карту…</div>';
    box.appendChild(el);
    var map = null, world = null, marks = {}, last = null, dead = false;
    // наклон: проведи пальцем (мышью) вверх-вниз — от 0° (сверху) до 85°; запоминается
    var pitch = 60;
    try { var p0 = +localStorage.getItem("daviart.holo.pitch"); if (isFinite(p0) && localStorage.getItem("daviart.holo.pitch") != null) pitch = p0; } catch (e) { }
    var drag = null;
    el.addEventListener("pointerdown", function (e) { drag = {y: e.clientY, p: pitch}; try { el.setPointerCapture(e.pointerId); } catch (x) { } });
    el.addEventListener("pointermove", function (e) {
      if (!drag) return;
      pitch = Math.max(0, Math.min(85, drag.p + (drag.y - e.clientY) * 0.45));
      var t = el.querySelector(".holo-tilt"); if (t) { t.textContent = "наклон " + Math.round(pitch) + "°"; t.style.opacity = 1; }
      if (last) apply(last);
    });
    var up = function () {
      if (!drag) return; drag = null;
      try { localStorage.setItem("daviart.holo.pitch", String(Math.round(pitch))); } catch (e) { }
      var t = el.querySelector(".holo-tilt"); if (t) setTimeout(function () { t.style.opacity = 0; }, 1200);
    };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    setTimeout(function () { var t = el.querySelector(".holo-tilt"); if (t) t.style.opacity = 0; }, 5000);
    fetch(BASE + "worlds.json?t=" + Math.floor(Date.now() / 300000)).then(function (r) { return r.json(); }).then(function (j) { updated = j.updated || 0; }).catch(function () { })
      .then(lib).then(function () {
        if (dead) return;
        proto();
        var mc = el.querySelector(".holo-map");
        mc.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%";   // css MapLibre (.maplibregl-map{position:relative}) иначе даёт высоту 0
        map = new maplibregl.Map({container: mc, style: style(world || "world"), interactive: false, attributionControl: false,
          center: ll(0, 0), zoom: 17, pitch: pitch, maxPitch: 85, renderWorldCopies: false, fadeDuration: 0});
        window.__vpHoloMap = map;   // для отладки из консоли
        // не ждём «load» (он ждёт все плитки до горизонта) — показываем, как только готов стиль
        map.on("style.load", function () {
          map.setTerrain({source: "d", exaggeration: 2});
          var l = el.querySelector(".holo-load"); if (l) l.remove();
          if (last) apply(last);
        });
      }).catch(function () { var l = el.querySelector(".holo-load"); if (l) l.textContent = "Голограмма не загрузилась"; });

    function apply(s) {
      if (!map || !map.getSource("t")) return;
      if (s.world !== world) { world = s.world; map.setStyle(style(world), {diff: false}); Object.keys(marks).forEach(function (k) { marks[k].remove(); }); marks = {}; return; }
      var w = el.clientWidth || 300;
      var zoom = Z0 - Math.log(2 * Math.max(10, s.radius) / w) / Math.LN2 + 0.6;   // радиус компаса ≈ половина ширины (с запасом — наклон)
      var heading = s.northUp ? 0 : ((s.yaw + 180) % 360 + 360) % 360;              // Minecraft: yaw 180 — север
      map.jumpTo({center: ll(s.x, s.z), zoom: zoom, bearing: heading, pitch: pitch});
      el.querySelector(".holo-me").style.transform = "translate(-50%,-50%) rotate(" + (s.northUp ? ((s.yaw + 180) % 360) : 0) + "deg)";
      // «С» — где север на ободе (по взгляду — ездит по кругу)
      var n = el.querySelector(".holo-n"), a = -heading * Math.PI / 180, R = el.clientWidth / 2 - 14;
      if (n) { n.style.left = (el.clientWidth / 2 + Math.sin(a) * R) + "px"; n.style.top = (el.clientHeight / 2 - Math.cos(a) * R - 6) + "px"; }
      var seen = {};
      (s.players || []).forEach(function (p) {
        seen[p.name] = 1;
        var m = marks[p.name];
        if (!m) {
          var d = document.createElement("div"); d.className = "holo-p" + (p.clan ? " clan" : p.friend ? " friend" : "");
          d.innerHTML = "<i></i><span></span>"; d.querySelector("span").textContent = p.name;
          m = marks[p.name] = new maplibregl.Marker({element: d, anchor: "bottom"}).setLngLat(ll(s.x + p.dx, s.z + p.dz)).addTo(map);
        } else m.setLngLat(ll(s.x + p.dx, s.z + p.dz));
      });
      Object.keys(marks).forEach(function (k) { if (!seen[k]) { marks[k].remove(); delete marks[k]; } });
    }
    return {
      update: function (s) { if (!s || s.x == null || !s.world) return; last = s; apply(s); },
      resize: function () { if (map) map.resize(); },
      destroy: function () { dead = true; if (map) map.remove(); el.remove(); }
    };
  }
  window.VPHolo = {create: create};
})();
