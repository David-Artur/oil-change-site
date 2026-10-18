/* «Главная» личного кабинета (У237) — «второй экран»: телефон рядом с игрой.
 * Шапка (где ты, время, погода, баланс), голос (voice.js), радар игроков рядом, тело и силы, прокачка, быстрое (подарок, ачивка, Рынок), чат.
 * Данные: POST /api/home (VPLand) раз в ~0.7 с, пока вкладка открыта и страница видна; остальное — из /api/me кабинета.
 * Подключение: window.VPHome.mount(элемент, {api, toast, me: fn() → данные /me, money, mapLink, skills: {id: название}, setTab}). */
(function () {
  "use strict";
  var POLL_MS = 700;
  var box = null, o = null, timer = null, live = null, chatId = 0, chat = [], shown = false, busy = false, chatOpen = false;
  var BODY = [["head", "Голова"], ["torso", "Туловище"], ["left_arm", "Л. рука"], ["right_arm", "П. рука"], ["left_leg", "Л. нога"], ["right_leg", "П. нога"]];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  function $(id) { return document.getElementById(id); }
  function bar(v, cls) { return '<div class="bar ' + (cls || "") + '"><i style="width:' + Math.max(0, Math.min(100, v)) + '%"></i></div>'; }
  function sev(v) { return v < 25 ? "bad" : v < 60 ? "warn" : ""; }

  function mount(el, opt) {
    box = el; o = opt;
    box.innerHTML =
      '<div class="card cab-card hm-head" id="hm-head"></div>' +
      '<div id="hm-voice"></div>' +
      '<div class="hm-row">' +
        '<div class="card cab-card hm-radar"><h3>Рядом</h3><canvas id="hm-radar" width="320" height="320" aria-label="Радар: игроки рядом"></canvas>' +
          '<p class="cab-meta" id="hm-radar-note"></p><div class="cab-row" id="hm-map"></div></div>' +
        '<div class="card cab-card hm-vitals" id="hm-vitals"></div>' +
      '</div>' +
      '<div class="card cab-card hm-skills" id="hm-skills"></div>' +
      '<div class="card cab-card hm-quick" id="hm-quick"></div>' +
      '<div class="card cab-card hm-chat"><div class="hm-chat-top"><h3>Чат</h3><button class="btn small" type="button" id="hm-chat-full">⤢ На весь экран</button></div>' +
        '<div class="hm-chat-list" id="hm-chat-mini"></div>' + chatForm("mini") + '</div>' +
      '<div class="hm-chat-over" id="hm-chat-over" hidden><div class="hm-chat-over-top"><b>Чат сервера</b><button class="btn small" type="button" id="hm-chat-close">✕ Закрыть</button></div>' +
        '<div class="hm-chat-list" id="hm-chat-big"></div>' + chatForm("big") + '</div>';
    if (window.VPVoice) window.VPVoice.mount($("hm-voice"), {api: o.api, toast: o.toast, compact: true});
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
    if (on) { drawStatic(); tick(); } else { clearTimeout(timer); timer = null; }
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

  function drawHead() {
    var me = o.me() || {}, m = live && live.me, env = live && live.env;
    var place = m ? esc(m.world) + ' <span class="cab-meta">' + m.x + " " + m.y + " " + m.z + "</span>" : (me.online ? "в игре" : "не в игре");
    var sky = "";
    if (env) {
      sky = env.dim === "nether" ? "🔥 Ад" : env.dim === "the_end" ? "🌌 Энд" : (env.thunder ? "⛈ гроза" : env.storm ? "🌧 дождь" : env.day ? "☀ день" : "🌙 ночь") + " · " + env.clock;
    }
    $("hm-head").innerHTML = '<div class="hm-head-l"><b class="hm-nick">' + esc(me.nick || "") + '</b><span class="dot' + (live && live.online ? " on" : "") + '"></span>' +
      '<span>' + place + "</span></div>" +
      '<div class="hm-head-r">' + (sky ? '<span>' + sky + "</span>" : "") + '<span class="hm-bal">' + o.money(me.balance) + "</span>" +
      '<span class="cab-meta">ур. ' + (me.level || "—") + "</span></div>";
  }

  function drawLive() {
    drawHead();
    drawRadar();
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

  // радар: ты в центре, вверх — куда смотришь; зелёные — с голосом, серые — без, жёлтые — твой клан
  function drawRadar() {
    var c = $("hm-radar"); if (!c) return;
    var g = c.getContext("2d"), W = c.width, R = W / 2 - 14, cx = W / 2, cy = W / 2;
    var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    g.clearRect(0, 0, W, W);
    g.fillStyle = dark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.04)";
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    var range = (live && live.radarRange) || 48, sc = R / range;
    g.strokeStyle = dark ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.15)"; g.lineWidth = 1;
    [16, 32, 48].forEach(function (r) { if (r <= range) { g.beginPath(); g.arc(cx, cy, r * sc, 0, 7); g.stroke(); } });
    g.strokeStyle = "rgba(63,210,94,.5)"; g.setLineDash([4, 4]);   // граница слышимости голоса (32)
    g.beginPath(); g.arc(cx, cy, 32 * sc, 0, 7); g.stroke(); g.setLineDash([]);
    var note = $("hm-radar-note"), mapEl = $("hm-map");
    if (!live || !live.online || !live.me) {
      g.fillStyle = dark ? "#aaa" : "#777"; g.font = "15px Rubik, sans-serif"; g.textAlign = "center"; g.fillText("не в игре", cx, cy + 5);
      if (note) note.textContent = "Радар заработает, когда ты зайдёшь на сервер.";
      if (mapEl) mapEl.innerHTML = "";
      return;
    }
    var yaw = live.me.yaw * Math.PI / 180, fx = -Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = -Math.sin(yaw);
    // север на ободе
    var nx = 0 * rx + -1 * rz, ny = -(0 * fx + -1 * fz);
    g.fillStyle = "#e0533d"; g.font = "bold 14px Rubik, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("С", cx + nx * (R + 7), cy + ny * (R + 7));
    var list = live.radar || [];
    list.forEach(function (p) {
      var sx = p.dx * rx + p.dz * rz, sy = -(p.dx * fx + p.dz * fz);
      var d = Math.sqrt(sx * sx + sy * sy), k = d * sc > R ? R / (d * sc) : 1;
      var x = cx + sx * sc * k, y = cy + sy * sc * k;
      g.fillStyle = p.clan ? "#f7c73c" : p.voice ? "#3fd25e" : "#9a9a9a";
      g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
      if (p.voice) { g.fillStyle = "#fff"; g.font = "9px sans-serif"; g.fillText("🎤", x, y); }
      g.fillStyle = dark ? "#eee" : "#222"; g.font = "12px Rubik, sans-serif"; g.textBaseline = "top";
      g.fillText(p.name + (Math.abs(p.dy) >= 4 ? (p.dy > 0 ? " ▲" : " ▼") : ""), x, y + 9); g.textBaseline = "middle";
    });
    g.fillStyle = "#3a9bff";   // ты — стрелка вверх
    g.beginPath(); g.moveTo(cx, cy - 11); g.lineTo(cx + 8, cy + 8); g.lineTo(cx, cy + 4); g.lineTo(cx - 8, cy + 8); g.closePath(); g.fill();
    if (note) note.innerHTML = list.length ? '<span class="hm-dot g"></span>с голосом <span class="hm-dot s"></span>без голоса <span class="hm-dot y"></span>твой клан · пунктир — слышно голос'
      : "Рядом (48 бл.) никого.";
    if (mapEl && o.mapLink && live.me.world !== "Лобби" && !mapEl.firstChild) {
      var me = o.me() || {}, w = me.where;
      if (w) mapEl.innerHTML = o.mapLink(w.worldId, live.me.x, live.me.y, live.me.z, "🗺 Большая карта");
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
