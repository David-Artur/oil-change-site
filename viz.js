/* DaviArt Craft — схемы для разделов-гайдов (SVG строками, без картинок). Цвета берутся из CSS-переменных темы.
 * window.VIZ[имя]() → строка <svg>. Используются в app.js по полю viz у раздела в data.js (window.GUIDES). */
(function () {
  "use strict";
  var T = "var(--text)", M = "var(--muted)", L = "var(--line2)", C = "var(--card2)";
  function svg(w, h, body, label) {
    return '<svg class="viz" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + label + '" xmlns="http://www.w3.org/2000/svg">' + body + "</svg>";
  }
  function t(x, y, s, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + (o.size || 13) + '" fill="' + (o.fill || T) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : "") +
      (o.bold ? ' font-weight="700"' : "") + ">" + s + "</text>";
  }
  var V = {};

  /* ---------- приваты: вид сверху ---------- */
  V.claimsTop = function () {
    var cx = 190, cy = 190, k = 0.78; // 1 блок = 0.78 px (200 бл. = 156 px)
    var ring = function (r, col, dash, lab, ly) {
      return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r * k + '" fill="none" stroke="' + col + '" stroke-width="2.5"' + (dash ? ' stroke-dasharray="6 5"' : "") + "/>" +
        t(cx + 6, cy - r * k + (ly || 14), lab, { size: 12, fill: col, bold: true });
    };
    var b = '<rect x="0" y="0" width="380" height="380" rx="10" fill="' + C + '"/>';
    b += '<circle cx="' + cx + '" cy="' + cy + '" r="' + 200 * k + '" fill="#4a9a2a" fill-opacity=".08"/>';
    b += ring(200, "#3b82f6", false, "200 бл. — дальше можно приватить", 14);
    b += ring(100, "#f59e0b", false, "100 — ничего не ломается", 14);
    b += ring(32, "#ef4444", true, "32 — без PvP", -6);
    b += '<rect x="' + (cx - 5) + '" y="' + (cy - 5) + '" width="10" height="10" fill="#8b5cf6"/>' + t(cx, cy + 22, "точка прибытия", { size: 11, anchor: "middle", fill: M });
    // приваты за голубой линией
    var claim = function (x, y, col, lab) {
      return '<rect x="' + x + '" y="' + y + '" width="22" height="22" fill="' + col + '" fill-opacity=".35" stroke="' + col + '" stroke-width="2"/>' + t(x + 26, y + 15, lab, { size: 11, fill: col, bold: true });
    };
    b += claim(300, 40, "#22c55e", "твой");
    b += claim(26, 300, "#ef4444", "чужой");
    b += claim(300, 318, "#eab308", "ты участник");
    b += '<line x1="290" y1="250" x2="340" y2="250" stroke="#ef4444" stroke-width="3"/><line x1="290" y1="235" x2="340" y2="265" stroke="#ef4444" stroke-width="3"/>' +
      t(278, 280, "ближе 200 — нельзя", { size: 11, fill: "#ef4444" });
    return svg(380, 380, b, "Вид сверху: точка прибытия и зоны 32, 100 и 200 блоков, приваты за линией 200");
  };

  /* ---------- приваты: куб «от земли» сбоку ---------- */
  V.claimSide = function () {
    var s = 22, x0 = 40, y0 = 20, b = '<rect x="0" y="0" width="380" height="300" rx="10" fill="' + C + '"/>';
    // сетка 11×11
    for (var i = 0; i < 11; i++) for (var j = 0; j < 11; j++) {
      var under = j >= 8; // нижние 3 ряда — под землёй
      b += '<rect x="' + (x0 + i * s) + '" y="' + (y0 + j * s) + '" width="' + s + '" height="' + s + '" fill="' + (under ? "#8a6040" : "#7dd3fc") + '" fill-opacity="' + (under ? ".55" : ".18") + '" stroke="' + L + '" stroke-width=".6"/>';
    }
    // кликнутый блок — посередине на уровне земли (ряд 7)
    b += '<rect x="' + (x0 + 5 * s) + '" y="' + (y0 + 7 * s) + '" width="' + s + '" height="' + s + '" fill="#f59e0b" stroke="#000" stroke-width="1.5"/>';
    b += '<line x1="' + x0 + '" y1="' + (y0 + 8 * s) + '" x2="' + (x0 + 11 * s) + '" y2="' + (y0 + 8 * s) + '" stroke="#4a9a2a" stroke-width="4"/>';
    // домик
    b += '<rect x="' + (x0 + 3 * s) + '" y="' + (y0 + 4 * s) + '" width="' + 5 * s + '" height="' + 3 * s + '" fill="#a16207" fill-opacity=".7"/><polygon points="' + (x0 + 2.5 * s) + "," + (y0 + 4 * s) + " " + (x0 + 5.5 * s) + "," + (y0 + 1.6 * s) + " " + (x0 + 8.5 * s) + "," + (y0 + 4 * s) + '" fill="#7c2d12" fill-opacity=".8"/>';
    var rx = x0 + 11 * s + 10;
    b += t(rx, y0 + 4 * s, "7 блоков вверх", { size: 12, bold: true }) + t(rx, y0 + 4 * s + 16, "(дом над землёй)", { size: 11, fill: M });
    b += t(rx, y0 + 7.7 * s, "← блок, по которому", { size: 12, fill: "#f59e0b", bold: true }) + t(rx, y0 + 7.7 * s + 15, "кликнул компасом", { size: 11, fill: "#f59e0b" });
    b += t(rx, y0 + 9.9 * s, "3 блока вниз", { size: 12, bold: true }) + t(rx, y0 + 9.9 * s + 15, "(подвал)", { size: 11, fill: M });
    b += t(x0 + 5.5 * s, y0 + 11 * s + 18, "11 блоков в ширину (по 5 в стороны)", { size: 12, anchor: "middle" });
    return svg(380, 300, b, "Вид сбоку: приват 11 на 11, от кликнутого блока 3 вниз и 7 вверх");
  };

  /* ---------- приваты: расширение ---------- */
  V.claimExpand = function () {
    var b = '<rect x="0" y="0" width="380" height="170" rx="10" fill="' + C + '"/>';
    var box = function (x, w, lab, sub) {
      return '<rect x="' + x + '" y="30" width="' + w + '" height="88" fill="#22c55e" fill-opacity=".25" stroke="#22c55e" stroke-width="2.5"/>' +
        t(x + w / 2, 142, lab, { size: 12, anchor: "middle", bold: true }) + t(x + w / 2, 158, sub, { size: 11, anchor: "middle", fill: M });
    };
    b += box(20, 88, "было 11×11", "");
    b += t(130, 70, "встань у границы,", { size: 11, fill: M }) + t(130, 85, "ЛКМ компасом ×2", { size: 12, bold: true }) + '<path d="M128 98 h70 l-8 -6 m8 6 l-8 6" fill="none" stroke="' + T + '" stroke-width="2"/>';
    b += box(222, 96, "стало 12×11", "+1 ряд = 11×11 = 121 бл. → $121");
    b += '<rect x="310" y="30" width="8" height="88" fill="#f59e0b" fill-opacity=".8"/>';
    return svg(380, 170, b, "Расширение привата: два клика компасом у границы — сторона на блок дальше, 1 доллар за блок объёма");
  };

  /* ---------- приваты: цвета границ с компасом ---------- */
  V.compass = function () {
    var rows = [["#22c55e", "твой приват"], ["#eab308", "приват, где ты участник"], ["#ef4444", "чужой приват"],
      ["#f59e0b", "100 бл. от спавна — ничего не ломается"], ["#3b82f6", "200 бл. — ближе приватить нельзя"]];
    var b = '<rect x="0" y="0" width="380" height="' + (rows.length * 30 + 20) + '" rx="10" fill="' + C + '"/>';
    rows.forEach(function (r, i) {
      var y = 26 + i * 30;
      for (var d = 0; d < 7; d++) b += '<circle cx="' + (24 + d * 9) + '" cy="' + (y - 4) + '" r="3" fill="' + r[0] + '"/>';
      b += t(96, y, r[1], { size: 13 });
    });
    return svg(380, rows.length * 30 + 20, b, "Цвета частиц-границ, когда компас в руке");
  };

  /* ---------- градусник ---------- */
  V.thermo = function () {
    var b = '<rect x="0" y="0" width="380" height="230" rx="10" fill="#1b1b1b"/>';
    b += '<defs><linearGradient id="tg" x1="0" x2="1"><stop offset="0" stop-color="#3a7bff"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#ff4a1a"/></linearGradient></defs>';
    var x0 = 30, w = 320, y = 110;
    b += '<rect x="' + x0 + '" y="' + y + '" width="' + w + '" height="14" fill="url(#tg)"/>';
    // зона комфорта (жёлтая рамка)
    b += '<rect x="' + (x0 + 130) + '" y="' + (y - 7) + '" width="70" height="28" fill="#ffd54a" fill-opacity=".25" stroke="#ffd54a" stroke-width="3"/>';
    // ▼ снаружи (холодно — слева), ▲ тело
    b += '<polygon points="' + (x0 + 70) + "," + (y - 12) + " " + (x0 + 60) + "," + (y - 26) + " " + (x0 + 80) + "," + (y - 26) + '" fill="#5fc8ff"/>';
    b += '<polygon points="' + (x0 + 118) + "," + (y + 18) + " " + (x0 + 108) + "," + (y + 32) + " " + (x0 + 128) + "," + (y + 32) + '" fill="#ffffff"/>';
    b += t(x0 + w, y - 34, "Холодно 20%", { size: 15, anchor: "end", fill: "#8fd8ff", bold: true });
    // выноски
    b += t(x0, 28, "▼ голубой — температура вокруг", { size: 12, fill: "#5fc8ff" });
    b += t(x0, 48, "▲ белый — температура твоего тела", { size: 12, fill: "#ffffff" });
    b += t(x0, 68, "жёлтая рамка — твоя зона комфорта (привычка)", { size: 12, fill: "#ffd54a" });
    b += t(x0, 160, "синий край — холодно · белое — норма · красный — жарко", { size: 12, fill: "#cfcfcf" });
    b += t(x0, 182, "подпись: «Норма» / «Холодно 20%» / «Жарко 20%»", { size: 12, fill: "#cfcfcf" });
    b += t(x0, 202, "с 25% — «скоро обморожение / тепловой удар»", { size: 12, fill: "#ffb36b" });
    b += t(x0, 222, "с 30% — красным: уже травмирует · мигает рамка", { size: 12, fill: "#ff6b6b" });
    return svg(380, 230, b, "Градусник над полоской еды: шкала, зона комфорта, температура вокруг и тела, подписи");
  };

  /* ---------- тело ---------- */
  V.body = function () {
    var b = '<rect x="0" y="0" width="380" height="250" rx="10" fill="' + C + '"/>';
    var part = function (x, y, w, h, col) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + col + '" stroke="#000" stroke-width="1.5"/>'; };
    var X = 60;
    b += part(X + 16, 16, 32, 32, "#22c55e");   // голова
    b += part(X + 16, 50, 32, 70, "#eab308");   // туловище
    b += part(X - 2, 50, 16, 70, "#22c55e");    // левая рука
    b += part(X + 50, 50, 16, 70, "#ef4444");   // правая рука
    b += part(X + 16, 122, 15, 76, "#f97316");  // левая нога
    b += part(X + 33, 122, 15, 76, "#22c55e");  // правая нога
    var rx = 170;
    b += t(rx, 32, "Голова — кружится", { size: 13 });
    b += t(rx, 72, "Туловище — тошнит", { size: 13 });
    b += t(rx, 100, "Руки — слабее бьёшь,", { size: 13 }) + t(rx, 116, "медленнее ломаешь", { size: 13 });
    b += t(rx, 160, "Ноги — хромаешь,", { size: 13 }) + t(rx, 176, "ходишь медленнее", { size: 13 });
    b += t(20, 226, "цвет части:", { size: 12, fill: M }) + part(100, 215, 14, 14, "#22c55e") + t(118, 226, "цела", { size: 12 }) +
      part(162, 215, 14, 14, "#eab308") + t(180, 226, "ранена", { size: 12 }) + part(238, 215, 14, 14, "#ef4444") + t(256, 226, "сильно ранена", { size: 12 });
    return svg(380, 250, b, "Фигурка тела: 6 частей и что бывает при ранении каждой");
  };

  /* ---------- стамина ---------- */
  V.stamina = function () {
    var b = '<rect x="0" y="0" width="380" height="170" rx="10" fill="#1b1b1b"/>';
    var bar = function (y, frac, col, lab) {
      return '<rect x="40" y="' + y + '" width="300" height="8" fill="#333"/><rect x="' + (190 - 150 * frac) + '" y="' + y + '" width="' + 300 * frac + '" height="8" fill="' + col + '"/>' +
        t(190, y + 26, lab, { size: 12, anchor: "middle", fill: "#cfcfcf" });
    };
    b += bar(22, 0.9, "#4ade80", "много сил — зелёная (сжимается к центру)");
    b += bar(70, 0.45, "#facc15", "половина — жёлтая");
    b += bar(118, 0.12, "#ef4444", "почти ноль — красная, мигает: бег и рывок нельзя");
    return svg(380, 170, b, "Полоска стамины над хотбаром: зелёная, жёлтая, красная");
  };

  /* ---------- экономика ---------- */
  V.economy = function () {
    var b = '<rect x="0" y="0" width="380" height="250" rx="10" fill="' + C + '"/>';
    var node = function (x, y, w, lab, sub, col) {
      return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="48" rx="8" fill="' + col + '" fill-opacity=".18" stroke="' + col + '" stroke-width="2"/>' +
        t(x + w / 2, y + 21, lab, { size: 13, anchor: "middle", bold: true }) + t(x + w / 2, y + 38, sub, { size: 11, anchor: "middle", fill: M });
    };
    var arrow = function (x1, y1, x2, y2) {
      return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + T + '" stroke-width="2" marker-end="url(#ah)"/>';
    };
    b += '<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="' + T + '"/></marker></defs>';
    b += node(14, 16, 110, "Медь", "есть во всех мирах", "#c2410c");
    b += node(146, 16, 96, "Хранитель", "в лобби, скупка", "#a16207");
    b += node(264, 16, 100, "$ деньги", "/balance", "#16a34a");
    b += arrow(124, 40, 144, 40) + arrow(242, 40, 262, 40);
    b += node(196, 108, 170, "Расширить приват", "$1 за блок", "#2563eb");
    b += node(14, 108, 160, "Купить у игрока", "/pay ник сумма", "#7c3aed");
    b += arrow(314, 64, 290, 106) + arrow(300, 64, 140, 106);
    b += node(14, 186, 352, "Редкое — только в опасных мирах", "алмазы, золото, изумруды → прокачался → продаёшь слабым", "#dc2626");
    b += arrow(94, 184, 94, 158);
    return svg(380, 250, b, "Схема экономики: медь, Хранитель, деньги, приват и покупки у игроков, редкие ресурсы из опасных миров");
  };

  window.VIZ = V;
})();
