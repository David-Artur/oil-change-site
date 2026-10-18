/* DaviArt Craft — рисует разделы из data.js, живой статус, копирование, поиск команд.
 * Контент здесь не править — он в data.js. */
(function () {
  "use strict";
  var S = window.SITE || {};
  window.DA_HAS_COPY = true;   // копирование [data-copy] делает app.js (ui.js тогда своё не вешает)
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  // `команда` → <code>команда</code> (остальной HTML из data.js пишем как есть — это наш файл)
  var rich = function (s) { return String(s || "").replace(/`([^`]+)`/g, function (_, c) { return "<code>" + esc(c) + "</code>"; }); };

  /* ---------- общие поля ---------- */
  if (S.address) { var a = $("addr"); if (a) a.textContent = S.address; }
  if (S.updated) { var u = $("updated"); if (u) u.textContent = S.updated.split("-").reverse().join("."); }

  /* ---------- как зайти ---------- */
  // картинка к шагу — маленькая сцена «как в игре» (CSS + текстуры из img/mc)
  var mcImg = function (t) { return 'style="background-image:url(img/mc/' + t + '.png)"'; };
  var JOIN_V = {
    launcher: '<div class="jv jv-launch"><div class="jv-logo">MINECRAFT</div><span class="jv-ver">Java 1.21.10</span><span class="jv-btn green">Играть</span></div>',
    server: '<div class="jv jv-dirt"><div class="jv-title">Добавить сервер</div><label>Адрес сервера</label>' +
      '<button type="button" class="jv-field" data-copy="' + esc(S.address || "daviart.com") + '" data-msg="Адрес скопирован — вставь его в Minecraft">' + esc(S.address || "daviart.com") + '<i class="copy-ico"></i></button><span class="jv-btn">Готово</span></div>',
    chat: '<div class="jv jv-chat"><p class="y">Зарегистрируйся: /reg пароль</p><p class="in">/reg <span class="ph">пароль</span><b class="caret">_</b></p></div>',
    portal: '<div class="jv jv-portal"><div class="frame"><i ' + mcImg("block__nether_portal") + '></i></div><span class="jv-sign">Святые земли</span></div>',
    start: '<div class="jv jv-start"><span class="slot"><i ' + mcImg("item__raw_copper") + '></i><b>64</b></span><span class="arr">→</span><span class="slot"><i ' + mcImg("item__emerald") + '></i></span><span class="arr">→</span><span class="slot"><i ' + mcImg("item__compass_16") + '></i></span></div>'
  };
  var js = $("join-steps");
  if (js && window.JOIN) js.innerHTML = JOIN.map(function (s, i) {
    return '<li class="card jstep"><span class="jn">' + (i + 1) + "</span>" + (JOIN_V[s.v] || "") + "<h3>" + rich(s.t) + "</h3><p>" + rich(s.d) + "</p>" + (s.more ? '<p class="jmore">' + rich(s.more) + "</p>" : "") + "</li>";
  }).join("");

  /* ---------- что нового (data.js NEWS, новые сверху) ---------- */
  var nl = $("news-list");
  var MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  var dayMon = function (d) { var p = String(d).split("-"); return +p[2] + " " + (MON[+p[1] - 1] || ""); };
  if (nl && window.NEWS) nl.innerHTML = NEWS.map(function (n, i) {
    return '<li class="card news-item' + (i === 0 ? " fresh" : "") + '"><time datetime="' + esc(n.d) + '">' + esc(dayMon(n.d)) + "</time><div><h3>" + rich(n.t) + "</h3><p>" + rich(n.p) + "</p>" +
      (n.a ? '<a class="news-more" href="' + esc(n.a) + '">Подробнее →</a>' : "") + "</div></li>";
  }).join("");

  /* ---------- миры ---------- */
  var wl = $("worlds-list");
  if (wl && window.WORLDS) wl.innerHTML = WORLDS.map(function (w) {
    var pic = w.img ? '<div class="pic' + (w.pixel ? " pixel" : "") + '" style="background-image:url(' + w.img + ')" role="img" aria-label="' + esc(w.imgAlt || ("Карта местности у точки прибытия: " + w.name)) + '">'
                    : '<div class="pic ' + (w.art || "") + '" aria-hidden="true">';
    pic += '<span class="badge">' + esc(w.tag) + "</span></div>";
    var st = w.stats ? w.stats.slice() : [["Сложность", w.diff], ["PvP", w.pvp], ["Смерть: навыки", w.loss], ["Вещи при смерти", w.items],
              ["Приваты", w.claims ? "есть" : "нет"], ["Телепорт", w.tp || "—"]];
    if (w.grief) st.push(["Гриферство", w.grief, 1]);
    if (w.boom) st.push(["Взрывы", w.boom, 1]);
    var hasNo = w.noOres && w.noOres !== "—";
    if (w.ores) st.push(["Руды", w.ores, hasNo ? 0 : 1]);
    if (hasNo) st.push(["Нет (→ медь)", w.noOres]);
    if (w.structures) st.push(["Строения", w.structures, 1]);
    var dl = '<dl class="stats">' + st.map(function (x) { return "<div" + (x[2] ? ' class="wide"' : "") + "><dt>" + x[0] + "</dt><dd>" + rich(x[1]) + "</dd></div>"; }).join("") + "</dl>";
    var notes = (w.notes || []).length ? '<ul class="more">' + w.notes.map(function (n) { return "<li>" + rich(n) + "</li>"; }).join("") + "</ul>" : "";
    var maplink = S.map && w.map ? '<a class="btn small maplink" href="' + mapUrl(w.map) + '" target="_blank" rel="noopener">🗺 Карта этого мира</a>' : "";
    return '<article class="card world tone-' + w.tone + '" id="w-' + w.id + '">' + pic + '<div class="body"><h3>' + esc(w.name) +
      ' <span class="lvl" title="Рекомендуемый уровень">ур. ' + esc(w.level) + "</span></h3>" + dl + notes + maplink + "</div></article>";
  }).join("");
  // веб-карта: кнопки на каждый мир (лобби — карточка в WORLDS, последняя)
  function mapUrl(id) { return S.map + "/#" + id + ":0:64:0:1500:0:0:0:1:flat"; }
  var mb = $("map-buttons");
  if (mb && S.map) mb.innerHTML = (window.WORLDS || []).filter(function (w) { return w.map; }).map(function (w) { return [w.map, w.name]; })
    .map(function (x) { return '<a class="btn small" href="' + mapUrl(x[0]) + '" target="_blank" rel="noopener">' + esc(x[1]) + "</a>"; }).join("");

  /* Компас из Minecraft — пиксельная иконка 16×16 (d — обод, m — рамка, f — циферблат, r — стрелка, k — ось, g — хвост). */
  function compassIcon() {
    var rows = [".....dddddd.....", "...ddmmmmmmdd...", "..dmmffffffmmd..", ".dmffffrrffffmd.", "dmfffffrrfffffmd", "dmfffffrrfffffmd",
      "dmfffffrrfffffmd", "dmfffffkkfffffmd", "dmfffffggfffffmd", "dmfffffggfffffmd", "dmfffffggfffffmd", ".dmffffggffffmd.",
      ".dmffffffffffmd.", "..dmmffffffmmd..", "...ddmmmmmmdd...", ".....dddddd....."];
    var col = { d: "#3a3a3a", m: "#9a9a9a", f: "#e6dcc4", r: "#d42a2a", k: "#3a3a3a", g: "#6b6b6b" }, px = "";
    rows.forEach(function (r, y) { for (var x = 0; x < 16; x++) if (col[r[x]]) px += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + col[r[x]] + '"/>'; });
    return '<svg class="mc-ico" viewBox="0 0 16 16" shape-rendering="crispEdges" role="img" aria-label="Компас">' + px + "</svg>";
  }

  /* ---------- разделы-гайды (data.js GUIDES + схемы viz.js) ---------- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-guide]"), function (sec) {
    var g = (window.GUIDES || {})[sec.getAttribute("data-guide")];
    if (!g) return;
    var h = '<h2><span class="gico" aria-hidden="true">' + g.icon + "</span>" + esc(g.title) + "</h2>";
    h += '<p class="lead">' + rich(g.lead) + "</p>";
    if (g.howto) h += '<div class="howto">' + g.howto.map(function (b) {
      var body = b.list ? "<ol>" + b.list.map(function (x) { return "<li>" + rich(x) + "</li>"; }).join("") + "</ol>" : "<p>" + rich(b.p) + "</p>";
      return '<div class="card howto-card' + (b.icon ? " has-ico" : "") + '">' + (b.icon === "compass" ? compassIcon() : "") + "<div><h3>" + rich(b.h) + "</h3>" + body + "</div></div>";
    }).join("") + "</div>";
    if (g.easier) h += '<p class="easier">↗ <b>Прокачивается — со временем станет легче.</b> ' + rich(g.easier) + "</p>";
    if (g.table) h += '<div class="card tablewrap"><table class="gtable"><thead><tr>' + g.table.head.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + g.table.rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + rich(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
    if (g.viz && window.VIZ) h += '<div class="vizgrid">' + g.viz.map(function (v, i) {
      return window.VIZ[v] ? '<figure class="card">' + window.VIZ[v]() + "<figcaption>" + esc((g.captions || [])[i] || "") + "</figcaption></figure>" : "";
    }).join("") + "</div>";
    h += '<div class="gblocks">' + (g.blocks || []).filter(function (b) { return !b.cab || S.cabinet; }).map(function (b) {
      var body = b.list ? "<ul>" + b.list.map(function (x) { return "<li>" + rich(x) + "</li>"; }).join("") + "</ul>" : "<p>" + rich(b.p) + "</p>";
      return '<div class="card gblock"><h3>' + rich(b.h) + "</h3>" + body + "</div>";
    }).join("") + "</div>";
    sec.innerHTML = h;
  });
  /* личный кабинет: пока API не включён — ссылки спрятаны (SITE.cabinet) */
  if (!S.cabinet) Array.prototype.forEach.call(document.querySelectorAll("[data-cab]"), function (el) { el.hidden = true; el.style.display = "none"; });
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
    return '<div class="cgroup" data-group="' + g.id + '"><h3>' + g.icon + " " + esc(g.title) + '</h3><div class="cmds">' + g.items.filter(function (it) { return !it.cab || S.cabinet; }).map(function (it) {
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

  /* ---------- лидеры (живые данные с сервера: S.leadersJson, раз в 10 мин) ---------- */
  var lc = $("lead-chips"), lb = $("lead-box"), lu = $("lead-upd");
  if (lb && S.leadersJson && window.fetch) {
    fetch(S.leadersJson + "?t=" + Math.floor(Date.now() / 300000)).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
      var cats = Object.keys(d.cats || {}), cur = cats[0];
      function show() {
        var c = d.cats[cur] || { rows: [] };
        lb.innerHTML = c.rows.length ? '<table class="gtable"><thead><tr><th>#</th><th>Игрок</th><th>' + esc(c.title) + "</th></tr></thead><tbody>" +
          c.rows.map(function (r, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(r.name) + "</td><td>" + esc(r.value) + "</td></tr>"; }).join("") + "</tbody></table>"
          : '<p class="empty" style="padding:16px">Пока никого — стань первым!</p>';
        if (lc) Array.prototype.forEach.call(lc.querySelectorAll(".chip"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-c") === cur ? "true" : "false"); });
      }
      if (lc) {
        lc.innerHTML = cats.map(function (k) { return '<button class="chip" type="button" data-c="' + k + '" aria-pressed="false">' + esc(d.cats[k].title) + "</button>"; }).join("");
        lc.addEventListener("click", function (e) { var b = e.target.closest(".chip"); if (!b) return; cur = b.getAttribute("data-c"); show(); });
      }
      if (lu && d.updated) lu.textContent = "Обновлено: " + new Date(d.updated).toLocaleString("ru-RU");
      show();
    }).catch(function () { lb.innerHTML = '<p class="empty" style="padding:16px">Таблица временно недоступна — загляни позже или напиши <code>/top</code> в игре.</p>'; });
  }

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
