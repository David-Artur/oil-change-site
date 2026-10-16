/* DaviArt Craft — «Донат» (У208.2, 2026-10-16): бесплатные $ за голоса на мониторингах + пакеты игровой валюты (оплата lava.top через VPPay).
 * Используется на главной (раздел #donate, pages.js) и в кабинете (вкладка «Донат», cabinet.js):
 *   DShop.votes(el, nick)            — карточки площадок: «+$25 · Голосовать на сайте» / «✔ сегодня», и «все 4 — +$100»
 *   DShop.packs(el, getNick, opts)   — карточки пакетов; клик → способ оплаты + почта (+ ник, если opts.askNick) → /pay/create → lava.top
 * Данные: https://mc.daviart.com/vote/status?nick= | /vote/sites, https://mc.daviart.com/pay/packs | /pay/create. */
(function () {
  var VOTE = "https://mc.daviart.com/vote", PAY = "https://mc.daviart.com/pay";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  function fmt(n) { return String(Math.round(n * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function json(url, opt) { return fetch(url, opt).then(function (r) { return r.json(); }); }

  // ---------------------------------------------------------------- голоса
  var voteTimers = [];
  function votes(el, nick) {
    if (!el) return;
    voteTimers.forEach(clearTimeout); voteTimers = [];
    var url = nick ? VOTE + "/status?nick=" + encodeURIComponent(nick) : VOTE + "/sites";
    json(url).then(function (d) { draw(d); }).catch(function () { el.innerHTML = '<p class="empty">Не удалось загрузить площадки — сервер не отвечает.</p>'; });
    function draw(d) {
      if (!d || d.error || !d.sites) { el.innerHTML = '<p class="empty">' + (d && d.error ? "Проверь ник — латиница, цифры и _." : "Нет данных.") + "</p>"; return; }
      var sites = d.sites, done = 0, h = "";
      sites.forEach(function (s) {
        var today = !!s.today; if (today) done++;
        h += '<div class="card don-card vote-card' + (today ? " voted" : "") + '"><span class="don-tag green">Бесплатно</span>' +
          "<h3>" + esc(s.name) + '</h3><p class="don-price">+$' + fmt(d.reward) + ' <span>за голос, раз в сутки</span></p>' +
          (today ? '<p class="vote-ok">✔ Сегодня ты уже проголосовал</p>'
            : '<a class="btn green" href="' + esc(s.url) + '" target="_blank" rel="noopener" data-vote>Голосовать на сайте</a>') + "</div>";
      });
      if (d.bonus > 0) h += '<div class="card don-card vote-card vote-all' + (d.bonusToday ? " voted" : "") + '"><span class="don-tag">Бонус</span>' +
        '<h3>Все ' + sites.length + ' за сутки</h3><p class="don-price">+$' + fmt(d.bonus) + ' <span>сверху</span></p>' +
        '<div class="vote-bar" aria-label="Проголосовано ' + done + " из " + sites.length + '"><i style="width:' + (sites.length ? done / sites.length * 100 : 0) + '%"></i></div>' +
        '<p class="vote-ok">' + (d.bonusToday ? "✔ Бонус получен сегодня" : (nick ? done + " из " + sites.length + " — проголосуй везде" : "Итого до $" + fmt(d.reward * sites.length + d.bonus) + " в день")) + "</p></div>";
      var note = nick ? (d.eligible === false ? '<p class="vote-note">Голоса засчитываются сразу, а $ придут, когда наиграешь на сервере ' + esc(d.needMinutes) + " мин.</p>"
          : '<p class="vote-note">На сайте площадки впиши ник <b>' + esc(d.nick || nick) + "</b>. $ придут в игре через минуту (не в сети — при входе). Отметки обновляются сами.</p>")
        : '<p class="vote-note">Впиши свой ник — покажем, где ты уже проголосовал сегодня. На сайте площадки тоже указывай ник из игры.</p>';
      el.innerHTML = '<div class="don-grid">' + h + "</div>" + note;
      Array.prototype.forEach.call(el.querySelectorAll("[data-vote]"), function (a) {
        a.addEventListener("click", function () { if (nick) [20, 45, 90, 150].forEach(function (s) { voteTimers.push(setTimeout(function () { votes(el, nick); }, s * 1000)); }); });
      });
    }
  }

  // ---------------------------------------------------------------- пакеты
  function packs(el, getNick, opts) {
    if (!el) return;
    opts = opts || {};
    var data = null, sel = null, msel = 0;
    json(PAY + "/packs").then(function (d) { data = d; draw(); }).catch(function () {
      el.innerHTML = '<p class="empty">Оплата сейчас недоступна — сервер не отвечает. Попробуй позже или напиши в <a href="https://discord.gg/sTgZM8Kh" target="_blank" rel="noopener">Discord</a>.</p>';
    });
    function draw() {
      if (!data || !data.packs || !data.packs.length) { el.innerHTML = '<p class="empty">Пакеты не загрузились.</p>'; return; }
      var h = '<div class="don-grid">';
      data.packs.forEach(function (p, i) {
        h += '<div class="card don-card pack-card' + (sel === i ? " sel" : "") + (p.bonus ? " don-best" : "") + '">' + (p.bonus ? '<span class="don-tag">' + esc(p.bonus) + " выгоднее</span>" : "") +
          '<h3>$' + fmt(p.coins) + ' <small>игровой валюты</small></h3><p class="don-price">' + fmt(p.rub) + ' ₽ <span>или $' + Number(p.usd).toFixed(2) + "</span></p>" +
          '<button class="btn gold" type="button" data-pack="' + i + '"' + (data.enabled ? "" : " disabled") + ">" + (data.enabled ? "Купить" : "Скоро") + "</button></div>";
      });
      h += "</div>";
      if (sel != null) h += form();
      el.innerHTML = h;
      Array.prototype.forEach.call(el.querySelectorAll("[data-pack]"), function (b) {
        b.onclick = function () { sel = +b.getAttribute("data-pack"); draw(); var f = el.querySelector(".pay-form"); if (f && f.scrollIntoView) f.scrollIntoView({behavior: "smooth", block: "center"}); };
      });
      Array.prototype.forEach.call(el.querySelectorAll("[data-m]"), function (b) { b.onclick = function () { msel = +b.getAttribute("data-m"); keep(); draw(); }; });
      var f = el.querySelector(".pay-form");
      if (f) f.addEventListener("submit", submit);
      var x = el.querySelector("[data-close]"); if (x) x.onclick = function () { sel = null; draw(); };
    }
    function keep() { var n = el.querySelector("#pf-nick"), m = el.querySelector("#pf-email"); if (n) put("daviart-nick", n.value.trim()); if (m) put("daviart-email", m.value.trim()); }
    function form() {
      var p = data.packs[sel], m = data.methods[msel] || data.methods[0], rub = m.currency === "RUB";
      var nick = getNick ? getNick() : "";
      var h = '<form class="card pay-form" novalidate><div class="pf-head"><b>$' + fmt(p.coins) + "</b> за " + (rub ? fmt(p.rub) + " ₽" : "$" + Number(p.usd).toFixed(2)) +
        (nick && !opts.askNick ? " · на ник <b>" + esc(nick) + "</b>" : "") + '<button type="button" class="pf-x" data-close aria-label="Закрыть">✕</button></div>';
      h += '<div class="pf-methods" role="radiogroup" aria-label="Способ оплаты">';
      data.methods.forEach(function (x, i) { h += '<button type="button" class="' + (i === msel ? "sel" : "") + '" data-m="' + i + '" role="radio" aria-checked="' + (i === msel) + '">' + esc(x.title) + "</button>"; });
      h += "</div>";
      if (opts.askNick || !nick) h += '<label for="pf-nick">Ник в игре</label><input id="pf-nick" maxlength="16" autocomplete="username" value="' + esc(nick || get("daviart-nick") || "") + '" placeholder="Например, Steve">';
      h += '<label for="pf-email">Почта — для чека</label><input id="pf-email" type="email" maxlength="200" autocomplete="email" value="' + esc(get("daviart-email") || "") + '" placeholder="you@mail.ru">';
      h += '<label class="pf-agree"><input type="checkbox" id="pf-agree"> Согласен с <a href="oferta.html" target="_blank" rel="noopener">условиями покупки и возврата</a></label>';
      h += '<button class="btn gold" type="submit" id="pf-pay">Оплатить</button><p class="pf-err" id="pf-err" role="alert" hidden></p>';
      h += '<p class="vote-note">$ придут на ник через минуту после оплаты (не в игре — при входе).</p></form>';
      return h;
    }
    function submit(ev) {
      ev.preventDefault();
      var err = el.querySelector("#pf-err"), btn = el.querySelector("#pf-pay");
      function fail(t) { err.textContent = t; err.hidden = false; btn.disabled = false; btn.textContent = "Оплатить"; }
      var ni = el.querySelector("#pf-nick"), nick = ni ? ni.value.trim() : (getNick ? getNick() : "");
      var email = el.querySelector("#pf-email").value.trim();
      if (!/^[A-Za-z0-9_]{3,16}$/.test(nick || "")) return fail("Ник: латиница, цифры и _, от 3 до 16 символов.");
      if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(email)) return fail("Укажи почту — на неё придёт чек.");
      if (!el.querySelector("#pf-agree").checked) return fail("Отметь согласие с условиями покупки.");
      keep(); err.hidden = true; btn.disabled = true; btn.textContent = "Создаём счёт…";
      json(PAY + "/create", {method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({nick: nick, email: email, pack: data.packs[sel].id, method: data.methods[msel].id})})
        .then(function (d) { if (d && d.ok && d.url) { put("daviart-order", d.id); location.href = d.url; } else fail((d && d.error) || "Не получилось создать счёт."); })
        .catch(function () { fail("Сервер не отвечает — попробуй позже."); });
    }
  }

  window.DShop = {votes: votes, packs: packs};
})();
