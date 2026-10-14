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
  var TABS = ["profile", "claims", "clan", "market", "ach", "account", "help", "donate"];
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
    var base = "https://mc.daviart.com/map";   // через Caddy: https + сжатие (прямой :8100 без сжатия грузится на телефоне очень долго)
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

  Array.prototype.forEach.call(document.querySelectorAll("#tabs .chip"), function (b) {
    b.addEventListener("click", function () {
      setTab(b.getAttribute("data-tab"));
      var v = $("cab-view"), y = v ? v.getBoundingClientRect().top + window.scrollY : 0;   // прокручено вниз — к началу вкладки
      if (window.scrollY > y) window.scrollTo(0, y);
    });
  });

  function setTab(t) {
    tab = t;
    Array.prototype.forEach.call(document.querySelectorAll("#tabs .chip"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t); });
    TABS.forEach(function (x) { $("tab-" + x).hidden = x !== t; });
    $("cab-view").classList.toggle("on-donate", t === "donate");   // на «Донате» полоса бонуса не дублирует карточку
    try { history.replaceState(null, "", "#" + t); } catch (e) { }
    if (t === "market" && !market) loadMarket();
    if (t === "clan" && !clansAll) loadClans();
    if (t === "donate" && !donTiers && !donLoading && me) loadDonate();
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
    renderBonusBar();
    renderProfile();
    renderClaims();
    renderClan();
    renderAch();
    renderAccount();
    renderHelp();
    renderDonate();
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
      h += '<div class="card cab-card"><h2>Инвентарь</h2><p class="cab-meta">Как в игре: наведи (или нажми) на предмет — название и прочность. Продать — во вкладке «Рынок», когда ты в лобби.</p>' + mcInventory(me.inventory, false) + "</div>";
    } else h += '<div class="card cab-card"><h2>Снаряжение и инвентарь</h2><p class="cab-meta">Видно, когда ты в игре.</p></div>';
    $("profile-body").innerHTML = h;
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

  // ---------------------------------------------------------------- бонус дня + донат (всегда рядом, над вкладками)
  // продолжение кнопки «Донат» (полупрозрачная часть той же кнопки): что сейчас действует / подарок ждёт; клик — во вкладку «Донат»
  var BONUS_ICO = {vigor: "⚡", miner: "⛏", legs: "👟", night: "🌙", trade: "💰", fish: "🎣"};
  function plainTitle(t) { return String(t || "").replace(/^[^\p{L}\p{N}]+/u, ""); }   // сервер до 0.7.5 присылал «🎣 Рыбацкая удача» — без двойной иконки
  function renderBonusBar() {
    var b = me.bonus || {}, a = b.active, el = $("bonusbar"), h;
    if (a) { h = '<span class="bc-ico">' + (BONUS_ICO[a.id] || "🎁") + "</span>" + esc(plainTitle(a.title)) + ' <span class="bc-t">· ещё ' + hm(Math.max(0, a.until - Date.now())) + "</span>"; el.title = a.desc + " — подарок дня из «Доната»"; }
    else if (b.nextIn > 0) { h = '<span class="bc-ico">🎁</span><span class="bc-t">подарок через ' + hm(b.nextIn) + "</span>"; el.title = "Следующий подарок дня"; }
    else { h = '<span class="bc-ico gift-glow">🎁</span>Подарок ждёт!'; el.title = "Забрать бесплатный подарок дня"; }
    el.className = "don-ext" + (a ? " on" : !(b.nextIn > 0) ? " ready" : "");
    el.innerHTML = h;
  }
  function hm(ms) { var h = Math.floor(ms / 3600000), m = Math.ceil(ms % 3600000 / 60000); if (m === 60) { h++; m = 0; } return (h ? h + " ч " : "") + (m || !h ? m + " мин" : ""); }

  // вкладка «Донат»: первая карточка — бесплатный подарок (бонус дня), дальше — пакеты
  function openDonate() { setTab("donate"); var t = $("tabs"); if (t && t.scrollIntoView) t.scrollIntoView({behavior: "smooth", block: "start"}); }
  function loadDonate() { donLoading = true; return api("/donate").then(function (d) { donLoading = false; donTiers = (d && d.tiers) || []; renderDonate(); }); }
  function claimBonus(btn) {
    btn.disabled = true;
    api("/bonus", {}).then(function (j) { toast(j.message || "", !j.ok); if (j.bonus) { me.bonus = j.bonus; renderBonusBar(); renderDonate(); } else btn.disabled = false; });
  }
  function renderDonate() {
    var b = me.bonus || {}, a = b.active, h = '<div class="card cab-card"><h2>💛 Донат и подарки</h2><p class="cab-meta">Первая карточка — <b>бесплатный подарок</b>, забирай каждый день. ' +
      'Оплата пакетов пока не подключена — но нажми «Поддержать»: мы увидим, сколько людей хотят помочь' + (b.gifted ? "" : ", а тебе — <b>разовый подарок</b> +45 минут к бонусу") +
      ". Пакеты — только внешний вид: за деньги на сервере не побеждают.</p></div>";
    // бесплатная карточка
    h += '<div class="don-grid don-tab-grid"><div class="card don-card don-free"><span class="don-tag">Бесплатно · каждый день</span><div class="gift-big"><span class="gift-glow">🎁</span></div>' +
      '<h3>Подарок дня</h3><p class="don-price">0 ₽ <span>каждые 24 часа</span></p>' +
      '<p class="cab-meta" style="flex:1">Случайный сюрприз: может выпасть предмет, а может — бонус на время. Что именно — узнаешь, когда заберёшь!</p>';
    if (a) h += '<p class="cab-meta"><b>Сейчас: ' + (BONUS_ICO[a.id] || "") + " " + esc(plainTitle(a.title)) + "</b> — ещё " + hm(Math.max(0, a.until - Date.now())) + "</p>" +
      (b.nextIn > 0 ? '<button class="btn" type="button" disabled>Следующий через ' + hm(b.nextIn) + "</button>" : "");
    else if (b.nextIn > 0) h += '<button class="btn" type="button" disabled>Следующий через ' + hm(b.nextIn) + "</button>";
    else h += '<button class="btn green" type="button" id="don-claim">🎁 Забрать бесплатно</button>';
    h += "</div>";
    // пакеты
    if (!donTiers) h += '<p class="cab-meta">Загружаю пакеты…</p>';
    else if (!donTiers.length) h += '<p class="cab-meta">Не удалось загрузить пакеты.</p>';
    else h += donTiers.map(function (x) {
      return '<div class="card don-card"><span class="don-tag gold">Пакет</span><h3>' + esc(x.title) + '</h3><p class="don-price">' + esc(x.price) + " <span>" + esc(x.period) + "</span></p><ul>" +
        (x.perks || []).map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + '</ul><button class="btn gold" type="button" data-dtier="' + esc(x.id) + '">💛 Поддержать</button>' +
        (b.gifted ? "" : '<p class="don-hint">🎁 за первое нажатие — подарок</p>') + "</div>";
    }).join("");
    $("tab-donate").innerHTML = h + "</div>";
    var c = $("don-claim"); if (c) c.onclick = function () { claimBonus(c); };
    Array.prototype.forEach.call(document.querySelectorAll("[data-dtier]"), function (btn) {
      btn.onclick = function () {
        btn.disabled = true;
        api("/donate", {tier: btn.getAttribute("data-dtier")}).then(function (j) {
          toast(j.message || "Спасибо!", !j.ok);
          if (j.bonus) { me.bonus = j.bonus; renderBonusBar(); }
          renderDonate();
        });
      };
    });
    if (!donTiers && !donLoading && tab === "donate") loadDonate();
  }

  // ---------------------------------------------------------------- аккаунт
  function renderAccount() {
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
    // Discord
    h += '<div class="card cab-card"><h2>Discord</h2><p class="cab-meta">Для связи с администрацией (например, при восстановлении аккаунта). Подтверждение через Discord — позже.</p>' +
      '<div class="cab-row"><input type="text" id="dc-name" maxlength="32" value="' + esc(a.discord || "") + '" placeholder="ник в Discord"><button class="btn small" data-acc="dc-save">Сохранить</button></div></div>';
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
      "<li><b>Приваты:</b> название, друзья и их права, двери для гостей, взрывы, видимость на карте, кнопка «На карте». Расширить, уменьшить или удалить — только в игре, компасом.</li>" +
      "<li><b>Клан:</b> создать, вступить по приглашению, клан-чат (сообщения видят и в игре), звания, исключить, передать лидерство, банк и налог, список всех кланов.</li>" +
      "<li><b>Рынок:</b> купить с сайта откуда угодно (предмет — на Склад, забрать в лобби), продать из инвентаря, когда ты в лобби (окно с ценой), снять свой лот, Склад и что продалось, пока тебя не было. В игре — <code>/market</code> из любого мира.</li>" +
      "<li><b>Аккаунт:</b> вход — ником и паролем от сервера (тем же, что в <code>/login</code>). Здесь же — смена пароля, почта для восстановления, Discord, доверенные адреса (вход в игру без /login), выход на других устройствах.</li>" +
      "<li><b>Безопасность:</b> пароль проверяет сервер, сайт его не хранит. 5 неверных паролей — вход для ника закрыт на 15 минут. Потерял телефон — в игре <code>/account logout</code> или кнопка во вкладке «Аккаунт».</li></ul></div>";
  }

  // ---------------------------------------------------------------- старт
  var h0 = (location.hash || "").replace("#", "");
  if (TABS.indexOf(h0) >= 0) tab = h0;
  if (tok()) { show("load"); load(true); } else show("login");
})();
