/* Личный кабинет DaviArt Craft. API — VPLand WebApi за Caddy: https://mc.daviart.com/api.
 * Вход: ник + одноразовый код из игры (/account) → токен (30 дней) в localStorage. Все действия — POST, ответ {ok, message}.
 * Синхронизация с сервером: данные берутся с сервера при каждом открытии и обновляются сами каждые 20 с (пока вкладка открыта
 * и ты ничего не печатаешь); после любого действия — сразу. */
(function () {
  "use strict";
  var qs = new URLSearchParams(location.search);
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || location.protocol === "file:";
  var API = (local && qs.get("api")) || "https://mc.daviart.com/api";
  var KEY = "daviart.cabinet.token";
  var REFRESH = 20000;
  var me = null, market = null, clansAll = null, tab = "profile", lastSync = 0, mkFilter = {q: "", cat: "all", sort: "new"};

  var SKILLS = {"walk":"Ходьба","sprint":"Бег","sneak":"Ходьба вприсядку","jump":"Прыжок в высоту","fall":"Падение","swim":"Плавание","swim_fast":"Быстрое плавание",
    "wade":"Ходьба в воде","breath":"Дыхание","riding":"Верховая езда","minecart":"Вагонетка","strength":"Сила удара","crit":"Критический удар","reach":"Дальность удара",
    "knockback":"Отбрасывание","shield":"Блок щитом","defense":"Защита","regen":"Регенерация здоровья","throwing":"Метание","suffocation_res":"Стойкость к удушью",
    "fire_res":"Стойкость к огню","poison_res":"Стойкость к ядам","mining":"Ломание блоков","ore_yield":"Добыча ресурсов","farming":"Фермерство","stomach":"Крепкий желудок",
    "injury_res":"Стойкость к травмам","adrenaline":"Адреналин","stamina":"Выносливость","second_wind":"Второе дыхание","stealth":"Скрытность","glide":"Полёт",
    "hardiness":"Акклиматизация","cold_tol":"Морозостойкость","heat_tol":"Жаростойкость","wet_res":"Привычка к сырости","first_aid":"Первая помощь","fishing":"Рыбалка","build":"Строительство"};
  var BODY = [["head", "Голова"], ["torso", "Туловище"], ["left_arm", "Левая рука"], ["right_arm", "Правая рука"], ["left_leg", "Левая нога"], ["right_leg", "Правая нога"]];
  var RANK = {3: "лидер", 2: "заместитель", 1: "участник"};
  var RANKS = {level: "Уровень", money: "Деньги", pvp: "PvP", mobs: "Мобы", time: "Время в игре", market: "Оборот Рынка", ach: "Ачивки"};
  var CATS = [["all", "Все"], ["res", "Ресурсы"], ["blocks", "Блоки"], ["tools", "Снаряжение"], ["magic", "Магия"], ["food", "Еда"], ["other", "Другое"]];
  var TABS = ["profile", "claims", "clan", "market", "ach", "help"];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  function money(v) { return "$" + Number(v || 0).toLocaleString("ru-RU", {maximumFractionDigits: 2}); }
  function getTok() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setTok(t) { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch (e) { } }
  var memTok = null;
  function tok() { return memTok || getTok(); }
  function item(it) { return esc((it.item || it.material || "?").replace(/_/g, " ")) + (it.amount > 1 ? " ×" + it.amount : "") + (it.enchanted ? ' <span class="ench" title="Зачарован">✦</span>' : ""); }
  function mapLink(worldId, x, y, z, label) {
    var base = (me && me.map) || "http://mc.daviart.com:8100";
    return '<a class="btn small" target="_blank" rel="noopener" href="' + esc(base) + "/#" + encodeURIComponent(worldId) + ":" + x + ":" + (y || 64) + ":" + z + ':120:0:0:0:0:perspective">' + (label || "🗺 На карте") + "</a>";
  }
  function ago(t) { var s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? s + " с" : Math.round(s / 60) + " мин"; }

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
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401) { memTok = null; setTok(null); stopSync(); show("login"); }
          j.status = r.status;
          return j;
        });
      })
      .catch(function () { return {ok: false, offline: true, message: "Сервер не отвечает. Попробуйте позже — возможно, идёт перезапуск."}; });
  }

  function show(v) {
    $("login-view").hidden = v !== "login";
    $("cab-view").hidden = v !== "cab";
    $("load-view").hidden = v !== "load";
  }

  // ---------------------------------------------------------------- вход
  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var m = $("login-msg");
    m.className = "cab-msg";
    m.textContent = "Проверяю…";
    api("/login", {nick: $("f-nick").value.trim(), code: $("f-code").value.trim()}).then(function (j) {
      if (!j.ok) { m.textContent = j.message || "Не получилось."; return; }
      memTok = j.token;
      setTok(j.token);
      m.className = "cab-msg ok";
      m.textContent = j.message;
      load(true);
    });
  });

  $("logout").addEventListener("click", function () {
    api("/logout", {}).then(function () { memTok = null; setTok(null); me = null; stopSync(); show("login"); toast("Вы вышли из кабинета."); });
  });

  Array.prototype.forEach.call(document.querySelectorAll("#tabs .chip"), function (b) {
    b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); });
  });

  function setTab(t) {
    tab = t;
    Array.prototype.forEach.call(document.querySelectorAll("#tabs .chip"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t); });
    TABS.forEach(function (x) { $("tab-" + x).hidden = x !== t; });
    try { history.replaceState(null, "", "#" + t); } catch (e) { }
    if (t === "market" && !market) loadMarket();
    if (t === "clan" && !clansAll) loadClans();
  }

  // ---------------------------------------------------------------- синхронизация
  var timer = null;
  function startSync() {
    stopSync();
    timer = setInterval(function () {
      if (document.hidden || !tok()) return;
      var a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest && a.closest("#cab-view") && a.value) return;   // не сбивать ввод
      load(false);
      if (tab === "market") loadMarket();
    }, REFRESH);
  }
  function stopSync() { if (timer) clearInterval(timer); timer = null; }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && me && Date.now() - lastSync > REFRESH) load(false); });
  setInterval(function () { var s = $("sync"); if (s && lastSync) s.textContent = "синхронизировано " + ago(lastSync) + " назад"; }, 1000);

  function load(first) {
    if (!tok()) { show("login"); return; }
    return api("/me").then(function (j) {
      if (!j.ok) {
        if (j.offline && me) { $("sync").textContent = "сервер не отвечает — показаны последние данные"; return; }
        if (j.status !== 401) { show("login"); $("login-msg").textContent = j.message || ""; }
        return;
      }
      me = j;
      lastSync = Date.now();
      render();
      show("cab");
      if (first) startSync();
    });
  }
  function loadMarket() { return api("/market").then(function (j) { if (j.ok) { market = j; renderMarket(); } }); }
  function loadClans() { return api("/clans").then(function (j) { if (j.ok) { clansAll = j.clans; renderClan(); } }); }

  // действие → сообщение → обновить
  function act(path, body) {
    return api(path, body).then(function (j) {
      toast(j.message || (j.ok ? "Готово." : "Не получилось."), !j.ok);
      if (j.ok) { load(false); if (path === "/market") loadMarket(); if (path === "/clan") loadClans(); }
      return j;
    });
  }

  // ---------------------------------------------------------------- отрисовка
  function render() {
    $("me-nick").textContent = me.nick;
    $("me-dot").className = "dot" + (me.online ? " on" : "");
    $("me-online").textContent = me.online ? "в игре сейчас" + (me.where ? " · " + me.where.world : "") : (me.lastSeen ? "был в игре " + new Date(me.lastSeen).toLocaleString("ru-RU") : "");
    $("me-bal").textContent = money(me.balance);
    $("me-lvl").textContent = me.level || "—";
    $("me-clan").textContent = me.clan ? "[" + me.clan.tag + "]" : "нет";
    var n = (me.market && me.market.notices || []).length + (me.invite ? 1 : 0);
    var badge = $("tab-badge"); if (badge) { badge.textContent = n ? String(n) : ""; badge.hidden = !n; }
    renderProfile();
    renderClaims();
    renderClan();
    renderAch();
    renderHelp();
    if (market) renderMarket(); else renderMarketShell();
    setTab(tab);
  }

  function bar(v, cls) { return '<div class="bar ' + (cls || "") + '"><i style="width:' + Math.max(0, Math.min(100, v)) + '%"></i></div>'; }
  function stat(l, v) { return '<div class="cab-stat"><span class="lbl">' + l + "</span><b>" + (v == null ? "—" : v) + "</b></div>"; }

  function renderProfile() {
    var s = me.stats || {}, h = "";
    if (me.where) {
      var w = me.where;
      h += '<div class="card cab-card"><h2>Сейчас в игре</h2><div class="cab-stats">' + stat("Мир", esc(w.world)) + stat("Координаты", w.x + " " + w.y + " " + w.z) +
        stat("Здоровье", Math.round(w.health) + " / " + w.maxHealth) + stat("Сытость", w.food + " / 20") + stat("Уровень опыта", w.xpLevel) + "</div>" +
        '<div class="cab-row">' + (w.world !== "Лобби" ? mapLink(w.worldId, w.x, w.y, w.z, "🗺 Где я на карте") : "") + "</div></div>";
    }
    h += '<div class="card cab-card"><h2>Статистика</h2><div class="cab-stats">' +
      stat("В игре", s.playMinutes != null ? (Math.floor(s.playMinutes / 60) + " ч " + (s.playMinutes % 60) + " мин") : "—") +
      stat("Смертей", s.deaths) + stat("Убито мобов", s.mobKills) + stat("Убито игроков", s.playerKills) +
      stat("Пройдено", s.walkCm != null ? (s.walkCm / 100000).toFixed(1) + " км" : "—") + stat("Прыжков", s.jumps) +
      stat("На сервере с", me.firstPlayed ? new Date(me.firstPlayed).toLocaleDateString("ru-RU") : "—") + "</div></div>";
    var rk = me.ranks || {}, rkeys = Object.keys(RANKS).filter(function (k) { return rk[k]; });
    if (rkeys.length) {
      h += '<div class="card cab-card"><h2>Места в рейтингах</h2><div class="cab-stats">' + rkeys.map(function (k) {
        var r = rk[k];
        return stat(RANKS[k], r.rank ? "#" + r.rank + ' <span class="cab-meta">из ' + r.of + (r.value ? " · " + esc(r.value) : "") + "</span>" : '<span class="cab-meta">нет в таблице</span>');
      }).join("") + '</div><p class="cab-note">Таблица обновляется раз в минуту по игрокам онлайн. В игре — <code>/top</code>.</p></div>';
    }
    var homes = me.homes || [];
    h += '<div class="card cab-card"><h2>Дома</h2>' + (homes.length ? homes.map(function (x) {
      return '<div class="mem"><span class="nm">' + esc(x.world) + '</span><span class="cab-meta">' + x.x + " " + x.y + " " + x.z + "</span>" + mapLink(x.worldId, x.x, x.y, x.z) + "</div>";
    }).join("") : '<p class="cab-meta">Домов нет. В каждом мире (1–3) — свой: встань на место и напиши <code>/sethome</code>.</p>') + "</div>";
    var b = me.body || {};
    if (Object.keys(b).length) {
      h += '<div class="card cab-card"><h2>Тело</h2><p class="cab-meta">Части тела лечатся сами (кровать — ×5), бинтами и у лекаря. Сломанные ноги — медленно ходишь.</p><div class="body-fig">' +
        BODY.map(function (p) { var v = Math.round((b[p[0]] == null ? 1 : b[p[0]]) * 100); return "<div>" + p[1] + " · <b>" + v + "%</b>" + bar(v, v < 25 ? "bad" : v < 60 ? "warn" : "") + "</div>"; }).join("") + "</div></div>";
    }
    var sk = me.skills || {}, keys = Object.keys(sk);
    if (keys.length) {
      keys.sort(function (a, c) { return (sk[c] - sk[a]) || ((SKILLS[a] || a).localeCompare(SKILLS[c] || c)); });
      h += '<div class="card cab-card"><h2>Навыки <span class="cab-meta">(1–100, качаются действием)</span></h2><div class="cab-cards" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0 22px">' +
        keys.map(function (k) { return '<div class="skill"><span>' + esc(SKILLS[k] || k) + "</span><b>" + sk[k] + "</b>" + bar(sk[k]) + "</div>"; }).join("") + "</div></div>";
    }
    if (me.inventory) {
      var inv = me.inventory;
      var cell = function (x) { return '<div class="slot' + (x.empty ? " empty" : "") + '" title="' + esc(x.slot || "") + '">' + (x.empty ? "" : '<span class="it">' + item(x) + "</span>" + (x.durability != null ? bar(x.durability, x.durability < 20 ? "bad" : x.durability < 50 ? "warn" : "") : "")) + "</div>"; };
      h += '<div class="card cab-card"><h2>Снаряжение и инвентарь</h2><h3>Надето</h3><div class="inv inv5">' + inv.slice(0, 5).map(cell).join("") + "</div>" +
        '<h3 style="margin-top:12px">Хотбар</h3><div class="inv">' + inv.slice(5, 14).map(cell).join("") + "</div>" +
        '<h3 style="margin-top:12px">Рюкзак</h3><div class="inv">' + inv.slice(14).map(cell).join("") + "</div></div>";
    } else h += '<div class="card cab-card"><h2>Снаряжение и инвентарь</h2><p class="cab-meta">Видно, когда ты в игре.</p></div>';
    $("tab-profile").innerHTML = h;
  }

  function renderClaims() {
    var list = me.claims || [];
    if (!list.length) {
      $("tab-claims").innerHTML = '<div class="card cab-card"><h2>Приватов нет</h2><p class="cab-meta">Приват ставится в игре: возьми компас (вторая рука пустая) и держи ЛКМ по блоку 10 секунд — получится 11×11×11. Подробнее — на <a href="index.html#claims">странице приватов</a>.</p></div>';
      return;
    }
    $("tab-claims").innerHTML = '<div class="cab-cards">' + list.map(claimCard).join("") + "</div>";
    Array.prototype.forEach.call(document.querySelectorAll("[data-claim]"), wireClaim);
  }

  function claimCard(c) {
    var own = c.role >= 3, mgr = c.role >= 2;
    var xyz = String(c.center || "0 64 0").split(" ");
    var h = '<div class="card cab-card" data-claim="' + esc(c.id) + '"><h2>' + esc(c.name) + (c.clan ? ' <span class="rank r2">клан</span>' : "") + "</h2>" +
      '<p class="cab-meta">' + esc(c.world) + " · " + esc(c.size) + " · центр " + esc(c.center) + (c.role < 3 ? " · хозяин " + esc(c.owner) : "") +
      " · твоя роль: " + (own ? "хозяин" : mgr ? "управляющий" : "участник") + (c.invested ? " · вложено " + money(c.invested) : "") + "</p>" +
      '<div class="cab-row">' + mapLink(c.worldId, xyz[0], xyz[1], xyz[2]) + "</div>";
    if (own) {
      h += '<div class="cab-row"><input type="text" data-f="name" maxlength="24" value="' + esc(c.name) + '" aria-label="Название привата"><button class="btn small" data-a="rename">Переименовать</button></div>' +
        tog("doors", "Деревянные двери и люки открыты для гостей", c.guestDoors) +
        tog("explosions", "Взрывы ломают блоки (крипер, TNT)", c.explosions) +
        tog("map", "Показывать на веб-карте", !c.mapHidden);
    }
    h += "<h3 style=\"margin-top:14px\">Участники (" + c.members.length + ")</h3>";
    if (c.members.length) {
      h += '<div class="tablewrap"><table class="mtable"><thead><tr><th>Ник</th><th title="Строить и ломать">Стр.</th><th title="Сундуки, печки">Сунд.</th><th title="Двери, кнопки, рычаги">Дв.</th><th title="Управление приватом">Упр.</th>' + (mgr ? "<th></th>" : "") + "</tr></thead><tbody>" +
        c.members.map(function (m) {
          var dis = mgr ? "" : " disabled";
          var cb = function (p) { return '<td><input type="checkbox" data-perm="' + p + '" data-nick="' + esc(m.name) + '"' + (m[p] ? " checked" : "") + (p === "manager" && !own ? " disabled" : dis) + "></td>"; };
          return "<tr><td>" + esc(m.name) + "</td>" + cb("build") + cb("containers") + cb("access") + cb("manager") +
            (mgr ? '<td><button class="btn small red" data-rm="' + esc(m.name) + '" title="Убрать из привата">✕</button></td>' : "") + "</tr>";
        }).join("") + "</tbody></table></div>";
    } else h += '<p class="cab-meta">Пока никого. Добавь друга — он сможет строить и открывать сундуки.</p>';
    if (mgr) h += '<div class="cab-row"><input type="text" data-f="nick" maxlength="16" placeholder="Ник друга" aria-label="Ник"><button class="btn small green" data-a="add">Добавить</button></div>';
    if (c.clan) h += '<p class="cab-note">Клан-приват: все участники клана строят тут и так; здесь — только гости со стороны.</p>';
    return h + "</div>";
  }
  function tog(k, label, on) { return '<label class="tog"><span>' + label + '</span><input type="checkbox" data-tog="' + k + '"' + (on ? " checked" : "") + "></label>"; }

  function wireClaim(card) {
    var id = card.getAttribute("data-claim");
    var q = function (s) { return card.querySelector(s); };
    var b;
    if ((b = q('[data-a="rename"]'))) b.onclick = function () { act("/claim", {claim: id, action: "rename", name: q('[data-f="name"]').value}); };
    if ((b = q('[data-a="add"]'))) b.onclick = function () { var n = q('[data-f="nick"]').value.trim(); if (n) act("/claim", {claim: id, action: "add", nick: n}); };
    Array.prototype.forEach.call(card.querySelectorAll("[data-tog]"), function (i) {
      i.onchange = function () { act("/claim", {claim: id, action: i.getAttribute("data-tog"), value: i.checked}); };
    });
    Array.prototype.forEach.call(card.querySelectorAll("[data-perm]"), function (i) {
      i.onchange = function () { act("/claim", {claim: id, action: "perm", nick: i.getAttribute("data-nick"), perm: i.getAttribute("data-perm"), value: i.checked}); };
    });
    Array.prototype.forEach.call(card.querySelectorAll("[data-rm]"), function (x) {
      x.onclick = function () { var n = x.getAttribute("data-rm"); if (confirm("Убрать " + n + " из привата?")) act("/claim", {claim: id, action: "remove", nick: n}); };
    });
  }

  function clanList() {
    if (!clansAll) return '<div class="card cab-card"><h3>Все кланы</h3><p class="cab-meta">Загружаю…</p></div>';
    if (!clansAll.length) return '<div class="card cab-card"><h3>Все кланы</h3><p class="cab-meta">Кланов пока нет — стань первым.</p></div>';
    return '<div class="card cab-card"><h3>Все кланы (' + clansAll.length + ')</h3>' + clansAll.slice().sort(function (a, b) { return b.members - a.members; }).map(function (c) {
      return '<div class="mem"><span class="nm">[' + esc(c.tag) + "] " + esc(c.name) + '</span><span class="cab-meta">' + c.members + " уч. · лидер " + esc(c.leader) + " · налог " + c.tax + "% · приватов " + c.claims + "</span></div>";
    }).join("") + "</div>";
  }

  function renderClan() {
    if (!me) return;
    var c = me.clan, h = "";
    if (me.invite && !c) {
      h += '<div class="card cab-card"><h2>Приглашение в клан</h2><p>Тебя зовут в клан <b>[' + esc(me.invite.tag) + "] " + esc(me.invite.name) + "</b> (пригласил " + esc(me.invite.by) + ').</p>' +
        '<div class="cab-row"><button class="btn green" data-c="accept">Вступить</button><button class="btn" data-c="decline">Отказаться</button></div></div>';
    }
    if (!c) {
      h += '<div class="card cab-card"><h2>Создать клан</h2><p class="cab-meta">Цена — <b>' + money(me.clanPrice) + "</b> (у тебя " + money(me.balance) + "). Тег — 2–4 буквы или цифры, название — до 24 символов. Участников — без ограничения.</p>" +
        '<div class="cab-row"><input type="text" id="cl-tag" maxlength="4" placeholder="ТЕГ" style="max-width:110px;flex:none"><input type="text" id="cl-name" maxlength="24" placeholder="Название клана"><button class="btn gold" data-c="create">Создать</button></div>' +
        '<p class="cab-note">Что даёт клан: тег у ника, клан-чат (и здесь, на сайте), свои не бьют своих (кроме Пустошей), клан-приваты для всех участников, общий банк и налог. Подробнее — <a href="index.html#clans">Кланы</a>.</p></div>';
      $("tab-clan").innerHTML = h + clanList();
      wireClan();
      return;
    }
    var r = c.rank;
    h += '<div class="card cab-card"><h2>[' + esc(c.tag) + "] " + esc(c.name) + ' <span class="rank r' + r + '">' + RANK[r] + "</span></h2>" +
      '<div class="cab-stats">' + stat("Участников", c.members.length) + stat("Банк", money(c.bank)) + stat("Налог", c.tax + "%") + stat("Клан-приватов", c.claims) + "</div></div>";
    // клан-чат
    var chat = c.chat || [];
    h += '<div class="card cab-card"><h2>Клан-чат</h2><div class="chat" id="chat">' + (chat.length ? chat.map(function (l) {
      return '<div class="cl"><span class="tm">' + new Date(l.t).toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"}) + '</span> <b>' + esc(l.name) + "</b>" + (l.web ? ' <span class="cab-meta">(сайт)</span>' : "") + ": " + esc(l.text) + "</div>";
    }).join("") : '<p class="cab-meta">Пока тихо. Сообщения из игры (<code>!текст</code>) и с сайта видны всем в клане.</p>') + "</div>" +
      '<div class="cab-row"><input type="text" id="cl-msg" maxlength="200" placeholder="Сообщение клану" aria-label="Сообщение"><button class="btn small green" data-c="chat">Отправить</button></div></div>';
    // участники
    h += '<div class="card cab-card"><h2>Участники</h2>' + c.members.slice().sort(function (a, b) { return b.rank - a.rank || a.name.localeCompare(b.name); }).map(function (m) {
      var btns = "";
      if (m.name !== me.nick) {
        if (r === 3) btns += m.rank === 2 ? '<button class="btn small" data-c="demote" data-n="' + esc(m.name) + '">Снять зама</button>' : '<button class="btn small" data-c="promote" data-n="' + esc(m.name) + '">Сделать замом</button>';
        if (r === 3) btns += '<button class="btn small gold" data-c="transfer" data-n="' + esc(m.name) + '">Передать лидерство</button>';
        if (r > m.rank && r >= 2) btns += '<button class="btn small red" data-c="kick" data-n="' + esc(m.name) + '">Исключить</button>';
      }
      return '<div class="mem"><span class="nm">' + esc(m.name) + (m.online ? ' <span class="on">● в игре</span>' : "") + '</span><span class="rank r' + m.rank + '">' + RANK[m.rank] + "</span>" + btns + "</div>";
    }).join("") + "</div>";
    h += '<div class="cab-cards">';
    if (r >= 2) h += '<div class="card cab-card"><h3>Пригласить</h3><p class="cab-meta">Игрок должен хоть раз зайти на сервер. Приглашение — 24 часа; если он не в сети, увидит при входе (и в своём кабинете).</p><div class="cab-row"><input type="text" id="cl-inv" maxlength="16" placeholder="Ник"><button class="btn small green" data-c="invite">Пригласить</button></div></div>';
    h += '<div class="card cab-card"><h3>Банк клана</h3><p class="cab-meta">Из банка оплачивается расширение клан-приватов. Снять может только лидер.</p><div class="cab-row"><input type="number" id="cl-sum" min="1" step="1" placeholder="Сумма, $"><button class="btn small green" data-c="deposit">Внести</button>' + (r === 3 ? '<button class="btn small" data-c="withdraw">Снять</button>' : "") + "</div></div>";
    if (r === 3) h += '<div class="card cab-card"><h3>Налог клана</h3><p class="cab-meta">Доля от продаж меди, продаж на Рынке и полученных переводов участников идёт в банк. 0–' + c.maxTax + '%.</p><div class="cab-row"><input type="number" id="cl-tax" min="0" max="' + c.maxTax + '" value="' + c.tax + '"><button class="btn small" data-c="tax">Сохранить</button></div></div>';
    h += '<div class="card cab-card"><h3>' + (r === 3 ? "Распустить клан" : "Выйти из клана") + '</h3><p class="cab-meta">' + (r === 3 ? "Клан-приваты исчезнут, вложенное в них вернётся в банк, банк поделят поровну между участниками. Чтобы уйти, не распуская, — передай лидерство." : "Ты перестанешь быть участником; вернуться — по новому приглашению.") +
      '</p><button class="btn small red" data-c="' + (r === 3 ? "disband" : "leave") + '">' + (r === 3 ? "Распустить" : "Выйти") + "</button></div>";
    h += "</div>" + clanList();
    var keep = $("cl-msg") ? $("cl-msg").value : "";
    $("tab-clan").innerHTML = h;
    if (keep && $("cl-msg")) $("cl-msg").value = keep;
    var ch = $("chat"); if (ch) ch.scrollTop = ch.scrollHeight;
    wireClan();
  }

  function wireClan() {
    var msg = $("cl-msg");
    if (msg) msg.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); sendChat(); } };
    Array.prototype.forEach.call(document.querySelectorAll("#tab-clan [data-c]"), function (b) {
      b.onclick = function () {
        var a = b.getAttribute("data-c"), n = b.getAttribute("data-n"), args = [];
        if (a === "chat") { sendChat(); return; }
        if (a === "create") { args = [$("cl-tag").value.trim()].concat($("cl-name").value.trim().split(/\s+/)); if (!confirm("Создать клан за " + money(me.clanPrice) + "?")) return; }
        else if (a === "invite") args = [$("cl-inv").value.trim()];
        else if (a === "deposit" || a === "withdraw") args = [$("cl-sum").value];
        else if (a === "tax") args = [$("cl-tax").value];
        else if (n) args = [n];
        if (a === "kick" && !confirm("Исключить " + n + " из клана?")) return;
        if (a === "transfer" && !confirm("Передать лидерство " + n + "? Ты станешь заместителем.")) return;
        if (a === "disband" && !confirm("Точно распустить клан? Это нельзя отменить.")) return;
        if (a === "leave" && !confirm("Выйти из клана?")) return;
        act("/clan", {action: a, args: args});
      };
    });
  }
  function sendChat() {
    var i = $("cl-msg"), t = i ? i.value.trim() : "";
    if (!t) return;
    api("/clan", {action: "chat", args: [t]}).then(function (j) {
      if (!j.ok) { toast(j.message || "Не отправлено.", true); return; }
      i.value = "";
      load(false);
    });
  }

  function renderMarketShell() { $("tab-market").innerHTML = '<p class="cab-meta">Загружаю Рынок…</p>'; }

  function renderMarket() {
    if (!me) return;
    var mk = me.market || {mine: [], storage: [], notices: []}, h = "";
    if (mk.notices && mk.notices.length) h += '<div class="card cab-card note-card"><h2>Пока тебя не было</h2>' + mk.notices.map(function (n) { return '<p class="cab-meta">• ' + esc(n) + "</p>"; }).join("") + '<p class="cab-note">Эти сообщения придут и в игре при входе.</p></div>';
    h += '<div class="cab-cards">';
    h += '<div class="card cab-card"><h3>Мои лоты (' + mk.mine.length + ")</h3>" + (mk.mine.length ? mk.mine.map(function (l) {
      var left = Math.max(0, Math.round((l.expires - Date.now()) / 60000));
      return '<div class="mem"><span class="nm">' + item(l) + '</span><b>' + money(l.price) + '</b><span class="cab-meta">ещё ' + (left >= 60 ? Math.floor(left / 60) + " ч " : "") + (left % 60) + ' мин</span><button class="btn small" data-m="unlist" data-id="' + l.id + '">Снять</button></div>';
    }).join("") : '<p class="cab-meta">Нет лотов. Выставить — в игре у NPC «Рынок»: предмет в руку → «Продать» (или <code>/market sell цена</code>).</p>') + "</div>";
    h += '<div class="card cab-card"><h3>Склад (' + mk.storage.length + ')</h3><p class="cab-meta">Непроданное, снятое и купленное на сайте. Забрать — у NPC «Рынок» в лобби, вкладка «Склад».</p>' +
      (mk.storage.length ? mk.storage.map(function (s) { return '<div class="mem"><span class="nm">' + item(s) + "</span></div>"; }).join("") : '<p class="cab-meta">Пусто.</p>') + "</div>";
    h += "</div>";
    // витрина
    h += '<div class="card cab-card"><h2>Витрина Рынка</h2><p class="cab-meta">Купить с сайта: деньги — сразу, предмет — на твой Склад (забрать у NPC). Комиссия ' + Math.round(mk.commission || 10) + '% платит продавец.</p>' +
      '<div class="cab-row"><input type="text" id="mk-q" placeholder="Поиск: diamond, книга…" value="' + esc(mkFilter.q) + '"><select id="mk-sort" class="cab-sel"><option value="new">сначала новые</option><option value="cheap">сначала дешёвые</option><option value="dear">сначала дорогие</option></select></div>' +
      '<div class="chips" id="mk-cats">' + CATS.map(function (c) { return '<button class="chip" data-cat="' + c[0] + '" aria-selected="' + (mkFilter.cat === c[0]) + '">' + c[1] + "</button>"; }).join("") + "</div>";
    if (!market) h += '<p class="cab-meta">Загружаю…</p>';
    else {
      var lots = market.lots.filter(function (l) {
        return (mkFilter.cat === "all" || l.cat === mkFilter.cat) && (!mkFilter.q || (l.item + " " + l.material + " " + l.seller).toLowerCase().indexOf(mkFilter.q.toLowerCase()) >= 0);
      });
      if (mkFilter.sort === "cheap") lots.sort(function (a, b) { return a.price - b.price; });
      if (mkFilter.sort === "dear") lots.sort(function (a, b) { return b.price - a.price; });
      h += lots.length ? '<div class="tablewrap"><table class="mtable lots"><thead><tr><th>Товар</th><th>Цена</th><th>Средняя</th><th>Продавец</th><th></th></tr></thead><tbody>' + lots.map(function (l) {
        var mine = l.seller === me.nick;
        return "<tr><td>" + item(l) + "</td><td><b>" + money(l.price) + "</b></td><td>" + (l.avg ? money(l.avg) + "/шт" : "—") + "</td><td>" + esc(l.seller) + "</td><td>" +
          (mine ? '<button class="btn small" data-m="unlist" data-id="' + l.id + '">Снять</button>' : '<button class="btn small green" data-m="buy" data-id="' + l.id + '" data-p="' + l.price + '" data-n="' + esc(l.item) + '">Купить</button>') + "</td></tr>";
      }).join("") + "</tbody></table></div>" : '<p class="cab-meta">Ничего не нашлось.</p>';
    }
    h += "</div>";
    var hadFocus = document.activeElement && document.activeElement.id === "mk-q";
    $("tab-market").innerHTML = h;
    var q = $("mk-q"), so = $("mk-sort");
    if (so) so.value = mkFilter.sort;
    if (q) { q.oninput = function () { mkFilter.q = q.value; var pos = q.selectionStart; renderMarket(); var n = $("mk-q"); n.focus(); n.setSelectionRange(pos, pos); }; if (hadFocus) q.focus(); }
    if (so) so.onchange = function () { mkFilter.sort = so.value; renderMarket(); };
    Array.prototype.forEach.call(document.querySelectorAll("#mk-cats .chip"), function (b) { b.onclick = function () { mkFilter.cat = b.getAttribute("data-cat"); renderMarket(); }; });
    Array.prototype.forEach.call(document.querySelectorAll("#tab-market [data-m]"), function (b) {
      b.onclick = function () {
        var a = b.getAttribute("data-m"), id = Number(b.getAttribute("data-id"));
        if (a === "buy" && !confirm("Купить «" + b.getAttribute("data-n") + "» за " + money(b.getAttribute("data-p")) + "? Предмет ляжет на Склад Рынка.")) return;
        if (a === "unlist" && !confirm("Снять лот? Предмет уйдёт на Склад.")) return;
        act("/market", {action: a, id: id});
      };
    });
  }

  function renderAch() {
    var l = me.achievements || [], done = l.filter(function (a) { return a.done; }).length;
    $("tab-ach").innerHTML = '<p class="cab-meta">Получено ' + done + " из " + l.length + ". Награду забирай у <b>Гида</b> в лобби (ПКМ → «Ачивки»).</p>" +
      '<div class="cab-cards">' + l.map(function (a) {
        var p = Math.round(100 * a.progress / Math.max(1, a.amount));
        var st = a.claimed ? "✔ награда получена" : a.done ? "✔ забери " + money(a.reward) + " у Гида" : a.progress + " / " + a.amount;
        return '<div class="card ach' + (a.done ? " done" : "") + '"><h3>' + esc(a.title) + '</h3><span class="st">' + (a.done ? "" : money(a.reward) + " · ") + st + "</span><p>" + esc(a.desc) + "</p>" + (a.done ? "" : bar(p)) + "</div>";
      }).join("") + "</div>";
  }

  function renderHelp() {
    $("tab-help").innerHTML = '<div class="card cab-card"><h2>Как это работает</h2><ul class="cab-steps" style="list-style:disc">' +
      "<li><b>Синхронизация:</b> кабинет берёт данные прямо с сервера и сам обновляется каждые 20 секунд (пока ты ничего не печатаешь). Всё, что ты меняешь здесь, сразу действует в игре — и наоборот.</li>" +
      "<li><b>Профиль:</b> где ты сейчас, здоровье, снаряжение и инвентарь (когда в игре), дома по мирам, места в рейтингах, тело, все навыки, статистика.</li>" +
      "<li><b>Приваты:</b> название, друзья и их права, двери для гостей, взрывы, видимость на карте, кнопка «На карте». Расширить, уменьшить или удалить — только в игре, компасом.</li>" +
      "<li><b>Клан:</b> создать, вступить по приглашению, клан-чат (сообщения видят и в игре), звания, исключить, передать лидерство, банк и налог, список всех кланов.</li>" +
      "<li><b>Рынок:</b> купить с сайта (предмет — на Склад, забрать у NPC «Рынок»), снять свой лот, посмотреть Склад и что продалось, пока тебя не было. Выставить на продажу — в игре.</li>" +
      "<li><b>Безопасность:</b> вход — только кодом из игры (<code>/account</code>). Потерял телефон или вошёл на чужом компьютере — напиши в игре <code>/account logout</code>: выйдут все устройства. Сессия живёт 30 дней с последнего визита.</li></ul></div>";
  }

  // ---------------------------------------------------------------- старт
  var h0 = (location.hash || "").replace("#", "");
  if (TABS.indexOf(h0) >= 0) tab = h0;
  if (tok()) { show("load"); load(true); } else show("login");
})();
