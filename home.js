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
        '<div class="card cab-card hm-radar" id="hm-rcard"><button class="btn small hm-rclose" type="button" id="hm-rclose">✕ Закрыть</button><div class="hm-rwrap"><canvas id="hm-mapc" width="320" height="320" aria-hidden="true"></canvas>' +
          '<canvas id="hm-radar" width="320" height="320" aria-label="Радар: игроки рядом"></canvas></div>' +
          '<div class="hm-rbtns"><button class="btn small" type="button" id="hm-zout" title="Дальше">−</button><span class="hm-zl" id="hm-zoom"></span><button class="btn small" type="button" id="hm-zin" title="Ближе">+</button>' +
          '<button class="btn small" type="button" id="hm-mapbtn">🗺 Мир</button><button class="btn small" type="button" id="hm-full" title="На весь экран">⤢</button></div>' +
          '<p class="cab-meta hm-note" id="hm-radar-note"></p>' +
          '<div class="hm-info"><button class="hm-coords" type="button" id="hm-coords" title="Нажми — скопировать координаты">📍 <b id="hm-xyz">—</b> <span class="hm-copy">⧉</span></button>' +
          '<div class="hm-line" id="hm-line"></div><div id="hm-map"></div></div></div>' +
        '<div class="card cab-card hm-vitals" id="hm-vitals"></div>' +
      '</div>' +
      '<div class="card cab-card hm-friends" id="hm-friends"></div>' +
      '<div class="card cab-card hm-skills" id="hm-skills"></div>' +
      '<div class="card cab-card hm-quick" id="hm-quick"></div>' +
      '<div class="card cab-card hm-chat"><div class="hm-chat-top"><h3>Чат</h3><button class="btn small" type="button" id="hm-chat-full">⤢ На весь экран</button></div>' +
        '<div class="hm-chat-list" id="hm-chat-mini"></div>' + chatForm("mini") + '</div>' +
      '<div class="hm-chat-over" id="hm-chat-over" hidden><div class="hm-chat-over-top"><b>Чат сервера</b><button class="btn small" type="button" id="hm-chat-close">✕ Закрыть</button></div>' +
        '<div class="hm-chat-list" id="hm-chat-big"></div>' + chatForm("big") + '</div>';
    if (window.VPVoice) window.VPVoice.mount($("hm-voice"), {api: o.api, toast: o.toast, compact: true});
    mapOn = pref("map") === "1"; zoom = Number(pref("zoom")) || 100; if (ZOOMS.indexOf(zoom) < 0) zoom = 100;
    var upd = function () {
      $("hm-mapbtn").classList.toggle("on", mapOn); $("hm-mapbtn").textContent = mapOn ? "🗺 Мир: вкл" : "🗺 Мир";
      $("hm-zoom").textContent = zoom + " бл.";
      $("hm-zin").disabled = zoom === ZOOMS[0]; $("hm-zout").disabled = zoom === ZOOMS[ZOOMS.length - 1];
      if (!mapOn) { var mc = $("hm-mapc"); mc.getContext("2d").clearRect(0, 0, mc.width, mc.height); }
      drawRadar(); drawMap();
    };
    $("hm-mapbtn").onclick = function () { mapOn = !mapOn; pref("map", mapOn ? "1" : "0"); upd(); };
    var zstep = function (d) { var i = ZOOMS.indexOf(zoom) + d; if (i < 0 || i >= ZOOMS.length) return; zoom = ZOOMS[i]; pref("zoom", String(zoom)); upd(); };
    $("hm-zin").onclick = function () { zstep(-1); };
    $("hm-zout").onclick = function () { zstep(1); };
    var full = function (on) { $("hm-rcard").classList.toggle("full", on); document.body.classList.toggle("hm-noscroll", on); sizeCanvases(); drawMap(); drawRadar(); };
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
    if (on) { drawStatic(); tick(); loadFriends(true); } else { clearTimeout(timer); timer = null; }
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
        if (j.chat && j.chat.length) { chat = chat.concat(j.chat).slice(-150); chatId = j.chat[j.chat.length - 1].id; drawChat(); }
        else if (j.chatId != null && j.chatId < chatId) chatId = j.chatId;   // сервер перезапускался — счётчик начался заново
        drawLive();
        loadFriends(false);
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

  // ---------------------------------------------------------------- карта мира под радаром (BlueMap: lowres-тайлы 500×500 блоков, 1 пиксель = 1 блок;
  // картинка — верхняя половина PNG 501×1002). Обновляется, когда BlueMap перерисует участок (обычно через несколько минут).
  var MAP_ROOT = "https://mc.daviart.com/map/maps/", TILE = 500, tiles = {}, mapOn = false, zoom = 100, ZOOMS = [25, 50, 100, 200, 300];
  // холсты — в размер на экране × плотность пикселей (во всю ширину телефона и на весь экран — чётко)
  var U = 1;
  function sizeCanvases() {
    var w = $("hm-radar"); if (!w) return;
    var css = w.clientWidth || 300, dpr = Math.min(3, window.devicePixelRatio || 1), px = Math.round(css * dpr);
    U = dpr * Math.max(1, Math.min(1.5, css / 320));
    ["hm-radar", "hm-mapc"].forEach(function (id) { var c = $(id); if (c && c.width !== px) { c.width = px; c.height = px; } });
  }
  function numPath(n) { var s = String(Math.abs(n)).split("").join("/"); return (n < 0 ? "-" : "") + s; }
  function tileImg(world, tx, tz) {
    var k = world + ":" + tx + ":" + tz, t = tiles[k];
    if (t) return t.ok ? t.img : null;
    t = tiles[k] = {img: new Image(), ok: false};
    t.img.onload = function () { t.ok = true; };
    t.img.onerror = function () { t.bad = true; };
    t.img.src = MAP_ROOT + encodeURIComponent(world) + "/tiles/1/x" + numPath(tx) + "/z" + numPath(tz) + ".png";
    return null;
  }
  function drawMap() {
    var c = $("hm-mapc"); if (!c) return;
    sizeCanvases();
    var g = c.getContext("2d"), W = c.width, R = W / 2 - 14 * U, cx = W / 2, cy = W / 2;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, W);
    var me = o.me() || {}, world = (live && live.me && live.me.worldId) || (me.where && me.where.worldId);
    if (!mapOn || !live || !live.online || !live.me || sm.x == null || !world) return;
    var sc = R / zoom, psi = sm.yaw * Math.PI / 180, cs = Math.cos(psi), sn = Math.sin(psi);
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
    g.fillStyle = "#1b1b1b"; g.fillRect(0, 0, W, W);
    // мир → экран: вверх — куда смотришь (та же формула, что для точек игроков)
    g.setTransform(-cs * sc, sn * sc, -sn * sc, -cs * sc, cx, cy);
    g.imageSmoothingEnabled = false;
    var span = zoom * 1.5, x0 = Math.floor((sm.x - span) / TILE), x1 = Math.floor((sm.x + span) / TILE), z0 = Math.floor((sm.z - span) / TILE), z1 = Math.floor((sm.z + span) / TILE);
    for (var tx = x0; tx <= x1; tx++) for (var tz = z0; tz <= z1; tz++) {
      var img = tileImg(world, tx, tz);
      if (img) g.drawImage(img, 0, 0, TILE, TILE, tx * TILE - sm.x, tz * TILE - sm.z, TILE, TILE);
    }
    g.restore();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "rgba(0,0,0,.18)"; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();   // чуть темнее — точки и подписи читаются
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
    if (!rafOn) { rafOn = true; lastFrame = 0; requestAnimationFrame(frame); }
  }
  function frame(t) {
    if (!shown || !live || !live.online || !live.me) { rafOn = false; drawRadar(); return; }
    var dt = lastFrame ? Math.min(0.1, (t - lastFrame) / 1000) : 0.016; lastFrame = t;
    var k = 1 - Math.exp(-dt / 0.18);   // ~0.4 с до нового положения (данные — 3 раза в секунду)
    var d = ((live.me.yaw - sm.yaw + 540) % 360) - 180;   // поворот по кратчайшему пути
    sm.yaw += d * k;
    Object.keys(sm.pts).forEach(function (n) { var p = sm.pts[n]; p.dx += (p.tdx - p.dx) * k; p.dz += (p.tdz - p.dz) * k; });
    sm.x += (live.me.x + 0.5 - sm.x) * k; sm.z += (live.me.z + 0.5 - sm.z) * k;
    drawMap();
    drawRadar();
    requestAnimationFrame(frame);
  }

  function drawLive() {
    drawHead();
    radarTarget();
    if (!rafOn) drawRadar();
    drawVitals();
    drawSkills();
  }

  function drawVitals() {
    var el = $("hm-vitals"); if (!el) return;
    var m = live && live.me;
    if (!live || !live.online || !m) { el.innerHTML = '<h3>Тело и силы</h3><p class="cab-meta">Зайди на сервер — здесь будут здоровье, еда, стамина, раны и температура в реальном времени.</p>'; return; }
    var lv = live.leveling || {}, hp = Math.round(100 * m.health / Math.max(1, m.maxHealth)), food = Math.round(100 * m.food / 20);
    var h = "<h3>Тело и силы</h3>" +
      row("❤", "Здоровье", Math.ceil(m.health) + " / " + m.maxHealth, hp, sev(hp)) +
      row("🍗", "Еда", m.food + " / 20", food, sev(food)) +
      (lv.stamina != null ? row("⚡", "Стамина", lv.exhausted ? "без сил" : Math.round(lv.stamina) + "%", lv.stamina, lv.exhausted ? "bad" : sev(lv.stamina)) : "") +
      (m.air >= 0 ? row("🫧", "Воздух", m.air + "%", m.air, sev(m.air)) : "") +
      '<div class="hm-mini">🛡 Броня <b>' + m.armor + "</b>" + (live.enemies ? ' · <span class="hm-warn">👹 врагов рядом: ' + live.enemies + "</span>" : "") + "</div>";
    if (lv.heat != null) {
      var hot = lv.heat >= 0.03, cold = lv.cold >= 0.03, tr = lv.trend > 0 ? " ↑" : lv.trend < 0 ? " ↓" : "";
      h += '<div class="hm-mini">' + (hot ? "☀" : cold ? "❄" : "✔") + " " + lv.outside + "° · " +
        (hot ? '<span class="' + (lv.heat >= 0.3 ? "hm-warn" : "") + '">Жарко ' + Math.round(lv.heat * 100) + "%</span>" :
          cold ? '<span class="' + (lv.cold >= 0.3 ? "hm-cold" : "") + '">Холодно ' + Math.round(lv.cold * 100) + "%</span>" : "Норма") + tr +
        (lv.wet >= 0.1 ? " · 💧 мокрый " + Math.round(lv.wet * 100) + "%" : "") + "</div>";
    }
    var b = live.body || {};
    if (Object.keys(b).length) {
      h += '<div class="hm-body">' + BODY.map(function (p) {
        var v = Math.round((b[p[0]] == null ? 1 : b[p[0]]) * 100);
        return '<div class="hm-part ' + (v >= 95 ? "ok" : v >= 60 ? "warn" : "bad") + '" title="' + p[1] + " " + v + '%"><span>' + p[1] + "</span><b>" + v + "%</b></div>";
      }).join("") + "</div>";
    }
    el.innerHTML = h;
  }

  function row(ico, name, val, pct, cls) {
    return '<div class="hm-stat"><span class="hm-ico">' + ico + '</span><span class="hm-sn">' + name + '</span><b>' + val + "</b>" + bar(pct, cls) + "</div>";
  }

  function drawSkills() {
    var el = $("hm-skills"); if (!el) return;
    var me = o.me() || {}, lv = live && live.leveling;
    var h = '<h3>Прокачка · уровень персонажа <b>' + (me.level || "—") + "</b></h3>";
    var near = lv && lv.near || [];
    if (near.length) h += near.map(function (s) {
      var p = Math.round(s.pct * 100);
      return '<div class="hm-stat"><span class="hm-sn">' + esc(o.skills[s.id] || s.id) + " · " + s.level + " → " + (s.level + 1) + "</span><b>" + p + "%</b>" + bar(p) + "</div>";
    }).join("");
    else h += '<p class="cab-meta">' + (live && live.online ? "Качай навыки действием — здесь будут три ближайших к новому уровню." : "Видно, когда ты в игре.") + "</p>";
    var lines = lv && lv.lines || [];
    if (lines.length) h += '<div class="hm-tags">' + lines.map(function (l) { return "<span>" + esc(l) + "</span>"; }).join("") + "</div>";
    el.innerHTML = h;
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

  // радар: ты в центре, вверх — куда смотришь; зелёные — с голосом, серые — без, жёлтые — твой клан
  function drawRadar() {
    var c = $("hm-radar"); if (!c) return;
    sizeCanvases();
    var g = c.getContext("2d"), W = c.width, R = W / 2 - 14 * U, cx = W / 2, cy = W / 2, u = U;
    var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    g.clearRect(0, 0, W, W);
    if (!mapOn) { g.fillStyle = dark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.04)"; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill(); }
    var range = zoom, sc = R / range;
    if (mapOn) dark = true;   // на карте — светлые подписи
    g.strokeStyle = dark ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.15)"; g.lineWidth = u;
    [0.25, 0.5, 0.75, 1].forEach(function (f) { g.beginPath(); g.arc(cx, cy, range * f * sc, 0, 7); g.stroke(); });
    g.fillStyle = dark ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.4)"; g.font = (10 * u) + "px Rubik, sans-serif"; g.textAlign = "left"; g.textBaseline = "bottom";
    [0.5, 1].forEach(function (f) { g.fillText(Math.round(range * f) + "", cx + 3 * u, cy - range * f * sc - 1); });   // подписи колец, блоки
    g.strokeStyle = "rgba(63,210,94,.55)"; g.setLineDash([4 * u, 4 * u]);   // граница слышимости голоса (32)
    g.beginPath(); g.arc(cx, cy, 32 * sc, 0, 7); g.stroke(); g.setLineDash([]);
    var note = $("hm-radar-note"), mapEl = $("hm-map");
    if (!live || !live.online || !live.me) {
      g.fillStyle = dark ? "#aaa" : "#777"; g.font = (15 * u) + "px Rubik, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("не в игре", cx, cy);
      if (note) note.textContent = "Радар заработает, когда ты зайдёшь на сервер.";
      if (mapEl) mapEl.innerHTML = "";
      return;
    }
    var yaw = sm.yaw * Math.PI / 180, fx = -Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = -Math.sin(yaw);
    // север на ободе
    var nx = 0 * rx + -1 * rz, ny = -(0 * fx + -1 * fz);
    g.fillStyle = "#e0533d"; g.font = "bold " + (14 * u) + "px Rubik, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("С", cx + nx * (R + 7 * u), cy + ny * (R + 7 * u));
    var list = Object.keys(sm.pts).map(function (n) { return sm.pts[n]; });
    list.forEach(function (p) {
      var sx = p.dx * rx + p.dz * rz, sy = -(p.dx * fx + p.dz * fz);
      var d = Math.sqrt(sx * sx + sy * sy), k = d * sc > R ? R / (d * sc) : 1;
      var x = cx + sx * sc * k, y = cy + sy * sc * k;
      g.fillStyle = p.clan ? "#f7c73c" : p.friend ? "#3a9bff" : p.voice ? "#3fd25e" : "#9a9a9a";
      g.beginPath(); g.arc(x, y, 7 * u, 0, 7); g.fill();
      if (p.voice) { g.fillStyle = "#fff"; g.font = (9 * u) + "px sans-serif"; g.fillText("🎤", x, y); }
      g.fillStyle = dark ? "#eee" : "#222"; g.font = (12 * u) + "px Rubik, sans-serif"; g.textBaseline = "top";
      g.fillText(p.name + (Math.abs(p.dy) >= 4 ? (p.dy > 0 ? " ▲" : " ▼") : ""), x, y + 9 * u); g.textBaseline = "middle";
    });
    drawMarks(g, cx, cy, R, sc, u, rx, rz, fx, fz, dark);
    g.fillStyle = "#3a9bff";   // ты — стрелка вверх
    g.beginPath(); g.moveTo(cx, cy - 11 * u); g.lineTo(cx + 8 * u, cy + 8 * u); g.lineTo(cx, cy + 4 * u); g.lineTo(cx - 8 * u, cy + 8 * u); g.closePath(); g.fill();
    var nh = list.length ? '<span class="hm-dot g"></span>с голосом <span class="hm-dot s"></span>без голоса <span class="hm-dot y"></span>клан <span class="hm-dot b"></span>друзья · пунктир — слышно голос'
      : "В радиусе " + zoom + " бл. никого.";
    if (note && note.getAttribute("data-v") !== nh) { note.innerHTML = nh; note.setAttribute("data-v", nh); }
    if (mapEl && o.mapLink && live.me.world !== "Лобби" && !mapEl.firstChild) {
      var me = o.me() || {}, w = me.where;
      if (w) mapEl.innerHTML = o.mapLink(w.worldId, live.me.x, live.me.y, live.me.z, "🗺 Карта");
    }
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
