/* Страница одного привата DaviArt Craft (У276, VPLand 0.9.13+): claim.html?id=<claim.id>.
 * Вход — тот же, что в кабинете (токен в localStorage «daviart.cabinet.token»), API — тот же (https://mc.daviart.com/api).
 * Данные — из /api/me (claims[]), действия — POST /api/claim {claim, action, ...}. Показываются только разрешённые функции (claim.can). */
(function () {
  "use strict";
  var qs = new URLSearchParams(location.search);
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || location.protocol === "file:";
  var API = (local && qs.get("api")) || "https://mc.daviart.com/api";
  var KEY = "daviart.cabinet.token";
  var ID = qs.get("id") || "";
  var REFRESH = 30000;
  var me = null, cur = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  function money(v) { return "$" + Number(v || 0).toLocaleString("ru-RU", {maximumFractionDigits: 2}); }
  function tok() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function dropTok() { try { localStorage.removeItem(KEY); } catch (e) { } }
  function when(t) { return t ? new Date(t).toLocaleString("ru-RU", {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"}) : "—"; }
  var MC_COL = {"0": "#000000", "1": "#0000AA", "2": "#00AA00", "3": "#00AAAA", "4": "#AA0000", "5": "#AA00AA", "6": "#FFAA00", "7": "#AAAAAA",
    "8": "#555555", "9": "#5555FF", "a": "#55FF55", "b": "#55FFFF", "c": "#FF5555", "d": "#FF55FF", "e": "#FFFF55", "f": "#FFFFFF"};
  function pill(text, col) {
    var m = /^[&§]([0-9a-f])$/i.exec(String(col || "").trim()), hex = m ? MC_COL[m[1].toLowerCase()] : null;
    if (!hex) return '<span class="rank">' + esc(text) + "</span>";
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return '<span class="rank role-pill" style="background:' + hex + ";border-color:" + hex + ";color:" + ((r * 299 + g * 587 + b * 114) / 1000 > 140 ? "#1a1a1a" : "#fff") + '">' + esc(text) + "</span>";
  }
  function mapLink(worldId, x, y, z) {   // тот же формат, что в кабинете
    return '<a class="btn small" target="_blank" rel="noopener" href="https://mc.daviart.com/map/#' + encodeURIComponent(worldId || "") + ":" + x + ":" + (y || 64) + ":" + z + ':120:0:0:0:0:perspective">🗺 Открыть на карте</a>';
  }
  var toastT;
  function toast(msg, bad) {
    var t = $("toast");
    t.textContent = msg;
    t.style.boxShadow = bad ? "inset 0 0 0 2px #b4321f" : "";
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove("show"); }, 4200);
  }
  function api(path, body) {
    var h = {"Content-Type": "application/json"};
    if (tok()) h.Authorization = "Bearer " + tok();
    return fetch(API + path, {method: body ? "POST" : "GET", headers: h, body: body ? JSON.stringify(body) : undefined})
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { j = j || {}; j.status = r.status; if (r.status === 401) { dropTok(); me = null; } return j; });
      })
      .catch(function () { return {ok: false, offline: true, message: "Сервер не отвечает. Попробуй позже — возможно, идёт перезапуск."}; });
  }
  function page(html) { $("cl-root").innerHTML = html; }
  function msgCard(title, text) {
    page('<div class="card cab-card"><h2>' + title + '</h2><p class="cab-meta">' + text + '</p><div class="cab-row"><a class="btn small" href="cabinet.html#land">← В кабинет</a></div></div>');
  }

  // ---------------------------------------------------------------- загрузка
  function load(quiet) {
    if (!tok()) { needLogin(); return; }
    return api("/me").then(function (j) {
      if (!j.ok) {
        if (j.status === 401 || !tok()) { needLogin(); return; }
        if (j.offline && me) { if (!quiet) toast(j.message, true); return; }
        msgCard("Не получилось загрузить", esc(j.message || "Попробуй обновить страницу."));
        return;
      }
      me = j;
      render();
    });
  }
  function needLogin() {
    page('<div class="card cab-card"><h2>Нужно войти</h2><p class="cab-meta">Страница привата открывается после входа в личный кабинет — ником и паролем от сервера. ' +
      'Войди в кабинете, потом снова нажми «Открыть страницу привата».</p><div class="cab-row"><a class="btn green" href="cabinet.html#land">Войти в кабинет</a></div></div>');
  }

  // ---------------------------------------------------------------- отрисовка
  function render() {
    var c = (me.claims || []).filter(function (x) { return x && String(x.id) === ID; })[0];
    cur = c || null;
    if (!ID || !c) {
      msgCard("Приват не найден", "Такого привата нет среди твоих: возможно, его удалили, передали другому или тебя из него убрали. Список твоих приватов — в кабинете, вкладка «Земли и клан».");
      return;
    }
    var can = c.can;
    if (!can || typeof can !== "object") {
      msgCard(esc(c.name), "Страница привата заработает после обновления сервера. Пока управляй приватом в кабинете, вкладка «Земли и клан».");
      return;
    }
    document.title = c.name + " · Приват · DaviArt Craft";
    var keep = {};   // не терять набранное при обновлении
    Array.prototype.forEach.call(document.querySelectorAll("#cl-root input[id], #cl-root select[id]"), function (i) { if (i.type !== "checkbox") keep[i.id] = i.value; });
    var xyz = String(c.center || "0 64 0").split(" "), members = c.members || [];
    var role = c.role >= 3 ? "хозяин" : c.role >= 2 ? "управляющий" : "участник";
    var h = "";
    // шапка
    h += '<div class="card cab-card cl-head"><h1>' + esc(c.name) + " " + (c.clan ? '<span class="rank r2">клан-приват</span>' : '<span class="rank">личный приват</span>') + "</h1>" +
      '<p class="cab-meta">' + esc(c.world) + " · " + (c.clan ? (c.clanTag ? pill("[" + c.clanTag + "]" + (c.clanName ? " " + c.clanName : ""), c.clanColor) : "клан") + (c.owner ? " · поставил " + esc(c.owner) : "") : "хозяин <b>" + esc(c.owner) + "</b>") +
      " · твоя роль: " + role + "</p>" +
      '<div class="cab-row">' + mapLink(c.worldId, xyz[0], xyz[1], xyz[2]) + '<a class="btn small" href="cabinet.html#land">← В кабинет</a></div></div>';
    // факты
    var st = function (l, v) { return '<div class="cab-stat"><span class="lbl">' + l + "</span><b>" + (v == null || v === "" ? "—" : v) + "</b></div>"; };
    h += '<div class="card cab-card cl-facts"><h2>О привате</h2><div class="cab-stats">' + st("Размер", esc(c.size)) +
      st("Объём", c.volume ? Number(c.volume).toLocaleString("ru-RU") + " бл." : null) + st("Центр", esc(c.center)) +
      st("Углы", c.min && c.max ? esc(c.min) + " → " + esc(c.max) : null) + st("Вложено", c.invested ? money(c.invested) : "$0") +
      st("Создан", c.created ? new Date(c.created).toLocaleDateString("ru-RU") : null) +
      st(c.clan ? "Гостей" : "Друзей", members.length + (c.maxMembers > 0 ? " из " + c.maxMembers : "")) + "</div>" +
      (c.deal ? '<p class="cab-note">⏳ Есть предложение передать приват — см. «Продать или передать».</p>' : "") + "</div>";
    // название
    if (can.rename) h += '<div class="card cab-card"><h2>Название</h2><div class="cab-row"><input type="text" id="cl-name" maxlength="24" value="' + esc(c.name) + '" aria-label="Название привата">' +
      '<button class="btn small" type="button" data-a="rename">Переименовать</button></div></div>';
    // участники
    h += membersHtml(c, can);
    // настройки (только не простой приват)
    if (can.settings && !c.simple) {
      var defGreet = c.clanTag ? "Земли клана [" + c.clanTag + "] " + (c.clanName || "") : "по умолчанию";
      h += '<div class="card cab-card"><h2>Настройки</h2>' +
        tog("entry", "Вход открыт для чужих (выключи — посторонние не смогут зайти)", c.entryClosed !== true) +
        tog("doors", "Деревянные двери и люки открыты для гостей", c.guestDoors) +
        tog("explosions", "Взрывы ломают блоки (крипер, TNT)", c.explosions) +
        tog("mobs", "Враждебные мобы появляются (выключи — без мобов)", c.noMobs !== true) +
        tog("map", "Показывать на веб-карте", !c.mapHidden) +
        '<h3 style="margin-top:14px">Приветствие при входе</h3><p class="cab-meta">2–48 символов. Пусто — «' + esc(defGreet) + "».</p>" +
        '<div class="cab-row"><input type="text" id="cl-greet" maxlength="48" value="' + esc(c.greeting || "") + '" placeholder="' + esc(defGreet) + '" aria-label="Приветствие">' +
        '<button class="btn small" type="button" data-a="greeting">Сохранить</button>' + (c.greeting ? '<button class="btn small" type="button" data-a="greeting-reset">Сбросить</button>' : "") + "</div></div>";
    }
    // продать / передать
    if (can.sell) {
      h += '<div class="card cab-card cl-sell"><h2>Продать или передать</h2>';
      if (c.deal) {
        h += '<p>Предложено: <b>' + esc(String(c.deal.to || "?").replace(/^clan:/i, "клану ")) + "</b> · " + (Number(c.deal.price) > 0 ? "цена <b>" + money(c.deal.price) + "</b>" : "<b>бесплатно</b>") +
          (c.deal.expires ? " · действует до " + when(c.deal.expires) : "") + (c.deal.by ? ' <span class="cab-meta">(предложил ' + esc(c.deal.by) + ")</span>" : "") + "</p>" +
          '<p class="cab-meta">Ждём ответа получателя. Пока он не принял — приват остаётся как был.</p><div class="cab-row"><button class="btn small red" type="button" data-a="sell_cancel">Отменить предложение</button></div>';
      } else {
        h += '<p class="cab-meta">Получатель увидит предложение в своём кабинете («Земли и клан» → «Приваты») и сможет принять или отказаться. Цена 0 — бесплатно. Пока он не принял — приват остаётся как был.</p>' +
          '<div class="cab-row"><select id="cl-to-kind" class="cab-sel" aria-label="Кому"><option value="nick">Игроку</option><option value="clan">Клану</option></select>' +
          '<input type="text" id="cl-to" maxlength="16" placeholder="Ник игрока или тег клана" aria-label="Получатель"></div>' +
          '<div class="cab-row"><input type="number" id="cl-price" min="0" step="1" value="0" inputmode="numeric" aria-label="Цена, $" style="max-width:160px;flex:none"><span class="cab-meta" style="margin:0">$ (0 — бесплатно)</span>' +
          '<button class="btn small gold" type="button" data-a="sell">Предложить</button></div>';
      }
      h += "</div>";
    }
    if (can.resize || can.delete) h += '<div class="card cab-card"><p class="cab-meta" style="margin:0">📐 Расширить, уменьшить или удалить — в игре, компасом (ПКМ компасом — меню).</p></div>';
    page('<div class="cl-page">' + h + "</div>");
    Object.keys(keep).forEach(function (k) { var i = $(k); if (i && keep[k] !== "" && k !== "cl-name" && k !== "cl-greet") i.value = keep[k]; });
    wire(c);
  }
  function tog(k, label, on) { return '<label class="tog"><span>' + label + '</span><input type="checkbox" data-tog="' + k + '"' + (on ? " checked" : "") + "></label>"; }

  function membersHtml(c, can) {
    var ms = c.members || [], h = "", rm = function (m) { return can.members ? '<button class="btn small red" type="button" data-rm="' + esc(m.name) + '" title="Убрать из привата">✕</button>' : ""; };
    var addRow = can.members ? '<div class="cab-row"><input type="text" id="cl-nick" maxlength="16" placeholder="Ник игрока" aria-label="Ник"><button class="btn small green" type="button" data-a="add">Добавить</button></div>' : "";
    if (c.simple) {
      var max = c.maxMembers > 0 ? c.maxMembers : "?";
      h += '<div class="card cab-card"><h2>Друзья (' + ms.length + (c.maxMembers > 0 ? " из " + c.maxMembers : "") + ")</h2>" +
        '<p class="cab-meta">Личный приват — простой: двери для гостей закрыты, взрывы не ломают блоки, на карте виден. Друзей — до ' + max +
        ", у них все права, кроме управления. Больше игроков и настройки — у клан-привата (кланы, Пограничье).</p>" +
        (ms.length ? ms.map(function (m) { return '<div class="mem"><span class="nm">' + esc(m.name) + "</span>" + rm(m) + "</div>"; }).join("") : '<p class="cab-meta">Пока никого.</p>') +
        addRow + "</div>";
      return h;
    }
    var dis = can.perms ? "" : " disabled";
    h += '<div class="card cab-card"><h2>' + (c.clan ? "Гости" : "Участники") + " (" + ms.length + ")</h2>" +
      (c.clan ? '<p class="cab-meta">Участники клана получают доступ по своим ролям — это настраивается в кабинете, раздел <a href="cabinet.html#land">«Клан»</a>. Здесь — только гости со стороны.</p>' : "");
    if (ms.length) {
      h += '<div class="tablewrap"><table class="mtable"><thead><tr><th>Ник</th><th title="Строить и ломать">Стр.</th><th title="Сундуки, печки">Сунд.</th><th title="Двери, кнопки, рычаги">Дв.</th><th title="Управление приватом">Упр.</th>' + (can.members ? "<th></th>" : "") + "</tr></thead><tbody>" +
        ms.map(function (m) {
          var cb = function (p) { return '<td><input type="checkbox" data-perm="' + p + '" data-nick="' + esc(m.name) + '"' + (m[p] ? " checked" : "") + dis + ' aria-label="' + p + " " + esc(m.name) + '"></td>'; };
          return "<tr><td>" + esc(m.name) + "</td>" + cb("build") + cb("containers") + cb("access") + cb("manager") + (can.members ? "<td>" + rm(m) + "</td>" : "") + "</tr>";
        }).join("") + "</tbody></table></div>" +
        '<p class="cab-meta">Каждая галочка работает отдельно: <b>Стр.</b> — ставить и ломать блоки; <b>Сунд.</b> — сундуки, бочки, печи, воронки, животные; ' +
        "<b>Дв.</b> — двери, люки, кнопки, рычаги, кровати; <b>Упр.</b> — может добавлять и убирать людей. Галочку сняли — сразу нельзя.</p>";
    } else h += '<p class="cab-meta">Пока никого.</p>';
    return h + addRow + "</div>";
  }

  // ---------------------------------------------------------------- действия
  function act(body) {
    body.claim = ID;
    return api("/claim", body).then(function (j) {
      if (j.status === 401) { needLogin(); return j; }
      toast(j.message || (j.ok ? "Готово." : "Не получилось."), !j.ok);
      load(true);
      return j;
    });
  }
  function wire(c) {
    var root = $("cl-root");
    Array.prototype.forEach.call(root.querySelectorAll("[data-a]"), function (b) {
      b.onclick = function () {
        var a = b.getAttribute("data-a"), v;
        if (a === "rename") { v = $("cl-name").value.trim(); if (v) act({action: "rename", name: v}); }
        else if (a === "add") { v = $("cl-nick").value.trim(); if (v) act({action: "add", nick: v}).then(function (j) { if (j && j.ok && $("cl-nick")) $("cl-nick").value = ""; }); }
        else if (a === "greeting") act({action: "greeting", text: $("cl-greet").value.trim()});
        else if (a === "greeting-reset") act({action: "greeting", text: ""});
        else if (a === "sell_cancel") { if (confirm("Отменить предложение?")) act({action: "sell_cancel"}); }
        else if (a === "sell") {
          var who = $("cl-to").value.trim(), clan = $("cl-to-kind").value === "clan", price = Math.max(0, Math.floor(Number($("cl-price").value) || 0));
          if (!who) { toast(clan ? "Напиши тег клана." : "Напиши ник игрока.", true); return; }
          who = who.replace(/^clan:/i, "");
          if (!confirm((price > 0 ? "Продать" : "Передать бесплатно") + " приват «" + c.name + "» " + (clan ? "клану [" + who + "]" : "игроку " + who) + (price > 0 ? " за " + money(price) : "") + "?\n\nПриват перейдёт, только когда получатель примет предложение.")) return;
          act({action: "sell", to: clan ? "clan:" + who : who, price: price});
        }
      };
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-tog]"), function (i) {
      i.onchange = function () { act({action: i.getAttribute("data-tog"), value: i.checked}); };
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-perm]"), function (i) {
      i.onchange = function () { act({action: "perm", nick: i.getAttribute("data-nick"), perm: i.getAttribute("data-perm"), value: i.checked}); };
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-rm]"), function (x) {
      x.onclick = function () { var n = x.getAttribute("data-rm"); if (confirm("Убрать " + n + " из привата?")) act({action: "remove", nick: n}); };
    });
    var enter = function (id, a) { var i = $(id); if (i) i.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); var b = root.querySelector('[data-a="' + a + '"]'); if (b) b.click(); } }; };
    enter("cl-name", "rename"); enter("cl-nick", "add"); enter("cl-greet", "greeting");
  }

  // ---------------------------------------------------------------- тема (как в кабинете) и автообновление
  (function () {
    var tb = $("theme-btn"), THEMES = ["auto", "light", "dark"], ICON = {auto: "🌗", light: "☀", dark: "🌙"}, NAME = {auto: "как в системе", light: "светлая", dark: "тёмная"};
    var get = function () { try { return localStorage.getItem("daviart.theme") || "auto"; } catch (e) { return "auto"; } };
    var apply = function (th) {
      if (th === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", th);
      if (tb) { tb.textContent = ICON[th]; tb.title = "Тема: " + NAME[th] + " (нажми — сменить)"; }
      try { if (th === "auto") localStorage.removeItem("daviart.theme"); else localStorage.setItem("daviart.theme", th); } catch (e) { }
    };
    apply(get());
    if (tb) tb.onclick = function () { var th = THEMES[(THEMES.indexOf(get()) + 1) % 3]; apply(th); toast("Тема: " + NAME[th]); };
  })();
  function typing() { var a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox" && a.closest && a.closest("#cl-root"); }
  setInterval(function () { if (!document.hidden && me && tok() && !typing()) load(true); }, REFRESH);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && me && !typing()) load(true); });
  load(false);
})();
