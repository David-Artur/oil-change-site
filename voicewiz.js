/* У399 (владелец 2026-10-25): «Подключиться к голосовому чату» — простой мастер в cabinet.html#voice.
 * Шаг 1 — ник, шаг 2 — пароль от игры (тот же, что /login) → вход тем же /api/login, что у кабинета; сразу (это нажатие — браузер разрешает
 * звук) включаются звуки мира и голос «только слушать» (voice.js). Шаг 3 — крупный статус и отдельная кнопка «🎤 Включить микрофон».
 * Уже вошедшему — сразу шаг 3 (одна кнопка «Включить звук и голос»: без нажатия браузер звук не даст).
 * Подключение: cabinet.js вызывает VPVoiceWiz.start(cab), где cab = {api, toast, login(nick, pass) → Promise<json>, me() → данные /me,
 * openCabinet()}; дальше cabinet.js сообщает вид: VPVoiceWiz.view("login" | "load" | "cab"). */
(function () {
  "use strict";
  var cab = null, step = 0, mounted = false, nick = "";
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  function set(id, html) { var e = $(id); if (e && e.__h !== html) { e.__h = html; e.innerHTML = html; } }
  function V() { return window.VPVoice; }

  function go(n) {
    step = n;
    [1, 2, 3].forEach(function (i) { $("vw-s" + i).hidden = i !== n; });
    Array.prototype.forEach.call(document.querySelectorAll("#vw-dots li"), function (li) {
      var d = +li.getAttribute("data-d");
      li.className = d < n ? "done" : d === n ? "cur" : "";
    });
    if (n === 1) setTimeout(function () { var i = $("vw-nick"); if (i && !i.value) try { i.focus(); } catch (e) { } }, 50);
    if (n === 2) setTimeout(function () { try { $("vw-pass").focus(); } catch (e) { } }, 50);
    if (n === 3) render();
  }

  function mountVoice() {
    if (mounted || !V()) return;
    mounted = true;
    V().mount($("vw-panel"), {api: cab.api, toast: cab.toast, compact: true, noMicBtn: true});
    V().onChange(render);
  }

  // включить звук мира и голос «только слушать»; вызывать после prime() (по нажатию)
  function startAudio() {
    mountVoice();
    var v = V();
    if (!v) { set("vw-game", "Не загрузился голосовой чат — обнови страницу 🔄."); return; }
    if (!v.active()) v.listen();
    if (window.VPSound && !VPSound.enabled()) VPSound.toggle();   // «после ввода автоматически включаются музыка и звук»
    if (window.VPSound && VPSound.unlock) VPSound.unlock();
    render();
  }

  function render() {
    if (step !== 3) return;
    var v = V(), st = v ? v.state() : {on: false};
    var me = cab && cab.me ? cab.me() : null;
    set("vw-me", me && me.nick ? "Ты вошёл как <b>" + esc(me.nick) + "</b>" : "Проверяю вход…");
    $("vw-start").hidden = !!st.on;
    $("vw-live").hidden = !st.on;
    if (!st.on) return;
    // статус крупно: звук · слышишь · микрофон
    var snd = st.sound ? (st.audio === "running" ? "✅ Звук включён" : "⚠ Звук на паузе — нажми «🔊 Вернуть звук»") : "🔕 Звуки мира выключены";
    set("vw-st-snd", snd);
    $("vw-st-snd").className = st.sound && st.audio === "running" ? "ok" : "warn";
    var hear = !st.server ? "⏳ Подключаюсь к серверу…" : !st.inGame ? "🎧 Голос готов — зайди в игру, и услышишь игроков рядом" :
      st.near ? "🎧 Слышишь игроков рядом: " + st.near : "🎧 Слышишь игроков рядом (сейчас рядом никого в голосе)";
    set("vw-st-hear", hear);
    $("vw-st-hear").className = st.server && st.inGame ? "ok" : "wait";
    var mic = st.micLive ? "🎤 Микрофон работает — тебя слышат игроки рядом" : st.mic === "asking" ? "🎤 Разреши доступ к микрофону (окно браузера)" : "🎤 Микрофон выключен";
    set("vw-st-mic", mic);
    $("vw-st-mic").className = st.micLive ? "ok" : st.mic === "asking" ? "wait" : "off";
    var b = $("vw-mic");
    b.disabled = st.mic === "asking";
    b.textContent = st.micLive ? "🔇 Выключить микрофон" : st.mic === "asking" ? "⏳ Жду разрешение…" : "🎤 Включить микрофон";
    b.className = "btn vw-btn " + (st.micLive ? "" : "green vw-pulse");
    var help = v.micHelp(st.mic);
    set("vw-michelp", help ? "⚠ " + help : st.micLive ? "Говори как обычно. Лучше в наушниках — не будет эха." : "Хочешь, чтобы тебя слышали? Нажми — браузер спросит разрешение на микрофон.");
    $("vw-michelp").className = "vw-michelp" + (help ? " bad" : "");
    var g = !st.server ? "" : st.inGame ? "📍 " + esc(st.world || "В игре") + " · в голосе на сервере: " + st.connected + (st.others ? " · рядом без голоса: " + st.others : "")
      : "Ты сейчас не в игре. Зайди на сервер <b>daviart.com</b> — эта вкладка пусть остаётся открытой.";
    set("vw-game", g);
    $("vw-fix").hidden = !(st.audio && st.audio !== "running" && st.audio !== "none");
  }

  function friendly(j) {
    var m = (j && j.message) || "Не получилось.";
    if (j && j.offline) return "Сервер не отвечает — возможно, идёт перезапуск. Попробуй через минуту.";
    if (/Неверный ник или пароль/.test(m)) return m + " Пароль — тот же, что ты вводишь в игре после <code>/login</code>. Проверь ник на шаге 1.";
    if (/Сначала зайди/.test(m)) return m + " Зайди на сервер <b>daviart.com</b>, зарегистрируйся (<code>/register</code>) — и возвращайся.";
    return esc(m);
  }

  function bind() {
    $("vw-s1").addEventListener("submit", function (e) {
      e.preventDefault();
      var n = $("vw-nick").value.trim(), m = $("vw-m1");
      if (!/^[A-Za-z0-9_]{3,16}$/.test(n)) { m.textContent = n ? "Ник — от 3 до 16 латинских букв, цифр или «_», как в игре." : "Напиши свой ник из игры."; return; }
      m.textContent = "";
      nick = n;
      $("vw-nickshow").textContent = n;
      $("vw-user").value = n;
      go(2);
    });
    $("vw-back").onclick = function (e) { e.preventDefault(); $("vw-m2").textContent = ""; go(1); };
    $("vw-s2").addEventListener("submit", function (e) {
      e.preventDefault();
      var m = $("vw-m2"), p = $("vw-pass").value, btn = $("vw-login");
      if (!p) { m.className = "cab-msg"; m.textContent = "Напиши пароль от игры."; return; }
      if (V()) V().prime();   // это нажатие — сейчас браузер разрешает звук (потом, после ответа сервера, уже нет)
      m.className = "cab-msg"; m.textContent = "Проверяю…"; btn.disabled = true;
      cab.login(nick, p).then(function (j) {
        btn.disabled = false;
        if (!j || !j.ok) { m.innerHTML = friendly(j); return; }
        $("vw-pass").value = "";
        m.className = "cab-msg ok"; m.textContent = "Готово!";
        go(3);
        startAudio();
      });
    });
    $("vw-go").onclick = function () { if (V()) V().prime(); startAudio(); };
    $("vw-mic").onclick = function () {
      var v = V(); if (!v) return;
      if (v.state().micLive) v.disableMic(); else v.enableMic();
      render();
    };
    $("vw-fix").onclick = function () { var v = V(); if (v) v.fix(); setTimeout(render, 300); };
    $("vw-cab").onclick = function () { cab.openCabinet(); };
    $("vw-out").onclick = function () { var v = V(); if (v) v.leave(); render(); };
    setInterval(render, 1000);   // «звук на паузе», связь — обновлять, даже если опрос голоса молчит
  }

  window.VPVoiceWiz = {
    start: function (c) { cab = c; bind(); },
    // cabinet.js: login — нужен вход; load — проверяю сохранённый вход; cab — вошёл
    view: function (v) {
      if (v === "login") { if (step !== 1 && step !== 2) go(1); }
      else if (v === "load") { if (!step) go(3); }
      else if (v === "cab") { if (step !== 3) go(3); else render(); mountVoice(); }
    }
  };
})();
