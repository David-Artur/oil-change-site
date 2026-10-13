/* Личный кабинет DaviArt Craft. API — VPLand WebApi за Caddy: https://mc.daviart.com/api.
 * Вход: ник + одноразовый код из игры (/account) → токен (30 дней) в localStorage. Все действия — POST, ответ {ok, message}. */
(function () {
  "use strict";
  var qs = new URLSearchParams(location.search);
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || location.protocol === "file:";
  var API = (local && qs.get("api")) || "https://mc.daviart.com/api";
  var KEY = "daviart.cabinet.token";
  var me = null, tab = "profile";

  var SKILLS = {"walk":"Ходьба","sprint":"Бег","sneak":"Ходьба вприсядку","jump":"Прыжок в высоту","fall":"Падение","swim":"Плавание","swim_fast":"Быстрое плавание",
    "wade":"Ходьба в воде","breath":"Дыхание","riding":"Верховая езда","minecart":"Вагонетка","strength":"Сила удара","crit":"Критический удар","reach":"Дальность удара",
    "knockback":"Отбрасывание","shield":"Блок щитом","defense":"Защита","regen":"Регенерация здоровья","throwing":"Метание","suffocation_res":"Стойкость к удушью",
    "fire_res":"Стойкость к огню","poison_res":"Стойкость к ядам","mining":"Ломание блоков","ore_yield":"Добыча ресурсов","farming":"Фермерство","stomach":"Крепкий желудок",
    "injury_res":"Стойкость к травмам","adrenaline":"Адреналин","stamina":"Выносливость","second_wind":"Второе дыхание","stealth":"Скрытность","glide":"Полёт",
    "hardiness":"Акклиматизация","cold_tol":"Морозостойкость","heat_tol":"Жаростойкость","wet_res":"Привычка к сырости","first_aid":"Первая помощь","fishing":"Рыбалка","build":"Строительство"};
  var BODY = [["head", "Голова"], ["torso", "Туловище"], ["left_arm", "Левая рука"], ["right_arm", "Правая рука"], ["left_leg", "Левая нога"], ["right_leg", "Правая нога"]];
  var RANK = {3: "лидер", 2: "заместитель", 1: "участник"};

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  function money(v) { return "$" + Number(v || 0).toLocaleString("ru-RU", {maximumFractionDigits: 2}); }
  function getTok() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setTok(t) { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch (e) { } }
  var memTok = null;
  function tok() { return memTok || getTok(); }

  var toastT;
  function toast(msg, bad) {
    var t = $("toast");
    t.textContent = msg;
    t.style.boxShadow = bad ? "inset 0 0 0 2px #b4321f" : "";
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove("show"); }, 3800);
  }

  function api(path, body) {
    var h = {"Content-Type": "application/json"};
    if (tok()) h.Authorization = "Bearer " + tok();
    return fetch(API + path, {method: body ? "POST" : "GET", headers: h, body: body ? JSON.stringify(body) : undefined})
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401) { memTok = null; setTok(null); show("login"); }
          j.status = r.status;
          return j;
        });
      })
      .catch(function () { return {ok: false, message: "Сервер не отвечает. Попробуйте позже — возможно, идёт перезапуск."}; });
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
      load();
    });
  });

  $("logout").addEventListener("click", function () {
    api("/logout", {}).then(function () { memTok = null; setTok(null); me = null; show("login"); toast("Вы вышли из кабинета."); });
  });

  Array.prototype.forEach.call(document.querySelectorAll("#tabs .chip"), function (b) {
    b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); });
  });

  function setTab(t) {
    tab = t;
    Array.prototype.forEach.call(document.querySelectorAll("#tabs .chip"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t); });
    ["profile", "claims", "clan", "ach", "help"].forEach(function (x) { $("tab-" + x).hidden = x !== t; });
    try { history.replaceState(null, "", "#" + t); } catch (e) { }
  }

  function load() {
    if (!tok()) { show("login"); return; }
    api("/me").then(function (j) {
      if (!j.ok) { if (j.status !== 401) { show("login"); $("login-msg").textContent = j.message || ""; } return; }
      me = j;
      render();
      show("cab");
    });
  }

  // действие → сообщение → обновить профиль
  function act(path, body) {
    return api(path, body).then(function (j) {
      toast(j.message || (j.ok ? "Готово." : "Не получилось."), !j.ok);
      if (j.ok) load();
      return j;
    });
  }

  // ---------------------------------------------------------------- отрисовка
  function render() {
    $("me-nick").textContent = me.nick;
    $("me-dot").className = "dot" + (me.online ? " on" : "");
    $("me-online").textContent = me.online ? "в игре сейчас" : (me.lastSeen ? "был в игре " + new Date(me.lastSeen).toLocaleString("ru-RU") : "");
    $("me-bal").textContent = money(me.balance);
    $("me-lvl").textContent = me.level || "—";
    $("me-clan").textContent = me.clan ? "[" + me.clan.tag + "]" : "нет";
    renderProfile();
    renderClaims();
    renderClan();
    renderAch();
    renderHelp();
    setTab(tab);
  }

  function bar(v, cls) { return '<div class="bar ' + (cls || "") + '"><i style="width:' + Math.max(0, Math.min(100, v)) + '%"></i></div>'; }

  function renderProfile() {
    var s = me.stats || {};
    var h = '<div class="card cab-card"><h2>Статистика</h2><div class="cab-stats">' +
      stat("В игре", s.playMinutes != null ? (Math.floor(s.playMinutes / 60) + " ч " + (s.playMinutes % 60) + " мин") : "—") +
      stat("Смертей", s.deaths) + stat("Убито мобов", s.mobKills) + stat("Убито игроков", s.playerKills) +
      stat("Пройдено", s.walkCm != null ? (s.walkCm / 100000).toFixed(1) + " км" : "—") + stat("Прыжков", s.jumps) +
      stat("На сервере с", me.firstPlayed ? new Date(me.firstPlayed).toLocaleDateString("ru-RU") : "—") + '</div></div>';
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
    } else h += '<div class="card cab-card"><h2>Навыки</h2><p class="cab-meta">Данные прокачки появятся, когда сервер их отдаст.</p></div>';
    $("tab-profile").innerHTML = h;
  }
  function stat(l, v) { return '<div class="cab-stat"><span class="lbl">' + l + "</span><b>" + esc(v == null ? "—" : v) + "</b></div>"; }

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
    var h = '<div class="card cab-card" data-claim="' + esc(c.id) + '"><h2>' + esc(c.name) + (c.clan ? ' <span class="rank r2">клан</span>' : "") + "</h2>" +
      '<p class="cab-meta">' + esc(c.world) + " · " + esc(c.size) + " · центр " + esc(c.center) + (c.role < 3 ? " · хозяин " + esc(c.owner) : "") +
      " · твоя роль: " + (own ? "хозяин" : mgr ? "управляющий" : "участник") + "</p>";
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

  function renderClan() {
    var c = me.clan, h = "";
    if (me.invite && !c) {
      h += '<div class="card cab-card"><h2>Приглашение в клан</h2><p>Тебя зовут в клан <b>[' + esc(me.invite.tag) + "] " + esc(me.invite.name) + "</b> (пригласил " + esc(me.invite.by) + ').</p>' +
        '<div class="cab-row"><button class="btn green" data-c="accept">Вступить</button><button class="btn" data-c="decline">Отказаться</button></div></div>';
    }
    if (!c) {
      h += '<div class="card cab-card"><h2>Создать клан</h2><p class="cab-meta">Цена — <b>' + money(me.clanPrice) + "</b> (у тебя " + money(me.balance) + "). Тег — 2–4 буквы или цифры, название — до 24 символов. Участников — без ограничения.</p>" +
        '<div class="cab-row"><input type="text" id="cl-tag" maxlength="4" placeholder="ТЕГ" style="max-width:110px;flex:none"><input type="text" id="cl-name" maxlength="24" placeholder="Название клана"><button class="btn gold" data-c="create">Создать</button></div>' +
        '<p class="cab-note">Что даёт клан: тег у ника, клан-чат (<code>!текст</code>), свои не бьют своих (кроме Пустошей), клан-приваты для всех участников, общий банк и налог. Подробнее — <a href="index.html#clans">Кланы</a>.</p></div>';
      $("tab-clan").innerHTML = h;
      wireClan();
      return;
    }
    var r = c.rank;
    h += '<div class="card cab-card"><h2>[' + esc(c.tag) + "] " + esc(c.name) + ' <span class="rank r' + r + '">' + RANK[r] + "</span></h2>" +
      '<div class="cab-stats">' + stat("Участников", c.members.length) + stat("Банк", money(c.bank)) + stat("Налог", c.tax + "%") + stat("Клан-приватов", c.claims) + "</div></div>";
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
    // действия
    h += '<div class="cab-cards">';
    if (r >= 2) h += '<div class="card cab-card"><h3>Пригласить</h3><p class="cab-meta">Игрок должен хоть раз зайти на сервер. Приглашение — 24 часа; если он не в сети, увидит при входе (и в своём кабинете).</p><div class="cab-row"><input type="text" id="cl-inv" maxlength="16" placeholder="Ник"><button class="btn small green" data-c="invite">Пригласить</button></div></div>';
    h += '<div class="card cab-card"><h3>Банк клана</h3><p class="cab-meta">Из банка оплачивается расширение клан-приватов. Снять может только лидер.</p><div class="cab-row"><input type="number" id="cl-sum" min="1" step="1" placeholder="Сумма, $"><button class="btn small green" data-c="deposit">Внести</button>' + (r === 3 ? '<button class="btn small" data-c="withdraw">Снять</button>' : "") + "</div></div>";
    if (r === 3) h += '<div class="card cab-card"><h3>Налог клана</h3><p class="cab-meta">Доля от продаж меди, продаж на Рынке и полученных переводов участников идёт в банк. 0–' + c.maxTax + '%.</p><div class="cab-row"><input type="number" id="cl-tax" min="0" max="' + c.maxTax + '" value="' + c.tax + '"><button class="btn small" data-c="tax">Сохранить</button></div></div>';
    h += '<div class="card cab-card"><h3>' + (r === 3 ? "Распустить клан" : "Выйти из клана") + '</h3><p class="cab-meta">' + (r === 3 ? "Клан-приваты исчезнут, вложенное в них вернётся в банк, банк поделят поровну между участниками. Чтобы уйти, не распуская, — передай лидерство." : "Ты перестанешь быть участником; вернуться — по новому приглашению.") +
      '</p><button class="btn small red" data-c="' + (r === 3 ? "disband" : "leave") + '">' + (r === 3 ? "Распустить" : "Выйти") + "</button></div>";
    h += "</div>";
    $("tab-clan").innerHTML = h;
    wireClan();
  }

  function wireClan() {
    Array.prototype.forEach.call(document.querySelectorAll("#tab-clan [data-c]"), function (b) {
      b.onclick = function () {
        var a = b.getAttribute("data-c"), n = b.getAttribute("data-n"), args = [];
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
      "<li>Кабинет показывает данные прямо с сервера: изменения в игре видны здесь сразу (обнови страницу), изменения отсюда — сразу в игре.</li>" +
      "<li><b>Приваты:</b> название, друзья и их права, двери для гостей, взрывы, видимость на карте. Расширить, уменьшить или удалить приват — только в игре, компасом (ПКМ — меню).</li>" +
      "<li><b>Клан:</b> лидер — всё; заместитель — приглашать, исключать участников, ставить клан-приваты и табличку (<code>/clan sign</code>); участник — строить в клан-привате и вносить в банк.</li>" +
      "<li><b>Безопасность:</b> вход — только кодом из игры. Потерял телефон или вошёл на чужом компьютере — напиши в игре <code>/account logout</code>: выйдут все устройства.</li>" +
      "<li>Сессия живёт 30 дней с последнего визита.</li></ul></div>";
  }

  // ---------------------------------------------------------------- старт
  var h0 = (location.hash || "").replace("#", "");
  if (["profile", "claims", "clan", "ach", "help"].indexOf(h0) >= 0) tab = h0;
  if (tok()) { show("load"); load(); } else show("login");
})();
