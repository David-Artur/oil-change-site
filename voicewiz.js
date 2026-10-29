/* У426 (владелец 2026-10-28): это ЕДИНСТВЕННЫЙ вход в кабинет (cabinet.html и cabinet.html#voice) — «Личный кабинет · Голос и звук · Карта»;
 * галочка «Сразу включить звук и голос» (#vw-auto, по умолч. вкл.): выключена — «Войти» без звука, на «Главной» кнопка «Включить звук и голос».
 * У399 + У404 (владелец 2026-10-25): «Подключиться к голосу и звуку» — мастер живёт на cabinet.html#voice (кнопка на главной ведёт сюда).
 * Шаг 1 — ник (запомненный на устройстве ник → сразу шаг 2 со ссылкой «другой ник»), шаг 2 — пароль от игры (тот же /api/login).
 * У404: нажатие «Войти» — это жест на ЭТОЙ странице: прямо в обработчике (до любых await/fetch) создаётся и возобновляется AudioContext
 * (VPVoice.prime → resume), включаются звуки мира. После ответа сервера — БЕЗ перезагрузки страницы открывается «Главная» кабинета,
 * голос подключается «только слушать», наверху «Главной» — карточка #vw-top: крупный статус «Звуки мира · слышишь игроков · микрофон»
 * и большая кнопка «🎤 Включить микрофон». Уже вошедшему (сессия есть) — сразу кабинет с одной кнопкой «🎧 Включить звук и голос»
 * (без нажатия браузер звук не даст).
 * Подключение: cabinet.js вызывает VPVoiceWiz.start(cab), cab = {api, toast, login(nick, pass) → Promise<json>, me(), openCabinet()};
 * VPVoiceWiz.view("login") — показать шаги мастера (нет входа). */
(function () {
  "use strict";
  var cab = null, step = 0, nick = "", started = false;
  var NICK_KEY = "daviart.voice.nick";
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  function set(id, html) { var e = $(id); if (e && e.__h !== html) { e.__h = html; e.innerHTML = html; } }
  function V() { return window.VPVoice; }
  function savedNick() { try { var n = localStorage.getItem(NICK_KEY) || ""; return /^[A-Za-z0-9_]{3,16}$/.test(n) ? n : ""; } catch (e) { return ""; } }
  function saveNick(n) { try { localStorage.setItem(NICK_KEY, n); } catch (e) { } }
  // У426: галочка «Сразу включить звук и голос» — по умолчанию вкл., выбор запоминается на устройстве
  var AUTO_KEY = "daviart.voice.auto";
  function autoOn() { var c = $("vw-auto"); return !c || c.checked; }
  function autoLabel() { var b = $("vw-login"); if (b) b.textContent = autoOn() ? "🎧 Войти и включить звук" : "🔑 Войти"; }

  function go(n) {
    step = n;
    [1, 2].forEach(function (i) { $("vw-s" + i).hidden = i !== n; });
    Array.prototype.forEach.call(document.querySelectorAll("#vw-dots li"), function (li) {
      var d = +li.getAttribute("data-d");
      li.className = d < n ? "done" : d === n ? "cur" : "";
    });
    setTimeout(function () { var i = $(n === 1 ? "vw-nick" : "vw-pass"); if (i) try { i.focus(); } catch (e) { } }, 50);
  }
  function toPass(n) {
    nick = n;
    $("vw-nickshow").textContent = n;
    $("vw-user").value = n;   // для менеджера паролей: ник + пароль в одной форме
    go(2);
  }

  // голос — смонтирован на «Главной» (home.js → #hm-voice) или, пока её нет, во временную скрытую #vw-panel
  function mountVoice() {
    var v = V(); if (!v) return false;
    var hm = $("hm-voice");
    if (hm && hm.firstChild) return true;
    var p = $("vw-panel");
    if (p && !p.firstChild) v.mount(p, {api: cab.api, toast: cab.toast, compact: true, noMicBtn: true});
    return true;
  }

  // ВЫЗЫВАТЬ СИНХРОННО В ОБРАБОТЧИКЕ НАЖАТИЯ (iOS Safari: resume() — до любых await): AudioContext создан и возобновлён, речь разрешена,
  // звуки мира включены (настройка). Голос подключится позже — startAudio() после ответа сервера возьмёт этот же AudioContext.
  function gesture() {
    if (V()) V().prime();
    if (window.VPSound && !VPSound.enabled()) VPSound.toggle();   // «звуки мира уже включены»
    if (window.VPSound && VPSound.unlock) VPSound.unlock();
  }
  // подключить голос «только слушать» (без микрофона) + звучащие точки мира
  function startAudio() {
    var v = V();
    if (!v || !mountVoice()) { set("vw-game", "Не загрузился голосовой чат — обнови страницу 🔄."); return; }
    if (!v.active()) v.listen();
    if (window.VPSound && VPSound.unlock) VPSound.unlock();
    render();
  }

  function render() {
    var top = $("vw-top");
    if (!top || top.hidden) return;
    var v = V(), st = v ? v.state() : {on: false};
    $("vw-start").hidden = !!st.on;
    $("vw-live").hidden = !st.on;
    if (!st.on) return;
    // крупный статус: «✅ Звуки мира включены · 🎧 слышишь игроков рядом · 🎤 микрофон выкл»
    var sndOk = st.sound && st.audio === "running";
    set("vw-st-snd", st.sound ? (sndOk ? "✅ Звуки мира включены" : "⚠ Звук на паузе") : "🔕 Звуки мира выкл");
    $("vw-st-snd").className = sndOk ? "ok" : "warn";
    set("vw-st-hear", !st.server ? "⏳ подключаюсь…" : st.near ? "🎧 слышишь игроков рядом: " + st.near : "🎧 слышишь игроков рядом");
    $("vw-st-hear").className = st.server ? "ok" : "wait";
    set("vw-st-mic", st.micLive ? "🎤 микрофон вкл" : st.mic === "asking" ? "🎤 разреши микрофон" : "🎤 микрофон выкл");
    $("vw-st-mic").className = st.micLive ? "ok" : st.mic === "asking" ? "wait" : "off";
    var b = $("vw-mic");
    b.disabled = st.mic === "asking";
    b.textContent = st.micLive ? "🔇 Выключить микрофон" : st.mic === "asking" ? "⏳ Жду разрешение…" : "🎤 Включить микрофон";
    b.className = "btn vw-btn " + (st.micLive ? "" : "green vw-pulse");
    var help = v.micHelp(st.mic);
    set("vw-michelp", help ? "⚠ " + help : st.micLive ? "Тебя слышат игроки рядом. Лучше в наушниках." : "Чтобы тебя слышали — нажми, браузер спросит разрешение.");
    $("vw-michelp").className = "vw-michelp" + (help ? " bad" : "");
    var g = !st.server ? "" : st.inGame ? "📍 " + esc(st.world || "В игре") + " · в голосе: " + st.connected
      : "Зайди в игру на <b>daviart.com</b> — вкладку не закрывай.";
    set("vw-game", g);
    $("vw-fix").hidden = !(st.audio && st.audio !== "running" && st.audio !== "none");
  }

  function friendly(j) {
    var m = (j && j.message) || "Не получилось.";
    if (j && j.offline) return "Сервер не отвечает — возможно, идёт перезапуск. Попробуй через минуту.";
    if (/Неверный ник или пароль/.test(m)) return m + " Пароль — тот же, что ты вводишь в игре после <code>/login</code>.";
    if (/Сначала зайди/.test(m)) return m + " Зайди на сервер <b>daviart.com</b>, зарегистрируйся (<code>/register</code>) — и возвращайся.";
    return esc(m);
  }

  function bind() {
    $("vw-s1").addEventListener("submit", function (e) {
      e.preventDefault();
      var n = $("vw-nick").value.trim(), m = $("vw-m1");
      if (!/^[A-Za-z0-9_]{3,16}$/.test(n)) { m.textContent = n ? "Ник — от 3 до 16 латинских букв, цифр или «_», как в игре." : "Напиши свой ник из игры."; return; }
      m.textContent = "";
      toPass(n);
    });
    $("vw-back").onclick = function (e) { e.preventDefault(); $("vw-m2").textContent = ""; $("vw-nick").value = ""; go(1); };
    $("vw-s2").addEventListener("submit", function (e) {
      e.preventDefault();
      var m = $("vw-m2"), p = $("vw-pass").value, btn = $("vw-login");
      if (!p) { m.className = "cab-msg"; m.textContent = "Напиши пароль от игры."; return; }
      var auto = autoOn();
      if (auto) gesture();   // ← синхронно, в этом же нажатии: после ответа сервера браузер звук уже не разрешил бы
      m.className = "cab-msg"; m.textContent = "Проверяю…"; btn.disabled = true;
      cab.login(nick, p).then(function (j) {
        btn.disabled = false;
        if (!j || !j.ok) { m.innerHTML = friendly(j); return; }
        $("vw-pass").value = ""; m.textContent = "";
        saveNick(nick);
        $("vw-top").hidden = false;
        cab.openCabinet();   // та же страница, без перезагрузки — AudioContext остаётся «running»
        if (auto) startAudio(); else render();   // У426: без галочки — кабинет, звук потом кнопкой на карточке
      });
    });
    var ac = $("vw-auto");
    if (ac) {
      try { if (localStorage.getItem(AUTO_KEY) === "0") ac.checked = false; } catch (e) { }
      ac.addEventListener("change", function () { try { localStorage.setItem(AUTO_KEY, ac.checked ? "1" : "0"); } catch (e) { } autoLabel(); });
      autoLabel();
    }
    $("vw-go").onclick = function () { gesture(); startAudio(); };
    $("vw-mic").onclick = function () {
      var v = V(); if (!v) return;
      if (window.VPSound && VPSound.unlock) VPSound.unlock();   // ещё один жест — заодно радио на iPhone
      if (v.state().micLive) v.disableMic(); else v.enableMic();
      render();
    };
    $("vw-fix").onclick = function () { var v = V(); if (v) v.fix(); setTimeout(render, 300); };
    if (V()) V().onChange(render);
    setInterval(render, 1000);   // «звук на паузе», связь — обновлять, даже если опрос голоса молчит
  }

  window.VPVoiceWiz = {
    // armed — страница открыта по cabinet.html#voice: карточка голоса наверху «Главной» кабинета
    start: function (c) {
      if (started) return; started = true;
      cab = c; bind();
      document.body.classList.add("vw-armed");
      $("vw-top").hidden = false;
      render();
    },
    view: function (v) {
      if (v !== "login" || step) return;
      var n = savedNick();
      if (n) { $("vw-nick").value = n; toPass(n); } else go(1);
    },
    render: render
  };
})();
