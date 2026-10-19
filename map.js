/* Своя карта мира DaviArt Craft (У280 v2, владелец 2026-10-19: «замени старую карту: 3D, человечки-игроки, метки, круги на спавнах,
 * компас через новую карту — весь функционал прошлой»).
 * Движок — MapLibre GL: плоский вид и 3D (рельеф из карт высот, наклон и поворот). Плитки рисует minecraft-server/map-render и кладёт
 * на GitHub Pages (David-Artur/daviart-map): tiles/<мир>/<z>/<x>_<y>.webp — цвет, dem/<мир>/<z>/<x>_<y>.png — высоты (terrarium);
 * наш z=0 (1 пиксель = 1 блок) = зум 18 MapLibre, плитка = регион 512×512. markers.json — приваты и зоны у точки прибытия.
 * Живое (если mc.daviart.com открывается): /api/players — игроки онлайн, /api/home (вход в кабинет) — я, мои метки, дом.
 * Адрес: map.html#мир/x/z/зум[/наклон/поворот] — так же открывают карту кабинет («компас») и страницы приватов. */
(function () {
  "use strict";
  var BASE = "https://david-artur.github.io/daviart-map/";
  var API = "https://mc.daviart.com/api";
  var TOKEN_KEY = "daviart.cabinet.token";
  var ORDER = ["world", "world_valley", "world_frontier", "world_wastes", "vp_nether", "world_the_end", "world_lobby"];
  var SHORT = {world: "1 Святые", world_valley: "2 Долины", world_frontier: "3 Пограничье", world_wastes: "4 Пустоши",
    vp_nether: "5 Незер", world_the_end: "6 Энд", world_lobby: "Лобби"};
  var EXAG = +(new URLSearchParams(location.search).get("ex") || 2);   // высота гор ×2 по умолчанию (в настоящей пропорции Minecraft выглядит почти плоским); меняется в «Слоях»
  var Z0 = 18, WPX = 512 * Math.pow(2, Z0), C = WPX / 2, MPB = 40075016.686 / WPX;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); };
  var token = null; try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { }

  // ---------------------------------------------------------------- координаты: блоки ↔ долгота/широта (Web Mercator, зум 18 = 1 блок/пиксель)
  function ll(x, z) {
    var lng = (x + C) / WPX * 360 - 180;
    var n = Math.PI * (1 - 2 * (z + C) / WPX);
    return [lng, 180 / Math.PI * Math.atan(Math.sinh(n))];
  }
  function blk(lngLat) {
    var lat = lngLat.lat * Math.PI / 180;
    var x = (lngLat.lng + 180) / 360 * WPX - C;
    var z = (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * WPX - C;
    return {x: x, z: z};
  }
  function zoomOf(our) { return Z0 + our; }

  // ---------------------------------------------------------------- плитки: свой протокол dav:// → наши файлы (наш z, x, y)
  var EMPTY_PNG = null, FLAT = {};
  function blankPng() {
    if (EMPTY_PNG) return EMPTY_PNG;
    var c = document.createElement("canvas"); c.width = c.height = 1;
    EMPTY_PNG = new Promise(function (r) { c.toBlob(function (b) { b.arrayBuffer().then(r); }, "image/png"); });
    return EMPTY_PNG;
  }
  function flatDem(level) {
    if (FLAT[level]) return FLAT[level];
    var v = level * MPB + 32768, R = Math.floor(v / 256), G = Math.floor(v - R * 256), B = Math.floor((v - R * 256 - G) * 256);
    var c = document.createElement("canvas"); c.width = c.height = 256;
    var g = c.getContext("2d"); g.fillStyle = "rgb(" + R + "," + G + "," + B + ")"; g.fillRect(0, 0, 256, 256);
    FLAT[level] = new Promise(function (r) { c.toBlob(function (b) { b.arrayBuffer().then(r); }, "image/png"); });
    return FLAT[level];
  }
  maplibregl.addProtocol("dav", function (params, abort) {
    var m = params.url.match(/^dav:\/\/(t|d)\/([a-z_]+)\/(\d+)\/(\d+)\/(\d+)$/);
    if (!m) return Promise.reject(new Error("bad url"));
    var z = +m[3], off = Math.pow(2, z - 1), oz = z - Z0, x = +m[4] - off, y = +m[5] - off;
    var url = BASE + (m[1] === "t" ? "tiles/" : "dem/") + m[2] + "/" + oz + "/" + x + "_" + y + (m[1] === "t" ? ".webp" : ".png") + "?v=" + (info ? info.updated : 0);
    return fetch(url, {signal: abort.signal}).then(function (r) {
      if (r.ok) return r.arrayBuffer().then(function (d) { return {data: d}; });
      return (m[1] === "t" ? blankPng() : flatDem(m[2] === "world_the_end" ? 0 : 62)).then(function (d) { return {data: d}; });
    });
  });

  // ---------------------------------------------------------------- карта
  var info = null, marks = null, cur = null, is3d = false;
  var map = new maplibregl.Map({container: "map", style: {version: 8, sources: {}, layers: [{id: "bg", type: "background", paint: {"background-color": "#0e0c0a"}}]},
    center: ll(0, 0), zoom: 17, minZoom: 12.5, maxZoom: 21, maxPitch: 75, attributionControl: false, renderWorldCopies: false, dragRotate: true});
  map.addControl(new maplibregl.NavigationControl({visualizePitch: true, showCompass: true}), "top-left");

  function circle(x, z, r, n) {
    var pts = [];
    for (var i = 0; i <= n; i++) { var a = i / n * Math.PI * 2; pts.push(ll(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
    return pts;
  }
  function rect(b) { return [[ll(b[0], b[1]), ll(b[2], b[1]), ll(b[2], b[3]), ll(b[0], b[3]), ll(b[0], b[1])]]; }

  function overlays() {
    var m = marks && marks.worlds && marks.worlds[cur] || {};
    var claims = (m.claims || []).map(function (c, i) {
      return {type: "Feature", id: i, properties: {n: c.n, o: c.o || "", c: !!c.c, s: c.s || "", m: (c.m || []).join(", ")}, geometry: {type: "Polygon", coordinates: rect(c.b)}};
    });
    map.addSource("claims", {type: "geojson", data: {type: "FeatureCollection", features: claims}});
    map.addLayer({id: "claims-fill", type: "fill", source: "claims", paint: {"fill-color": ["case", ["get", "c"], "#eab308", "#22c55e"], "fill-opacity": 0.22}});
    map.addLayer({id: "claims-line", type: "line", source: "claims", paint: {"line-color": ["case", ["get", "c"], "#eab308", "#22c55e"], "line-width": 2}});
    var zf = [], zn = m.zone;
    if (zn) {
      if (zn.safe > 0) zf.push({type: "Feature", properties: {t: "Без PvP — " + Math.round(zn.safe) + " бл.", col: "#ef4444"}, geometry: {type: "LineString", coordinates: circle(zn.x, zn.z, zn.safe, 96)}});
      if (zn.protect > 0) zf.push({type: "Feature", properties: {t: (zn.public ? "Ничего не ломается — " : "Неразрушимый спавн — ") + Math.round(zn.protect) + " бл.", col: "#f59e0b"}, geometry: {type: "LineString", coordinates: circle(zn.x, zn.z, zn.protect, 128)}});
      if (zn.public > 0) zf.push({type: "Feature", properties: {t: "Дальше — можно приватить (" + Math.round(zn.public) + " бл.)", col: "#3b82f6"}, geometry: {type: "LineString", coordinates: circle(zn.x, zn.z, zn.public, 160)}});
    }
    map.addSource("zones", {type: "geojson", data: {type: "FeatureCollection", features: zf}});
    map.addLayer({id: "zones-line", type: "line", source: "zones", paint: {"line-color": ["get", "col"], "line-width": 3, "line-opacity": 0.95}});
    layerVis();
  }
  function layerVis() {
    var v = function (id, on) { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none"); };
    v("claims-fill", $("lclaims").checked); v("claims-line", $("lclaims").checked); v("zones-line", $("lzones").checked);
    Object.keys(pMarks).forEach(function (k) { pMarks[k].getElement().style.display = $("lplayers").checked ? "" : "none"; });
    myMarks.forEach(function (mk) { mk.getElement().style.display = $("lmine").checked ? "" : "none"; });
  }

  var popup = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 8});
  map.on("mousemove", "claims-fill", function (e) {
    var p = e.features[0].properties;
    popup.setLngLat(e.lngLat).setHTML("<b>" + esc(p.n) + "</b>" + (p.o ? "<br>" + esc(p.o) : "") + (p.s ? "<br>Размер " + esc(p.s) : "") + (p.m ? "<br>Участники: " + esc(p.m) : "")).addTo(map);
  });
  map.on("mouseleave", "claims-fill", function () { popup.remove(); });
  map.on("click", "claims-fill", function (e) {
    var p = e.features[0].properties;
    new maplibregl.Popup({offset: 8}).setLngLat(e.lngLat).setHTML("<b>" + esc(p.n) + "</b>" + (p.o ? "<br>" + esc(p.o) : "") + (p.s ? "<br>Размер " + esc(p.s) : "") + (p.m ? "<br>Участники: " + esc(p.m) : "")).addTo(map);
  });
  map.on("mousemove", "zones-line", function (e) { popup.setLngLat(e.lngLat).setHTML(esc(e.features[0].properties.t)).addTo(map); });
  map.on("mouseleave", "zones-line", function () { popup.remove(); });

  function style(w) {
    var dark = w === "vp_nether" ? "#1a0b08" : w === "world_the_end" ? "#0b0a12" : "#0e0c0a";
    return {version: 8,
      sources: {
        tiles: {type: "raster", tiles: ["dav://t/" + w + "/{z}/{x}/{y}"], tileSize: 512, minzoom: zoomOf(info.minZoom || -5), maxzoom: Z0},
        dem: {type: "raster-dem", tiles: ["dav://d/" + w + "/{z}/{x}/{y}"], tileSize: 256, encoding: "terrarium", minzoom: zoomOf(info.minZoom || -5), maxzoom: Z0}
      },
      layers: [
        {id: "bg", type: "background", paint: {"background-color": dark}},
        {id: "tiles", type: "raster", source: "tiles", paint: {"raster-resampling": "nearest", "raster-fade-duration": 0}}
      ]};
  }

  function chips() {
    var box = $("worlds"); box.innerHTML = "";
    ORDER.forEach(function (w) {
      if (!info.worlds[w]) return;
      var b = document.createElement("button");
      b.type = "button"; b.textContent = SHORT[w] || info.worlds[w].name; b.dataset.w = w;
      if (w === cur) b.className = "on";
      b.onclick = function () { show(w); };
      box.appendChild(b);
    });
    var on = box.querySelector(".on"); if (on && on.scrollIntoView) on.scrollIntoView({inline: "center", block: "nearest"});
  }

  function spawnOf(w) {
    var z = marks && marks.worlds && marks.worlds[w] && marks.worlds[w].zone;
    var s = marks && marks.worlds && marks.worlds[w] && marks.worlds[w].spawn;
    return z ? [z.x, z.z] : s || [0, 0];
  }

  function show(w, x, z, zoom, pitch, bearing) {
    var wi = info.worlds[w]; if (!wi) return;
    cur = w;
    map.once("style.load", function () {
      overlays();
      if (is3d) map.setTerrain({source: "dem", exaggeration: EXAG});
      refreshPlayers(); refreshMe();
    });
    map.setStyle(style(w), {diff: false});   // без diff — иначе style.load не приходит и слои меток не добавляются
    var a = ll(wi.minX - 512, wi.minZ - 512), b = ll(wi.maxX + 512, wi.maxZ + 512);
    map.setMaxBounds([[a[0], b[1]], [b[0], a[1]]]);
    var sp = spawnOf(w);
    map.jumpTo({center: ll(isFinite(x) ? x : sp[0], isFinite(z) ? z : sp[1]), zoom: isFinite(zoom) ? zoom : 17, pitch: isFinite(pitch) ? pitch : (is3d ? 55 : 0), bearing: isFinite(bearing) ? bearing : 0});
    clearPlayers(); clearMine();
    chips(); writeHash();
  }

  function set3d(on) {
    is3d = on;
    $("b3d").classList.toggle("on", on);
    $("b3d").textContent = on ? "2D" : "3D";
    if (on) { if (map.getSource("dem")) map.setTerrain({source: "dem", exaggeration: EXAG}); map.easeTo({pitch: 60, duration: 700}); }
    else { map.setTerrain(null); map.easeTo({pitch: 0, bearing: 0, duration: 500}); }
    writeHash();
  }
  $("b3d").onclick = function () { set3d(!is3d); };

  // ---------------------------------------------------------------- адрес
  var hashTimer = null;
  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(function () {
      var c = blk(map.getCenter());
      var h = "#" + cur + "/" + Math.round(c.x) + "/" + Math.round(c.z) + "/" + (Math.round(map.getZoom() * 10) / 10);
      if (is3d || map.getPitch() > 1 || Math.abs(map.getBearing()) > 1) h += "/" + Math.round(map.getPitch()) + "/" + Math.round(map.getBearing());
      try { history.replaceState(null, "", h); } catch (e) { }
    }, 300);
  }
  map.on("moveend", writeHash);
  function parseHash() {
    var p = (location.hash || "").slice(1).split("/");
    return {w: p[0], x: parseFloat(p[1]), z: parseFloat(p[2]), zoom: parseFloat(p[3]), pitch: parseFloat(p[4]), bearing: parseFloat(p[5])};
  }
  window.addEventListener("hashchange", function () {
    var h = parseHash(); if (!info || !info.worlds[h.w]) return;
    if (h.w !== cur) show(h.w, h.x, h.z, h.zoom, h.pitch, h.bearing);
    else map.jumpTo({center: ll(h.x, h.z), zoom: isFinite(h.zoom) ? h.zoom : map.getZoom()});
  });

  // ---------------------------------------------------------------- координаты, поиск
  map.on("mousemove", function (e) { var b = blk(e.lngLat); $("coord").textContent = "X " + Math.floor(b.x) + " · Z " + Math.floor(b.z); });
  map.on("click", function (e) { var b = blk(e.lngLat); $("coord").textContent = "X " + Math.floor(b.x) + " · Z " + Math.floor(b.z); });
  var goMark = null;
  $("go").onsubmit = function (e) {
    e.preventDefault();
    var x = parseInt($("gx").value, 10), z = parseInt($("gz").value, 10);
    if (!isFinite(x) || !isFinite(z)) return;
    if (goMark) goMark.remove();
    var el = document.createElement("div"); el.className = "mk-go"; el.textContent = "X " + x + " · Z " + z;
    goMark = new maplibregl.Marker({element: el, anchor: "bottom"}).setLngLat(ll(x + 0.5, z + 0.5)).addTo(map);
    map.flyTo({center: ll(x, z), zoom: Math.max(map.getZoom(), 18.5)});
  };

  // ---------------------------------------------------------------- игроки онлайн («человечки»)
  var pMarks = {};
  function clearPlayers() { Object.keys(pMarks).forEach(function (k) { pMarks[k].remove(); }); pMarks = {}; }
  function head(name) {
    var el = document.createElement("div"); el.className = "mk-player";
    var img = document.createElement("img"); img.alt = ""; img.width = 22; img.height = 22; img.loading = "lazy";
    img.src = "https://mc-heads.net/avatar/" + encodeURIComponent(name) + "/22";
    img.onerror = function () { img.replaceWith(Object.assign(document.createElement("i"), {textContent: "🙂"})); };
    var s = document.createElement("span"); s.textContent = name;
    el.appendChild(img); el.appendChild(s);
    return el;
  }
  function refreshPlayers() {
    fetch(API + "/players", {cache: "no-store"}).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.players) return;
      var seen = {};
      j.players.forEach(function (p) {
        if (p.world !== cur) return;
        if (me && me.name && p.name === me.name) return;   // себя — стрелкой
        seen[p.name] = 1;
        var mk = pMarks[p.name];
        if (!mk) { mk = pMarks[p.name] = new maplibregl.Marker({element: head(p.name), anchor: "bottom"}).setLngLat(ll(p.x, p.z)).addTo(map); }
        else mk.setLngLat(ll(p.x, p.z));
        mk.getElement().style.display = $("lplayers").checked ? "" : "none";
      });
      Object.keys(pMarks).forEach(function (k) { if (!seen[k]) { pMarks[k].remove(); delete pMarks[k]; } });
    }).catch(function () { });
  }

  // ---------------------------------------------------------------- я, мои метки, дом (вход в кабинет)
  var me = null, meMark = null, myMarks = [];
  function clearMine() { myMarks.forEach(function (m) { m.remove(); }); myMarks = []; if (meMark) { meMark.remove(); meMark = null; } }
  function refreshMe() {
    if (!token) return;
    fetch(API + "/home", {headers: {Authorization: "Bearer " + token}, cache: "no-store"}).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.ok) return;
      $("loginhint").hidden = true;
      var m = j.me;
      if (m && m.worldId) {
        me = {name: j.name || (j.account && j.account.name) || "", world: m.worldId, x: m.x, z: m.z, yaw: m.yaw};
        $("bme").hidden = false;
      }
      myMarks.forEach(function (x) { x.remove(); }); myMarks = [];
      if (me && me.world === cur) {
        if (!meMark) {
          var el = document.createElement("div"); el.className = "mk-me"; el.innerHTML = '<b></b><span>Я</span>';
          meMark = new maplibregl.Marker({element: el, rotationAlignment: "map"}).setLngLat(ll(me.x + 0.5, me.z + 0.5)).addTo(map);
        }
        meMark.setLngLat(ll(me.x + 0.5, me.z + 0.5)).setRotation((me.yaw || 0) - 180);
      } else if (meMark) { meMark.remove(); meMark = null; }
      if (me && me.world === cur) (j.marks || []).forEach(function (q) {
        if (q.x == null || q.z == null) return;
        var el = document.createElement("div"); el.className = "mk-mine mk-" + (q.kind || q.type || "mark");
        el.textContent = (q.kind === "home" || q.type === "home" ? "🏠 " : q.kind === "claim" || q.type === "claim" ? "🧭 " : "📍 ") + (q.label || "");
        el.style.display = $("lmine").checked ? "" : "none";
        myMarks.push(new maplibregl.Marker({element: el, anchor: "bottom"}).setLngLat(ll(q.x + 0.5, q.z + 0.5)).addTo(map));
      });
    }).catch(function () { });
  }
  $("bme").onclick = function () {
    if (!me) return;
    if (me.world !== cur) show(me.world, me.x, me.z, 18.5);
    else map.flyTo({center: ll(me.x, me.z), zoom: Math.max(map.getZoom(), 18.5)});
  };
  setInterval(function () { if (!document.hidden && info) { refreshPlayers(); refreshMe(); } }, 5000);

  // ---------------------------------------------------------------- слои
  $("blayers").onclick = function () { $("layers").hidden = !$("layers").hidden; };
  ["lclaims", "lzones", "lplayers", "lmine"].forEach(function (id) { $(id).onchange = layerVis; });
  try { var ex0 = localStorage.getItem("daviart.map.exag"); if (ex0 && !new URLSearchParams(location.search).get("ex")) EXAG = +ex0; } catch (e) { }
  $("exag").value = String(EXAG);
  $("exag").onchange = function () {
    EXAG = +this.value; try { localStorage.setItem("daviart.map.exag", EXAG); } catch (e) { }
    if (is3d && map.getSource("dem")) map.setTerrain({source: "dem", exaggeration: EXAG});
  };

  // ---------------------------------------------------------------- старт
  function load(name) { return fetch(BASE + name + "?t=" + Math.floor(Date.now() / 300000)).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  Promise.all([load("worlds.json"), load("markers.json").catch(function () { return null; })]).then(function (r) {
    info = r[0]; marks = r[1];
    var d = new Date(info.updated * 1000);
    $("note").textContent = "Карта обновлена " + d.toLocaleString("ru-RU", {day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"}) + " · обновляется каждые 3 ч. Игроки — вживую.";
    var h = parseHash();
    if (isFinite(h.pitch) && h.pitch > 1) { is3d = true; $("b3d").classList.add("on"); $("b3d").textContent = "2D"; }
    show(info.worlds[h.w] ? h.w : "world", h.x, h.z, h.zoom, h.pitch, h.bearing);
    if (!token) $("loginhint").hidden = false;
  }).catch(function () {
    $("note").textContent = "Карта не загрузилась. Обнови страницу через минуту.";
  });
})();
