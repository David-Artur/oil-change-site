/* 2026-10-28: главная-витрина — главы-истории со скриншотами сервера, просмотр фото, переход старых ссылок #раздел → справочник. */
(function () {
  "use strict";
  // старые ссылки вида daviart.com/#skills ведут в справочник (разделы переехали в guide.html)
  var GUIDE_IDS = ["join", "claims", "worlds", "npc", "teleport", "economy", "market", "emerald", "potions", "clans", "leaders", "cabinet", "voice", "club",
    "music", "ach", "bloodmoon", "elytra", "skills", "craft", "body", "stamina", "climate", "pvp", "features", "commands", "rules", "soon", "donate", "faq", "map"];
  function toGuide() {
    var h = (location.hash || "").slice(1);
    if (h && GUIDE_IDS.indexOf(h) >= 0 && !document.getElementById(h)) location.replace("guide.html#" + h);
  }
  toGuide();
  window.addEventListener("hashchange", toGuide);

  var S = "img/shots/";
  var CHAPTERS = [
    { id: "lobby", cls: "lobby", eyebrow: "Лобби · над облаками", title: "Остров, с которого всё начинается",
      lead: "Лобби — парящий остров с сакурами. Отсюда шесть порталов ведут в миры, сюда же возвращаешься после смерти. Здесь Рынок, Скупщик, Гид и Аллея славы.",
      shots: [
        { f: "lobby-sunset", big: 1, t: "Закат над лобби", d: "Остров висит над облаками, лианы спускаются в пустоту. Каждый игрок начинает путь отсюда." },
        { f: "lobby-camp", t: "Вечер у порталов", d: "У костра собираются перед вылазкой. Слева — порталы в Незер и Пустоши." },
        { f: "lobby-fog", t: "Остров в тумане", d: "Надпись daviart.com над облаками видно издалека." },
        { f: "hall-of-fame", wide: 1, t: "Аллея славы", d: "Статуи десяти лучших игроков сервера. Сейчас на первом месте — Marvin_Araksos." },
        { f: "players", wide: 1, t: "Свой дом в Святых землях", d: "AleksaLav и rudekitten у своего домика: приват ставится компасом — бесплатно." }
      ] },
    { id: "holy", cls: "holy", eyebrow: "Святые земли · мир 1", title: "Мир, в котором живут",
      lead: "Первый мир не пустой. Бродяги поют у костра, Баба Яга варит зелья, дед рыбачит у пруда, другой копает шахту. С голосовым чатом их слышно по-настоящему.",
      shots: [
        { f: "campfire", big: 1, t: "Костёр бродяг", d: "Пятеро сталкеров спорят, шутят и поют под гитару. У Бывалого — ежедневные задания по $25." },
        { f: "yaga-hut", t: "Изба на курьих ножках", d: "Из трубы валит зелёный дым, вокруг летают летучие мыши, а рядом играет жуткая музыка." },
        { f: "yaga", t: "Баба Яга", d: "Зелья навсегда: плюс написан на бутылке, а минус выпадет случайно. Узнаешь, когда выпьешь." },
        { f: "neklev", t: "Дед Неклёв", d: "Рыбачит у пруда, где появляются новички. Бормочет байки и раздаёт бесплатные задания." },
        { f: "okak-mine", t: "Штольня Деда Окака", d: "Руду у рельсов можно копать — она отрастает. Кирку дед даёт раз в сутки." },
        { f: "campfire-close", t: "Молчун, Гитарист и Новичок", d: "Подойди ближе — разговор у костра не прекращается ни днём, ни ночью." },
        { f: "dasha", t: "Даша-путешественница", d: "Продаёт карты к настоящим строениям мира. Первая карта — самая дорогая." },
        { f: "holy-night", t: "Ночь в Святых землях", d: "Самый спокойный мир: без PvP, с приватами для своих. Самое место для первого дома." },
        { f: "gameplay-forest", t: "Выживание с прокачкой", d: "Ходишь — качается ходьба, копаешь — ломание. Справа — панель состояния: уровень, баланс, место, тело." }
      ] },
    { id: "club", cls: "club", eyebrow: "DaviArt Holy Club · Пограничье", title: "Ночной клуб в горе",
      lead: "Свет и лазеры в такт музыке, толпа на танцполе, свои треки, бар с коктейлями и Барыга на диване. Вход — только с голосовым чатом.",
      shots: [
        { f: "club-dance", big: 1, t: "Танцпол", d: "Прожекторы и лазеры бьют в такт треку. На дропе — отсчёт 3-2-1 и вспышка." },
        { f: "club-entrance", t: "Вход и охранник Гоша", d: "Гоша пускает только с голосовым чатом и называет каждого по нику." },
        { f: "club-crowd", t: "Все треки — свои", d: "Музыку для клуба написали для сервера. Её можно заказать у DJ или слушать на сайте." },
        { f: "club-bar", t: "Бармен Аркадий", d: "Коктейли от $1. Каждый слегка «вставляет» — что именно, узнаешь, когда выпьешь." },
        { f: "baryga", t: "Барыга", d: "Сидит на диване и торгует редкостями только за изумруды: шаблоны, тотемы, книги." },
        { f: "club-floor", t: "Огни клуба", d: "Пол и потолок меняют цвет вместе с музыкой." },
        { f: "club-dj", wide: 1, t: "DJ Крипер", d: "Закажи трек за $50 — он заиграет следующим." },
        { f: "club-manager", wide: 1, t: "Менеджер клуба", d: "Три задания в день и премия за все три. Взносы и награды — в игровой валюте." }
      ] },
    { id: "end", cls: "end", eyebrow: "Дальние миры", title: "Чем дальше — тем страшнее",
      lead: "Пограничье, Пустоши, Незер и Энд. Чем дальше мир, тем он богаче и опаснее, и тем больше отнимает смерть. В Пустошах восходит Кровавая луна.",
      shots: [
        { f: "wastes-tower", wide: 1, t: "Край мира", d: "В Энде — фиолетовые башни, порталы и дракон. Туда идут только прокачанные." },
        { f: "wastes-sage", wide: 1, t: "Преисполнившийся", d: "Отшельник в Энде делится мудростью: «Я в своём познании настолько преисполнился…»" }
      ] }
  ];

  var all = [];
  function shotHTML(s) {
    var i = all.length;
    all.push(s);
    var cls = "l-shot" + (s.big ? " big" : s.wide ? " wide" : "");
    return '<figure class="' + cls + '" tabindex="0" role="button" data-i="' + i + '" aria-label="' + esc(s.t) + ' — открыть фото">' +
      '<img src="' + S + s.f + (s.big ? "" : "-s") + '.jpg" alt="' + esc(s.t + ". " + s.d) + '" loading="' + (i < 3 ? "eager" : "lazy") + '" decoding="async">' +
      '<figcaption><b>' + esc(s.t) + '</b><span>' + esc(s.d) + '</span></figcaption></figure>';
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var box = document.getElementById("chapters");
  if (box) box.innerHTML = CHAPTERS.map(function (c) {
    return '<section class="l-ch l-ch--' + c.cls + '" id="' + c.id + '-story"><div class="l-ch__head"><div class="l-eyebrow">' + esc(c.eyebrow) + '</div><h2>' +
      esc(c.title) + '</h2><p class="l-ch__lead">' + esc(c.lead) + '</p></div><div class="l-grid">' + c.shots.map(shotHTML).join("") + '</div></section>';
  }).join("");
  // кадры вне глав (геймплей/карта у отзывов) — тоже в общий просмотр
  Array.prototype.forEach.call(document.querySelectorAll(".l-shot[data-extra]"), function (el) {
    el.dataset.i = all.length;
    all.push({ f: el.dataset.extra, t: el.dataset.t, d: el.dataset.d });
  });

  // ---------- просмотр фото ----------
  var lb = document.getElementById("lb"), lbImg = document.getElementById("lb-img"), lbT = document.getElementById("lb-t"), lbD = document.getElementById("lb-d");
  var cur = 0, opener = null;
  function show(i) {
    cur = (i + all.length) % all.length;
    var s = all[cur];
    lbImg.src = S + s.f + ".jpg";
    lbImg.alt = s.t;
    lbT.textContent = s.t;
    lbD.textContent = s.d;
  }
  function open(i, el) { opener = el; show(i); lb.hidden = false; document.body.style.overflow = "hidden"; document.getElementById("lb-x").focus(); }
  function close() { lb.hidden = true; document.body.style.overflow = ""; if (opener) opener.focus(); }
  document.addEventListener("click", function (e) {
    var f = e.target.closest(".l-shot");
    if (f && f.dataset.i) open(+f.dataset.i, f);
  });
  document.addEventListener("keydown", function (e) {
    var f = document.activeElement && document.activeElement.closest && document.activeElement.closest(".l-shot");
    if (lb.hidden) { if (f && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(+f.dataset.i, f); } return; }
    if (e.key === "Escape") close();
    if (e.key === "ArrowRight") show(cur + 1);
    if (e.key === "ArrowLeft") show(cur - 1);
  });
  document.getElementById("lb-x").addEventListener("click", close);
  document.getElementById("lb-prev").addEventListener("click", function () { show(cur - 1); });
  document.getElementById("lb-next").addEventListener("click", function () { show(cur + 1); });
  lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
  var x0 = null;
  lb.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1)); x0 = null; });
})();
