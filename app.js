/* DaviArt Craft — рисует разделы из data.js, живой статус, копирование, поиск команд.
 * Контент здесь не править — он в data.js. */
(function () {
  "use strict";
  var S = window.SITE || {};
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  // `команда` → <code>команда</code> (остальной HTML из data.js пишем как есть — это наш файл)
  var rich = function (s) { return String(s || "").replace(/`([^`]+)`/g, function (_, c) { return "<code>" + esc(c) + "</code>"; }); };

  /* ---------- общие поля ---------- */
  if (S.address) { var a = $("addr"); if (a) a.textContent = S.address; }
  if (S.updated) { var u = $("updated"); if (u) u.textContent = S.updated.split("-").reverse().join("."); }

  /* ---------- как зайти ---------- */
  var js = $("join-steps");
  if (js && window.JOIN) js.innerHTML = JOIN.map(function (s) {
    return '<li class="card"><div><h3>' + rich(s.t) + "</h3><p>" + rich(s.d) + "</p></div></li>";
  }).join("");

  /* ---------- миры ---------- */
  var wl = $("worlds-list");
  if (wl && window.WORLDS) wl.innerHTML = WORLDS.map(function (w) {
    var pic = w.img ? '<div class="pic" style="background-image:url(' + w.img + ')" role="img" aria-label="Карта местности у точки прибытия: ' + esc(w.name) + '">'
                    : '<div class="pic ' + (w.art || "") + '" aria-hidden="true">';
    pic += '<span class="badge">' + esc(w.tag) + "</span></div>";
    var st = [["Сложность", w.diff], ["PvP", w.pvp], ["Смерть: навыки", w.loss], ["Вещи при смерти", w.items]];
    var hasNo = w.noOres && w.noOres !== "—";
    if (w.ores) st.push(["Руды", w.ores, hasNo ? 0 : 1]);
    if (hasNo) st.push(["Нет (→ медь)", w.noOres]);
    if (w.structures) st.push(["Строения", w.structures, 1]);
    var dl = '<dl class="stats">' + st.map(function (x) { return "<div" + (x[2] ? ' class="wide"' : "") + "><dt>" + x[0] + "</dt><dd>" + rich(x[1]) + "</dd></div>"; }).join("") + "</dl>";
    var notes = (w.notes || []).length ? '<ul class="more">' + w.notes.map(function (n) { return "<li>" + rich(n) + "</li>"; }).join("") + "</ul>" : "";
    return '<article class="card world tone-' + w.tone + '" id="w-' + w.id + '">' + pic + '<div class="body"><h3>' + esc(w.name) +
      ' <span class="lvl" title="Рекомендуемый уровень">ур. ' + esc(w.level) + "</span></h3>" + dl + notes + "</div></article>";
  }).join("");
  var wc = $("worlds-common");
  if (wc && window.WORLDS_COMMON) wc.innerHTML = WORLDS_COMMON.map(function (x) { return "<li>" + rich(x) + "</li>"; }).join("");

  /* ---------- особенности ---------- */
  var fl = $("features-list");
  if (fl && window.FEATURES) fl.innerHTML = FEATURES.map(function (f) {
    var fig = f.img ? '<figure><img src="' + f.img + '" alt="' + esc(f.imgAlt || "") + '" loading="lazy" width="960" height="791"><figcaption>' + esc(f.imgAlt || "") + "</figcaption></figure>" : "";
    return '<details class="card feature" id="f-' + f.id + '"><summary><span class="ico" aria-hidden="true">' + f.icon + "</span><div><h3>" + esc(f.title) +
      "</h3><p>" + rich(f.lead) + '</p></div><span class="chev" aria-hidden="true"></span></summary><ul>' +
      f.list.map(function (x) { return "<li>" + rich(x) + "</li>"; }).join("") + "</ul>" + fig + "</details>";
  }).join("");

  /* ---------- команды ---------- */
  var groups = window.COMMAND_GROUPS || [];
  var norm = function (s) { return String(s || "").toLowerCase().replace(/ё/g, "е"); };
  var chips = $("cmd-chips"), list = $("cmd-list"), q = $("q"), cnt = $("qcount"), empty = $("cmd-empty");
  var curGroup = "all";
  if (chips) chips.innerHTML = '<button class="chip" type="button" data-g="all" aria-pressed="true">Все</button>' +
    groups.map(function (g) { return '<button class="chip" type="button" data-g="' + g.id + '" aria-pressed="false">' + g.icon + " " + esc(g.title) + "</button>"; }).join("");
  if (list) list.innerHTML = groups.map(function (g) {
    return '<div class="cgroup" data-group="' + g.id + '"><h3>' + g.icon + " " + esc(g.title) + '</h3><div class="cmds">' + g.items.map(function (it) {
      var isAct = it.c.charAt(0) !== "/";
      var copyTxt = it.ex === "" ? "" : (it.ex || it.c);
      var hay = norm([it.c, it.d, it.ex, it.k, g.title].join(" "));
      return '<div class="card cmd" data-hay="' + esc(hay) + '"><span class="name' + (isAct ? " act" : "") + '">' + esc(it.c) + "</span>" +
        (copyTxt ? '<button class="copy" type="button" data-copy="' + esc(copyTxt) + '" aria-label="Копировать ' + esc(copyTxt) + '">Копировать</button>' : "<span></span>") +
        "<p>" + rich(it.d) + "</p>" + (it.ex && it.ex !== it.c ? '<span class="ex">Пример: <code>' + esc(it.ex) + "</code></span>" : "") + "</div>";
    }).join("") + "</div></div>";
  }).join("");

  function filterCmds() {
    if (!list) return;
    var words = norm(q ? q.value : "").trim().split(/\s+/).filter(Boolean).map(function (w) { return w.replace(/^\//, ""); });
    var shown = 0;
    Array.prototype.forEach.call(list.querySelectorAll(".cgroup"), function (gEl) {
      var inGroup = curGroup === "all" || gEl.getAttribute("data-group") === curGroup;
      var any = 0;
      Array.prototype.forEach.call(gEl.querySelectorAll(".cmd"), function (c) {
        var hay = c.getAttribute("data-hay");
        var ok = inGroup && words.every(function (w) { return hay.indexOf(w) >= 0; });
        c.hidden = !ok; if (ok) { any++; shown++; }
      });
      gEl.hidden = !any;
    });
    if (cnt) cnt.textContent = shown ? shown + " шт." : "";
    if (empty) empty.hidden = shown > 0;
  }
  if (q) q.addEventListener("input", filterCmds);
  if (chips) chips.addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    curGroup = b.getAttribute("data-g");
    Array.prototype.forEach.call(chips.querySelectorAll(".chip"), function (c) { c.setAttribute("aria-pressed", c === b ? "true" : "false"); });
    filterCmds();
  });
  filterCmds();

  /* ---------- правила, скоро, FAQ ---------- */
  var rl = $("rules-list");
  if (rl && window.RULES) rl.innerHTML = RULES.map(function (r) { return '<li class="card"><div><h3>' + esc(r.t) + "</h3><p>" + rich(r.d) + "</p></div></li>"; }).join("");
  var sl = $("soon-list");
  if (sl && window.SOON) sl.innerHTML = SOON.map(function (s) { return '<div class="card"><h3>' + esc(s.t) + ' <span class="tag">в разработке</span></h3><p>' + rich(s.d) + "</p></div>"; }).join("");
  var fq = $("faq-list");
  if (fq && window.FAQ) fq.innerHTML = FAQ.map(function (f) { return '<details class="card"><summary>' + esc(f.q) + '</summary><div class="a">' + rich(f.a) + "</div></details>"; }).join("");

  /* ---------- копирование ---------- */
  var toast = $("toast"), tt;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg; toast.classList.add("show");
    clearTimeout(tt); tt = setTimeout(function () { toast.classList.remove("show"); }, 1800);
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta); return ok;
  }
  function copy(text, btn, msg) {
    var done = function () {
      showToast(msg || "Скопировано: " + text);
      if (btn && btn.classList.contains("copy")) { var old = btn.textContent; btn.textContent = "✔"; btn.classList.add("done"); setTimeout(function () { btn.textContent = old; btn.classList.remove("done"); }, 1400); }
    };
    var fail = function () { if (fallbackCopy(text)) done(); else showToast("Не удалось скопировать — выдели и скопируй вручную"); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fail); else fail();
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-copy]"); if (!b) return;
    copy(b.getAttribute("data-copy"), b, b.getAttribute("data-msg"));
  });

  /* ---------- высота меню (для липкого поиска команд) и подсветка раздела ---------- */
  var nav = $("nav");
  function setNavH() { if (nav) document.documentElement.style.setProperty("--navh", nav.offsetHeight + "px"); }
  setNavH(); window.addEventListener("resize", setNavH);
  if (nav && "IntersectionObserver" in window) {
    var links = {}; Array.prototype.forEach.call(nav.querySelectorAll("a"), function (l) { links[l.getAttribute("href").slice(1)] = l; });
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!en.isIntersecting) return;
        Object.keys(links).forEach(function (k) { links[k].classList.toggle("cur", k === en.target.id); });
        var l = links[en.target.id], w = l && l.parentNode;
        if (w && w.scrollWidth > w.clientWidth) { try { w.scrollTo({ left: Math.max(0, l.offsetLeft - w.offsetLeft - 16), behavior: "smooth" }); } catch (e) { w.scrollLeft = l.offsetLeft - 16; } }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(links).forEach(function (k) { var s = $(k); if (s) io.observe(s); });
  }

  /* ---------- живой статус (api.mcsrvstat.us, кэш 1 минута) ---------- */
  var box = $("status"), stText = $("st-text"), stSub = $("st-sub");
  var KEY = "daviart-status-v1", TTL = 60 * 1000;
  function render(d) {
    if (!box) return;
    box.classList.remove("on", "off");
    if (!d) { stText.textContent = "Статус недоступен"; stSub.textContent = "Проверь позже или просто зайди"; return; }
    if (!d.online) { box.classList.add("off"); stText.textContent = "Сервер сейчас выключен"; stSub.textContent = "Возможно, идёт перезапуск — попробуй через пару минут"; return; }
    box.classList.add("on");
    var p = d.players || {}, n = p.online || 0;
    stText.textContent = "Онлайн · " + n + " / " + (p.max || "?") + " " + plural(n);
    var names = (p.list || []).map(function (x) { return typeof x === "string" ? x : x.name; }).filter(Boolean);
    stSub.textContent = names.length ? "Сейчас играют: " + names.slice(0, 12).join(", ") + (names.length > 12 ? " и ещё " + (names.length - 12) : "") : (n ? "" : "Сейчас никого — будь первым!");
  }
  function plural(n) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? "игрок" : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "игрока" : "игроков"); }
  function readCache() { try { var c = JSON.parse(localStorage.getItem(KEY) || "null"); if (c && Date.now() - c.t < TTL) return c.d; } catch (e) {} return null; }
  function writeCache(d) { try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {} }
  function load(force) {
    var c = !force && readCache();
    if (c) { render(c); return; }
    if (!window.fetch || !S.statusApi) { render(null); return; }
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
    fetch(S.statusApi, ctl ? { signal: ctl.signal } : {}).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) {
        clearTimeout(to);
        var slim = { online: !!d.online, players: d.players ? { online: d.players.online, max: d.players.max, list: (d.players.list || []).map(function (x) { return x.name || x; }) } : null };
        writeCache(slim); render(slim);
      })
      .catch(function () { clearTimeout(to); render(null); });
  }
  load(false);
  setInterval(function () { if (!document.hidden) load(false); }, TTL);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) load(false); });
})();
