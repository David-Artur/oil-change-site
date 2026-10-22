/* Раздел «🎵 Музыка» на главной (владелец 2026-10-22: «выложи все наши треки на сайт — отдельная вкладка, по клубам и по стилю,
 * чтобы люди могли послушать»). Источник — music/own/playlist.json (= то, что играет в клубе; собирает scripts/club/club_sync.py
 * из папки владельца HOLY CLUB). Группы: место (клуб) → стиль; фильтр по стилю; играет один трек за раз. */
(function () {
  "use strict";
  var box = document.getElementById("music-list"), chips = document.getElementById("music-chips"), cnt = document.getElementById("music-count");
  if (!box) return;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  function mmss(t) { t = Math.round(t || 0); return Math.floor(t / 60) + ":" + ("0" + t % 60).slice(-2); }
  var tracks = [], cur = "all";
  function render() {
    var list = tracks.filter(function (t) { return cur === "all" || t.style === cur; });
    var places = {};
    list.forEach(function (t) { var p = t.place || "DaviArt Holy Club"; (places[p] = places[p] || {}); (places[p][t.style] = places[p][t.style] || []).push(t); });
    var html = "";
    Object.keys(places).forEach(function (p) {
      html += '<h3 class="music-place">🪩 ' + esc(p) + "</h3>";
      Object.keys(places[p]).sort().forEach(function (st) {
        html += '<div class="music-style"><h4>' + esc(st) + ' <span class="music-n">' + places[p][st].length + "</span></h4><div class=\"music-grid\">";
        places[p][st].forEach(function (t) {
          html += '<div class="card music-track"><div class="music-head"><b>' + esc(t.title) + '</b><span>' + mmss(t.length) + "</span></div>" +
            '<audio controls preload="none" src="music/' + esc(t.file) + '"></audio></div>';
        });
        html += "</div></div>";
      });
    });
    box.innerHTML = html || '<p class="empty">Треков пока нет.</p>';
  }
  fetch("music/own/playlist.json?t=" + Math.floor(Date.now() / 60000), {cache: "no-cache"}).then(function (r) { return r.json(); }).then(function (j) {
    tracks = (j.tracks || []).map(function (t) { t.style = t.style || "Клубное"; return t; });
    tracks.sort(function (a, b) { return a.title.localeCompare(b.title, "ru"); });
    var styles = {};
    tracks.forEach(function (t) { styles[t.style] = (styles[t.style] || 0) + 1; });
    var n = tracks.length, w = n % 10 === 1 && n % 100 !== 11 ? "трек" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "трека" : "треков";
    var min = Math.round(tracks.reduce(function (s, t) { return s + (t.length || 0); }, 0) / 60);
    if (cnt) cnt.textContent = n + " " + w + " · " + (min >= 60 ? Math.floor(min / 60) + " ч " + min % 60 + " мин" : min + " мин") + " музыки";
    if (chips) chips.innerHTML = '<button class="chip" type="button" data-s="all" aria-pressed="true">Все</button>' +
      Object.keys(styles).sort().map(function (s) { return '<button class="chip" type="button" data-s="' + esc(s) + '" aria-pressed="false">' + esc(s) + " · " + styles[s] + "</button>"; }).join("");
    render();
  }).catch(function () { box.innerHTML = '<p class="empty">Список треков не загрузился — обнови страницу.</p>'; });
  if (chips) chips.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest(".chip") : null; if (!b) return;
    cur = b.getAttribute("data-s");
    Array.prototype.forEach.call(chips.querySelectorAll(".chip"), function (c) { c.setAttribute("aria-pressed", c === b ? "true" : "false"); });
    render();
  });
  // играет один трек за раз
  box.addEventListener("play", function (e) {
    Array.prototype.forEach.call(box.querySelectorAll("audio"), function (a) { if (a !== e.target) a.pause(); });
  }, true);
})();
