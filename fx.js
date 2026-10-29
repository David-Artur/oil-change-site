/* 2026-10-29 (владелец: «главная — живая, современная, сногсшибательная»): анимации главной — лепестки сакуры и светлячки в шапке
 * (сдуваются курсором), параллакс и «прожектор», счётчики, бегущая строка, полоса прокрутки, появление блоков, 3D-наклон фото,
 * подсветка раздела в меню. Без библиотек; холст стоит, когда шапку не видно или вкладка скрыта.
 * prefers-reduced-motion или ?fx=0 — html.fx-still: ничего не движется (стили — fx.css). */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || /[?&]fx=0\b/.test(location.search);
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  root.classList.add("fx");
  if (reduce) root.classList.add("fx-still");
  var hero = document.querySelector(".l-hero");
  var hasIO = "IntersectionObserver" in window;

  // ---------- фон и полоса прокрутки ----------
  var bg = document.createElement("div"); bg.className = "fx-bg"; bg.setAttribute("aria-hidden", "true"); bg.innerHTML = "<i></i><i></i><i></i>";
  document.body.insertBefore(bg, document.body.firstChild);
  var bar = document.createElement("div"); bar.className = "fx-progress"; bar.setAttribute("aria-hidden", "true"); document.body.appendChild(bar);
  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var h = root.scrollHeight - innerHeight;
      bar.style.transform = "scaleX(" + (h > 0 ? Math.min(1, scrollY / h) : 0).toFixed(4) + ")";
      if (hero && !reduce && scrollY < innerHeight * 1.2) hero.style.setProperty("--sy", Math.round(scrollY));
    });
  }
  addEventListener("scroll", onScroll, {passive: true});
  onScroll();

  // ---------- шапка: прожектор, параллакс, подсказка «листай» ----------
  if (hero) {
    var spot = document.createElement("div"); spot.className = "fx-spot"; spot.setAttribute("aria-hidden", "true"); hero.appendChild(spot);
    var hint = document.createElement("a"); hint.className = "fx-hint"; hint.href = "#lobby-story"; hint.setAttribute("aria-label", "Листай вниз"); hero.appendChild(hint);
  }
  var mouse = {x: -9999, y: -9999, vx: 0, vy: 0};
  if (hero && fine && !reduce) {
    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      mouse.vx = x - (mouse.x < -999 ? x : mouse.x); mouse.vy = y - (mouse.y < -999 ? y : mouse.y);
      mouse.x = x; mouse.y = y;
      hero.style.setProperty("--mx", (x / r.width * 2 - 1).toFixed(3));
      hero.style.setProperty("--my", (y / r.height * 2 - 1).toFixed(3));
      hero.style.setProperty("--cx", Math.round(x) + "px");
      hero.style.setProperty("--cy", Math.round(y) + "px");
    });
    hero.addEventListener("pointerleave", function () { mouse.x = mouse.y = -9999; hero.style.setProperty("--mx", 0); hero.style.setProperty("--my", 0); });
  }

  // ---------- лепестки сакуры и светлячки ----------
  if (hero && !reduce && document.createElement("canvas").getContext) {
    var cv = document.createElement("canvas"); cv.className = "fx-petals"; cv.setAttribute("aria-hidden", "true");
    hero.insertBefore(cv, hero.querySelector(".l-hero__in"));
    var ctx = cv.getContext("2d"), W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1), P = [], run = true, raf = 0, last = 0;
    var PETAL = ["#ffc4dc", "#ffb0cf", "#ff9cc4", "#ffd8e8", "#f7a8c8"];
    var mk = function (init) {
      var fly = Math.random() < 0.22;
      return {x: Math.random() * W, y: init ? Math.random() * H : -12, f: fly, s: fly ? 1.4 + Math.random() * 1.8 : 3 + Math.random() * 4,
        vx: fly ? (Math.random() - 0.5) * 0.3 : 0.25 + Math.random() * 0.6, vy: fly ? -0.08 - Math.random() * 0.22 : 0.35 + Math.random() * 0.75,
        r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.05, ph: Math.random() * 6.28, c: PETAL[(Math.random() * PETAL.length) | 0], px: 0, py: 0};
    };
    var size = function () {
      W = hero.clientWidth; H = hero.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.max(18, Math.min(80, W * H / 20000)));
      while (P.length < n) P.push(mk(true));
      P.length = n;
    };
    var frame = function (t) {
      raf = 0;
      if (!run) return;
      var dt = Math.min(3, last ? (t - last) / 16.7 : 1); last = t;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < P.length; i++) {
        var p = P[i];
        // ветер от курсора: рядом с мышью лепестки отлетают по её движению
        var dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 14400) { var k = (1 - Math.sqrt(d2) / 120) * 0.08; p.px += mouse.vx * k + dx * 0.004; p.py += mouse.vy * k + dy * 0.004; }
        p.px *= 0.94; p.py *= 0.94;
        p.x += (p.vx + Math.sin(t / 1100 + p.ph) * (p.f ? 0.35 : 0.5) + p.px) * dt;
        p.y += (p.vy + (p.f ? Math.cos(t / 900 + p.ph) * 0.2 : 0) + p.py) * dt;
        p.r += p.vr * dt;
        if (p.y > H + 14 || p.x > W + 20 || p.x < -20 || p.y < -30) { P[i] = mk(false); if (p.f) { P[i].y = H * (0.3 + Math.random() * 0.7); P[i].x = Math.random() * W; } continue; }
        if (p.f) {
          var a = 0.45 + 0.45 * Math.sin(t / 420 + p.ph);
          var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s * 5);
          g.addColorStop(0, "rgba(255,226,120," + a.toFixed(3) + ")"); g.addColorStop(1, "rgba(255,226,120,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 5, 0, 6.2832); ctx.fill();
          ctx.fillStyle = "rgba(255,248,200," + Math.min(1, a + 0.2).toFixed(3) + ")"; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
        } else {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(t / 700 + p.ph)));   // переворачивается в полёте
          ctx.globalAlpha = 0.85; ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
          ctx.globalAlpha = 0.5; ctx.fillStyle = "#fff"; ctx.fillRect(-p.s / 2, -p.s / 2, p.s / 2, p.s / 2);   // пиксельный блик
          ctx.restore();
        }
      }
      mouse.vx *= 0.8; mouse.vy *= 0.8;
      raf = requestAnimationFrame(frame);
    };
    var setRun = function (on) { run = on && !document.hidden; if (run && !raf) { last = 0; raf = requestAnimationFrame(frame); } };
    size();
    var rt = 0; addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(size, 150); });
    document.addEventListener("visibilitychange", function () { setRun(heroVisible); });
    var heroVisible = true;
    if (hasIO) new IntersectionObserver(function (es) { heroVisible = es[0].isIntersecting; setRun(heroVisible); }).observe(hero);
    setRun(true);
  }

  // ---------- счётчики «40 навыков», «6 миров» ----------
  Array.prototype.forEach.call(document.querySelectorAll(".l-chips li"), function (li) {
    var m = /^(\d+)(\s.*)$/.exec(li.textContent.trim());
    if (!m) return;
    var n = +m[1];
    li.innerHTML = "<b class=\"fx-num\">" + (reduce ? n : 0) + "</b>" + m[2].replace(/[&<>]/g, "");
    if (reduce) return;
    var b = li.firstChild, t0 = 0;
    var tick = function (t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / 1400), e = 1 - Math.pow(1 - k, 3); b.textContent = Math.round(n * e); if (k < 1) requestAnimationFrame(tick); };
    setTimeout(function () { requestAnimationFrame(tick); }, 500);
  });

  // ---------- бегущая строка под меню ----------
  var nav = document.querySelector(".l-nav");
  if (nav) {
    var items = ["<b class=\"fx-online\">🟢 Сервер онлайн</b>", "⚔ <b>40 навыков</b> <span>— растут от дела</span>", "🌍 <b>6 миров</b> <span>— чем дальше, тем богаче</span>",
      "🎧 <b>голос в браузере</b> <span>— без модов</span>", "🪩 <b>свой ночной клуб</b> <span>— музыка написана для сервера</span>", "🧪 <b>48 зелий Бабы Яги</b> <span>— навсегда, с подвохом</span>",
      "🗺 <b>карта мира</b> <span>— в реальном времени</span>", "🛡 <b>честная прокачка</b> <span>— без ферм и твинков</span>", "🩸 <b>Кровавая луна</b> <span>— в Пустошах</span>",
      "🔑 <b>daviart.com</b> <span>— Java 1.21.10, можно с TLauncher</span>"];
    var tk = document.createElement("div"); tk.className = "fx-ticker"; tk.setAttribute("aria-hidden", "true");
    var one = items.map(function (s) { return "<span>" + s + "</span>"; }).join("");
    tk.innerHTML = "<div class=\"fx-ticker__run\">" + one + one.replace(/<span>/g, "<span class=\"fx-dup\">") + "</div>";
    nav.parentNode.insertBefore(tk, nav.nextSibling);
    // онлайн — из статуса шапки (его заполняет app.js)
    var sync = function () {
      var st = document.getElementById("st-text"), txt = st ? st.textContent.trim() : "";
      if (!txt || /Проверяю/.test(txt)) return;
      Array.prototype.forEach.call(tk.querySelectorAll(".fx-online"), function (b) { b.textContent = (/Онлайн/i.test(txt) ? "🟢 " : "🔴 ") + txt; });
    };
    setTimeout(sync, 1500); setInterval(sync, 15000);
  }

  // ---------- появление блоков при прокрутке ----------
  var io = hasIO && !reduce ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("fx-in"); io.unobserve(e.target); } });
  }, {rootMargin: "0px 0px -6% 0px", threshold: 0.06}) : null;
  var SEL = ".l-ch__head, .l-shot, .l-quote, .l-guide a, #join-steps > li, #news-list > li, .l-more";
  function arm(scope) {
    Array.prototype.forEach.call((scope || document).querySelectorAll(SEL), function (el) {
      if (el.__fx) return; el.__fx = 1;
      el.classList.add("fx-r");
      var i = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      el.style.setProperty("--fx-d", (Math.min(i, 8) * 70) + "ms");
      if (io) io.observe(el); else el.classList.add("fx-in");
    });
  }
  arm();
  if ("MutationObserver" in window) ["chapters", "join-steps", "news-list"].forEach(function (id) {
    var n = document.getElementById(id); if (n) new MutationObserver(function () { arm(n); }).observe(n, {childList: true, subtree: true});
  });

  // ---------- 3D-наклон фото за курсором ----------
  if (fine && !reduce) {
    var cur = null;
    document.addEventListener("pointermove", function (e) {
      var s = e.target.closest ? e.target.closest(".l-shot") : null;
      if (cur && cur !== s) { cur.classList.remove("fx-tilt"); cur = null; }
      if (!s || !s.classList.contains("fx-in")) return;
      var r = s.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      s.style.setProperty("--ry", ((x - 0.5) * 8).toFixed(2) + "deg");
      s.style.setProperty("--rx", ((0.5 - y) * 6).toFixed(2) + "deg");
      s.style.setProperty("--gx", (x * 100).toFixed(1) + "%");
      s.style.setProperty("--gy", (y * 100).toFixed(1) + "%");
      if (!s.classList.contains("fx-tilt")) s.classList.add("fx-tilt");
      cur = s;
    }, {passive: true});
    document.addEventListener("pointerleave", function () { if (cur) { cur.classList.remove("fx-tilt"); cur = null; } });
  }

  // ---------- меню: подсветка раздела, который на экране ----------
  if (hasIO && nav) {
    var links = {};
    Array.prototype.forEach.call(nav.querySelectorAll("a[href^='#']"), function (a) { links[a.getAttribute("href").slice(1)] = a; });
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var a = links[e.target.id]; if (!a) return;
        if (e.isIntersecting) { Object.keys(links).forEach(function (k) { links[k].classList.remove("fx-on"); }); a.classList.add("fx-on"); }
      });
    }, {rootMargin: "-45% 0px -50% 0px"});
    var watch = function () { Object.keys(links).forEach(function (id) { var el = document.getElementById(id); if (el && !el.__spy) { el.__spy = 1; spy.observe(el); } }); };
    watch(); setTimeout(watch, 800);
  }
})();
