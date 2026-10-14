/* Разделы сайта как подстраницы (владелец 2026-10-13: «главная слишком длинная — раздели по подстраницам; по кнопке — свой раздел,
 * а если листаешь вниз — следующие подгружаются по очереди, заранее и по несколько»).
 * Каждый <section> в <main> — подстраница. Открыт раздел + следующий (заранее); долистал до конца — открывается ещё один.
 * Пункт меню подсвечивается по разделу на экране. Ссылки «#раздел» в тексте работают так же. Плюс раздел «Донат» (пакеты — с сервера). */
(function () {
  "use strict";
  var main = document.querySelector("main");
  if (!main) return;
  var secs = Array.prototype.slice.call(main.querySelectorAll(":scope > section[id]"));
  if (!secs.length) return;
  var nav = document.getElementById("nav");
  var links = nav ? Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]')) : [];
  var ids = secs.map(function (s) { return s.id; });
  var PRELOAD = 1;   // сколько следующих разделов держать открытыми заранее
  var shownTo = -1, startAt = 0;

  function title(i) { var h = secs[i] && secs[i].querySelector("h2"); return h ? h.textContent.replace(/^[^\p{L}\p{N}]+/u, "").trim() : ids[i]; }

  // подвал раздела: назад / дальше
  secs.forEach(function (s, i) {
    if (s.querySelector(".pg-foot")) return;
    var f = document.createElement("div");
    f.className = "pg-foot";
    f.innerHTML = (i > 0 ? '<a class="btn small" href="#' + ids[i - 1] + '">← ' + "</a>" : "<span></span>") +
      (i < secs.length - 1 ? '<a class="btn small green" href="#' + ids[i + 1] + '">Дальше →</a>' : "<span></span>");
    s.appendChild(f);
  });
  function labelFoot() {   // подписи «назад/дальше» — после того как app.js отрисовал заголовки разделов
    secs.forEach(function (s, i) {
      var a = s.querySelectorAll(".pg-foot a");
      a.forEach(function (x) {
        var j = ids.indexOf(x.getAttribute("href").slice(1));
        if (j < 0) return;
        x.textContent = j < i ? "← " + title(j) : "Дальше: " + title(j) + " →";
      });
    });
  }

  var sentinel = document.createElement("div");
  sentinel.className = "pg-sentinel";
  sentinel.setAttribute("aria-hidden", "true");
  main.appendChild(sentinel);

  function showRange(from, to) {
    secs.forEach(function (s, i) { var vis = i >= from && i <= to; s.hidden = !vis; s.classList.toggle("pg-on", vis); });
    startAt = from; shownTo = to;
    sentinel.hidden = to >= secs.length - 1;
  }

  function go(id, push, smooth) {
    var i = ids.indexOf(id);
    if (i < 0) i = 0;
    showRange(i, Math.min(secs.length - 1, i + PRELOAD));
    if (push) { try { history.pushState(null, "", "#" + ids[i]); } catch (e) { location.hash = ids[i]; } }
    var navH = nav ? nav.offsetHeight : 0;
    var y = secs[i].getBoundingClientRect().top + window.pageYOffset - navH - 8;
    if (i === 0 && !push) y = 0;   // первый вход — с самого верха (шапка с адресом)
    window.scrollTo({ top: Math.max(0, y), behavior: smooth ? "smooth" : "auto" });
    mark(i);
  }

  function mark(i) {
    links.forEach(function (a) { var on = a.getAttribute("href") === "#" + ids[i]; a.classList.toggle("cur", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    var cur = links.filter(function (a) { return a.classList.contains("cur"); })[0];
    if (cur && cur.scrollIntoView && nav) { var wrap = cur.parentElement; if (wrap) wrap.scrollLeft = cur.offsetLeft - wrap.clientWidth / 2 + cur.offsetWidth / 2; }
  }

  // долистал до конца — открыть следующий раздел (заранее, до того как кончится текст)
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (ent) {
      ent.forEach(function (e) { if (e.isIntersecting && shownTo < secs.length - 1) showRange(startAt, shownTo + 1); });
    }, { rootMargin: "0px 0px 900px 0px" }).observe(sentinel);
  }

  // подсветку при прокрутке делает app.js (класс cur); здесь — только при переходе

  // все ссылки «#раздел» на странице
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    if (ids.indexOf(id) < 0) return;
    e.preventDefault();
    go(id, true, false);
  });
  window.addEventListener("popstate", function () { go((location.hash || "").slice(1), false, false); });

  // ---------------------------------------------------------------- Донат: пакеты с сервера, «Поддержать»
  var S = window.SITE || {};
  var API = S.api || "https://mc.daviart.com/api";
  var TOKEN_KEY = "daviart.cabinet.token";
  function tok() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  function donateApi(body) {
    var h = {"Content-Type": "application/json"}, t = tok();
    if (t) h.Authorization = "Bearer " + t;
    return fetch(API + "/donate", {method: body ? "POST" : "GET", headers: h, body: body ? JSON.stringify(body) : undefined}).then(function (r) { return r.json(); });
  }
  function renderDonate(d) {
    var box = document.getElementById("donate-list"), st = document.getElementById("donate-status");
    if (!box) return;
    var tiers = (d && d.tiers) || [];
    if (!tiers.length) { box.innerHTML = '<p class="empty">Не удалось загрузить пакеты — сервер не отвечает. Попробуй позже.</p>'; return; }
    box.innerHTML = tiers.map(function (t) {
      return '<div class="card don-card' + (t.id === "flame" ? " don-best" : "") + '">' + (t.id === "flame" ? '<span class="don-tag">выбор игроков</span>' : "") +
        "<h3>" + esc(t.title) + '</h3><p class="don-price">' + esc(t.price) + ' <span>' + esc(t.period) + "</span></p><ul>" +
        (t.perks || []).map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + '</ul><button class="btn gold" type="button" data-tier="' + esc(t.id) + '">Поддержать</button></div>';
    }).join("");
    if (st) {
      if (d.nick && d.boostLeft > 0) { var h = Math.floor(d.boostLeft / 3600000), m = Math.floor(d.boostLeft % 3600000 / 60000); st.innerHTML = "✦ <b>" + esc(d.nick) + "</b>, твой бонус ×" + d.mult + " к прокачке действует ещё " + h + " ч " + m + " мин. Спасибо!"; }
      else if (d.nick) st.innerHTML = "Ты вошёл как <b>" + esc(d.nick) + "</b> — нажми «Поддержать», и бонус ×" + d.mult + " к прокачке на " + d.hours + " ч твой.";
      else st.innerHTML = 'Чтобы получить бонус ×' + d.mult + " к прокачке на " + d.hours + ' ч, сначала <a href="cabinet.html">войди в личный кабинет</a> (ник и пароль от сервера).';
    }
    Array.prototype.forEach.call(box.querySelectorAll("[data-tier]"), function (b) {
      b.onclick = function () {
        b.disabled = true;
        donateApi({tier: b.getAttribute("data-tier")}).then(function (j) {
          var msg = document.getElementById("donate-msg");
          if (msg) { msg.hidden = false; msg.textContent = j.message || "Спасибо!"; msg.scrollIntoView({behavior: "smooth", block: "center"}); }
          b.disabled = false;
          donateApi(null).then(renderDonate).catch(function () {});
        }).catch(function () { b.disabled = false; var msg = document.getElementById("donate-msg"); if (msg) { msg.hidden = false; msg.textContent = "Сервер не отвечает — попробуй позже."; } });
      };
    });
  }
  if (document.getElementById("donate-list") && window.fetch) donateApi(null).then(renderDonate).catch(function () { renderDonate(null); });

  // ---------------------------------------------------------------- старт
  setTimeout(labelFoot, 0);
  go((location.hash || "").slice(1), false, false);
})();
