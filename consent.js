/* DaviArt Craft — уведомление о хранении в браузере (У208.3, 2026-10-16). Небольшая плашка внизу на всех страницах.
 * «Понятно» — скрыть до следующего визита (sessionStorage); галочка «Больше не показывать» — навсегда на этом устройстве (localStorage daviart-consent).
 * Cookie сайт не ставит; подробности — privacy.html. */
(function () {
  var FOREVER = "daviart-consent", SESSION = "daviart-consent-s";
  function get(s, k) { try { return s.getItem(k); } catch (e) { return null; } }
  function put(s, k) { try { s.setItem(k, "1"); } catch (e) {} }
  if (get(window.localStorage, FOREVER) || get(window.sessionStorage, SESSION)) return;

  var css = document.createElement("style");
  css.textContent =
    ".dc-bar{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:9999;margin:0 auto;max-width:560px;" +
    "background:var(--card,#fffdf8);color:var(--text,#2a2118);border:1px solid var(--line2,#c7b79c);border-radius:12px;" +
    "box-shadow:0 8px 28px -10px rgba(0,0,0,.45);padding:12px 14px;font:14px/1.45 var(--font,system-ui,sans-serif);" +
    "display:grid;grid-template-columns:1fr auto;gap:6px 12px;align-items:center}" +
    ".dc-bar p{margin:0;grid-column:1/2}" +
    ".dc-bar a{color:var(--grass,#3d8a1e);font-weight:600}" +
    ".dc-ok{grid-row:1/3;grid-column:2/3;font:inherit;font-weight:700;border:0;border-radius:8px;padding:9px 16px;cursor:pointer;min-height:40px;" +
    "background:var(--grass,#3d8a1e);color:#fff}" +
    ".dc-ok:focus-visible,.dc-never input:focus-visible{outline:3px solid var(--gold,#9a6a00);outline-offset:2px}" +
    ".dc-never{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--muted,#6b5c48);cursor:pointer;grid-column:1/2}" +
    "@media (max-width:420px){.dc-bar{grid-template-columns:1fr}.dc-ok{grid-row:auto;grid-column:auto;width:100%}}" +
    "@media (prefers-reduced-motion:no-preference){.dc-bar{animation:dcIn .25s ease-out}@keyframes dcIn{from{transform:translateY(12px);opacity:0}}}";
  document.head.appendChild(css);

  var bar = document.createElement("div");
  bar.className = "dc-bar";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Уведомление о данных");
  bar.innerHTML =
    '<p>🍪 Сайт хранит в браузере только нужное для работы — вход в кабинет, ник, выбранную валюту. Cookie и трекеров нет. ' +
    '<a href="privacy.html">Политика конфиденциальности</a></p>' +
    '<label class="dc-never"><input type="checkbox" id="dc-never"> Больше не показывать</label>' +
    '<button type="button" class="dc-ok" id="dc-ok">Понятно</button>';

  function show() {
    document.body.appendChild(bar);
    document.getElementById("dc-ok").addEventListener("click", function () {
      if (document.getElementById("dc-never").checked) put(window.localStorage, FOREVER);
      put(window.sessionStorage, SESSION);
      bar.remove();
    });
  }
  if (document.body) show(); else document.addEventListener("DOMContentLoaded", show);
})();
