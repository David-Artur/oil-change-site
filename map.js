/* Своя карта мира (У280, владелец 2026-10-19: «чтобы карта работала прямо на нашем сайте, у всех»).
 * Плитки рисует minecraft-server/map-render (вид сверху, 1 пиксель = 1 блок на z=0), лежат на GitHub Pages — David-Artur/daviart-map:
 * tiles/<мир>/<z>/<x>_<y>.webp (512×512), worlds.json (миры, границы, время), markers.json (приваты, точки прибытия).
 * Адрес вида map.html#world_frontier/120/-340/1 — мир, X, Z, приближение. */
(function () {
  "use strict";
  var BASE = "https://david-artur.github.io/daviart-map/";
  var ORDER = ["world", "world_valley", "world_frontier", "world_wastes", "world_nether", "world_the_end", "world_lobby"];
  var SHORT = {world: "1 Святые", world_valley: "2 Долины", world_frontier: "3 Пограничье", world_wastes: "4 Пустоши",
    world_nether: "5 Незер", world_the_end: "6 Энд", world_lobby: "Лобби"};
  var EMPTY = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  var CRS = L.extend({}, L.CRS.Simple, {transformation: new L.Transformation(1, 0, 1, 0)});   // lat = Z, lng = X
  var map = L.map("map", {crs: CRS, minZoom: -5, maxZoom: 3, zoomSnap: 1, attributionControl: false, zoomControl: true});
  var info = null, marks = null, cur = null, tiles = null, claims = L.layerGroup(), spawn = L.layerGroup();
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); };

  function parseHash() {
    var p = (location.hash || "").slice(1).split("/");
    return {w: p[0], x: +p[1], z: +p[2], zoom: +p[3]};
  }
  var hashTimer = null;
  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(function () {
      var c = map.getCenter();
      try { history.replaceState(null, "", "#" + cur + "/" + Math.round(c.lng) + "/" + Math.round(c.lat) + "/" + map.getZoom()); } catch (e) { }
    }, 300);
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

  function show(w, x, z, zoom) {
    var wi = info.worlds[w]; if (!wi) return;
    cur = w;
    if (tiles) map.removeLayer(tiles);
    var bounds = L.latLngBounds([[wi.minZ, wi.minX], [wi.maxZ, wi.maxX]]);
    tiles = L.tileLayer("", {tileSize: 512, minZoom: -5, maxZoom: 3, minNativeZoom: info.minZoom || -5, maxNativeZoom: 0,
      bounds: bounds, errorTileUrl: EMPTY, keepBuffer: 2, updateWhenIdle: false});
    tiles.getTileUrl = function (c) { return BASE + "tiles/" + w + "/" + c.z + "/" + c.x + "_" + c.y + ".webp?v=" + info.updated; };
    tiles.addTo(map);
    map.setMaxBounds(bounds.pad(0.5));
    var sp = marks && marks.worlds[w] && marks.worlds[w].spawn || [0, 0];
    map.setView([isFinite(z) ? z : sp[1], isFinite(x) ? x : sp[0]], isFinite(zoom) ? zoom : -1);
    drawMarks();
    chips();
    writeHash();
  }

  function drawMarks() {
    claims.clearLayers(); spawn.clearLayers();
    var m = marks && marks.worlds[cur]; if (!m) return;
    (m.claims || []).forEach(function (c) {
      var col = c.c ? "#f2b632" : "#5fd35f";
      L.rectangle([[c.b[1], c.b[0]], [c.b[3], c.b[2]]], {color: col, weight: 2, fillOpacity: 0.15})
        .bindTooltip('<span class="claim-tip"><b>' + esc(c.n) + "</b>" + (c.o ? esc(c.o) : "") + "</span>", {sticky: true})
        .addTo(claims);
    });
    if (m.spawn) L.circleMarker([m.spawn[1], m.spawn[0]], {radius: 7, color: "#fff", weight: 2, fillColor: "#e04848", fillOpacity: 1})
      .bindTooltip("Точка прибытия", {direction: "top"}).addTo(spawn);
    spawn.addTo(map);
    if ($("tclaims").checked) claims.addTo(map);
  }

  map.on("mousemove", function (e) { $("coord").textContent = "X " + Math.floor(e.latlng.lng) + " · Z " + Math.floor(e.latlng.lat); });
  map.on("moveend", function () {
    var c = map.getCenter();
    if (!("ontouchstart" in window) || !$("coord").dataset.touched) $("coord").textContent = "X " + Math.floor(c.lng) + " · Z " + Math.floor(c.lat);
    writeHash();
  });
  map.on("click", function (e) { $("coord").textContent = "X " + Math.floor(e.latlng.lng) + " · Z " + Math.floor(e.latlng.lat); });
  $("go").onsubmit = function (e) {
    e.preventDefault();
    var x = parseInt($("gx").value, 10), z = parseInt($("gz").value, 10);
    if (!isFinite(x) || !isFinite(z)) return;
    map.setView([z, x], Math.max(map.getZoom(), 1));
    L.circleMarker([z, x], {radius: 6, color: "#fff", weight: 2, fillColor: "#3b82f6", fillOpacity: 1}).addTo(map).bindTooltip("X " + x + " · Z " + z, {permanent: true, direction: "top"});
  };
  $("tclaims").onchange = function () { if (this.checked) claims.addTo(map); else map.removeLayer(claims); };

  function load(name) { return fetch(BASE + name + "?t=" + Math.floor(Date.now() / 300000)).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  Promise.all([load("worlds.json"), load("markers.json").catch(function () { return null; })]).then(function (r) {
    info = r[0]; marks = r[1];
    var d = new Date(info.updated * 1000);
    $("note").textContent = "🧪 Новая карта — тест. Обновлена " + d.toLocaleString("ru-RU", {day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"}) + ". Обновляется раз в несколько часов.";
    var h = parseHash();
    show(info.worlds[h.w] ? h.w : "world", h.x, h.z, h.zoom);
  }).catch(function () {
    $("map").innerHTML = '<p style="padding:90px 16px;text-align:center">Карта не загрузилась. Обнови страницу через минуту.</p>';
  });
})();
