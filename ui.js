/* DaviArt Craft — общее для всех страниц (главная, кабинет и др.):
 * 1) любая команда в <code> (начинается с «/») и адрес daviart.com копируются по нажатию;
 * 2) рядом с «ЛКМ» / «ПКМ» — значок мышки с подсвеченной кнопкой (владелец: «люди не понимают, что такое ПКМ»).
 * Работает и для текста, который страница дорисовывает позже (MutationObserver). */
(function () {
  "use strict";
  var MOUSE = function (side) {
    return '<svg class="mouse-ico" viewBox="0 0 12 18" aria-hidden="true"><rect x="0.75" y="0.75" width="10.5" height="16.5" rx="5.25" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<path d="M6 1v6.5" stroke="currentColor" stroke-width="1.2"/>' +
      (side === "l" ? '<path d="M5.4 1.3A4.6 4.6 0 0 0 1.4 6v1.4h4z" fill="#f6c945"/>' : '<path d="M6.6 1.3A4.6 4.6 0 0 1 10.6 6v1.4h-4z" fill="#f6c945"/>') + "</svg>";
  };
  var RE = /(Shift\s*\+\s*)?(ЛКМ|ПКМ)/g;
  var SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|OPTION|SVG|svg|TITLE)$/;

  function mice(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || n.nodeValue.indexOf("КМ") < 0) return NodeFilter.FILTER_REJECT;
        for (var p = n.parentNode; p && p !== root.parentNode; p = p.parentNode) {
          if (p.nodeType === 1 && (SKIP.test(p.tagName) || (p.classList && (p.classList.contains("mkey") || p.classList.contains("mctip"))))) return NodeFilter.FILTER_REJECT;
        }
        return RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var list = [];
    while (walker.nextNode()) list.push(walker.currentNode);
    list.forEach(function (n) {
      RE.lastIndex = 0;
      var span = document.createElement("span");
      span.innerHTML = n.nodeValue.replace(/[&<>]/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;"}[c]; }).replace(RE, function (m, sh, k) {
        var side = k === "ЛКМ" ? "l" : "r";
        return '<span class="mkey" title="' + (side === "l" ? "Левая" : "Правая") + ' кнопка мыши">' + MOUSE(side) + m + "</span>";
      });
      var frag = document.createDocumentFragment();
      while (span.firstChild) frag.appendChild(span.firstChild);
      n.parentNode.replaceChild(frag, n);
    });
  }

  // что копировать из команды: до первого «примерного» слова (пароль, ник, …) — его игрок впишет сам
  function cmdText(t) {
    t = t.replace(/\s+/g, " ").trim();
    if (!/^\/[a-z]/i.test(t)) return /^daviart\.com$/i.test(t) ? t : null;
    var out = [];
    t.split(" ").some(function (w) {
      if (/[а-яё<>\[\]|…]/i.test(w) && out.length) return true;
      out.push(w); return false;
    });
    var s = out.join(" ");
    return s.length < t.length ? s + " " : s;
  }
  function mark(root) {
    Array.prototype.forEach.call((root.querySelectorAll ? root : document).querySelectorAll("code:not([data-copy]):not(.nocopy)"), function (c) {
      if (c.closest("[data-copy], a, button")) return;
      var t = cmdText(c.textContent || "");
      if (!t) return;
      c.setAttribute("data-copy", t);
      c.setAttribute("data-msg", "Скопировано: " + t.trim() + (/ $/.test(t) ? " — допиши своё" : ""));
      c.classList.add("cmdcopy");
      c.setAttribute("tabindex", "0");
      c.setAttribute("role", "button");
      c.title = "Нажми — скопировать";
    });
  }
  function run(root) { try { mice(root); mark(root); } catch (e) { } }

  // копирование: если на странице нет своего обработчика data-copy (app.js) — свой
  var toastEl = null, tt;
  function toast(msg) {
    if (!toastEl) { toastEl = document.getElementById("toast"); }
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(tt); tt = setTimeout(function () { toastEl.classList.remove("show"); }, 1800);
  }
  function copy(text, msg) {
    var ok = function () { toast(msg || "Скопировано"); };
    var fb = function () {
      var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); var r = false; try { r = document.execCommand("copy"); } catch (e) { }
      document.body.removeChild(ta); if (r) ok(); else toast("Не удалось скопировать — выдели вручную");
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fb); else fb();
  }
  if (!window.DA_HAS_COPY) {
    document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("code[data-copy]"); if (b) copy(b.getAttribute("data-copy"), b.getAttribute("data-msg")); });
  }
  document.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("code[data-copy]")) { e.preventDefault(); e.target.click(); } });

  function start() {
    run(document.body);
    var pend = false;
    new MutationObserver(function () {
      if (pend) return; pend = true;
      (window.requestAnimationFrame || setTimeout)(function () { pend = false; run(document.body); });
    }).observe(document.body, {childList: true, subtree: true});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
