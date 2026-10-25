/* «Главная» личного кабинета (У237) — «второй экран»: телефон рядом с игрой.
 * Шапка (где ты, время, погода, баланс), голос (voice.js), радар игроков рядом, тело и силы, прокачка, быстрое (подарок, ачивка, Рынок), чат.
 * Данные: POST /api/home (VPLand) раз в ~0.7 с, пока вкладка открыта и страница видна; остальное — из /api/me кабинета.
 * Подключение: window.VPHome.mount(элемент, {api, toast, me: fn() → данные /me, money, mapLink, skills: {id: название}, setTab}). */
(function () {
  "use strict";
  var POLL_MS = 300;   // 3 раза в секунду + плавность — почти мгновенно (≈5 КБ/с, только пока «Главная» открыта)
  var box = null, o = null, timer = null, live = null, chatId = 0, chat = [], shown = false, busy = false, chatOpen = false;
  var BODY = [["head", "Голова"], ["torso", "Туловище"], ["left_arm", "Л. рука"], ["right_arm", "П. рука"], ["left_leg", "Л. нога"], ["right_leg", "П. нога"]];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  function $(id) { return document.getElementById(id); }
  function bar(v, cls) { return '<div class="bar ' + (cls || "") + '"><i style="width:' + Math.max(0, Math.min(100, v)) + '%"></i></div>'; }
  function sev(v) { return v < 25 ? "bad" : v < 60 ? "warn" : ""; }

  function mount(el, opt) {
    box = el; o = opt;
    box.classList.add("hm");
    box.innerHTML =
      '<div id="hm-voice"></div>' +
      '<div class="hm-row">' +
        '<div class="card cab-card hm-radar" id="hm-rcard"><button class="btn small hm-rclose" type="button" id="hm-rclose" title="Закрыть" aria-label="Закрыть">✕</button>' +
          '<button class="btn small hm-fbtn" type="button" id="hm-fbtn" title="Фильтры: что показывать на компасе" aria-label="Фильтры">⚙</button><div class="hm-flt card" id="hm-flt" hidden></div>' +
          '<div class="hm-rwrap"><canvas id="hm-mapc" width="320" height="320" aria-hidden="true"></canvas>' +
          '<canvas id="hm-radar" width="320" height="320" aria-label="Радар: игроки рядом"></canvas></div>' +
          '<div class="hm-rbtns"><button class="btn small" type="button" id="hm-zout" title="Дальше">−</button><span class="hm-zl" id="hm-zoom"></span><button class="btn small" type="button" id="hm-zin" title="Ближе">+</button>' +
          '<button class="btn small" type="button" id="hm-north">🧭</button><button class="btn small" type="button" id="hm-mapbtn">🗺 Мир</button>' +
          '<button class="btn small" type="button" id="hm-3d" title="Компас 3D: наклонённая карта с рельефом, крутится вместе с камерой; наклон — проведи по компасу вверх-вниз">⛰ 3D</button>' +
          '<button class="btn small" type="button" id="hm-full" title="На весь экран">⤢</button>' +
          '<button class="btn small" type="button" id="hm-center" hidden title="Обратно к твоему персонажу">⌖ Центр</button></div>' +
          '<div class="hm-wsel" id="hm-wsel" aria-label="Посмотреть мир"></div>' +
          '<p class="cab-meta hm-note" id="hm-radar-note"></p>' +
          '<div class="hm-info"><button class="hm-coords" type="button" id="hm-coords" title="Нажми — скопировать координаты">📍 <b id="hm-xyz">—</b> <span class="hm-copy">⧉</span></button>' +
          '<div class="hm-pois" id="hm-pois"></div>' +
          '<div class="hm-line" id="hm-line"></div><div id="hm-map"></div></div></div>' +
        '<div class="card cab-card hm-vitals" id="hm-vitals"></div>' +
      '</div>' +
      '<div class="card cab-card hm-tp" id="hm-tp"></div>' +
      '<div class="card cab-card hm-friends" id="hm-friends"></div>' +
      '<div class="card cab-card hm-skills" id="hm-skills"></div>' +
      '<div class="card cab-card hm-quick" id="hm-quick"></div>' +
      '<div class="card cab-card hm-chat"><div class="hm-chat-top"><h3>Чат</h3><button class="btn small" type="button" id="hm-chat-full">⤢ На весь экран</button></div>' +
        '<div class="hm-chat-list" id="hm-chat-mini"></div>' + chatForm("mini") + '</div>' +
      '<div class="hm-chat-over" id="hm-chat-over" hidden><div class="hm-chat-over-top"><b>Чат сервера</b><button class="btn small" type="button" id="hm-chat-close">✕ Закрыть</button></div>' +
        '<div class="hm-chat-list" id="hm-chat-big"></div>' + chatForm("big") + '</div>';
    if (window.VPVoice) window.VPVoice.mount($("hm-voice"), {api: o.api, toast: o.toast, compact: true});
    mapOn = pref("map") === "1"; zoom = Number(pref("zoom")) || 100; if (!(zoom >= ZMIN && zoom <= ZMAX)) zoom = 100; northUp = pref("north") !== "0";
    document.addEventListener("vp-theme", function () { drawMap(); drawRadar(); });
    var upd = function () {
      $("hm-mapbtn").classList.toggle("on", mapOn); $("hm-mapbtn").textContent = mapOn ? "🗺 Мир: вкл" : "🗺 Мир";
      $("hm-north").textContent = northUp ? "🧭 Север ↑" : "🧭 По взгляду"; $("hm-north").title = northUp ? "Север всегда вверху, крутится стрелка (нажми — радар по взгляду)" : "Радар крутится по взгляду (нажми — север вверху)";
      $("hm-zoom").textContent = zoomTxt();
      $("hm-zin").disabled = zoom <= ZMIN; $("hm-zout").disabled = zoom >= ZMAX;
      if (!mapOn) { var mc = $("hm-mapc"); mc.getContext("2d").clearRect(0, 0, mc.width, mc.height); }
      drawRadar(); drawMap();
    };
    $("hm-mapbtn").onclick = function () { mapOn = !mapOn; pref("map", mapOn ? "1" : "0"); upd(); };
    // компас-голограмма (holo.js): вкл/выкл, запоминается
    var setHolo = function (on) {
      holoOn = on && !!window.VPHolo; pref("holo", holoOn ? "1" : "0");
      var wrap = box.querySelector(".hm-rwrap");
      wrap.classList.toggle("holo-on", holoOn);
      if (holoOn && !holo) holo = window.VPHolo.create(wrap, {onFree: function (f) { holoFree = f; viewChanged(); }});
      if (!holoOn && holo) { holo.destroy(); holo = null; holoFree = false; }
      $("hm-3d").classList.toggle("on", holoOn); $("hm-3d").textContent = holoOn ? "⛰ 3D: вкл" : "⛰ 3D";
      holoPush();
    };
    $("hm-3d").onclick = function () { setHolo(!holoOn); };
    if (pref("holo") === "1") setTimeout(function () { setHolo(true); }, 0);
    $("hm-north").onclick = function () { northUp = !northUp; pref("north", northUp ? "1" : "0"); upd(); };
    // масштаб плавный: кнопки — ×1.5, колёсико мыши, щипок двумя пальцами (и в 2D, и в 3D)
    var setZoom = function (z, save) {
      zoom = Math.max(ZMIN, Math.min(ZMAX, z));
      $("hm-zoom").textContent = zoomTxt(); $("hm-zin").disabled = zoom <= ZMIN; $("hm-zout").disabled = zoom >= ZMAX;
      if (save !== false) pref("zoom", String(Math.round(zoom)));
      if (holo) holoPush(); else { drawMap(); drawRadar(); }
    };
    var zstep = function (d) { if (holo) { holo.zoomBy(d > 0 ? 1 / 1.5 : 1.5); return; } setZoom(zoom * (d > 0 ? 1.5 : 1 / 1.5)); };
    // 2D: щипок — масштаб, один палец (мышь) — двигать карту; 3D — всё делает сама 3D-карта (holo.js)
    var wrapEl = box.querySelector(".hm-rwrap"), pts = {}, pinch = null, pan = null;
    wrapEl.addEventListener("wheel", function (e) { if (holo) return; e.preventDefault(); setZoom(zoom * Math.pow(1.0015, e.deltaY)); }, {passive: false});
    var dist = function () { var k = Object.keys(pts); if (k.length < 2) return 0; var a = pts[k[0]], b = pts[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y); };
    wrapEl.addEventListener("pointerdown", function (e) {
      if (holo) return;
      pts[e.pointerId] = {x: e.clientX, y: e.clientY};
      var n = Object.keys(pts).length;
      if (n === 2) { pinch = {d: dist(), z: zoom}; pan = null; }
      else if (n === 1) { pan = {x: e.clientX, y: e.clientY}; try { wrapEl.setPointerCapture(e.pointerId); } catch (x) { } }
    });
    wrapEl.addEventListener("pointermove", function (e) {
      if (holo || !pts[e.pointerId]) return;
      pts[e.pointerId] = {x: e.clientX, y: e.clientY};
      if (pinch) { var d = dist(); if (d > 10 && pinch.d > 10) setZoom(pinch.z * pinch.d / d, false); return; }
      if (pan) {
        var c = $("hm-radar"), k = c.width / (c.clientWidth || 1), R = c.width / 2 - RIM * U, sc = R / zoom;
        var sx = -(e.clientX - pan.x) * k / sc, sy = -(e.clientY - pan.y) * k / sc;   // экранный сдвиг → блоки
        pan = {x: e.clientX, y: e.clientY};
        if (Math.abs(sx) + Math.abs(sy) < 0.01) return;
        var yw = (view.world ? 180 : viewYaw()) * Math.PI / 180, fx = -Math.sin(yw), fz = Math.cos(yw), rx = -Math.cos(yw), rz = -Math.sin(yw);
        view.ox += sx * rx - sy * fx; view.oz += sx * rz - sy * fz;
        viewChanged();
      }
    });
    var lift = function (e) {
      delete pts[e.pointerId];
      var n = Object.keys(pts).length;
      if (pinch && n < 2) { pinch = null; pref("zoom", String(Math.round(zoom))); }
      if (n === 0) pan = null;
    };
    wrapEl.addEventListener("pointerup", lift); wrapEl.addEventListener("pointercancel", lift);
    // «⌖ Центр» и быстрые миры
    $("hm-center").onclick = function () { view.world = null; view.ox = 0; view.oz = 0; if (holo) holo.center(); viewChanged(); };
    $("hm-wsel").onclick = function (e) {
      var b = e.target.closest("[data-w]"); if (!b) return;
      var w = b.getAttribute("data-w"), mine = live && live.me && live.me.worldId;
      view.world = w === mine ? null : w; view.ox = 0; view.oz = 0;
      if (holo) holo.center();
      viewChanged();
    };
    worldChips();
    loadSpawns();
    $("hm-zin").onclick = function () { zstep(-1); };
    $("hm-zout").onclick = function () { zstep(1); };
    var full = function (on) {
      var rc = $("hm-rcard"), vb = $("hm-voice");
      rc.classList.toggle("full", on); document.body.classList.toggle("hm-noscroll", on);
      // на весь экран: сверху — голосовой чат, по центру — компас, снизу — управление компасом
      if (on) rc.insertBefore(vb, rc.querySelector(".hm-rwrap")); else box.insertBefore(vb, box.firstChild);
      sizeCanvases(); drawMap(); drawRadar(); if (holo) setTimeout(holo.resize, 50);
    };
    $("hm-full").onclick = function () { full(true); try { history.pushState({vpRadar: 1}, ""); } catch (e) { } };
    $("hm-rclose").onclick = function () { full(false); if (history.state && history.state.vpRadar) history.back(); };
    window.addEventListener("popstate", function () { if ($("hm-rcard").classList.contains("full")) full(false); });   // жест «назад» — закрыть радар
    window.addEventListener("resize", function () { sizeCanvases(); drawMap(); drawRadar(); });
    upd();
    $("hm-coords").onclick = function () {
      var m = live && live.me; if (!m) return;
      var t = m.x + " " + m.y + " " + m.z, done = function () { o.toast("Координаты скопированы: " + t); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { fallbackCopy(t); done(); });
      else { fallbackCopy(t); done(); }
    };
    $("hm-fbtn").onclick = function () { var b = $("hm-flt"); if (b.hidden) filtersUi(); b.hidden = !b.hidden; };   // У256
    $("hm-fbtn").classList.toggle("on", FLT.some(function (x) { return !flt[x[0]]; }));
    $("hm-pois").onclick = function (e) {   // У248: тап по спавну/порталу — его координаты в буфер
      var ad = e.target.closest("[data-add]"), dl = e.target.closest("[data-del]");
      if (ad) {   // У255: личная метка там, где стоишь
        var nm = window.prompt("Название метки (видна только тебе):", "");
        if (nm && nm.trim()) o.api("/marks", {action: "add", name: nm.trim()}).then(function (j) { o.toast((j && j.message) || "Не получилось.", !(j && j.ok)); poisHtml = null; });
        return;
      }
      if (dl) {
        var dn = dl.getAttribute("data-del");
        if (window.confirm("Удалить метку «" + dn + "»?")) o.api("/marks", {action: "del", name: dn}).then(function (j) { o.toast((j && j.message) || "Не получилось.", !(j && j.ok)); poisHtml = null; });
        return;
      }
      var b = e.target.closest("[data-xz]"); if (!b) return;
      var t = b.getAttribute("data-xz"), done = function () { o.toast(b.getAttribute("data-name") + ": координаты скопированы — " + t); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { fallbackCopy(t); done(); });
      else { fallbackCopy(t); done(); }
    };
    $("hm-chat-full").onclick = function () { chatOpen = true; $("hm-chat-over").hidden = false; document.body.classList.add("hm-noscroll"); drawChat(); };
    $("hm-chat-close").onclick = function () { chatOpen = false; $("hm-chat-over").hidden = true; document.body.classList.remove("hm-noscroll"); };
    ["mini", "big"].forEach(function (k) {
      $("hm-cf-" + k).addEventListener("submit", function (e) { e.preventDefault(); sendChat($("hm-ci-" + k)); });
    });
    drawStatic();
  }

  function chatForm(k) {
    return '<form class="hm-chat-form" id="hm-cf-' + k + '"><input id="hm-ci-' + k + '" maxlength="200" placeholder="Написать в чат (ты должен быть в игре)" autocomplete="off">' +
      '<button class="btn green small" type="submit">➤</button></form>';
  }

  // вкладку показали / скрыли (cabinet.js)
  function show(on) {
    shown = on;
    if (on) { drawStatic(); tick(); loadFriends(true); loadTp(true); } else { clearTimeout(timer); timer = null; }
  }

  function tick() {
    clearTimeout(timer);
    if (!shown) return;
    if (document.hidden || busy) { timer = setTimeout(tick, POLL_MS); return; }
    busy = true;
    o.api("/home", {action: "live", since: chatId}).then(function (j) {
      busy = false;
      if (j && j.ok) {
        live = j;
        if (j.tp) { o.toast(j.tp.message, !j.tp.ok); tpRun = null; drawTp(); loadTp(true); }   // итог телепорта с сайта
        if (j.chat && j.chat.length) { chat = chat.concat(j.chat).slice(-150); chatId = j.chat[j.chat.length - 1].id; drawChat(); }
        else if (j.chatId != null && j.chatId < chatId) chatId = j.chatId;   // сервер перезапускался — счётчик начался заново
        drawLive();
        loadFriends(false);
        loadTp(false);
      } else if (j && j.offline) {
        var n = $("hm-radar-note"); if (n) n.textContent = "Сервер не отвечает — переподключаюсь…";
      }
      timer = setTimeout(tick, POLL_MS);
    });
  }

  // ---------------------------------------------------------------- отрисовка
  function drawStatic() {   // то, что меняется редко (из /me): шапка без координат, прокачка, быстрое
    if (!box) return;
    drawHead();
    drawSkills();
    drawQuick();
    if (!live) drawLive();
  }

  function pref(k, v) { try { if (v === undefined) return localStorage.getItem("daviart.home." + k); localStorage.setItem("daviart.home." + k, v); } catch (e) { return null; } }

  // ---------------------------------------------------------------- карта мира под радаром — своя карта (У280): плитки z=0 с GitHub Pages
  // (daviart-map: tiles/<мир>/0/<x>_<y>.webp, 512×512 блоков, 1 пиксель = 1 блок). Обновляется раз в ~3 ч (раньше — BlueMap с mc.daviart.com).
  var MAP_ROOT = "https://david-artur.github.io/daviart-map/tiles/", TILE = 512, tiles = {}, mapOn = false, zoom = 100;
  var ZMIN = 8, ZMAX = 3000;   // масштаб компаса — радиус в блоках; плавно: щипок, колёсико, кнопки ×1.5
  var MAP_V = Math.floor(Date.now() / 3600000);   // кэш плиток — на час
  var RIM = 26, northUp = true;   // ширина рамки компаса (CSS px); север вверху (по умолчанию) или «по взгляду»
  var holoOn = false, holo = null, holoFree = false;   // компас 3D (holo.js); holoFree — карту сдвинули/повернули рукой
  // что смотрим: свой мир (world: null) со сдвигом ox/oz в блоках или чужой мир (от его точки прибытия). «⌖ Центр» — обратно к себе.
  var view = {world: null, ox: 0, oz: 0}, spawns = {};
  var WORLDS_SEL = [["world", "1"], ["world_valley", "2"], ["world_frontier", "3"], ["world_wastes", "4"], ["vp_nether", "5"], ["world_the_end", "6"], ["world_lobby", "Л"]];
  var WNAME = {world: "Святые земли", world_valley: "Долины", world_frontier: "Пограничье", world_wastes: "Пустоши", vp_nether: "Незер", world_the_end: "Энд", world_lobby: "Лобби"};
  function loadSpawns() {
    fetch("https://david-artur.github.io/daviart-map/markers.json?t=" + Math.floor(Date.now() / 600000)).then(function (r) { return r.json(); }).then(function (j) {
      Object.keys(j.worlds || {}).forEach(function (w) { var z = j.worlds[w].zone, s = j.worlds[w].spawn; spawns[w] = z ? [z.x, z.z] : s || [0, 0]; });
    }).catch(function () { });
  }
  function spawnOf(w) { return spawns[w] || (w === "world_the_end" ? [200, 0] : [0, 0]); }
  function myWorld() { return live && live.me && live.me.worldId; }
  function viewWorld() { return view.world || myWorld(); }
  function isAway() { return !!view.world || Math.abs(view.ox) + Math.abs(view.oz) > 0.5 || holoFree; }
  function worldChips() {
    var el = $("hm-wsel"); if (!el) return;
    var vw = viewWorld(), mine = myWorld();
    var h = WORLDS_SEL.map(function (w) {
      return '<button class="btn small' + (w[0] === vw ? " on" : "") + '" type="button" data-w="' + w[0] + '" title="' + WNAME[w[0]] + (w[0] === mine ? " — ты здесь" : "") + '">' +
        w[1] + (w[0] === mine ? "•" : "") + "</button>";
    }).join("");
    if (el.getAttribute("data-v") !== h) { el.innerHTML = h; el.setAttribute("data-v", h); }
  }
  function viewChanged() {
    var c = $("hm-center"); if (c) c.hidden = !isAway();
    worldChips();
    var wrap = box && box.querySelector(".hm-rwrap"), tag = wrap && wrap.querySelector(".hm-vtag");
    if (view.world) { if (!tag && wrap) { tag = document.createElement("div"); tag.className = "hm-vtag"; wrap.appendChild(tag); } tag.textContent = "👁 " + (WNAME[view.world] || view.world); }
    else if (tag) tag.remove();
    if (holo) holoPush(); else { drawMap(); drawRadar(); }
  }
  function holoPush() {
    if (!holo) return;
    var on = live && live.online && live.me && sm.x != null, vw = viewWorld();
    if (!vw) return;
    holo.update({world: vw, myWorld: on ? live.me.worldId : null, x: on ? sm.x : null, y: on ? live.me.y : null, z: on ? sm.z : null, yaw: on ? (sm.yaw == null ? live.me.yaw : sm.yaw) : 180,
      spawn: spawnOf(vw), radius: zoom, northUp: northUp,
      // те же метки, что в 2D, с теми же фильтрами (⚙)
      players: on ? Object.keys(sm.pts).map(function (n) { return sm.pts[n]; }).filter(function (p) { return p.clan || p.friend ? flt.friends : p.voice ? flt.pvoice : flt.pother; }) : [],
      pois: on ? (live.pois || []).filter(function (p) { var k = POI_FLT[p.kind]; return !k || flt[k]; }).map(function (p) {
        return {kind: p.kind, label: p.label, x: live.me.x + 0.5 + p.dx, z: live.me.z + 0.5 + p.dz}; }) : [],
      marks: on && flt.mapmarks ? (live.marks || []).map(function (m) {
        var t = m.type || "", ban = t.indexOf("banner_") === 0 ? t.slice(7) : null;
        return {type: t, color: ban ? (BANNER[ban] || "#ddd") : null, label: m.label || MARK_NAME[t] || (ban ? "" : "Метка"), x: live.me.x + 0.5 + m.dx, z: live.me.z + 0.5 + m.dz}; }) : []});
  }
  function viewYaw() { return northUp || sm.yaw == null ? 180 : sm.yaw; }   // 180 = смотришь на север → север вверху
  function isDark() { var t = document.documentElement.getAttribute("data-theme"); return t ? t === "dark" : !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches); }
  // холсты — в размер на экране × плотность пикселей (во всю ширину телефона и на весь экран — чётко)
  var U = 1, cssW = 0, cssAt = 0;
  function sizeCanvases() {
    var w = $("hm-radar"); if (!w) return;
    // ширину на экране — раз в секунду (а не каждый кадр: чтение clientWidth заставляет браузер пересчитывать вёрстку); плотность ≤ 2×
    if (!cssW || Date.now() - cssAt > 1000) { cssW = w.clientWidth || 300; cssAt = Date.now(); }
    var css = cssW, dpr = Math.min(2, window.devicePixelRatio || 1), px = Math.round(css * dpr);
    U = dpr * Math.max(1, Math.min(1.5, css / 320));
    ["hm-radar", "hm-mapc"].forEach(function (id) { var c = $(id); if (c && c.width !== px) { c.width = px; c.height = px; } });
  }
  function numPath(n) { var s = String(Math.abs(n)).split("").join("/"); return (n < 0 ? "-" : "") + s; }
  function tileImg(world, tx, tz, lv) {
    lv = lv || 0;
    var k = world + ":" + lv + ":" + tx + ":" + tz, t = tiles[k];
    if (t) return t.ok ? t.img : null;
    t = tiles[k] = {img: new Image(), ok: false};
    t.img.onload = function () { t.ok = true; };
    t.img.onerror = function () { t.bad = true; };
    t.img.src = MAP_ROOT + encodeURIComponent(world) + "/" + lv + "/" + tx + "_" + tz + ".webp?v=" + MAP_V;
    return null;
  }
  // уровень плиток по масштабу: близко — z=0 (1 пиксель = 1 блок), далеко — уменьшенные (−1…−5), чтобы не грузить сотни плиток
  function zoomTxt() { return zoom >= 1000 ? (Math.round(zoom / 100) / 10) + " тыс. бл." : Math.round(zoom) + " бл."; }
  function tileLevel() { return zoom <= 220 ? 0 : Math.max(-5, -Math.ceil(Math.log(zoom / 220) / Math.LN2)); }
  function drawMap() {
    var c = $("hm-mapc"); if (!c) return;
    sizeCanvases();
    var g = c.getContext("2d"), W = c.width, R = W / 2 - RIM * U, cx = W / 2, cy = W / 2;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, W);
    var me = o.me() || {}, world = view.world || (live && live.me && live.me.worldId) || (me.where && me.where.worldId);
    var away = !!view.world;   // смотрим чужой мир — карта всегда (от точки прибытия мира)
    if (!(mapOn || away) || !world) return;
    if (!away && (!live || !live.online || !live.me || sm.x == null)) return;
    var base = away ? spawnOf(world) : [sm.x, sm.z], X = base[0] + view.ox, Z = base[1] + view.oz;
    var sc = R / zoom, psi = (away ? 180 : viewYaw()) * Math.PI / 180, cs = Math.cos(psi), sn = Math.sin(psi);
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
    g.fillStyle = "#1b1b1b"; g.fillRect(0, 0, W, W);
    // мир → экран: вверх — куда смотришь (та же формула, что для точек игроков)
    g.setTransform(-cs * sc, sn * sc, -sn * sc, -cs * sc, cx, cy);
    g.imageSmoothingEnabled = false;
    var lv = tileLevel(), TB = TILE * Math.pow(2, -lv);   // сколько блоков в плитке этого уровня
    var span = zoom * 1.5, x0 = Math.floor((X - span) / TB), x1 = Math.floor((X + span) / TB), z0 = Math.floor((Z - span) / TB), z1 = Math.floor((Z + span) / TB);
    // 2026-10-20: без мигания — пока плитка нового уровня грузится, на её месте рисуется уже загруженная соседнего уровня
    function peek(l, x, z) { var t = tiles[world + ":" + l + ":" + x + ":" + z]; return t && t.ok ? t.img : null; }
    for (var tx = x0; tx <= x1; tx++) for (var tz = z0; tz <= z1; tz++) {
      var img = tileImg(world, tx, tz, lv), dx = tx * TB - X, dz = tz * TB - Z;
      if (img) { g.drawImage(img, 0, 0, TILE, TILE, dx, dz, TB, TB); continue; }
      var done = false;
      for (var d = 1; d <= 3 && !done && lv - d >= -5; d++) {   // крупнее: кусок родительской плитки
        var m = 1 << d, pi = peek(lv - d, Math.floor(tx / m), Math.floor(tz / m)), s = TILE / m;
        if (pi) { g.drawImage(pi, (tx - Math.floor(tx / m) * m) * s, (tz - Math.floor(tz / m) * m) * s, s, s, dx, dz, TB, TB); done = true; }
      }
      if (!done && lv < 0) for (var ci = 0; ci < 4; ci++) {   // мельче: четыре дочерние
        var ch = peek(lv + 1, tx * 2 + (ci & 1), tz * 2 + (ci >> 1));
        if (ch) g.drawImage(ch, 0, 0, TILE, TILE, dx + (ci & 1) * TB / 2, dz + (ci >> 1) * TB / 2, TB / 2, TB / 2);
      }
    }
    g.restore();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "rgba(0,0,0,.18)"; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();   // чуть темнее — точки и подписи читаются
  }

  // ---------------------------------------------------------------- телепорты (/api/home tpopts|tp): цена сразу, подтверждение, отсчёт в игре, итог — уведомлением
  var tpo = null, tpNone = null, tpAt = 0, tpBusy = false, tpWorld = null, tpRun = null;
  function loadTp(force) {
    var w = live && live.me ? live.me.worldId : null;
    if (tpBusy || !(live && live.online)) { if (!(live && live.online)) { tpo = null; drawTp(); } return; }
    if (!force && w === tpWorld && Date.now() - tpAt < 15000) return;
    tpBusy = true;
    o.api("/home", {action: "tpopts"}).then(function (j) {
      tpBusy = false; tpAt = Date.now(); tpWorld = w;
      var el = $("hm-tp"); if (el) el.hidden = !!(j && j.status === 404) || (j && !j.ok && !j.options);
      tpo = j && j.options ? j.options : null; tpNone = j && j.none || null; drawTp();
    });
  }
  function priceTxt(t) { return t.price < 0 ? "нельзя" : (t.price > 0 ? "$" + Number(t.price).toLocaleString("ru-RU") : "бесплатно") + " · " + t.delay + " с"; }
  function drawTp() {
    var el = $("hm-tp"); if (!el) return;
    if (!live || !live.online) { el.innerHTML = '<h3>🧭 Телепорты</h3><p class="cab-meta">Зайди на сервер — отсюда можно будет телепортироваться в лобби, домой и на спавн миров.</p>'; return; }
    if (!tpo) { el.innerHTML = '<h3>🧭 Телепорты</h3><p class="cab-meta">Загружаю…</p>'; return; }
    var h = '<h3>🧭 Телепорты</h3>';
    if (tpRun) {
      var left = Math.max(0, Math.ceil((tpRun.until - Date.now()) / 1000));
      h += '<div class="tp-run">⏳ <b>' + esc(tpRun.label) + "</b> — отсчёт в игре" + (left ? ": " + left + " с" : "…") + ' <span class="cab-meta">не двигайся и не получай урон</span></div>';
    }
    if (tpNone && !tpo.length) { el.innerHTML = h + '<p class="cab-meta">🚫 ' + esc(tpNone) + "</p>"; return; }   // Б24: Пустоши/Ад/Энд — без кнопок
    h += '<div class="tp-grid">' + tpo.map(function (t, i) {
      var off = t.price < 0 || !!t.why || !!tpRun;
      return '<button class="tp-btn' + (t.price < 0 ? " no" : "") + '" type="button" data-i="' + i + '"' + (off ? " disabled" : "") + (t.why ? ' title="' + esc(t.why) + '"' : "") + '>' +
        "<b>" + esc(t.label) + '</b><span>' + (t.why && t.price < 0 ? esc(t.why) : priceTxt(t)) + "</span></button>";
    }).join("") + "</div>";
    el.innerHTML = h;
    Array.prototype.forEach.call(el.querySelectorAll(".tp-btn"), function (b) { b.onclick = function () { askTp(tpo[+b.getAttribute("data-i")]); }; });
  }
  function askTp(t) {
    var m = document.createElement("div");
    m.className = "tp-ask";
    m.innerHTML = '<div class="card tp-ask-box"><h3>' + esc(t.label) + '</h3><p>Цена: <b>' + (t.price > 0 ? "$" + Number(t.price).toLocaleString("ru-RU") : "бесплатно") + "</b> · отсчёт <b>" + t.delay + " с</b></p>" +
      '<p class="cab-meta">В игре начнётся отсчёт — не двигайся и не получай урон, иначе телепорт отменится (деньги не спишутся).</p>' +
      '<div class="cab-row"><button class="btn green" type="button" data-ok>Телепорт</button><button class="btn" type="button" data-no>Отмена</button></div></div>';
    document.body.appendChild(m);
    var close = function () { m.remove(); };
    m.onclick = function (e) { if (e.target === m) close(); };
    m.querySelector("[data-no]").onclick = close;
    m.querySelector("[data-ok]").onclick = function () {
      close();
      o.api("/home", {action: "tp", key: t.key}).then(function (j) {
        o.toast(j && j.message || (j && j.ok ? "Телепорт начат." : "Не получилось."), !(j && j.ok));
        if (j && j.ok) { tpRun = {label: t.label, until: Date.now() + (j.delay || t.delay) * 1000}; drawTp(); var iv = setInterval(function () { if (!tpRun) return clearInterval(iv); drawTp(); }, 1000); }
      });
    };
  }
  // ---------------------------------------------------------------- друзья (/api/friends): кто в игре и где, кто когда был, заявки
  var fr = null, frAt = 0, frBusy = false;
  function loadFriends(force) {
    if (frBusy || (!force && Date.now() - frAt < 15000)) return;
    frBusy = true;
    o.api("/friends", {action: "list"}).then(function (j) {
      frBusy = false; frAt = Date.now();
      var el = $("hm-friends"); if (el) el.hidden = !!(j && j.status === 404);   // сервер ещё без друзей (до выкладки) — блок не показываем
      if (j && j.friends) { fr = j; drawFriends(); } else if (!fr) drawFriends();
    });
  }
  function frAct(action, nick) {
    o.api("/friends", {action: action, nick: nick}).then(function (j) {
      if (j && j.message) o.toast(j.message, !j.ok);
      if (j && j.friends) { fr = j; frAt = Date.now(); drawFriends(); }
    });
  }
  function ago(t) {
    if (!t) return "давно";
    var m = Math.floor((Date.now() - t) / 60000);
    return m < 60 ? m + " мин назад" : m < 1440 ? Math.floor(m / 60) + " ч назад" : Math.floor(m / 1440) + " дн назад";
  }
  function drawFriends() {
    var el = $("hm-friends"); if (!el) return;
    if (!fr) { el.innerHTML = "<h3>👥 Друзья</h3><p class=\"cab-meta\">" + (frBusy ? "Загружаю…" : "Недоступно — обнови страницу.") + "</p>"; return; }
    var on = fr.friends.filter(function (f) { return f.online; }).length;
    var h = "<h3>👥 Друзья" + (fr.friends.length ? ' <span class="cab-meta">· в игре ' + on + " из " + fr.friends.length + "</span>" : "") + "</h3>";
    (fr.incoming || []).forEach(function (n) {
      h += '<div class="hm-fr req"><span>🤝 <b>' + esc(n) + '</b> хочет дружить</span><button class="btn small green" data-fa="accept" data-n="' + esc(n) + '">Принять</button>' +
        '<button class="btn small" data-fa="deny" data-n="' + esc(n) + '">Нет</button></div>';
    });
    h += fr.friends.map(function (f) {
      return '<div class="hm-fr"><span class="dot' + (f.online ? " on" : "") + '"></span><b>' + esc(f.name) + '</b><span class="cab-meta">' +
        (f.online ? "в игре · " + esc(f.world || "") : "был " + ago(f.lastSeen)) + '</span><button class="btn small hm-x" title="Убрать из друзей" data-fa="remove" data-n="' + esc(f.name) + '">✕</button></div>';
    }).join("");
    if (!fr.friends.length && !(fr.incoming || []).length) h += '<p class="cab-meta">Пока никого. Постой рядом с игроком в игре — предложим добавить, или впиши ник ниже.</p>';
    if ((fr.outgoing || []).length) h += '<p class="cab-meta">Ждут ответа: ' + fr.outgoing.map(esc).join(", ") + "</p>";
    h += '<form class="hm-chat-form" id="hm-fr-add"><input id="hm-fr-nick" maxlength="16" placeholder="Ник — добавить в друзья" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn small green" type="submit">+</button></form>';
    el.innerHTML = h;
    Array.prototype.forEach.call(el.querySelectorAll("[data-fa]"), function (b) {
      b.onclick = function () {
        var a = b.getAttribute("data-fa"), n = b.getAttribute("data-n");
        if (a === "remove" && !confirm("Убрать " + n + " из друзей?")) return;
        frAct(a, n);
      };
    });
    $("hm-fr-add").onsubmit = function (e) { e.preventDefault(); var n = $("hm-fr-nick").value.trim(); if (n) frAct("add", n); };
  }

  function fallbackCopy(t) {
    var ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) { } document.body.removeChild(ta);
  }

  // под радаром: координаты (нажать — скопировать) и строка «Ник ● · мир · погода/время · $ · ур.»
  function drawHead() {
    var me = o.me() || {}, m = live && live.me, env = live && live.env;
    var xyz = $("hm-xyz"), line = $("hm-line"), btn = $("hm-coords");
    if (!xyz) return;
    var t = m ? m.x + " " + m.y + " " + m.z : "—";
    if (xyz.textContent !== t) xyz.textContent = t;
    btn.disabled = !m;
    var sky = !env ? "" : env.dim === "nether" ? "🔥 Ад" : env.dim === "the_end" ? "🌌 Энд" :
      (env.thunder ? "⛈" : env.storm ? "🌧" : env.day ? "☀" : "🌙") + " " + env.clock;
    var h = '<b>' + esc(me.nick || "") + '</b> <span class="dot' + (live && live.online ? " on" : "") + '"></span>' +
      " · " + (m ? esc(m.world) : (me.online ? "в игре" : "не в игре")) + (sky ? " · " + sky : "") +
      ' · <span class="hm-bal">' + o.money(me.balance) + "</span> · ур. " + (me.level || "—");
    if (line.getAttribute("data-v") !== h) { line.innerHTML = h; line.setAttribute("data-v", h); }
  }

  // плавный радар: данные приходят раз в ~0.7 с, а стрелка и точки каждый кадр «доезжают» до новых значений
  var sm = {yaw: null, pts: {}, x: null, z: null}, rafOn = false, lastFrame = 0;
  function radarTarget() {
    if (!live || !live.online || !live.me) { sm.yaw = null; sm.pts = {}; sm.x = null; return; }
    if (sm.yaw == null) sm.yaw = live.me.yaw;
    if (sm.x == null || Math.abs(sm.x - live.me.x) + Math.abs(sm.z - live.me.z) > 60) { sm.x = live.me.x + 0.5; sm.z = live.me.z + 0.5; }   // телепорт — сразу
    var seen = {};
    (live.radar || []).forEach(function (p) {
      seen[p.name] = 1;
      var c = sm.pts[p.name];
      if (!c) sm.pts[p.name] = {name: p.name, dx: p.dx, dz: p.dz, dy: p.dy, voice: p.voice, clan: p.clan, friend: p.friend, tdx: p.dx, tdz: p.dz};
      else { c.tdx = p.dx; c.tdz = p.dz; c.dy = p.dy; c.voice = p.voice; c.clan = p.clan; c.friend = p.friend; }
    });
    Object.keys(sm.pts).forEach(function (n) { if (!seen[n]) delete sm.pts[n]; });
    if (!rafOn && !document.hidden) { rafOn = true; lastFrame = 0; requestAnimationFrame(frame); }
  }
  // 2026-10-21 (владелец: «компас очень грузит процессор, телефон греется»): раньше кадр рисовался 60 раз в секунду всегда, пока ты в игре.
  // Теперь — не чаще 30 кадров/с и только пока стрелка/точки «доезжают»; доехали — цикл останавливается до новых данных (radarTarget запустит снова).
  var FRAME_MS = 33;
  function frame(t) {
    if (!shown || !live || !live.online || !live.me) { rafOn = false; drawRadar(); return; }
    if (document.hidden) { rafOn = false; return; }   // вкладка свёрнута — не рисуем
    if (lastFrame && t - lastFrame < FRAME_MS - 2) { requestAnimationFrame(frame); return; }
    var dt = lastFrame ? Math.min(0.1, (t - lastFrame) / 1000) : 0.016; lastFrame = t;
    var k = 1 - Math.exp(-dt / 0.18);   // ~0.4 с до нового положения (данные — 3 раза в секунду)
    var d = ((live.me.yaw - sm.yaw + 540) % 360) - 180;   // поворот по кратчайшему пути
    sm.yaw += d * k;
    var move = Math.abs(d);
    Object.keys(sm.pts).forEach(function (n) { var p = sm.pts[n], ex = p.tdx - p.dx, ez = p.tdz - p.dz; p.dx += ex * k; p.dz += ez * k; move = Math.max(move, Math.abs(ex), Math.abs(ez)); });
    var ex0 = live.me.x + 0.5 - sm.x, ez0 = live.me.z + 0.5 - sm.z;
    sm.x += ex0 * k; sm.z += ez0 * k; move = Math.max(move, Math.abs(ex0), Math.abs(ez0));
    if (holo) holoPush(); else { drawMap(); drawRadar(); }
    if (move < 0.02) {   // доехали — встать точно и не крутить кадры впустую
      sm.yaw = live.me.yaw; sm.x = live.me.x + 0.5; sm.z = live.me.z + 0.5;
      Object.keys(sm.pts).forEach(function (n) { var p = sm.pts[n]; p.dx = p.tdx; p.dz = p.tdz; });
      rafOn = false; return;
    }
    requestAnimationFrame(frame);
  }

  function drawLive() {
    drawHead();
    radarTarget();
    if (!rafOn) { if (holo) holoPush(); else drawRadar(); }
    worldChips(); var cb = $("hm-center"); if (cb) cb.hidden = !isAway();
    drawVitals();
    drawSkills();
  }

  function drawVitals() {
    var el = $("hm-vitals"); if (!el) return;
    var m = live && live.me;
    if (!live || !live.online || !m) { el.innerHTML = '<h3>Тело и силы</h3><p class="cab-meta">Зайди на сервер — здесь будут здоровье, еда, стамина, раны и температура в реальном времени.</p>'; return; }
    var lv = live.leveling || {}, hp = Math.round(100 * m.health / Math.max(1, m.maxHealth)), food = Math.round(100 * m.food / 20);
    var rows = row("❤", "Здоровье", Math.ceil(m.health) + " / " + m.maxHealth, hp, sev(hp)) +
      row("🍗", "Еда", m.food + " / 20", food, sev(food)) +
      (lv.stamina != null ? row("⚡", "Стамина", lv.exhausted ? "без сил" : Math.round(lv.stamina) + "%", lv.stamina, lv.exhausted ? "bad" : sev(lv.stamina)) : "") +
      (m.air >= 0 ? row("🫧", "Воздух", m.air + "%", m.air, sev(m.air)) : "") +
      '<div class="hm-mini">🛡 Броня <b>' + m.armor + "</b>" + (live.enemies ? ' · <span class="hm-warn">👹 врагов: ' + live.enemies + "</span>" : "") + "</div>";
    if (lv.heat != null) {
      var hot = lv.heat >= 0.03, cold = lv.cold >= 0.03, tr = lv.trend > 0 ? " ↑" : lv.trend < 0 ? " ↓" : "";
      rows += '<div class="hm-mini">' + (hot ? "☀" : cold ? "❄" : "✔") + " " + lv.outside + "° · " +
        (hot ? '<span class="' + (lv.heat >= 0.3 ? "hm-warn" : "") + '">Жарко ' + Math.round(lv.heat * 100) + "%</span>" :
          cold ? '<span class="' + (lv.cold >= 0.3 ? "hm-cold" : "") + '">Холодно ' + Math.round(lv.cold * 100) + "%</span>" : "Норма") + tr +
        (lv.wet >= 0.1 ? " · 💧 " + Math.round(lv.wet * 100) + "%" : "") + "</div>";
    }
    var vh = '<h3>Тело и силы</h3><div class="hm-vgrid">' + figure(live.body || {}) + '<div class="hm-vcol">' + rows + "</div></div>";
    if (el.__v !== vh) { el.__v = vh; el.innerHTML = vh; }   // 2026-10-21: пересобирать, только если что-то поменялось (было 3 раза/с всегда)
  }

  // человечек в стиле Minecraft (пропорции скина 16×32): каждая часть — цветом по здоровью, процент прямо на ней
  function partColor(v) { return v >= 95 ? "#4caf50" : v >= 60 ? "#e8c21a" : v >= 30 ? "#f0892a" : "#e0412b"; }
  function figure(b) {
    var pc = function (k) { return Math.round((b[k] == null ? 1 : b[k]) * 100); };
    var parts = [   // id, x, y, w, h (в пикселях скина), подпись
      ["head", 4, 0, 8, 8, "Голова"], ["torso", 4, 8, 8, 12, "Туловище"], ["right_arm", 0, 8, 4, 12, "П. рука"],
      ["left_arm", 12, 8, 4, 12, "Л. рука"], ["right_leg", 4, 20, 4, 12, "П. нога"], ["left_leg", 8, 20, 4, 12, "Л. нога"]];
    var s = '<svg class="hm-fig" viewBox="-0.6 -0.6 17.2 33.2" role="img" aria-label="Части тела">';
    parts.forEach(function (p) {
      var v = pc(p[0]), c = partColor(v);
      s += '<g><title>' + p[5] + " " + v + "%</title>" +
        '<rect x="' + p[1] + '" y="' + p[2] + '" width="' + p[3] + '" height="' + p[4] + '" fill="' + c + '" stroke="#1d1d1d" stroke-width=".35"/>' +
        '<rect x="' + (p[1] + .45) + '" y="' + (p[2] + .45) + '" width="' + (p[3] - .9) + '" height="' + (p[4] * .28) + '" fill="#fff" opacity=".18"/>';   // блик
      var tx = p[1] + p[3] / 2, ty = p[2] + (p[0] === "head" ? 6.6 : p[4] / 2 + 1);
      if (p[0] !== "head") s += '<text x="' + tx + '" y="' + ty + '" text-anchor="middle" font-size="' + (p[3] > 4 ? 3 : 2.25) + '" font-weight="800" fill="#fff" stroke="#1d1d1d" stroke-width=".35" paint-order="stroke">' + v + "</text>";
      s += "</g>";
    });
    var hv = pc("head");   // лицо: глаза и рот; процент головы — под глазами
    s += '<rect x="5.5" y="3" width="1.6" height="1.6" fill="#fff"/><rect x="6.2" y="3.4" width=".9" height="1.2" fill="#2a2a2a"/>' +
      '<rect x="8.9" y="3" width="1.6" height="1.6" fill="#fff"/><rect x="9.6" y="3.4" width=".9" height="1.2" fill="#2a2a2a"/>' +
      '<text x="8" y="7.3" text-anchor="middle" font-size="2.4" font-weight="800" fill="#fff" stroke="#1d1d1d" stroke-width=".3" paint-order="stroke">' + hv + "</text>";
    return s + "</svg>";
  }

  function row(ico, name, val, pct, cls) {
    return '<div class="hm-stat"><span class="hm-ico">' + ico + '</span><span class="hm-sn">' + name + '</span><b>' + val + "</b>" + bar(pct, cls) + "</div>";
  }

  function drawSkills() {
    var el = $("hm-skills"); if (!el) return;
    var me = o.me() || {}, lv = live && live.leveling;
    var h = '<h3>Прокачка · уровень персонажа <b>' + (me.level || "—") + "</b></h3>";
    var near = (lv && lv.near || []).slice();
    var ar = live && live.archery || {};   // Leveling 0.4.25: стрельба из лука/арбалета — тоже кандидаты в «ближайшие к уровню»
    Object.keys(ar).forEach(function (k) { var a = ar[k]; if (a && a.level < 100 && a.pct > 0) near.push({id: k, level: a.level, pct: a.pct}); });
    near.sort(function (a, b) { return b.pct - a.pct; }); near = near.slice(0, 3);
    if (near.length) h += near.map(function (s) {
      var p = Math.round(s.pct * 100);
      return '<div class="hm-stat"><span class="hm-sn">' + esc(o.skills[s.id] || s.id) + " · " + s.level + " → " + (s.level + 1) + "</span><b>" + p + "%</b>" + bar(p) + "</div>";
    }).join("");
    else h += '<p class="cab-meta">' + (live && live.online ? "Качай навыки действием — здесь будут три ближайших к новому уровню." : "Видно, когда ты в игре.") + "</p>";
    var lines = lv && lv.lines || [];
    if (lines.length) h += '<div class="hm-tags">' + lines.map(function (l) { return "<span>" + esc(l) + "</span>"; }).join("") + "</div>";
    if (el.__v !== h) { el.__v = h; el.innerHTML = h; }   // 2026-10-21: только при изменении (было 3 раза/с всегда)
  }

  function drawQuick() {
    var el = $("hm-quick"); if (!el) return;
    var me = o.me() || {}, h = "<h3>Быстрое</h3>";
    var bb = $("bonusbar"), gift = bb ? bb.textContent.trim() : "";
    h += '<button class="hm-q" type="button" data-go="bonus"><span>🎁</span><b>Подарок</b><span class="cab-meta">' + esc(gift || "голосуй за сервер — $25") + "</span></button>";
    var ach = (me.achievements || []).filter(function (a) { return !a.done && a.amount > 0; })
      .sort(function (a, b) { return b.progress / b.amount - a.progress / a.amount; })[0];
    var ready = (me.achievements || []).filter(function (a) { return a.done && !a.claimed; }).length;
    h += '<button class="hm-q" type="button" data-go="ach"><span>🏆</span><b>' + (ready ? "Награда: " + ready : "Ачивка") + "</b>" +
      '<span class="cab-meta">' + (ach ? esc(ach.title) + " · " + ach.progress + " / " + ach.amount : "все получены") + "</span>" +
      (ach ? bar(Math.round(100 * ach.progress / ach.amount)) : "") + "</button>";
    var notes = (me.market && me.market.notices || []).length, lots = (me.market && me.market.mine || []).length;
    h += '<button class="hm-q" type="button" data-go="market"><span>🛒</span><b>Рынок</b><span class="cab-meta">' +
      (notes ? "новое: " + notes : "лотов: " + lots) + "</span></button>";
    el.innerHTML = h;
    Array.prototype.forEach.call(el.querySelectorAll("[data-go]"), function (b) { b.onclick = function () { o.setTab(b.getAttribute("data-go")); }; });
  }

  // метки карты в руке (флаги, крестик сокровищ, особняк…): дальше радиуса — на краю круга с расстоянием
  var BANNER = {white: "#f0f0f0", orange: "#f9801d", magenta: "#c74ebd", light_blue: "#3ab3da", yellow: "#fed83d", lime: "#80c71f", pink: "#f38baa", gray: "#474f52",
    light_gray: "#9d9d97", cyan: "#169c9c", purple: "#8932b8", blue: "#3c44aa", brown: "#835432", green: "#5e7c16", red: "#b02e26", black: "#1d1d21"};
  var MARK_NAME = {red_x: "Сокровище", mansion: "Особняк", woodland_mansion: "Особняк", monument: "Храм", ocean_monument: "Храм", target_x: "Цель", target_point: "Цель",
    trial_chambers: "Испытания", jungle_temple: "Храм джунглей", swamp_hut: "Хижина ведьмы", village_desert: "Деревня", village_plains: "Деревня", village_savanna: "Деревня",
    village_snowy: "Деревня", village_taiga: "Деревня"};
  function drawMarks(g, cx, cy, R, sc, u, rx, rz, fx, fz, dark) {
    var ms = live && live.marks || [];
    if (!ms.length || sm.x == null) return;
    ms.forEach(function (m) {
      var ax = live.me.x + 0.5 + m.dx, az = live.me.z + 0.5 + m.dz, dx = ax - sm.x, dz = az - sm.z;
      var sx = dx * rx + dz * rz, sy = -(dx * fx + dz * fz), d = Math.sqrt(sx * sx + sy * sy), out = d * sc > R - 8 * u;
      var k = out ? (R - 8 * u) / (d * sc) : 1, x = cx + sx * sc * k, y = cy + sy * sc * k;
      var t = m.type || "", ban = t.indexOf("banner_") === 0 ? t.slice(7) : null;
      g.save();
      if (ban) {   // флажок цвета флага
        g.fillStyle = "#5a4630"; g.fillRect(x - 1 * u, y - 9 * u, 2 * u, 14 * u);
        g.fillStyle = BANNER[ban] || "#ddd"; g.strokeStyle = "rgba(0,0,0,.6)"; g.lineWidth = u;
        g.beginPath(); g.rect(x + 1 * u, y - 9 * u, 9 * u, 7 * u); g.fill(); g.stroke();
      } else if (t === "red_x" || t === "target_x") {
        g.strokeStyle = "#e0262b"; g.lineWidth = 3 * u; g.lineCap = "round";
        g.beginPath(); g.moveTo(x - 5 * u, y - 5 * u); g.lineTo(x + 5 * u, y + 5 * u); g.moveTo(x + 5 * u, y - 5 * u); g.lineTo(x - 5 * u, y + 5 * u); g.stroke();
      } else {
        g.fillStyle = "#c86bff"; g.strokeStyle = "#fff"; g.lineWidth = u;
        g.beginPath(); g.moveTo(x, y - 7 * u); g.lineTo(x + 6 * u, y); g.lineTo(x, y + 7 * u); g.lineTo(x - 6 * u, y); g.closePath(); g.fill(); g.stroke();
      }
      var name = m.label || MARK_NAME[t] || (ban ? "" : "Метка"), txt = name + (out ? (name ? " · " : "") + Math.round(d) + " бл." : "");
      if (txt) {
        g.font = "bold " + (11 * u) + "px Rubik, sans-serif"; g.textAlign = "center"; g.textBaseline = "top";
        g.lineWidth = 3 * u; g.strokeStyle = dark ? "rgba(0,0,0,.75)" : "rgba(255,255,255,.85)"; g.strokeText(txt, x, y + 8 * u);
        g.fillStyle = dark ? "#fff" : "#222"; g.fillText(txt, x, y + 8 * u);
      }
      g.restore();
    });
  }

  // У256 (владелец 2026-10-18): фильтры радара — «⚙» в углу, галочки, что показывать; запоминается в браузере
  var FLT = [["pvoice", "Игроки с голосом"], ["pother", "Игроки без голоса"], ["friends", "Друзья и клан"], ["spawn", "Спавн"],
    ["portal", "Порталы"], ["home", "Мой дом"], ["clan", "Дом и точки клана"], ["claim", "Мои приваты"], ["member", "Приваты, где я участник"], ["mark", "Мои метки"],
    ["mapmarks", "Метки карты в руке (крестики, флаги)"], ["ring", "Круг слышимости голоса"]];
  // У289: дом и точки клана (VPLand 0.9.19 кладёт их в live.pois только участникам клана)
  var POI_FLT = {spawn: "spawn", portal: "portal", home: "home", "clan-home": "clan", "clan-point": "clan", claim: "claim", "claim-member": "member", mark: "mark"};
  var flt = (function () {
    var f = {}; FLT.forEach(function (x) { f[x[0]] = true; });
    try { var s = JSON.parse(pref("filters") || "{}"); Object.keys(s).forEach(function (k) { if (k in f) f[k] = !!s[k]; }); } catch (e) { }
    return f;
  })();
  function filtersUi() {
    var box = $("hm-flt"); if (!box) return;
    box.innerHTML = '<div class="hm-flt-top"><b>Что показывать</b><button class="btn small" type="button" data-fa="all">Всё</button><button class="btn small" type="button" data-fa="close">Готово</button></div>' +
      FLT.map(function (x) { return '<label class="hm-flt-row"><input type="checkbox" data-f="' + x[0] + '"' + (flt[x[0]] ? " checked" : "") + "> " + esc(x[1]) + "</label>"; }).join("");
    box.onchange = function (e) { var k = e.target.getAttribute("data-f"); if (!k) return; flt[k] = e.target.checked; saveFlt(); };
    box.onclick = function (e) {
      var a = e.target.getAttribute && e.target.getAttribute("data-fa");
      if (a === "all") { FLT.forEach(function (x) { flt[x[0]] = true; }); saveFlt(); filtersUi(); }
      if (a === "close") box.hidden = true;
    };
  }
  function saveFlt() {
    pref("filters", JSON.stringify(flt)); poisHtml = null;
    var b = $("hm-fbtn"); if (b) b.classList.toggle("on", FLT.some(function (x) { return !flt[x[0]]; }));
    drawRadar();
  }

  // У248 (владелец 2026-10-18): спавн мира и порталы — на радаре; дальше края — на ободе со стрелкой и расстоянием; список под радаром
  var DIRS = ["↑ С", "↗ СВ", "→ В", "↘ ЮВ", "↓ Ю", "↙ ЮЗ", "← З", "↖ СЗ"];
  var poisHtml = null;
  function drawPois(g, cx, cy, R, sc, u, rx, rz, fx, fz, dark) {
    var ps = (live && live.pois || []).filter(function (p) { var k = POI_FLT[p.kind]; return !k || flt[k]; });   // У256: фильтр точек
    var list = [], boxes = [];   // занятые подписями места: налезает — подпись не рисуем (название есть в кнопках под радаром)
    if (sm.x == null) ps = [];
    ps.forEach(function (p) {
      var ax = live.me.x + 0.5 + p.dx, az = live.me.z + 0.5 + p.dz, dx = ax - sm.x, dz = az - sm.z;
      var sx = dx * rx + dz * rz, sy = -(dx * fx + dz * fz), d = Math.sqrt(sx * sx + sy * sy), out = d * sc > R - 10 * u;
      var k = out ? (R - 10 * u) / (d * sc) : 1, x = cx + sx * sc * k, y = cy + sy * sc * k;
      g.save();
      if (p.kind === "home") {   // У255: домик
        g.fillStyle = "#e8743b"; g.strokeStyle = "#3a1a08"; g.lineWidth = 1.5 * u;
        g.beginPath(); g.moveTo(x, y - 8 * u); g.lineTo(x + 7 * u, y - 2 * u); g.lineTo(x + 5 * u, y - 2 * u); g.lineTo(x + 5 * u, y + 6 * u);
        g.lineTo(x - 5 * u, y + 6 * u); g.lineTo(x - 5 * u, y - 2 * u); g.lineTo(x - 7 * u, y - 2 * u); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = "#5a2a10"; g.fillRect(x - 1.5 * u, y + 1 * u, 3 * u, 5 * u);
      } else if (p.kind === "clan-home" || p.kind === "clan-point") {   // У289: флаг клана — бирюзовый (дом клана — крупнее, с домиком на полотнище)
        var big = p.kind === "clan-home" ? 1.25 : 1;
        g.strokeStyle = "#0b2e2a"; g.lineWidth = 1.6 * u; g.fillStyle = "#5b3a1e";
        g.fillRect(x - 1 * u, y - 9 * u * big, 2 * u, 15 * u * big);   // древко
        g.fillStyle = "#1abc9c"; g.beginPath(); g.moveTo(x + 1 * u, y - 9 * u * big); g.lineTo(x + 10 * u * big, y - 6 * u * big); g.lineTo(x + 1 * u, y - 2.5 * u * big); g.closePath(); g.fill(); g.stroke();
        if (big > 1) { g.fillStyle = "#fff"; g.fillRect(x + 3 * u, y - 7 * u, 3 * u, 2.5 * u); }
      } else if (p.kind === "claim" || p.kind === "claim-member") {   // У255: свой приват — зелёный квадрат, где участник — жёлтый
        g.fillStyle = p.kind === "claim" ? "rgba(63,210,94,.85)" : "rgba(247,209,84,.9)"; g.strokeStyle = "#16300c"; g.lineWidth = 1.5 * u;
        g.beginPath(); g.rect(x - 6 * u, y - 6 * u, 12 * u, 12 * u); g.fill(); g.stroke();
      } else if (p.kind === "mark") {   // У255: личная метка — красная булавка
        g.fillStyle = "#e0262b"; g.strokeStyle = "#fff"; g.lineWidth = 1.5 * u;
        g.beginPath(); g.arc(x, y - 6 * u, 5 * u, 0, 7); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(x - 3 * u, y - 3 * u); g.lineTo(x, y + 6 * u); g.lineTo(x + 3 * u, y - 3 * u); g.closePath(); g.fill();
      } else if (p.kind === "spawn") {   // золотая звезда
        g.fillStyle = "#f6c945"; g.strokeStyle = "#5a3b12"; g.lineWidth = 1.2 * u; g.beginPath();
        for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 3.2 : 8) * u; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
        g.closePath(); g.fill(); g.stroke();
      } else {   // портал: фиолетовая рамка
        g.fillStyle = "#8b3dff"; g.strokeStyle = "#1a0b33"; g.lineWidth = 2 * u;
        g.beginPath(); g.rect(x - 5 * u, y - 7 * u, 10 * u, 14 * u); g.fill(); g.stroke();
        g.fillStyle = "rgba(220,180,255,.8)"; g.fillRect(x - 2.5 * u, y - 4.5 * u, 5 * u, 9 * u);
      }
      var txt = p.label + (out ? " · " + Math.round(d) + " бл." : "");
      g.font = "bold " + (11 * u) + "px Rubik, sans-serif"; g.textBaseline = "top";
      // у края круга подпись — внутрь, чтобы не обрезалась ободом
      g.textAlign = x > cx + R * 0.45 ? "right" : x < cx - R * 0.45 ? "left" : "center";
      if (g.textAlign !== "center") x += (g.textAlign === "right" ? 6 : -6) * u;
      var tw = g.measureText(txt).width, bx = g.textAlign === "right" ? x - tw : g.textAlign === "left" ? x : x - tw / 2, by = y + 9 * u, bh = 13 * u;
      var hit = boxes.some(function (b) { return bx < b[0] + b[2] && bx + tw > b[0] && by < b[1] + b[3] && by + bh > b[1]; });
      if (!hit) {
        boxes.push([bx, by, tw, bh]);
        g.lineWidth = 3 * u; g.strokeStyle = dark ? "rgba(0,0,0,.75)" : "rgba(255,255,255,.85)"; g.strokeText(txt, x, by);
        g.fillStyle = dark ? "#fff" : "#222"; g.fillText(txt, x, by);
      }
      g.restore();
      var az8 = Math.round(((Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360) / 45) % 8;   // направление по сторонам света
      list.push({p: p, d: Math.round(Math.sqrt(dx * dx + dz * dz)), dir: DIRS[az8]});
    });
    var el = $("hm-pois");
    if (!el) return;
    list.sort(function (a, b) { return a.d - b.d; });
    var ICON = {spawn: "★ ", portal: "▣ ", home: "🏠 ", "clan-home": "🏰 ", "clan-point": "", claim: "🟩 ", "claim-member": "🟨 ", mark: "📍 "};   // у точки клана «⚑» уже в label
    var h = list.map(function (q) {
      return '<span class="hm-poiw"><button class="hm-poi" type="button" data-xz="' + q.p.x + ' ' + q.p.z + '" data-name="' + esc(q.p.label) + '" title="Нажми — скопировать координаты">' +
        (ICON[q.p.kind] || "• ") + esc(q.p.label) + " · <b>" + q.d + " бл.</b> " + q.dir + "</button>" +
        (q.p.kind === "mark" ? '<button class="hm-poi-del" type="button" data-del="' + esc(q.p.label) + '" title="Удалить метку" aria-label="Удалить метку">✕</button>' : "") + "</span>";
    }).join("") + (live && live.marksApi ? '<button class="hm-poi hm-poi-add" type="button" data-add="1" title="Поставить личную метку там, где ты стоишь (видна только тебе)">📍 Метка здесь</button>' : "");
    if (h !== poisHtml) { poisHtml = h; el.innerHTML = h; }
  }

  // рамка компаса «по-майнкрафтовски»: деревянный обод из «пикселей»-досок, тёмные края, деления через 15°, буквы С/В/Ю/З с пиксельной тенью
  // (север — красный), золотые ромбы между сторонами. Стороны света ставятся по текущему повороту радара (vy).
  var PLANK = ["#7a5533", "#8a6239", "#6e4c2c", "#946b40", "#80593a", "#9b7146"];
  function drawRim(g, cx, cy, R, u, vy) {
    var w = (RIM - 4) * u, mid = R + w / 2, yaw = vy * Math.PI / 180;
    var fx = -Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = -Math.sin(yaw);
    var scr = function (dx, dz) { return Math.atan2(-(dx * fx + dz * fz), dx * rx + dz * rz); };   // угол на экране для направления в мире
    g.save();
    var n = Math.max(48, Math.round(2 * Math.PI * mid / (7 * u)));
    for (var i = 0; i < n; i++) {   // доски: каждая «пиксельная» плашка своего оттенка
      g.strokeStyle = PLANK[(i * 7 + (i >> 2) * 3) % PLANK.length];
      g.lineWidth = w; g.beginPath(); g.arc(cx, cy, mid, i / n * 2 * Math.PI, (i + 1) / n * 2 * Math.PI + 0.004); g.stroke();
    }
    g.lineWidth = w * 0.18; g.strokeStyle = "rgba(255,230,180,.18)"; g.beginPath(); g.arc(cx, cy, R + w * 0.2, 0, 7); g.stroke();   // светлая грань
    g.lineWidth = 2.2 * u; g.strokeStyle = "#2e1d0e";
    g.beginPath(); g.arc(cx, cy, R + u, 0, 7); g.stroke();
    g.beginPath(); g.arc(cx, cy, R + w, 0, 7); g.stroke();
    for (var d = 0; d < 360; d += 15) {   // деления
      var a = scr(Math.sin(d * Math.PI / 180), -Math.cos(d * Math.PI / 180));   // d — азимут от севера по часовой
      var len = d % 90 === 0 ? 0 : d % 45 === 0 ? w * 0.5 : w * 0.28;
      if (!len) continue;
      g.strokeStyle = d % 45 === 0 ? "#f6d77a" : "rgba(255,240,210,.7)"; g.lineWidth = (d % 45 === 0 ? 2.2 : 1.4) * u;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * (R + w - 2 * u), cy + Math.sin(a) * (R + w - 2 * u)); g.lineTo(cx + Math.cos(a) * (R + w - 2 * u - len), cy + Math.sin(a) * (R + w - 2 * u - len)); g.stroke();
      if (d % 90 === 45) {   // золотой ромб
        var mx = cx + Math.cos(a) * (mid - w * 0.05), my = cy + Math.sin(a) * (mid - w * 0.05), s = 3 * u;
        g.fillStyle = "#f6c945"; g.strokeStyle = "#5a3b12"; g.lineWidth = u;
        g.beginPath(); g.moveTo(mx, my - s); g.lineTo(mx + s, my); g.lineTo(mx, my + s); g.lineTo(mx - s, my); g.closePath(); g.fill(); g.stroke();
      }
    }
    var sides = [["С", 0, -1, "#ff4a3d"], ["В", 1, 0, "#ffffff"], ["Ю", 0, 1, "#ffffff"], ["З", -1, 0, "#ffffff"]];
    g.font = "900 " + Math.round(w * 0.78) + "px 'Courier New', ui-monospace, monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    sides.forEach(function (sd) {
      var a = scr(sd[1], sd[2]), x = cx + Math.cos(a) * mid, y = cy + Math.sin(a) * mid;
      g.fillStyle = "#2e1d0e"; g.beginPath(); g.arc(x, y, w * 0.52, 0, 7); g.fill();   // «плашка» под буквой
      g.fillStyle = "#3a2a1a"; g.fillText(sd[0], x + 1.4 * u, y + 1.6 * u);              // пиксельная тень, как в Minecraft
      g.fillStyle = sd[3]; g.fillText(sd[0], x, y + 0.2 * u);
    });
    g.restore();
  }

  // радар: ты в центре, вверх — куда смотришь; зелёные — с голосом, серые — без, жёлтые — твой клан
  function drawRadar() {
    var c = $("hm-radar"); if (!c) return;
    sizeCanvases();
    var g = c.getContext("2d"), W = c.width, R = W / 2 - RIM * U, cx = W / 2, cy = W / 2, u = U;
    var dark = isDark();
    g.clearRect(0, 0, W, W);
    if (!mapOn) { g.fillStyle = dark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.04)"; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill(); }
    var range = zoom, sc = R / range;
    if (mapOn) dark = true;   // на карте — светлые подписи
    g.strokeStyle = dark ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.15)"; g.lineWidth = u;
    [0.25, 0.5, 0.75, 1].forEach(function (f) { g.beginPath(); g.arc(cx, cy, range * f * sc, 0, 7); g.stroke(); });
    g.fillStyle = dark ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.4)"; g.font = (10 * u) + "px Rubik, sans-serif"; g.textAlign = "left"; g.textBaseline = "bottom";
    [0.5, 1].forEach(function (f) { g.fillText(Math.round(range * f) + "", cx + 3 * u, cy - range * f * sc - 1); });   // подписи колец, блоки
    g.strokeStyle = "rgba(63,210,94,.55)"; g.setLineDash([4 * u, 4 * u]);   // граница слышимости голоса (voice.range с сервера)
    var vr = (window.VPVoice && window.VPVoice.range && window.VPVoice.range()) || 100;
    if (flt.ring) { g.beginPath(); g.arc(cx, cy, vr * sc, 0, 7); g.stroke(); }
    g.setLineDash([]);
    var note = $("hm-radar-note"), mapEl = $("hm-map");
    if (view.world) {   // смотрим чужой мир: без точек и стрелки, север вверху
      drawRim(g, cx, cy, R, u, 180);
      var vt = "👁 " + (WNAME[view.world] || view.world) + " · ☝ двигай, щипком — масштаб · «⌖ Центр» — обратно к себе";
      if (note && note.getAttribute("data-v") !== vt) { note.textContent = vt; note.setAttribute("data-v", vt); }
      return;
    }
    if (!live || !live.online || !live.me) {
      g.fillStyle = dark ? "#aaa" : "#777"; g.font = (15 * u) + "px Rubik, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("не в игре", cx, cy); drawRim(g, cx, cy, R, u, 180);
      if (note) note.textContent = "Радар заработает, когда ты зайдёшь на сервер.";
      mapButton(mapEl, null);
      return;
    }
    var vy = viewYaw(), yaw = vy * Math.PI / 180, fx = -Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = -Math.sin(yaw);
    // север на ободе
    drawRim(g, cx, cy, R, u, vy);
    var list = Object.keys(sm.pts).map(function (n) { return sm.pts[n]; }).filter(function (p) {   // У256: фильтр игроков
      if (p.clan || p.friend) return flt.friends;
      return p.voice ? flt.pvoice : flt.pother;
    });
    // сдвиг карты пальцем: ты и всё «вокруг тебя» — смещены на (−ox, −oz)
    var mx = cx + (-view.ox * rx - view.oz * rz) * sc, my = cy - (-view.ox * fx - view.oz * fz) * sc;
    list.forEach(function (p) {
      var ddx = p.dx - view.ox, ddz = p.dz - view.oz;
      var sx = ddx * rx + ddz * rz, sy = -(ddx * fx + ddz * fz);
      var d = Math.sqrt(sx * sx + sy * sy), k = d * sc > R ? R / (d * sc) : 1;
      var x = cx + sx * sc * k, y = cy + sy * sc * k;
      g.fillStyle = p.clan ? "#f7c73c" : p.friend ? "#3a9bff" : p.voice ? "#3fd25e" : "#9a9a9a";
      g.beginPath(); g.arc(x, y, 7 * u, 0, 7); g.fill();
      if (p.voice) { g.fillStyle = "#fff"; g.font = (9 * u) + "px sans-serif"; g.fillText("🎤", x, y); }
      g.fillStyle = dark ? "#eee" : "#222"; g.font = (12 * u) + "px Rubik, sans-serif"; g.textBaseline = "top";
      g.fillText(p.name + (Math.abs(p.dy) >= 4 ? (p.dy > 0 ? " ▲" : " ▼") : ""), x, y + 9 * u); g.textBaseline = "middle";
    });
    drawPois(g, mx, my, R, sc, u, rx, rz, fx, fz, dark);
    if (flt.mapmarks) drawMarks(g, mx, my, R, sc, u, rx, rz, fx, fz, dark);
    var inside = Math.hypot(mx - cx, my - cy) < R - 6 * u;
    g.save(); g.translate(inside ? mx : cx + (mx - cx) * (R - 10 * u) / Math.hypot(mx - cx, my - cy), inside ? my : cy + (my - cy) * (R - 10 * u) / Math.hypot(mx - cx, my - cy));
    g.rotate((sm.yaw - vy) * Math.PI / 180);   // ты — стрелка туда, куда смотришь (ушёл за край — стрелка на ободе)
    g.fillStyle = "#3a9bff"; g.strokeStyle = "#fff"; g.lineWidth = 1.5 * u;
    g.beginPath(); g.moveTo(0, -12 * u); g.lineTo(8 * u, 8 * u); g.lineTo(0, 4 * u); g.lineTo(-8 * u, 8 * u); g.closePath(); g.fill(); g.stroke(); g.restore();
    var nh = list.length ? '<span class="hm-dot g"></span>с голосом <span class="hm-dot s"></span>без голоса <span class="hm-dot y"></span>клан <span class="hm-dot b"></span>друзья · пунктир — слышно голос'
      : "В радиусе " + zoomTxt() + " никого.";
    if (note && note.getAttribute("data-v") !== nh) { note.innerHTML = nh; note.setAttribute("data-v", nh); }
    mapButton(mapEl, live.me.world !== "Лобби" && live.me.worldId ? {worldId: live.me.worldId} : null);   // мир — из живых данных
  }

  // 2026-10-18 (владелец): «Открыть карту» под компасом — всегда: в игре — на том месте, где стоишь (раз за показ), иначе — карта мира
  function mapButton(el, w) {
    if (!el || !o.mapLink) return;
    var kind = w ? "pos" : "all";
    if (el.getAttribute("data-kind") === kind && el.firstChild) return;
    el.setAttribute("data-kind", kind);
    el.innerHTML = (w ? o.mapLink(w.worldId, live.me.x, live.me.y, live.me.z, "🗺 Открыть карту — где я")
      : '<a class="btn small" target="_blank" rel="noopener" href="map.html">🗺 Открыть карту мира</a>') +
      // 2026-10-18 (владелец): рядом с картой — сразу Discord
      ' <a class="btn small hm-discord" target="_blank" rel="noopener" href="https://discord.gg/sQR9A7RH">💬 Discord</a>';
  }

  // ---------------------------------------------------------------- чат
  function drawChat() {
    var me = o.me() || {};
    var html = function (l) {
      return chat.slice(-l).map(function (x) {
        var t = new Date(x.t), hm = ("0" + t.getHours()).slice(-2) + ":" + ("0" + t.getMinutes()).slice(-2);
        return '<div class="hm-msg' + (x.name === me.nick ? " me" : "") + '"><span class="cab-meta">' + hm + "</span> <b>" + esc(x.name) + ":</b> " + esc(x.text) + "</div>";
      }).join("") || '<p class="cab-meta">Сообщений пока нет. Здесь видно то же, что в чате игры.</p>';
    };
    var mini = $("hm-chat-mini"); if (mini) { mini.innerHTML = html(5); mini.scrollTop = mini.scrollHeight; }
    if (chatOpen) { var big = $("hm-chat-big"); var stick = big.scrollTop + big.clientHeight >= big.scrollHeight - 30; big.innerHTML = html(150); if (stick) big.scrollTop = big.scrollHeight; }
  }

  function sendChat(inp) {
    var text = inp.value.trim(); if (!text) return;
    o.api("/home", {action: "chat", text: text}).then(function (j) {
      if (j && j.ok) { inp.value = ""; tick(); } else o.toast((j && j.message) || "Не отправилось.", true);
    });
  }

  window.VPHome = {mount: mount, show: show, refresh: function () { if (box) drawStatic(); }};
})();
