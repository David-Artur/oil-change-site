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

  // ---------------------------------------------------------------- Донат (У208.2): голоса за $ и пакеты валюты — shop.js
  if (window.DShop) {
    var dn = document.getElementById("don-nick"), vc = document.getElementById("vote-cards"), pc = document.getElementById("pack-cards");
    var nk = function () { return dn ? dn.value.trim() : ""; };
    var okNick = function (n) { return /^[A-Za-z0-9_]{3,16}$/.test(n); };
    try { if (dn) dn.value = localStorage.getItem("daviart-nick") || ""; } catch (e) {}
    var refresh = function () { var n = nk(); DShop.votes(vc, okNick(n) ? n : ""); };
    var tmr = null;
    if (dn) dn.addEventListener("input", function () { clearTimeout(tmr); tmr = setTimeout(function () { try { localStorage.setItem("daviart-nick", nk()); } catch (e) {} refresh(); }, 600); });
    if (vc) { refresh(); setInterval(function () { if (!document.hidden && okNick(nk())) refresh(); }, 60000); }
    if (pc) DShop.packs(pc, nk, {askNick: true});
  }

  // ---------------------------------------------------------------- старт
  setTimeout(labelFoot, 0);
  go((location.hash || "").slice(1), false, false);
})();
