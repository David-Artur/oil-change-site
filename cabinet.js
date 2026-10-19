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
  var me = null, market = null, clansAll = null, tab = "home", lastSync = 0, mkFilter = {q: "", cat: "all", sort: "new"};

  var SKILLS = {"walk":"Ходьба","sprint":"Бег","sneak":"Ходьба вприсядку","jump":"Прыжок в высоту","fall":"Падение","swim":"Плавание","swim_fast":"Быстрое плавание",
    "wade":"Ходьба в воде","breath":"Дыхание","riding":"Верховая езда","minecart":"Вагонетка","strength":"Сила удара","crit":"Критический удар","reach":"Дальность удара",
    "knockback":"Отбрасывание","shield":"Блок щитом","defense":"Защита","regen":"Регенерация здоровья","throwing":"Метание","suffocation_res":"Стойкость к удушью",
    "fire_res":"Стойкость к огню","poison_res":"Стойкость к ядам","mining":"Ломание блоков","ore_yield":"Добыча ресурсов","farming":"Фермерство","stomach":"Крепкий желудок",
    "injury_res":"Стойкость к травмам","adrenaline":"Адреналин","stamina":"Выносливость","second_wind":"Второе дыхание","stealth":"Скрытность","glide":"Полёт",
    "hardiness":"Акклиматизация","cold_tol":"Морозостойкость","heat_tol":"Жаростойкость","wet_res":"Привычка к сырости","first_aid":"Первая помощь","fishing":"Рыбалка","build":"Строительство","bow":"Стрельба из лука","crossbow":"Стрельба из арбалета"};
  var BODY = [["head", "Голова"], ["torso", "Туловище"], ["left_arm", "Левая рука"], ["right_arm", "Правая рука"], ["left_leg", "Левая нога"], ["right_leg", "Правая нога"]];
  var RANK = {3: "лидер", 2: "заместитель", 1: "участник"};
  var RANKS = {level: "Уровень", money: "Деньги", pvp: "PvP", mobs: "Мобы", time: "Время в игре", market: "Оборот Рынка", ach: "Ачивки"};
  var CATS = [["all", "Все"], ["res", "Ресурсы"], ["blocks", "Блоки"], ["tools", "Снаряжение"], ["magic", "Магия"], ["food", "Еда"], ["other", "Другое"]];
  var TABS = ["home", "land", "market", "rewards", "acct", "donate"];   // 2026-10-18: вкладки объединены (старые адреса — OLD_TABS)
  var OLD_TABS = {profile: "home", voice: "home", claims: "land", clan: "land", ach: "rewards", bonus: "rewards", account: "acct", help: "acct"};
  var homeMounted = false;   // У237: «Главная» — второй экран (home.js; голос — voice.js внутри неё)
  var donTiers = null, donLoading = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  function money(v) { return "$" + Number(v || 0).toLocaleString("ru-RU", {maximumFractionDigits: 2}); }
  function getTok() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setTok(t) { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch (e) { } }
  var memTok = null;
  function tok() { return memTok || getTok(); }
  function item(it) { return esc((it.item || it.material || "?").replace(/_/g, " ")) + (it.amount > 1 ? " ×" + it.amount : "") + (it.enchanted ? ' <span class="ench" title="Зачарован">✦</span>' : ""); }
  // ---------------------------------------------------------------- предметы как в Minecraft (иконки и названия — mc-icons.js)
  function mcName(it) {
    var m = String(it.material || "").toLowerCase(), plain = m.replace(/_/g, " ");
    return it.item && it.item !== plain ? it.item : ((window.MC_RU || {})[m] || plain || "?");
  }
  function mcIcon(mat) {
    var I = (window.MC_ICONS || {})[String(mat || "").toLowerCase()], u = function (t) { return "background-image:url(img/mc/" + t + ".png)"; };
    if (!I) return '<span class="mci mci-x">?</span>';
    if (I[0] === "i") return '<span class="mci" style="' + u(I[1]) + '"></span>';
    return '<span class="mcb"><i class="t" style="' + u(I[1]) + '"></i><i class="l" style="' + u(I[2]) + '"></i><i class="r" style="' + u(I[3]) + '"></i></span>';
  }
  // ячейка: it — предмет или пусто; extra — {cls, attrs, tip:[строки]}
  function mcSlot(it, extra) {
    extra = extra || {};
    var empty = !it || it.empty, tip = "";
    if (!empty) tip = [mcName(it) + (it.amount > 1 ? " ×" + it.amount : "")].concat(it.enchanted ? ["✦ зачарован"] : [], it.durability != null ? ["прочность " + it.durability + "%"] : [], extra.tip || []).join("\n");
    var h = '<button type="button" class="mcs' + (empty ? " empty" : "") + (it && it.enchanted ? " ench" : "") + (extra.cls ? " " + extra.cls : "") + '"' + (tip ? ' data-tip="' + esc(tip) + '"' : "") +
      (empty && extra.ph ? ' data-ph="' + extra.ph + '"' : "") + (extra.attrs || "") + (empty && !extra.attrs ? " tabindex=\"-1\"" : "") + ">";
    if (!empty) {
      h += mcIcon(it.material) + (it.amount > 1 ? '<b class="mcc">' + it.amount + "</b>" : "");
      if (it.durability != null && it.durability < 100) h += '<i class="mcd"><i style="width:' + Math.max(4, it.durability) + "%;background:hsl(" + Math.round(it.durability * 1.2) + ',90%,45%)"></i></i>';
    }
    return h + "</button>";
  }
  // окно инвентаря как в игре: броня + вторая рука, рюкзак 3×9, хотбар. sell=true — ячейки кликаются (продажа) и перетаскиваются
  var ARMOR_PH = ["helmet", "chestplate", "leggings", "boots"];
  function mcInventory(inv, sell) {
    var at = function (x, i) {   // i — индекс в me.inventory (0–3 броня, 4 вторая рука, 5–13 хотбар, 14–40 рюкзак); слот игры: 40 — вторая рука, 0–35
      var slot = i === 4 ? 40 : i - 5, can = sell && i >= 4 && x && !x.empty;
      return mcSlot(x, {ph: i < 4 ? ARMOR_PH[i] : i === 4 ? "shield" : "", cls: can ? "sellable" : "",
        attrs: can ? ' data-sell="' + slot + '" draggable="true"' : "", tip: can ? ["нажми — продать"] : []});
    };
    var cells = inv.map(at);
    return '<div class="mcwin mcinv"><div class="mc-top"><div class="mc-armor">' + cells.slice(0, 4).join("") + '</div><div class="mc-me"><b>' + esc(me.nick) + "</b>" +
      (me.where ? '<span>' + esc(me.where.world) + "</span>" : "") + '</div><div class="mc-off">' + cells[4] + "</div>" +
      (sell ? '<div class="mc-sellbox"><span>Продать</span>' + mcSlot(null, {cls: "drop", attrs: ' id="mc-drop"'}) + "</div>" : "") + "</div>" +
      '<div class="mcgrid">' + cells.slice(14).join("") + '</div><div class="mcgrid mc-hot">' + cells.slice(5, 14).join("") + "</div></div>";
  }
  // всплывающая подсказка (как в игре): мышь — при наведении, палец — по нажатию
  var tipEl = document.createElement("div"); tipEl.className = "mctip"; tipEl.hidden = true; document.body.appendChild(tipEl);
  function showTip(el) {
    var t = el.getAttribute("data-tip"); if (!t) return;
    var ls = t.split("\n");
    tipEl.innerHTML = '<b class="' + (el.classList.contains("ench") ? "aq" : "") + '">' + esc(ls[0]) + "</b>" + ls.slice(1).map(function (l) { return "<span>" + esc(l) + "</span>"; }).join("");
    tipEl.hidden = false;
    var r = el.getBoundingClientRect(), w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
    var x = Math.min(window.innerWidth - w - 6, Math.max(6, r.right + 6)), y = r.top - hh - 6 < 6 ? r.bottom + 6 : r.top - hh - 6;
    if (r.right + 6 + w > window.innerWidth) x = Math.max(6, r.left - w - 6);
    tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
  }
  document.addEventListener("mouseover", function (e) { var s = e.target.closest && e.target.closest("[data-tip]"); if (s) showTip(s); else tipEl.hidden = true; });
  document.addEventListener("scroll", function () { tipEl.hidden = true; }, true);
  function mapLink(worldId, x, y, z, label) {
    // У280: своя карта daviart.com/map.html#мир/x/z/зум (раньше — BlueMap на mc.daviart.com, у части игроков не открывался)
    return '<a class="btn small" target="_blank" rel="noopener" href="map.html#' + encodeURIComponent(worldId) + "/" + Math.round(x) + "/" + Math.round(z) + '/19">' + (label || "🗺 На карте") + "</a>";
  }
  function ago(t) { var s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? s + " с" : Math.round(s / 60) + " мин"; }
  // У276: цвета Minecraft «&x» (роли и теги кланов) → значок-«таблетка» с читаемым текстом в обеих темах
  var MC_COL = {"0": "#000000", "1": "#0000AA", "2": "#00AA00", "3": "#00AAAA", "4": "#AA0000", "5": "#AA00AA", "6": "#FFAA00", "7": "#AAAAAA",
    "8": "#555555", "9": "#5555FF", "a": "#55FF55", "b": "#55FFFF", "c": "#FF5555", "d": "#FF55FF", "e": "#FFFF55", "f": "#FFFFFF"};
  function mcColor(c) {
    var s = String(c == null ? "" : c).trim(), m = /^[&§]([0-9a-f])$/i.exec(s);
    if (m) return MC_COL[m[1].toLowerCase()];
    return /^#[0-9a-f]{6}$/i.test(s) ? s : null;
  }
  function pill(text, col, cls) {
    var hex = mcColor(col);
    if (!hex) return '<span class="rank' + (cls ? " " + cls : "") + '">' + esc(text) + "</span>";
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return '<span class="rank role-pill' + (cls ? " " + cls : "") + '" style="background:' + hex + ";border-color:" + hex + ";color:" + ((r * 299 + g * 587 + b * 114) / 1000 > 140 ? "#1a1a1a" : "#fff") + '">' + esc(text) + "</span>";
  }
  function when(t) { return t ? new Date(t).toLocaleString("ru-RU", {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"}) : "—"; }

  // У215: скопировать «/ref <ник>» для друга
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest("#ref-copy") || !me) return;
    var t = "/ref " + me.nick;
    var ok = function () { toast("Скопировано: " + t + " — отправь другу"); }, no = function () { toast("Скажи другу написать в игре: " + t); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(ok, no); else no();
  });

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
    api("/login", {nick: $("f-nick").value.trim(), password: $("f-pass").value}).then(function (j) {
      if (!j.ok) { m.textContent = j.message || "Не получилось."; return; }
      $("f-pass").value = "";
      memTok = j.token;
      setTok(j.token);
      m.className = "cab-msg ok";
      m.textContent = j.message;
      load(true);
    });
  });

  // ---------------------------------------------------------------- забыл пароль (код на привязанную почту)
  function recMode(on) { $("login-form").hidden = on; $("recover-form").hidden = !on; $("rec-msg").textContent = ""; }
  $("forgot-link").onclick = function (e) { e.preventDefault(); $("r-nick").value = $("f-nick").value; recMode(true); };
  $("back-login").onclick = function (e) { e.preventDefault(); recMode(false); $("rec-step1").hidden = false; $("rec-step2").hidden = true; };
  $("r-send").onclick = function () {
    var m = $("rec-msg"); m.className = "cab-msg"; m.textContent = "Отправляю…";
    api("/recover", {step: "request", nick: $("r-nick").value.trim(), email: $("r-email").value.trim()}).then(function (j) {
      m.className = "cab-msg" + (j.ok ? " ok" : ""); m.textContent = j.message || "";
      if (j.ok) { $("rec-step1").hidden = true; $("rec-step2").hidden = false; }
    });
  };
  $("r-reset").onclick = function () {
    var m = $("rec-msg"); m.className = "cab-msg";
    if ($("r-pass").value !== $("r-pass2").value) { m.textContent = "Пароли не совпадают."; return; }
    api("/recover", {step: "reset", nick: $("r-nick").value.trim(), code: $("r-code").value.trim(), password: $("r-pass").value}).then(function (j) {
      m.textContent = j.message || "";
      if (!j.ok) return;
      m.className = "cab-msg ok";
      memTok = j.token; setTok(j.token);
      recMode(false);
      load(true);
    });
  };

  $("logout").addEventListener("click", function () {
    api("/logout", {}).then(function () { memTok = null; setTok(null); me = null; stopSync(); show("login"); toast("Вы вышли из кабинета."); });
  });

  Array.prototype.forEach.call(document.querySelectorAll("#tabs .chip[data-tab]"), function (b) {
    b.addEventListener("click", function () {
      setTab(b.getAttribute("data-tab"));
      var v = $("cab-view"), y = v ? v.getBoundingClientRect().top + window.scrollY : 0;   // прокручено вниз — к началу вкладки
      if (window.scrollY > y) window.scrollTo(0, y);
    });
  });

  function setTab(t) {
    t = OLD_TABS[t] || t;
    tab = t;
    Array.prototype.forEach.call(document.querySelectorAll("#tabs .chip[data-tab]"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t); });
    TABS.forEach(function (x) { $("tab-" + x).hidden = x !== t; });
    $("cab-view").classList.toggle("on-donate", t === "donate");   // на «Донате» полоса бонуса не дублирует карточку
    try { history.replaceState(null, "", "#" + t); } catch (e) { }
    var ch = document.querySelector('#tabs .chip[data-tab="' + t + '"]');   // выбранная вкладка — в видимую часть полосы (телефон)
    if (ch && ch.scrollIntoView) try { ch.scrollIntoView({block: "nearest", inline: "nearest"}); } catch (e) { }
    if (t === "market" && !market) loadMarket();
    if (t === "market") markNoticesSeen();
    if (t === "land" && !clansAll) loadClans();
    if (t === "donate" && me) renderDonate();
    if (t === "rewards" && me) { loadBonus(); loadRefFriends(); }
    if (t === "home" && !homeMounted && me) {
      homeMounted = true;
      if (window.VPHome) window.VPHome.mount($("home-live"), {api: api, toast: toast, me: function () { return me; }, money: money, mapLink: mapLink, skills: SKILLS,
        setTab: function (x) { setTab(x); var v = $("cab-view"); if (v) window.scrollTo(0, v.getBoundingClientRect().top + window.scrollY); }});
      else $("home-live").innerHTML = '<div class="card cab-card"><p class="cab-meta">Не загрузилась «Главная» — обнови страницу.</p></div>';
    }
    if (window.VPHome && homeMounted) window.VPHome.show(t === "home");
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

  // ---------------------------------------------------------------- 2026-10-19 (У271): «Награды» — твой партнёрский код, кто пришёл, друзья
  var refFriends = null;
  function profileLink(n) { return '<a class="ref-nick" href="https://daviart.com/p/' + encodeURIComponent(n) + '" target="_blank" rel="noopener">' + esc(n) + "</a>"; }
  function since(t) {
    if (!t) return "—";
    var m = Math.floor((Date.now() - ms(t)) / 60000);
    return m < 2 ? "только что" : m < 60 ? m + " мин назад" : m < 1440 ? Math.floor(m / 60) + " ч назад" : Math.floor(m / 1440) + " дн назад";
  }
  function ms(t) { return t && t < 1e12 ? t * 1000 : t; }   // VPRef хранит время в секундах, Bukkit — в мс
  function day(t) { return t ? new Date(ms(t)).toLocaleDateString("ru-RU", {day: "numeric", month: "short"}) : "—"; }
  function loadRefFriends() {
    api("/friends", {action: "list"}).then(function (j) { if (j && j.friends) { refFriends = j.friends; renderRefs(); } });
  }
  function renderRefs() {
    var box = $("tab-refs"); if (!box || !me) return;
    // владелец 2026-10-19: несколько кодов у игрока — свой ник (у всех) и коды партнёра (ютуберам); у каждого кода — свой список
    var r = me.ref, h = "";
    var codes = (r && r.codes) || [{code: me.nick, kind: "friend", referrals: []}];
    codes.forEach(function (c, i) {
      var list = c.referrals || [], cmd = "/ref " + (c.kind === "partner" ? String(c.code).toLowerCase() : c.code);
      if (c.kind === "partner") {
        var s = c.stats || {};
        h += '<div class="card cab-card ref-partner"><h2>🎥 Код партнёра: <code>' + esc(c.code) + "</code></h2>" +
          '<p class="cab-meta">Новичок в <b>первые ' + (r.windowMinutes || 60) + " мин</b> игры пишет в чат <code>" + esc(cmd) +
          "</code> (большие или маленькие буквы — не важно) — ему <b>прокачка ×" + (r.mult || 2) + " до " + (r.untilLevel || 20) + " уровня</b>.</p>";
        h += '<div class="ref-code"><code id="ref-c' + i + '">' + esc(cmd) + '</code><button class="btn small gold" type="button" data-copy="ref-c' + i + '">Копировать</button></div>' +
          '<div class="ref-stats"><span>Пришло: <b>' + (s.players || 0) + "</b></span><span>Активны: <b>" + (s.active || 0) + "</b></span>" +
          "<span>Донаты их: <b>" + esc(s.donations || "0 ₽") + "</b></span><span>Тебе начислено: <b>" + esc(s.earned || "0 ₽") + "</b></span>" +
          "<span>К выплате: <b>" + esc(s.available || "0 ₽") + "</b></span></div>";
      } else {
        h += '<div class="card cab-card"><h2>👥 Пришли по твоему нику <code>' + esc(cmd) + "</code></h2>" +
          '<p class="cab-meta">«Приведи друга»: новичку — прокачка ×' + (r && r.mult || 2) + " до " + (r && r.friendUntilLevel || 10) + " уровня, тебе — " +
          money(r && r.friendReward || 1000) + ", когда он дорастёт до " + (r && r.friendUntilLevel || 10) + " уровня.</p>";
      }
      h += '<h3 class="ref-sub">Кто пришёл' + (list.length ? ' <span class="cab-meta">· ' + list.length + "</span>" : "") + "</h3>";
      if (!list.length) h += '<p class="cab-meta">По этому коду пока никого.</p>';
      else {
        h += '<div class="ref-table"><div class="ref-row ref-head"><span>Игрок</span><span>' + (c.kind === "friend" ? "Награда тебе" : "Пришёл") + "</span><span>Уровень</span><span>Ускорение</span><span>В игре</span></div>";
        h += list.map(function (x) {
          var boost = x.boostEnded || !x.boostLeft ? '<span class="cab-meta">закончилось</span>' : '<span class="ref-on">×' + (r.mult || 2) + " идёт</span>";
          var mid = c.kind === "friend" ? (x.reward === "paid" ? "<b>" + money(r.friendReward || 1000) + " получено</b>" : x.reward ? esc(x.reward) : "ждём " + (r.friendUntilLevel || 10) + " ур.")
            : day(x.enteredAt);
          return '<div class="ref-row"><span>' + profileLink(x.name) + (c.kind === "friend" ? '<small class="cab-meta"> · ' + day(x.enteredAt) + "</small>" : "") + "</span><span>" + mid +
            "</span><span>ур. <b>" + (x.level || "—") + "</b></span><span>" + boost + "</span><span>" + (x.online ? '<span class="ref-on">● сейчас</span>' : since(x.lastSeen)) + "</span></div>";
        }).join("") + "</div>";
      }
      h += "</div>";
    });
    if (refFriends) {
      h += '<div class="card cab-card"><h2>🤝 Друзья' + (refFriends.length ? ' <span class="cab-meta">· ' + refFriends.length + "</span>" : "") + "</h2>";
      h += refFriends.length ? '<div class="ref-friends">' + refFriends.map(function (f) {
        return '<div class="ref-fr">' + profileLink(f.name || f.nick) + ' <span class="cab-meta">' + (f.online ? '<span class="ref-on">● в игре</span>' + (f.world ? " · " + esc(f.world) : "") : (f.lastSeen ? "был " + since(f.lastSeen) : "")) + "</span></div>";
      }).join("") + "</div>" : '<p class="cab-meta">Друзей пока нет — добавь на «Главной» или в игре: <code>/friend add Ник</code>.</p>';
      h += "</div>";
    }
    box.innerHTML = h;
    Array.prototype.forEach.call(box.querySelectorAll("[data-copy]"), function (b) {
      b.onclick = function () { var t = $(b.getAttribute("data-copy")).textContent; try { navigator.clipboard.writeText(t); toast("Скопировано: " + t); } catch (e) { } };
    });
  }

  // 2026-10-19 (владелец: «на „Рынке“ горит 1, нажимаешь — ничего, не пропадает»): раньше на «Рынке» считалось и приглашение в клан,
  // которое видно только на «Земли и клан» (а если уже в клане — нигде). Теперь: «Рынок» — только непрочитанные сообщения рынка
  // (открыл вкладку — прочитано, запоминается в браузере), «Земли и клан» — приглашение в клан, только если ты не в клане.
  function noticesKey() { return ((me && me.market && me.market.notices) || []).join("\n"); }
  function seenNotices() { try { return localStorage.getItem("cab-mk-seen:" + me.nick) || ""; } catch (e) { return ""; } }
  function renderBadges() {
    if (!me) return;
    var nt = (me.market && me.market.notices) || [];
    var n = nt.length && noticesKey() !== seenNotices() ? nt.length : 0;
    var badge = $("tab-badge"); if (badge) { badge.textContent = n ? String(n) : ""; badge.hidden = !n; }
    var land = document.querySelector('#tabs .chip[data-tab="land"]');
    if (land) {
      var lb = land.querySelector(".badge");
      if (!lb) { lb = document.createElement("span"); lb.className = "badge"; land.appendChild(document.createTextNode(" ")); land.appendChild(lb); }
      var inv = me.invite && !me.clan ? 1 : 0, dl = Array.isArray(me.deals) ? me.deals.length : 0;   // У276: + входящие предложения приватов
      lb.textContent = inv + dl ? String(inv + dl) : ""; lb.hidden = !(inv + dl);
      lb.title = [inv ? "Тебя зовут в клан" : "", dl ? "Тебе предлагают приват" : ""].filter(Boolean).join(" · ");
    }
  }
  function markNoticesSeen() { if (!me) return; try { localStorage.setItem("cab-mk-seen:" + me.nick, noticesKey()); } catch (e) { } renderBadges(); }

  // ---------------------------------------------------------------- отрисовка
  function render() {
    $("me-nick").textContent = me.nick;
    if ($("ref-cmd")) $("ref-cmd").textContent = "/ref " + me.nick;   // У215: «Приведи друга» — код = ник
    renderRefs();
    $("me-dot").className = "dot" + (me.online ? " on" : "");
    $("me-online").textContent = me.online ? "в игре сейчас" + (me.where ? " · " + me.where.world : "") : (me.lastSeen ? "был в игре " + new Date(me.lastSeen).toLocaleString("ru-RU") : "");
    $("me-bal").textContent = money(me.balance);
    $("me-lvl").textContent = me.level || "—";
    $("me-clan").textContent = me.clan ? "[" + me.clan.tag + "]" : "нет";
    renderBadges();
    renderBonusBar();
    if (window.VPHome && homeMounted) window.VPHome.refresh();
    renderProfile();
    renderClaims();
    renderClan();
    renderAch();
    renderAccount();
    renderHelp();
    renderDonate();
    skinSetup();
    if (market) renderMarket(); else renderMarketShell();
    setTab(tab);
  }

  function bar(v, cls) { return '<div class="bar ' + (cls || "") + '"><i style="width:' + Math.max(0, Math.min(100, v)) + '%"></i></div>'; }
  function stat(l, v) { return '<div class="cab-stat"><span class="lbl">' + l + "</span><b>" + (v == null ? "—" : v) + "</b></div>"; }

  function renderProfile() {   // 2026-10-18: «Профиль» — нижняя часть «Главной»; живое (где ты, тело) — выше, в home.js
    var s = me.stats || {}, h = "", box = $("profile-body");
    var open = {};
    Array.prototype.forEach.call(box.querySelectorAll("details[data-k]"), function (d) { open[d.getAttribute("data-k")] = d.open; });
    var sec = function (k, title, body, def) {
      var isOpen = open[k] == null ? def : open[k];
      return '<details class="card cab-card cab-fold" data-k="' + k + '"' + (isOpen ? " open" : "") + "><summary><h2>" + title + "</h2></summary>" + body + "</details>";
    };
    h += sec("inv", "🎒 Инвентарь", me.inventory ? '<p class="cab-meta">Наведи (или нажми) на предмет — название и прочность. Продать — во вкладке «Рынок», когда ты в лобби.</p>' + mcInventory(me.inventory, false)
      : '<p class="cab-meta">Видно, когда ты в игре.</p>', true);
    var sk = me.skills || {}, keys = Object.keys(sk);
    if (keys.length) {
      keys.sort(function (a, c) { return (sk[c] - sk[a]) || ((SKILLS[a] || a).localeCompare(SKILLS[c] || c)); });
      h += sec("skills", "📈 Все навыки <span class=\"cab-meta\">(1–100)</span>", '<div class="cab-cards" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0 18px">' +
        keys.map(function (k) { return '<div class="skill"><span>' + esc(SKILLS[k] || k) + "</span><b>" + sk[k] + "</b>" + bar(sk[k]) + "</div>"; }).join("") + "</div>", false);
    }
    var st = '<div class="cab-stats">' +
      stat("В игре", s.playMinutes != null ? (Math.floor(s.playMinutes / 60) + " ч " + (s.playMinutes % 60) + " мин") : "—") +
      stat("Смертей", s.deaths) + stat("Убито мобов", s.mobKills) + stat("Убито игроков", s.playerKills) +
      stat("Пройдено", s.walkCm != null ? (s.walkCm / 100000).toFixed(1) + " км" : "—") + stat("Прыжков", s.jumps) +
      stat("На сервере с", me.firstPlayed ? new Date(me.firstPlayed).toLocaleDateString("ru-RU") : "—") + "</div>";
    var rk = me.ranks || {}, rkeys = Object.keys(RANKS).filter(function (k) { return rk[k]; });
    if (rkeys.length) st += '<h3 class="don-sub">Места в рейтингах</h3><div class="cab-stats">' + rkeys.map(function (k) {
      var r = rk[k];
      return stat(RANKS[k], r.rank ? "#" + r.rank + ' <span class="cab-meta">из ' + r.of + (r.value ? " · " + esc(r.value) : "") + "</span>" : '<span class="cab-meta">нет в таблице</span>');
    }).join("") + '</div><p class="cab-note">В игре — <code>/top</code>.</p>';
    h += sec("stats", "📊 Статистика и рейтинги", st, false);
    var homes = me.homes || [];
    h += sec("homes", "🏠 Дома", homes.length ? homes.map(function (x) {
      return '<div class="mem"><span class="nm">' + esc(x.world) + '</span><span class="cab-meta">' + x.x + " " + x.y + " " + x.z + "</span>" + mapLink(x.worldId, x.x, x.y, x.z) + "</div>";
    }).join("") : '<p class="cab-meta">Домов нет. В каждом мире (1–3) — свой: встань на место и напиши <code>/sethome</code>.</p>', false);
    $("profile-body").innerHTML = h;
  }

  function renderClaims() {
    var list = me.claims || [], deals = Array.isArray(me.deals) ? me.deals : [], h = "";
    if (deals.length) h += dealsHtml(deals);   // У276: входящие предложения — сверху
    if (!list.length) h += '<div class="card cab-card"><h2>Приватов нет</h2><p class="cab-meta">Приват ставится в игре: возьми компас (вторая рука пустая) и держи ЛКМ по блоку 10 секунд — получится 11×11×11. Подробнее — на <a href="index.html#claims">странице приватов</a>.</p></div>';
    // У276: сервер 0.9.13+ присылает claim.can — тогда список карточек со ссылкой на страницу привата; старый сервер — как раньше
    else h += '<div class="cab-cards">' + list.map(function (c) { return c && c.can && typeof c.can === "object" ? claimItem(c) : claimCard(c); }).join("") + "</div>";
    $("tab-claims").innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll("#tab-claims [data-claim]"), wireClaim);
    Array.prototype.forEach.call(document.querySelectorAll("#tab-claims [data-deal]"), function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-id"), d = deals.filter(function (x) { return String(x.id) === id; })[0] || {}, yes = b.getAttribute("data-deal") === "accept";
        if (yes && !confirm("Принять приват «" + (d.claim || "?") + "»" + (d.forClan ? " для клана" : "") + (Number(d.price) > 0 ? " за " + money(d.price) : " бесплатно") + "?")) return;
        if (!yes && !confirm("Отказаться от привата «" + (d.claim || "?") + "»?")) return;
        act("/claim", {action: yes ? "deal_accept" : "deal_decline", deal: id});
      };
    });
  }
  function dealsHtml(deals) {
    return '<div class="card cab-card note-card deal-card"><h2>📨 Тебе предлагают приват</h2>' + deals.map(function (d) {
      return '<div class="deal"><div class="deal-main"><b>' + esc(d.claim || "Приват") + "</b>" + (d.forClan ? ' <span class="rank r2">клану</span>' : "") +
        '<p class="cab-meta">' + esc(d.world || "") + (d.size ? " · " + esc(d.size) : "") + (d.center ? " · центр " + esc(d.center) : "") +
        " · от <b>" + esc(d.from || "?") + "</b> · " + (Number(d.price) > 0 ? "цена <b>" + money(d.price) + "</b>" : "<b>бесплатно</b>") +
        (d.expires ? " · до " + when(d.expires) : "") + "</p></div>" +
        '<div class="cab-row"><button class="btn small green" type="button" data-deal="accept" data-id="' + esc(d.id) + '">Принять</button>' +
        '<button class="btn small" type="button" data-deal="decline" data-id="' + esc(d.id) + '">Отказаться</button></div></div>';
    }).join("") + "</div>";
  }
  // У276: карточка в списке — коротко, управление — на отдельной странице claim.html (новая вкладка)
  function claimItem(c) {
    var xyz = String(c.center || "0 64 0").split(" "), role = c.role >= 3 ? "хозяин" : c.role >= 2 ? "управляющий" : "участник";
    var who = c.clan ? (c.clanTag ? pill("[" + c.clanTag + "]" + (c.clanName ? " " + c.clanName : ""), c.clanColor) : "клан") : "хозяин " + esc(c.owner || "?");
    return '<div class="card cab-card claim-li"><h2>' + esc(c.name) + " " + (c.clan ? '<span class="rank r2">клан</span>' : '<span class="rank">личный</span>') + "</h2>" +
      '<p class="cab-meta">' + esc(c.world) + " · " + esc(c.size) + " · центр " + esc(c.center) + "</p>" +
      '<p class="cab-meta">' + who + (c.clan && c.owner ? " · поставил " + esc(c.owner) : "") + " · твоя роль: " + role +
      " · " + (c.members ? c.members.length : 0) + (c.clan ? " гост." : " друз.") + "</p>" +
      (c.deal ? '<p class="cab-meta">⏳ Предложен ' + esc(c.deal.to) + (Number(c.deal.price) > 0 ? " за " + money(c.deal.price) : " бесплатно") + "</p>" : "") +
      '<div class="cab-row"><a class="btn small green" href="claim.html?id=' + encodeURIComponent(c.id) + '" target="_blank" rel="noopener">Открыть страницу привата ↗</a>' +
      mapLink(c.worldId, xyz[0], xyz[1], xyz[2]) + "</div></div>";
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
        }).join("") + "</tbody></table></div>" +
        // 2026-10-18 (владелец): каждая галочка — сама по себе («строить» больше не открывает сундуки и двери)
        '<p class="cab-meta">Каждая галочка работает отдельно: <b>Стр.</b> — ставить и ломать блоки; <b>Сунд.</b> — сундуки, бочки, печи, воронки, животные; ' +
        '<b>Дв.</b> — двери, люки, кнопки, рычаги, кровати; <b>Упр.</b> — может добавлять и убирать людей. Галочку сняли — сразу нельзя.</p>';
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
    if (Array.isArray(c.roles) && c.roles.length) { renderClanRoles(c, h); return; }   // У276: сервер с ролями (0.9.13+); старый — как раньше
    var r = c.rank;
    h += '<div class="card cab-card"><h2>[' + esc(c.tag) + "] " + esc(c.name) + ' <span class="rank r' + r + '">' + RANK[r] + "</span></h2>" +
      '<div class="cab-stats">' + stat("Участников", c.members.length) + stat("Банк", money(c.bank)) + stat("Налог", c.tax + "%") + stat("Клан-приватов", c.claims) + "</div></div>";
    h += chatHtml(c);
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

  function chatHtml(c) {
    var chat = c.chat || [];
    return '<div class="card cab-card"><h2>Клан-чат</h2><div class="chat" id="chat">' + (chat.length ? chat.map(function (l) {
      return '<div class="cl"><span class="tm">' + new Date(l.t).toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"}) + '</span> <b>' + esc(l.name) + "</b>" + (l.web ? ' <span class="cab-meta">(сайт)</span>' : "") + ": " + esc(l.text) + "</div>";
    }).join("") : '<p class="cab-meta">Пока тихо. Сообщения из игры (<code>!текст</code>) и с сайта видны всем в клане.</p>') + "</div>" +
      '<div class="cab-row"><input type="text" id="cl-msg" maxlength="200" placeholder="Сообщение клану" aria-label="Сообщение"><button class="btn small green" data-c="chat">Отправить</button></div></div>';
  }

  // ---------------------------------------------------------------- У276: клан с ролями (права вместо званий; иерархия = роли группами, лидер сверху)
  function renderClanRoles(c, h) {
    var box = $("tab-clan"), open = {};
    Array.prototype.forEach.call(box.querySelectorAll("details[data-k]"), function (d) { open[d.getAttribute("data-k")] = d.open; });
    var roles = c.roles, byId = {}, members = c.members || [], permList = Array.isArray(c.permList) ? c.permList : [], label = {};
    roles.forEach(function (x) { byId[x.id] = x; });
    permList.forEach(function (p) { label[p.id] = p.label; });
    var meM = members.filter(function (m) { return m.name === me.nick; })[0] || {};
    var isLeader = !!(meM.leader || (c.leader && c.leader === me.nick));
    var myPerms = Array.isArray(c.myPerms) ? c.myPerms : [];
    var can = function (p) { return isLeader || myPerms.indexOf(p) >= 0; };
    var mine = byId[c.myRole] || byId[meM.role];
    var permText = function (r) { return r.leader ? "все права" : (r.perms || []).length ? (r.perms || []).map(function (p) { return label[p] || p; }).join(", ") : "без особых прав"; };
    // шапка
    h += '<div class="card cab-card"><h2>' + pill("[" + c.tag + "]", c.color) + " " + esc(c.name) + (mine ? " " + pill(mine.name, mine.color) : "") + "</h2>" +
      '<div class="cab-stats">' + stat("Лидер", esc(c.leader || "—")) + stat("Участников", members.length) + stat("Банк", money(c.bank)) + stat("Налог", c.tax + "%") + stat("Клан-приватов", c.claims) + "</div>" +
      '<p class="cab-note">' + (isLeader ? "Ты лидер — у тебя все права." : "Твои права: " + (myPerms.length ? esc(myPerms.map(function (p) { return label[p] || p; }).join(", ")) : "обычный участник")) + "</p></div>";
    h += chatHtml(c);
    // состав по ролям
    var order = roles.slice().sort(function (a, b) { return (b.leader ? 1 : 0) - (a.leader ? 1 : 0) || (a.builtin && !a.leader ? 1 : 0) - (b.builtin && !b.leader ? 1 : 0); });
    var leaderRole = roles.filter(function (x) { return x.leader; })[0];
    var roleOf = function (m) { return m.leader && leaderRole ? leaderRole.id : m.role; };
    var setOpts = roles.filter(function (x) { return !x.leader; });
    var memRow = function (m) {
      var btns = "";
      if (m.name !== me.nick && !m.leader) {
        if (can("roles") && setOpts.length) btns += '<select class="cab-sel role-sel" data-rs="' + esc(m.name) + '" aria-label="Роль ' + esc(m.name) + '">' +
          setOpts.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === m.role ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select>";
        if (isLeader) btns += '<button class="btn small gold" data-c="transfer" data-n="' + esc(m.name) + '">Передать лидерство</button>';
        if (can("kick")) btns += '<button class="btn small red" data-c="kick" data-n="' + esc(m.name) + '">Исключить</button>';
      }
      return '<div class="mem"><span class="nm">' + (m.leader ? "👑 " : "") + esc(m.name) + (m.name === me.nick ? ' <span class="cab-meta">(ты)</span>' : "") + (m.online ? ' <span class="on">● в игре</span>' : "") + "</span>" + btns + "</div>";
    };
    var used = {};
    h += '<div class="card cab-card"><h2>Состав клана</h2><p class="cab-meta">Роли сверху вниз: лидер, свои роли, обычные участники. У каждой роли — свой набор прав.</p>';
    order.forEach(function (r) {
      var ms = members.filter(function (m) { return roleOf(m) === r.id; }).sort(function (a, b) { return (b.online ? 1 : 0) - (a.online ? 1 : 0) || a.name.localeCompare(b.name); });
      ms.forEach(function (m) { used[m.name] = 1; });
      h += '<div class="role-grp"' + (mcColor(r.color) ? ' style="border-left-color:' + mcColor(r.color) + '"' : "") + '><div class="role-grp-h">' + pill(r.name, r.color) +
        ' <span class="cab-meta">· ' + ms.length + "</span></div>" + '<p class="role-perms">' + esc(permText(r)) + "</p>" +
        (ms.length ? ms.map(memRow).join("") : '<p class="cab-meta">Никого.</p>') + "</div>";
    });
    var rest = members.filter(function (m) { return !used[m.name]; });
    if (rest.length) h += '<div class="role-grp"><div class="role-grp-h"><span class="rank">Без роли</span> <span class="cab-meta">· ' + rest.length + "</span></div>" + rest.map(memRow).join("") + "</div>";
    h += "</div>";
    // редактор ролей
    if (can("roles")) {
      var cols = Array.isArray(c.roleColors) ? c.roleColors : [];
      h += '<details class="card cab-card cab-fold" data-k="roles"' + (open.roles ? " open" : "") + "><summary><h2>🎭 Роли и права</h2></summary>" +
        '<p class="cab-meta">Права работают сами по себе — старшинства нет. Галочка сразу сохраняется. Лидеру доступно всё.</p>';
      roles.forEach(function (r) {
        var k = "re:" + r.id;
        h += '<details class="role-ed" data-k="' + esc(k) + '"' + (open[k] ? " open" : "") + "><summary>" + pill(r.name, r.color) + ' <span class="cab-meta">· ' + (r.count != null ? r.count : 0) + (r.builtin ? " · встроенная" : "") + "</span></summary>" +
          '<div class="cab-row"><input type="text" data-rn="' + esc(r.id) + '" maxlength="16" value="' + esc(r.name) + '" aria-label="Название роли"><button class="btn small" type="button" data-re="name" data-id="' + esc(r.id) + '">Переименовать</button></div>' +
          (cols.length ? '<div class="swatches" role="group" aria-label="Цвет роли">' + cols.map(function (col) {
            return '<button type="button" class="swatch' + (col === r.color ? " on" : "") + '" style="background:' + (mcColor(col) || "#888") + '" data-re="color" data-id="' + esc(r.id) + '" data-v="' + esc(col) + '" title="Цвет ' + esc(col) + '" aria-label="Цвет ' + esc(col) + '"></button>';
          }).join("") + "</div>" : "") +
          (r.leader ? '<p class="cab-meta">У лидера все права — их не изменить.</p>' : '<div class="perm-grid">' + permList.map(function (p) {
            return '<label class="perm"><input type="checkbox" data-rp="' + esc(p.id) + '" data-id="' + esc(r.id) + '"' + ((r.perms || []).indexOf(p.id) >= 0 ? " checked" : "") + "><span>" + esc(p.label) + "</span></label>";
          }).join("") + "</div>") +
          (r.builtin ? "" : '<div class="cab-row"><button class="btn small red" type="button" data-c="role-delete" data-n="' + esc(r.id) + '" data-rname="' + esc(r.name) + '">Удалить роль</button></div>') + "</details>";
      });
      h += '<h3 style="margin-top:14px">Новая роль' + (c.maxRoles ? ' <span class="cab-meta">· ' + roles.length + " из " + c.maxRoles + "</span>" : "") + "</h3>" +
        '<div class="cab-row"><input type="text" id="cl-role-new" maxlength="16" placeholder="Название: 2–16 букв, цифр" aria-label="Название новой роли"><button class="btn small green" data-c="role-create">Создать</button></div></details>';
    }
    // журнал (только с правом «журнал» — сервер присылает journal лишь тогда)
    if (Array.isArray(c.journal)) {
      h += '<details class="card cab-card cab-fold" data-k="journal"' + (open.journal ? " open" : "") + "><summary><h2>📜 Журнал клана</h2></summary>" +
        (c.journal.length ? '<div class="chat journal">' + c.journal.map(function (l) {
          return '<div class="cl"><span class="tm">' + when(l.t) + "</span> <b>" + esc(l.who) + "</b>: " + esc(l.text) + "</div>";
        }).join("") + "</div>" : '<p class="cab-meta">Записей пока нет.</p>') + '<p class="cab-note">Последние 200 действий: кто вступил, ушёл, сменил роль, взял из банка и т. д.</p></details>';
    }
    h += '<div class="cab-cards">';
    if (can("invite")) h += '<div class="card cab-card"><h3>Пригласить</h3><p class="cab-meta">Игрок должен хоть раз зайти на сервер. Приглашение — 24 часа; если он не в сети, увидит при входе (и в своём кабинете).</p><div class="cab-row"><input type="text" id="cl-inv" maxlength="16" placeholder="Ник"><button class="btn small green" data-c="invite">Пригласить</button></div></div>';
    h += '<div class="card cab-card"><h3>Банк клана</h3><p class="cab-meta">Из банка оплачивается расширение клан-приватов. Снимать могут роли с правом «банк».</p><div class="cab-row"><input type="number" id="cl-sum" min="1" step="1" placeholder="Сумма, $"><button class="btn small green" data-c="deposit">Внести</button>' + (can("bank") ? '<button class="btn small" data-c="withdraw">Снять</button>' : "") + "</div></div>";
    if (can("tax")) h += '<div class="card cab-card"><h3>Налог клана</h3><p class="cab-meta">Доля от продаж меди, продаж на Рынке и полученных переводов участников идёт в банк. 0–' + c.maxTax + '%.</p><div class="cab-row"><input type="number" id="cl-tax" min="0" max="' + c.maxTax + '" value="' + c.tax + '"><button class="btn small" data-c="tax">Сохранить</button></div></div>';
    h += '<div class="card cab-card"><h3>' + (isLeader ? "Распустить клан" : "Выйти из клана") + '</h3><p class="cab-meta">' + (isLeader ? "Клан-приваты исчезнут, вложенное в них вернётся в банк, банк поделят поровну между участниками. Чтобы уйти, не распуская, — передай лидерство (кнопка у участника в «Составе клана»)." : "Ты перестанешь быть участником; вернуться — по новому приглашению.") +
      '</p><button class="btn small red" data-c="' + (isLeader ? "disband" : "leave") + '">' + (isLeader ? "Распустить" : "Выйти") + "</button></div>";
    h += "</div>" + clanList();
    var keep = $("cl-msg") ? $("cl-msg").value : "";
    box.innerHTML = h;
    if (keep && $("cl-msg")) $("cl-msg").value = keep;
    var ch = $("chat"); if (ch) ch.scrollTop = ch.scrollHeight;
    wireClan();
    Array.prototype.forEach.call(box.querySelectorAll("[data-rs]"), function (s) {
      s.onchange = function () { act("/clan", {action: "role-set", args: [s.getAttribute("data-rs"), s.value]}); };
    });
    Array.prototype.forEach.call(box.querySelectorAll("[data-re]"), function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-id"), k = b.getAttribute("data-re");
        if (k === "name") {
          var inp = b.parentNode.querySelector("[data-rn]"), v = inp ? inp.value.trim() : "";
          if (v) act("/clan", {action: "role-edit", args: [id, "name", v]});
        } else act("/clan", {action: "role-edit", args: [id, "color", b.getAttribute("data-v")]});
      };
    });
    Array.prototype.forEach.call(box.querySelectorAll("[data-rp]"), function (i) {
      i.onchange = function () { act("/clan", {action: "role-edit", args: [i.getAttribute("data-id"), "perm", i.getAttribute("data-rp"), i.checked ? "on" : "off"]}); };
    });
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
        else if (a === "role-create") { var rn = $("cl-role-new") ? $("cl-role-new").value.trim() : ""; if (!rn) { toast("Напиши название роли.", true); return; } args = [rn]; }
        else if (n) args = [n];
        if (a === "role-delete" && !confirm("Удалить роль «" + (b.getAttribute("data-rname") || n) + "»? У кого она была, станут обычными участниками.")) return;
        if (a === "kick" && !confirm("Исключить " + n + " из клана?")) return;
        if (a === "transfer" && !confirm("Передать лидерство " + n + "?\n\n" + n + " станет лидером и получит все права, а ты станешь «Заместителем». Вернуть лидерство сможет только новый лидер.")) return;
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
    // ряд ячеек на 9 (как сундук), минимум один ряд
    var rows9 = function (cells) { while (cells.length % 9 || !cells.length) cells.push(mcSlot(null)); return '<div class="mcgrid">' + cells.join("") + "</div>"; };
    var leftOf = function (l) { var m = Math.max(0, Math.round((l.expires - Date.now()) / 60000)); return (m >= 60 ? Math.floor(m / 60) + " ч " : "") + (m % 60) + " мин"; };
    h += '<div class="cab-cards">';
    h += '<div class="card cab-card"><h3>Мои лоты (' + mk.mine.length + " из " + (me.maxLots || 5) + ")</h3>" + '<div class="mcwin"><h4>Мои лоты</h4>' +
      rows9(mk.mine.map(function (l) { return mcSlot(l, {attrs: ' data-pick="mine:' + l.id + '"', tip: [money(l.price), "ещё " + leftOf(l), "нажми — подробнее"]}); })) + "</div>" +
      (mk.mine.length ? "" : '<p class="cab-meta">Пусто. Выставить — ниже, перетащи или нажми предмет (когда ты в лобби), или в игре: <code>/market</code>.</p>') + "</div>";
    h += '<div class="card cab-card"><h3>Склад (' + mk.storage.length + ')</h3><div class="mcwin"><h4>Склад</h4>' + rows9(mk.storage.map(function (s) { return mcSlot(s, {tip: ["забрать — в лобби: NPC «Рынок» или /market"]}); })) + "</div>" +
      '<p class="cab-meta">Непроданное, снятое и купленное. Забрать — в лобби: NPC «Рынок» или <code>/market</code> → «Склад».</p></div>';
    h += "</div>";
    // продать из инвентаря — только в игре и в лобби
    h += '<div class="card cab-card"><h2>Продать из инвентаря</h2>';
    if (!me.online) h += '<p class="cab-meta">Зайди в игру и встань в <b>лобби</b> — здесь появится твой инвентарь, и любой предмет можно выставить в один клик.</p>';
    else if (!me.inLobby) h += '<p class="cab-meta">Ты сейчас в мире «' + esc(me.where ? me.where.world : "?") + '». Продавать можно только из <b>лобби</b> — принеси товар туда (купить с сайта можно откуда угодно).</p>';
    else h += '<p class="cab-meta">Ты в лобби: <b>нажми на предмет</b> или <b>перетащи его в ячейку «Продать»</b> и назови цену. Лотов: ' + mk.mine.length + " из " + (me.maxLots || 5) + ", лот висит 48 ч, комиссия " + Math.round(mk.commission || 10) + "%.</p>" + mcInventory(me.inventory || [], true);
    h += "</div>";
    // витрина
    h += '<div class="card cab-card"><h2>Витрина Рынка</h2><p class="cab-meta">Купить с сайта: деньги — сразу, предмет — на твой Склад (забрать у NPC). Комиссия ' + Math.round(mk.commission || 10) + '% платит продавец.</p>' +
      '<div class="cab-row"><input type="text" id="mk-q" placeholder="Поиск: алмаз, книга, ник…" value="' + esc(mkFilter.q) + '"><select id="mk-sort" class="cab-sel"><option value="new">сначала новые</option><option value="cheap">сначала дешёвые</option><option value="dear">сначала дорогие</option></select></div>' +
      '<div class="chips" id="mk-cats">' + CATS.map(function (c) { return '<button class="chip" data-cat="' + c[0] + '" aria-selected="' + (mkFilter.cat === c[0]) + '">' + c[1] + "</button>"; }).join("") + "</div>";
    if (!market) h += '<p class="cab-meta">Загружаю…</p>';
    else {
      var lots = market.lots.filter(function (l) {
        return (mkFilter.cat === "all" || l.cat === mkFilter.cat) && (!mkFilter.q || (l.item + " " + l.material + " " + mcName(l) + " " + l.seller).toLowerCase().indexOf(mkFilter.q.toLowerCase()) >= 0);
      });
      if (mkFilter.sort === "cheap") lots.sort(function (a, b) { return a.price - b.price; });
      if (mkFilter.sort === "dear") lots.sort(function (a, b) { return b.price - a.price; });
      h += lots.length ? '<div class="mcwin mc-shop"><h4>Рынок · ' + lots.length + " " + (lots.length === 1 ? "лот" : "лотов") + "</h4>" + rows9(lots.map(function (l) {
        return mcSlot(l, {cls: l.seller === me.nick ? "mine" : "", attrs: ' data-pick="lot:' + l.id + '"', tip: [money(l.price) + (l.avg ? " · средняя " + money(l.avg) + "/шт" : ""), "продавец " + l.seller, "нажми — купить"]});
      })) + "</div>" : '<p class="cab-meta">Ничего не нашлось.</p>';
    }
    h += '<div id="mk-pick"></div></div>';
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
    // продажа: нажать на предмет или перетащить его в ячейку «Продать»
    var bySlot = function (s) { s = Number(s); var inv = me.inventory || []; return inv[s === 40 ? 4 : s + 5]; };
    var sellFrom = function (s) { var x = bySlot(s); if (x && !x.empty) openSell(Number(s), mcName(x), x.amount, x.material); };
    Array.prototype.forEach.call(document.querySelectorAll("#tab-market [data-sell]"), function (b) {
      b.onclick = function () { sellFrom(b.getAttribute("data-sell")); };
      b.ondragstart = function (e) { e.dataTransfer.setData("text/plain", b.getAttribute("data-sell")); e.dataTransfer.effectAllowed = "move"; tipEl.hidden = true; };
    });
    var drop = $("mc-drop");
    if (drop) {
      drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); };
      drop.ondragleave = function () { drop.classList.remove("over"); };
      drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("over"); sellFrom(e.dataTransfer.getData("text/plain")); };
      drop.onclick = function () { toast("Перетащи сюда предмет из инвентаря — или просто нажми на него."); };
    }
    // выбор лота → карточка с кнопкой «Купить» / «Снять»
    Array.prototype.forEach.call(document.querySelectorAll("#tab-market [data-pick]"), function (b) {
      b.onclick = function () {
        var p = b.getAttribute("data-pick").split(":"), id = Number(p[1]);
        var l = p[0] === "mine" ? mk.mine.filter(function (x) { return x.id === id; })[0] : (market.lots || []).filter(function (x) { return x.id === id; })[0];
        if (!l) return;
        var mine = p[0] === "mine" || l.seller === me.nick;
        Array.prototype.forEach.call(document.querySelectorAll("#tab-market .mcs.sel"), function (x) { x.classList.remove("sel"); });
        b.classList.add("sel");
        var box = p[0] === "mine" ? b.closest(".cab-card") : $("mk-pick"), old = document.querySelector("#tab-market .mc-pick");
        if (old) old.remove();
        var d = document.createElement("div");
        d.className = "mc-pick";
        d.innerHTML = '<div class="mcs big' + (l.enchanted ? " ench" : "") + '">' + mcIcon(l.material) + (l.amount > 1 ? '<b class="mcc">' + l.amount + "</b>" : "") + "</div><div><b>" + esc(mcName(l)) + (l.amount > 1 ? " ×" + l.amount : "") + "</b>" +
          '<p class="cab-meta">' + money(l.price) + (l.avg ? " · средняя за неделю " + money(l.avg) + "/шт" : "") + (l.seller ? " · продавец " + esc(l.seller) : "") + (l.expires ? " · ещё " + leftOf(l) : "") + "</p>" +
          (mine ? '<button class="btn small" data-m2="unlist">Снять лот</button>' : '<button class="btn small green" data-m2="buy">Купить за ' + money(l.price) + "</button>") + "</div>";
        box.appendChild(d);
        d.querySelector("[data-m2]").onclick = function () {
          var a = this.getAttribute("data-m2");
          if (a === "buy" && !confirm("Купить «" + mcName(l) + "» за " + money(l.price) + "? Предмет ляжет на Склад Рынка.")) return;
          if (a === "unlist" && !confirm("Снять лот? Предмет уйдёт на Склад.")) return;
          act("/market", {action: a, id: id});
        };
      };
    });
  }

  // ---------------------------------------------------------------- окно «Продать»
  var sellSlot = -1;
  function avgFor(mat) {
    if (!market) return 0;
    var l = market.lots.filter(function (x) { return x.material === mat && x.avg > 0; });
    return l.length ? l[0].avg : 0;
  }
  function openSell(slot, name, amount, mat) {
    sellSlot = slot;
    var avg = avgFor(mat);
    $("sell-what").innerHTML = "<b>" + esc((name || mat).replace(/_/g, " ")) + (amount > 1 ? " ×" + amount : "") + "</b>" + (avg ? " · средняя цена за неделю — " + money(avg) + "/шт" : "");
    $("sell-price").value = avg ? Math.max(1, Math.round(avg * amount)) : "";
    updNet();
    $("sell-modal").hidden = false;
    setTimeout(function () { $("sell-price").focus(); }, 50);
  }
  function updNet() {
    var p = Number($("sell-price").value) || 0, c = (me && me.market && me.market.commission) || 10;
    $("sell-net").textContent = p > 0 ? "Тебе после комиссии " + Math.round(c) + "% — " + money(Math.round(p * (100 - c)) / 100) : "";
  }
  $("sell-price").oninput = updNet;
  $("sell-cancel").onclick = function () { $("sell-modal").hidden = true; };
  $("sell-modal").onclick = function (e) { if (e.target === $("sell-modal")) $("sell-modal").hidden = true; };
  $("sell-form").onsubmit = function (e) {
    e.preventDefault();
    var p = Number($("sell-price").value);
    if (!(p >= 1)) return;
    $("sell-modal").hidden = true;
    act("/market", {action: "sell", slot: sellSlot, price: p});
  };

  // ---------------------------------------------------------------- подарок дня (подпись на кнопке «Бонусы»)
  // У218 (2026-10-16): подпись «+$25 за голос» / действующий подарок — на кнопке «🎁 Бонусы» (раньше — продолжение кнопки «Донат»)
  var BONUS_ICO = {vigor: "⚡", miner: "⛏", legs: "👟", night: "🌙", trade: "💰", fish: "🎣"};
  function plainTitle(t) { return String(t || "").replace(/^[^\p{L}\p{N}]+/u, ""); }   // сервер до 0.7.5 присылал «🎣 Рыбацкая удача» — без двойной иконки
  function renderBonusBar() {
    var b = me.bonus || {}, a = b.active, el = $("bonusbar"), h;
    var acts = b.actives || (a ? [a] : []);
    // У208.2 (2026-10-16): «Подарок дня» теперь = $25 за голос (с У218 — вкладка «Бонусы»); старый случайный бонус больше не предлагаем —
    // показываем только ещё действующий (взятый раньше), иначе — подсказку про голоса.
    if (!el) return;
    if (!acts.length) { el.className = "bn-ext ready"; el.innerHTML = '<span class="bc-t">+$25 за голос</span>'; el.title = "Подарок дня — голосуй за сервер"; return; }
    if (acts.length > 1) { h = '<span class="bc-ico">' + acts.map(function (x) { return BONUS_ICO[x.id] || "🎁"; }).join("") + "</span>Подарки ×" + acts.length + ' <span class="bc-t">· ещё ' + hm(Math.max(0, acts[0].until - Date.now())) + "</span>"; el.title = acts.map(function (x) { return plainTitle(x.title); }).join(", ") + " — подарки дня"; }
    else if (a) { h = '<span class="bc-ico">' + (BONUS_ICO[a.id] || "🎁") + "</span>" + esc(plainTitle(a.title)) + ' <span class="bc-t">· ещё ' + hm(Math.max(0, a.until - Date.now())) + "</span>"; el.title = a.desc + " — подарок дня"; }
    else if (b.nextIn > 0) { h = '<span class="bc-ico">🎁</span><span class="bc-t">подарок через ' + hm(b.nextIn) + "</span>"; el.title = "Следующий подарок дня"; }
    else { h = '<span class="bc-ico gift-glow">🎁</span>Подарок ждёт!'; el.title = "Забрать бесплатный подарок дня"; }
    el.className = "bn-ext" + (a ? " on" : !(b.nextIn > 0) ? " ready" : "");
    el.innerHTML = h;
  }
  function hm(ms) { var h = Math.floor(ms / 3600000), m = Math.ceil(ms % 3600000 / 60000); if (m === 60) { h++; m = 0; } return (h ? h + " ч " : "") + (m || !h ? m + " мин" : ""); }

  // вкладка «Донат»: только пакеты игровой валюты (подарок дня за голоса — во вкладке «Бонусы», У218)
  function openDonate() { setTab("donate"); var t = $("tabs"); if (t && t.scrollIntoView) t.scrollIntoView({behavior: "smooth", block: "start"}); }
  function loadDonate() { donLoading = true; return api("/donate").then(function (d) { donLoading = false; donTiers = (d && d.tiers) || []; renderDonate(); }); }
  function claimBonus(btn) {
    btn.disabled = true;
    api("/bonus", {}).then(function (j) { toast(j.message || "", !j.ok); if (j.bonus) { me.bonus = j.bonus; renderBonusBar(); renderDonate(); } else btn.disabled = false; });
  }
  // У208.2 (2026-10-16): пакеты игровой валюты (оплата lava.top) — shop.js. У218: голоса («Подарок дня») — во вкладке «Бонусы».
  // Рисуется один раз (кабинет обновляется каждые 20 с — форма оплаты не должна сбрасываться).
  function renderDonate() {
    var box = $("tab-donate");
    if (!box || !me) return;
    if (!$("cab-packs")) {
      box.innerHTML = '<div class="card cab-card"><h2>💛 Донат</h2><p class="cab-meta">Игровые $ — те же, что зарабатываются в игре: у Заклинателя, Торговца, на Рынке. ' +
        'Купи пакет — валюта придёт на ник <b>' + esc(me.nick) + '</b>. Бесплатные $ (подарок дня за голоса и другие) — во вкладке <a href="#bonus" data-go="bonus">«🎁 Бонусы»</a>.</p></div>' +
        '<h3 class="don-sub">💰 Пакеты игровой валюты</h3><div id="cab-packs"><p class="cab-meta">Загружаю пакеты…</p></div>' +
        '<p class="cab-meta">Оплата — картой, СБП, зарубежной картой или PayPal (lava.top). <a href="oferta.html" target="_blank" rel="noopener">Условия покупки и возврата</a>.</p>';
      var go = box.querySelector("[data-go]");
      if (go) go.onclick = function (e) { e.preventDefault(); setTab("bonus"); };
      if (window.DShop) DShop.packs($("cab-packs"), function () { return me.nick; }, {askNick: false});
      else $("cab-packs").innerHTML = '<p class="cab-meta">Не загрузился модуль доната — обнови страницу.</p>';
    }
  }

  // У218: «Подарок дня» (голоса за сервер, $25 за голос — DShop.votes) — всегда в самом верху вкладки «Бонусы»; отметки — раз в минуту
  var giftVoteTimer = null;
  function giftHtml() {
    return '<h3 class="don-sub">🎁 Подарок дня: голосуй за сервер — $25 за каждый голос</h3><div id="cab-votes"><p class="cab-meta">Загружаю площадки…</p></div>';
  }
  function renderGift() {
    if (!$("cab-votes") || !me) return;
    if (window.DShop) DShop.votes($("cab-votes"), me.nick);
    else $("cab-votes").innerHTML = '<p class="cab-meta">Не загрузился модуль голосования — обнови страницу.</p>';
    if (!giftVoteTimer && window.DShop) giftVoteTimer = setInterval(function () {
      if (!document.hidden && tab === "rewards" && $("cab-votes")) DShop.votes($("cab-votes"), me.nick);
    }, 60000);
  }

  // ---------------------------------------------------------------- бонусы (У209, VPBonus: https://mc.daviart.com/bonus)
  var BONUS_API = "https://mc.daviart.com/bonus";
  function bonusFetch(path, post) {
    return fetch(BONUS_API + path, {method: post ? "POST" : "GET", headers: {"Authorization": "Bearer " + tok(), "Content-Type": "application/json"}, body: post ? "{}" : undefined})
      .then(function (r) { return r.json(); }).catch(function () { return {ok: false, error: "Сервер бонусов не отвечает — попробуй позже."}; });
  }
  // У213: один источник состояния Discord для «Бонусов» и «Аккаунта»
  var bonusData = null, bonusAt = 0, dcSaved = false;
  function bonusStatus() {
    return bonusFetch("/status").then(function (d) {
      if (d && d.ok) { bonusData = d; bonusAt = Date.now(); dcSync(); }
      return d;
    });
  }
  function dcItem() {
    var it = null;
    (bonusData && bonusData.items || []).forEach(function (x) { if (x.id === "discord") it = x; });
    return it;
  }
  function dcUser() {
    if (bonusData && bonusData.discordUser) return bonusData.discordUser;
    var it = dcItem(), m = it && it.note && /^Привязан: (.+)$/.exec(it.note);
    return m ? m[1] : "";
  }
  // привязал через Discord — этот же ник сам становится «ником для связи»
  function dcSync() {
    var u = dcUser(), a = me && me.account || {};
    if (!u || dcSaved || a.discord === u) return;
    dcSaved = true;
    api("/discord", {name: u}).then(function (j) { if (j && j.ok) load(false); });
  }
  function dcLink(b) {
    if (b) b.disabled = true;
    bonusFetch("/discord/start", true).then(function (j) {
      if (j && j.ok && j.url) location.href = j.url;
      else { toast((j && j.error) || "Не получилось.", true); if (b) b.disabled = false; }
    });
  }
  // У218: вкладка = «Подарок дня» сверху (#bn-gift, рисуется один раз) + бонусы VPBonus ниже (#bn-rest, перерисовываются)
  function loadBonus() {
    var tabBox = $("tab-bonus");
    if (!$("bn-rest")) {
      tabBox.innerHTML = '<div id="bn-gift" class="bn-gift">' + giftHtml() + '</div><div id="bn-rest"><div class="card cab-card"><p class="cab-meta">Загружаю бонусы…</p></div></div>';
      // владелец 2026-10-19: «Приведи друга — получи $1000» и списки по кодам — сразу после голосования, до остальных бонусов
      var rc = $("ref-card"), rr = $("tab-refs"), rest = $("bn-rest");
      if (rc) tabBox.insertBefore(rc, rest);
      if (rr) tabBox.insertBefore(rr, rest);
      renderGift();
    }
    bonusStatus().then(renderBonus);
  }
  function renderBonus(d) {
    var box = $("bn-rest") || $("tab-bonus");
    if (!d || !d.ok) { box.innerHTML = '<div class="card cab-card"><p class="cab-meta">' + esc((d && d.error) || "Не удалось загрузить.") + "</p></div>"; return; }
    var STATE = {done: ["✔ Получено", "bn-done"], wait: ["⏳ Получишь, когда наиграешь " + d.needPlay + " мин (сейчас " + d.played + ")", "bn-wait"],
      todo: ["Ещё не выполнено", "bn-todo"], join: ["Зайди на наш Discord-сервер — и бонус придёт", "bn-wait"], off: ["Скоро заработает", "bn-off"], info: ["", "bn-info"],
      used: ["Роль выдана · этот Discord уже давал бонус другому игроку — $ не начисляются", "bn-done"]};
    var h = '<div class="card cab-card"><h2>🎁 Бесплатные бонусы</h2><p class="cab-meta">Выполняй — и $ приходят на счёт сами. Разовые бонусы — после ' + d.needPlay +
      " минут игры (защита от твинков). В игре — <code>/bonuses</code>.</p></div><div class=\"bn-list\">";
    d.items.forEach(function (it) {
      var st = STATE[it.state] || STATE.todo, act = "";
      if (it.action === "account" && it.state === "todo") act = '<button class="btn small" type="button" data-bn="account">Открыть «Аккаунт»</button>';
      if (it.action === "discord" && (it.state === "todo" || it.state === "join")) act = '<button class="btn small blue" type="button" data-bn="discord">' + (it.state === "join" ? "Проверить ещё раз" : "Привязать Discord") + "</button>" +
        (it.state === "join" ? ' <a class="btn small" href="https://discord.gg/sTgZM8Kh" target="_blank" rel="noopener">Наш Discord-сервер</a>' : "");
      if (it.action === "donate") act = '<button class="btn small" type="button" data-bn="donate">Голосовать</button>';
      h += '<div class="card bn-item ' + st[1] + '"><div class="bn-main"><b>' + esc(it.title) + '</b><span class="bn-amt">' + esc(it.amount) + "</span></div>" +
        (st[0] ? '<p class="bn-st">' + esc(st[0]) + "</p>" : "") + (it.note ? '<p class="cab-meta">' + esc(it.note) + "</p>" : "") + (act ? '<div class="bn-act">' + act + "</div>" : "") + "</div>";
    });
    box.innerHTML = h + "</div>";
    Array.prototype.forEach.call(box.querySelectorAll("[data-bn]"), function (b) {
      b.onclick = function () {
        var k = b.getAttribute("data-bn");
        if (k === "account") return setTab("account");
        if (k === "donate") { var g = $("bn-gift"); if (g && g.scrollIntoView) g.scrollIntoView({behavior: "smooth", block: "start"}); return; }   // У218: голоса — вверху этой вкладки
        dcLink(b);
      };
    });
  }
  (function discordReturn() {
    var m = /[?&]discord=([a-z]+)/.exec(location.search);
    if (!m) return;
    var MSG = {ok: "Discord привязан — бонус начислен, роль выдана!", join: "Discord привязан. Зайди на наш Discord-сервер, потом нажми «Проверить ещё раз».",
      young: "Аккаунт Discord слишком новый (нужно 7+ дней).", taken: "Этот Discord уже привязан к другому игроку.", already: "У тебя уже привязан другой Discord.",
      changed: "Discord сменён — роли и ник перенесены на новый аккаунт. Бонус $250 уже был получен раньше.",
      cooldown: "Сменить Discord можно раз в 7 дней — попробуй позже.",
      cancel: "Привязка отменена.", expired: "Ссылка устарела — нажми «Привязать Discord» ещё раз.", error: "Discord не ответил — попробуй позже."};
    setTimeout(function () { toast(MSG[m[1]] || "Готово.", !(m[1] === "ok" || m[1] === "join" || m[1] === "changed")); }, 800);
    try { history.replaceState(null, "", location.pathname + "#bonus"); } catch (e) { }
  })();

  // ---------------------------------------------------------------- аккаунт
  var bonusLoading = false;
  function renderAccount() {
    if (Date.now() - bonusAt > 60000 && !bonusLoading) {   // состояние привязки Discord — не чаще раза в минуту
      bonusLoading = true;
      var was = dcUser() + "|" + ((dcItem() || {}).state || "");
      bonusStatus().then(function () {
        bonusLoading = false; bonusAt = Date.now();
        if (dcUser() + "|" + ((dcItem() || {}).state || "") !== was) renderAccount();
      });
    }
    var a = me.account || {}, h = "";
    h += '<div class="cab-cards">';
    // пароль
    h += '<div class="card cab-card"><h2>Пароль</h2><p class="cab-meta">Один пароль — и для сайта, и для <code>/login</code> в игре. Сменишь здесь — сменится и там.</p>' +
      '<form id="acc-pass" autocomplete="off"><label class="lbl2">Текущий пароль<input type="password" id="ap-old" maxlength="30" autocomplete="current-password"></label>' +
      '<label class="lbl2">Новый пароль (6–30 символов)<input type="password" id="ap-new" maxlength="30" autocomplete="new-password"></label>' +
      '<label class="lbl2">Ещё раз<input type="password" id="ap-new2" maxlength="30" autocomplete="new-password"></label>' +
      '<div class="cab-row"><button class="btn green" type="submit">Сменить пароль</button></div></form></div>';
    // почта
    h += '<div class="card cab-card"><h2>Почта</h2>';
    if (!a.mail) h += '<p class="cab-meta">⚠ Отправка писем на сервере пока не подключена — привязка почты скоро заработает.</p>';
    if (a.email) h += '<p>Привязана: <b>' + esc(a.email) + '</b>' + (a.emailAt ? ' <span class="cab-meta">с ' + new Date(a.emailAt).toLocaleDateString("ru-RU") + "</span>" : "") + '</p><p class="cab-meta">Забудешь пароль — на неё придёт код восстановления.</p>';
    else h += '<p class="cab-meta">Не привязана. Привяжи — и сможешь сам восстановить пароль, если забудешь.</p>';
    if (a.emailPending) h += '<p class="cab-meta">Код отправлен на <b>' + esc(a.emailPending) + '</b> — введи его:</p><div class="cab-row"><input type="text" id="em-code" maxlength="6" inputmode="numeric" placeholder="123456"><button class="btn small green" data-acc="em-confirm">Подтвердить</button></div>';
    h += '<div class="cab-row"><input type="email" id="em-new" maxlength="80" placeholder="' + (a.email ? "новая почта" : "твоя@почта.ру") + '"><button class="btn small" data-acc="em-add">' + (a.email ? "Сменить" : "Привязать") + "</button></div>";
    if (a.email) h += '<div class="cab-row"><button class="btn small red" data-acc="em-remove">Отвязать почту</button></div>';
    h += "</div>";
    // Discord (У213): главное — кнопка привязки (та же, что в «Бонусах»); ручной ник — отдельно, только для связи
    var dci = dcItem(), dcu = dcUser();
    h += '<div class="card cab-card"><h2>Discord</h2>';
    if (dcu) {
      h += '<p>✔ Привязан: <b>' + esc(dcu) + '</b></p>' +
        (dci && dci.state === "join" ? '<p class="cab-meta">Зайди на наш Discord-сервер — и придут $250 и роль.</p><div class="cab-row"><a class="btn small" href="https://discord.gg/sTgZM8Kh" target="_blank" rel="noopener">Наш Discord-сервер</a>' +
          '<button class="btn small blue" type="button" data-acc="dc-link">Проверить ещё раз</button></div>'
          : '<p class="cab-meta">Роль в Discord показывает твой уровень и обновляется сама. Через этот Discord администрация свяжется с тобой.</p>' +
            (dci && dci.state === "used" ? '<p class="cab-meta">Этот Discord уже давал бонус другому игроку — роль есть, $250 повторно не начисляются.</p>' : ""));
      // У214: сменить Discord — роли переедут на новый, $250 второй раз не придут
      var days = bonusData && bonusData.discordChangeDays || 0;
      h += '<details class="dc-manual"><summary class="cab-meta">Сменить Discord</summary>' +
        '<p class="cab-meta">Войдёшь в другой аккаунт Discord — роли и ник переедут на него, со старого снимутся. На странице Discord нажми «Не вы?» / смени аккаунт, чтобы выбрать другой. Бонус $250 за Discord — один раз, повторно не начисляется. ' +
        'Менять можно раз в 7 дней.</p>' +
        (days ? '<p class="cab-meta">Следующая смена — через ' + days + " дн.</p>" : '<div class="cab-row"><button class="btn small" type="button" data-acc="dc-change">Войти в другой Discord</button></div>') +
        "</details>";
    } else {
      h += '<p class="cab-meta">Привяжи Discord одной кнопкой — получишь <b>$250</b>, роль по уровню персонажа, и администрация сможет с тобой связаться.</p>' +
        '<div class="cab-row"><button class="btn blue" type="button" data-acc="dc-link">Привязать Discord (+$250 и роль)</button></div>' +
        '<details class="dc-manual"><summary class="cab-meta">Или просто указать ник для связи (без бонуса)</summary>' +
        '<p class="cab-meta">Ник, вписанный руками, никто не проверяет — поэтому бонус и роль даёт только кнопка выше.</p>' +
        '<div class="cab-row"><input type="text" id="dc-name" maxlength="32" value="' + esc(a.discord || "") + '" placeholder="ник в Discord"><button class="btn small" data-acc="dc-save">Сохранить</button></div></details>';
    }
    h += "</div>";
    h += "</div>";
    // доверенные адреса
    var tr = a.trusted || [];
    h += '<div class="card cab-card"><h2>Доверенные адреса</h2><p class="cab-meta">Заходишь в игру с доверенного адреса — <b>/login не нужен</b>, сервер пустит сам. Добавляй только свои устройства и свою домашнюю сеть: ' +
      'все, кто выходит в интернет через тот же роутер (семья, общежитие, кафе), получат доступ к твоему нику. На мобильном интернете адрес часто меняется.</p>' +
      '<p class="cab-meta">Адрес, с которого открыт сайт: <b>' + esc(a.siteIp || "?") + "</b>" + (a.gameIp ? " · в игре сейчас: <b>" + esc(a.gameIp) + "</b>" + (a.gameIp === a.siteIp ? " (тот же)" : " (другой — добавь его)") : "") + "</p>" +
      (tr.length ? tr.map(function (x) {
        return '<div class="mem"><span class="nm">' + esc(x.label) + ' <span class="cab-meta">' + esc(x.ip) + "</span></span><span class=\"cab-meta\">добавлен " + new Date(x.added).toLocaleDateString("ru-RU") +
          (x.used ? " · вход " + new Date(x.used).toLocaleString("ru-RU") : " · ещё не входил") + '</span><button class="btn small red" data-acc="tr-remove" data-ip="' + esc(x.ip) + '">Убрать</button></div>';
      }).join("") : '<p class="cab-meta">Список пуст — при каждом входе нужен /login.</p>') +
      '<div class="cab-row"><input type="text" id="tr-label" maxlength="24" placeholder="подпись: дом, телефон…"><button class="btn small green" data-acc="tr-add-site">Добавить этот адрес</button>' +
      (a.gameIp && a.gameIp !== a.siteIp ? '<button class="btn small green" data-acc="tr-add-game">Добавить адрес из игры</button>' : "") + "</div></div>";
    // сессии
    h += '<div class="card cab-card"><h2>Входы на сайт</h2><p class="cab-meta">Открыто сессий: ' + (a.sessions || 1) + '. Каждая живёт 30 дней с последнего визита.</p><div class="cab-row"><button class="btn small" data-acc="logout-all">Выйти на всех других устройствах</button></div></div>';
    $("tab-account").innerHTML = h;
    $("acc-pass").onsubmit = function (e) {
      e.preventDefault();
      if ($("ap-new").value !== $("ap-new2").value) { toast("Новые пароли не совпадают.", true); return; }
      act("/password", {old: $("ap-old").value, "new": $("ap-new").value}).then(function (j) { if (j.ok) ["ap-old", "ap-new", "ap-new2"].forEach(function (k) { var i = $(k); if (i) i.value = ""; }); });
    };
    Array.prototype.forEach.call(document.querySelectorAll("#tab-account [data-acc]"), function (b) {
      b.onclick = function () {
        var k = b.getAttribute("data-acc"), pw;
        if (k === "em-add") act("/email", {action: "add", email: $("em-new").value.trim()});
        else if (k === "em-confirm") act("/email", {action: "confirm", code: $("em-code").value.trim()});
        else if (k === "em-remove") { pw = prompt("Чтобы отвязать почту, введи пароль:"); if (pw) act("/email", {action: "remove", password: pw}); }
        else if (k === "dc-save") act("/discord", {name: $("dc-name").value.trim()});
        else if (k === "dc-link") dcLink(b);
        else if (k === "dc-change") { if (confirm("Сменить привязанный Discord? Роли переедут на новый аккаунт, $250 второй раз не начисляются. Следующая смена — через 7 дней.")) dcLink(b); }
        else if (k === "tr-add-site" || k === "tr-add-game") {
          pw = prompt("Подтверди паролем — после этого с этого адреса в игру без /login:");
          if (pw) act("/trusted", {action: "add", ip: k === "tr-add-game" ? a.gameIp : "", label: $("tr-label").value.trim(), password: pw});
        } else if (k === "tr-remove") { pw = prompt("Подтверди паролем, чтобы убрать адрес:"); if (pw) act("/trusted", {action: "remove", ip: b.getAttribute("data-ip"), password: pw}); }
        else if (k === "logout-all") act("/logout-all", {});
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
      "<li><b>Приваты:</b> у каждого привата — своя страница (кнопка «Открыть страницу привата»): название, друзья или гости и их права, настройки клан-привата, продажа или передача привата другому игроку или клану. Входящие предложения — вверху «Приватов». Расширить, уменьшить или удалить — только в игре, компасом.</li>" +
      "<li><b>Клан:</b> создать, вступить по приглашению, клан-чат (сообщения видят и в игре), роли и их права, журнал клана, исключить, передать лидерство, банк и налог, список всех кланов.</li>" +
      "<li><b>Рынок:</b> купить с сайта откуда угодно (предмет — на Склад, забрать в лобби), продать из инвентаря, когда ты в лобби (окно с ценой), снять свой лот, Склад и что продалось, пока тебя не было. В игре — <code>/market</code> из любого мира.</li>" +
      "<li><b>Аккаунт:</b> вход — ником и паролем от сервера (тем же, что в <code>/login</code>). Здесь же — смена пароля, почта для восстановления, Discord, доверенные адреса (вход в игру без /login), выход на других устройствах.</li>" +
      "<li><b>Безопасность:</b> пароль проверяет сервер, сайт его не хранит. 5 неверных паролей — вход для ника закрыт на 15 минут. Потерял телефон — в игре <code>/account logout</code> или кнопка во вкладке «Аккаунт».</li></ul></div>";
  }

  // ---------------------------------------------------------------- скин (SkinsRestorer, VPLand 0.7.7)
  var skinMode = "upload", skinData = null, skinChecked = false;
  function drawSkin(img) {
    var c = $("skin-prev"), g = c.getContext("2d"), slim = $("skin-var").value === "slim", old = img.height === 32, k = 8;
    g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height);
    var part = function (sx, sy, w, h, dx, dy, flip) {
      g.save();
      if (flip) { g.translate((dx + w) * k, dy * k); g.scale(-1, 1); g.drawImage(img, sx, sy, w, h, 0, 0, w * k, h * k); }
      else g.drawImage(img, sx, sy, w, h, dx * k, dy * k, w * k, h * k);
      g.restore();
    };
    var aw = slim ? 3 : 4, ox = 4;   // фигура 16×32 «пикселей скина» по центру холста
    part(8, 8, 8, 8, ox, 0); part(40, 8, 8, 8, ox, 0);                 // голова + шапка
    part(20, 20, 8, 12, ox, 8);                                        // туловище
    part(44, 20, aw, 12, ox - aw, 8);                                  // правая рука (слева на картинке)
    if (old) part(44, 20, aw, 12, ox + 8, 8, true); else part(36, 52, aw, 12, ox + 8, 8);
    part(4, 20, 4, 12, ox, 20);                                        // правая нога
    if (old) part(4, 20, 4, 12, ox + 4, 20, true); else part(20, 52, 4, 12, ox + 4, 20);
    if (!old) { part(20, 36, 8, 12, ox, 8); part(44, 36, aw, 12, ox - aw, 8); part(52, 52, aw, 12, ox + 8, 8); part(4, 36, 4, 12, ox, 20); part(4, 52, 4, 12, ox + 4, 20); }
  }
  function skinSetup() {
    if (skinChecked) return; skinChecked = true;
    api("/skin").then(function (j) {
      if (!j.ok || !j.available) return;
      $("skin-card").hidden = false;
      Array.prototype.forEach.call(document.querySelectorAll("#skin-mode .chip"), function (b) {
        b.onclick = function () {
          skinMode = b.getAttribute("data-sm");
          Array.prototype.forEach.call(document.querySelectorAll("#skin-mode .chip"), function (x) { x.setAttribute("aria-selected", x === b); });
          Array.prototype.forEach.call(document.querySelectorAll("[data-sp]"), function (x) { x.hidden = x.getAttribute("data-sp") !== skinMode; });
        };
      });
      var lastImg = null;
      $("skin-file").onchange = function () {
        var f = this.files && this.files[0]; skinData = null;
        if (!f) return;
        if (f.size > 32 * 1024) { $("skin-msg").textContent = "Файл больше 32 КБ — это точно скин?"; return; }
        var rd = new FileReader();
        rd.onload = function () {
          var im = new Image();
          im.onload = function () {
            if (im.width !== 64 || (im.height !== 64 && im.height !== 32)) { $("skin-msg").textContent = "Скин должен быть 64×64 пикселя, а у файла " + im.width + "×" + im.height + "."; return; }
            skinData = rd.result; lastImg = im; drawSkin(im); $("skin-msg").textContent = "Вот так он будет выглядеть. Нажми «Поставить скин».";
          };
          im.src = rd.result;
        };
        rd.readAsDataURL(f);
      };
      $("skin-var").onchange = function () { if (lastImg) drawSkin(lastImg); };
      var send = function (body, btn) {
        btn.disabled = true; $("skin-msg").textContent = "Ставлю скин… это может занять до 30 секунд.";
        api("/skin", body).then(function (r) { btn.disabled = false; $("skin-msg").textContent = r.message || ""; toast(r.message || "", !r.ok); });
      };
      $("skin-set").onclick = function () {
        var v = $("skin-var").value, b;
        if (skinMode === "upload") { if (!skinData) { toast("Сначала выбери PNG-файл скина.", true); return; } b = {action: "upload", data: skinData, variant: v}; }
        else if (skinMode === "name") b = {action: "name", name: $("skin-name").value.trim()};
        else b = {action: "url", url: $("skin-url").value.trim(), variant: v};
        send(b, this);
      };
      $("skin-reset").onclick = function () { if (confirm("Вернуть обычный скин?")) send({action: "reset"}, this); };
    });
  }


  // ---------------------------------------------------------------- 2026-10-18 (владелец): кнопка «обновить» и веб-карта внутри кабинета с крестиком
  // (в режиме «приложения» на телефоне ссылка на карту открывалась на весь экран без возможности вернуться)
  (function () {
    var rb = document.getElementById("reload-btn");
    // 2026-10-18: GitHub Pages отдаёт страницу из кэша до 10 мин — обычный reload мог оставить старый voice.js; грузим заново с меткой
    var fresh = function () {
      try { var u = new URL(location.href); u.searchParams.set("r", Date.now().toString(36)); location.replace(u.toString()); }
      catch (e) { location.reload(); }
    };
    if (rb) rb.onclick = function () { rb.disabled = true; fresh(); };
    // раз в 5 мин: вышла новая версия кабинета (другие ?v= у скриптов) — подсветить 🔄 и предложить обновить
    var mine = function (doc) {
      return Array.prototype.map.call(doc.querySelectorAll("script[src*='?v='], link[href*='?v=']"), function (e) { return e.getAttribute("src") || e.getAttribute("href"); }).sort().join(" ");
    };
    var loaded = mine(document), told = false;
    setInterval(function () {
      if (told || document.hidden) return;
      fetch(location.pathname + "?check=" + Date.now(), {cache: "no-store"}).then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) {
        if (!t || told) return;
        var now = mine(new DOMParser().parseFromString(t, "text/html"));
        if (!now || now === loaded) return;
        told = true;
        if (rb) { rb.classList.add("gold"); rb.title = "Вышло обновление кабинета — нажми, чтобы загрузить"; }
        if (typeof toast === "function") toast("Вышло обновление кабинета — нажми 🔄 вверху справа.");
      }).catch(function () { });
    }, 300000);
    // iOS Safari не слушает user-scalable=no — гасим щипок и двойной тап вручную
    ["gesturestart", "gesturechange"].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); }, {passive: false}); });
    document.addEventListener("touchmove", function (e) { if (e.touches && e.touches.length > 1) e.preventDefault(); }, {passive: false});
    // тема: авто (как в системе) → светлая → тёмная; хранится на устройстве
    var tb = document.getElementById("theme-btn"), THEMES = ["auto", "light", "dark"], ICON = {auto: "🌗", light: "☀", dark: "🌙"}, NAME = {auto: "как в системе", light: "светлая", dark: "тёмная"};
    var cur = function () { try { return localStorage.getItem("daviart.theme") || "auto"; } catch (e) { return "auto"; } };
    var applyTheme = function (th) {
      if (th === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", th);
      if (tb) { tb.textContent = ICON[th]; tb.title = "Тема: " + NAME[th] + " (нажми — сменить)"; }
      try { if (th === "auto") localStorage.removeItem("daviart.theme"); else localStorage.setItem("daviart.theme", th); } catch (e) { }
      document.dispatchEvent(new Event("vp-theme"));
    };
    applyTheme(cur());
    if (tb) tb.onclick = function () { var th = THEMES[(THEMES.indexOf(cur()) + 1) % 3]; applyTheme(th); toast("Тема: " + NAME[th]); };
    var over = null;
    function closeMap(fromBack) {
      if (!over || over.hidden) return;
      over.hidden = true; over.querySelector("iframe").src = "about:blank"; document.body.classList.remove("hm-noscroll");
      if (!fromBack && history.state && history.state.vpMap) history.back();
    }
    function openMap(url) {
      if (!over) {
        over = document.createElement("div");
        over.className = "map-over";
        over.innerHTML = '<div class="map-over-top"><b>🗺 Карта мира</b><a class="btn small" target="_blank" rel="noopener" id="map-ext">В браузере ↗</a>' +
          '<button class="btn small red" type="button" id="map-close">✕ Закрыть</button></div><iframe title="Карта мира" allow="fullscreen" referrerpolicy="no-referrer"></iframe>';
        document.body.appendChild(over);
        over.querySelector("#map-close").onclick = function () { closeMap(false); };
        window.addEventListener("popstate", function () { closeMap(true); });   // жест «назад» — закрыть карту
      }
      over.querySelector("#map-ext").href = url;
      over.querySelector("iframe").src = url;
      over.hidden = false; document.body.classList.add("hm-noscroll");
      try { history.pushState({vpMap: 1}, ""); } catch (e) { }
    }
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href^="map.html"], a[href^="/map.html"], a[href^="https://daviart.com/map.html"], a[href^="https://mc.daviart.com/map"]');
      if (!a || a.id === "map-ext") return;
      e.preventDefault();
      openMap(a.href);
    });
  })();
  // ---------------------------------------------------------------- старт
  var h0 = (location.hash || "").replace("#", "");
  h0 = OLD_TABS[h0] || h0;   // старые адреса (#profile, #clan, #bonus, #voice …) → объединённые вкладки
  if (TABS.indexOf(h0) >= 0) tab = h0;
  if (tok()) { show("load"); load(true); } else show("login");
})();
