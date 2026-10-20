/* DaviArt Craft — 3D-карта (У280 v3). Service Worker страницы daviart.com/3d/ (область — только /3d/, остальной сайт не трогает).
 * 1) BlueMap хранит hires-плитки и textures.json сжатыми (*.gz). Свой сервер BlueMap отдавал их с Content-Encoding: gzip,
 *    а GitHub Pages отдаёт .gz как есть. Без сжатия плитки в ~16 раз больше — не влезают в лимит GitHub.
 *    Поэтому запрос «…/x.prbm» → качаем «…/x.prbm.gz» (репо David-Artur/daviart-3d) → распаковываем в браузере (DecompressionStream).
 * 2) live/players.json — собираем из https://mc.daviart.com/api/players (игроки онлайн; CORS разрешён только для daviart.com).
 * 3) assets/playerheads/<ник>.png — головы с mc-heads.net. */
const API_PLAYERS = 'https://mc.daviart.com/api/players';
const GZ_RE = /\/tiles\/0\/.*\.prbm$|\/textures\.json$/;
const PLAYERS_RE = /\/maps\/([^/]+)\/live\/players\.json$/;
const HEAD_RE = /\/assets\/playerheads\/([^/]+)\.png$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
// страница, открытая, пока SW ещё ставился (быстрое обновление на первом заходе), просит взять её под управление
self.addEventListener('message', (e) => { if (e.data === 'claim') e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  let m;
  if (GZ_RE.test(u.pathname)) e.respondWith(gunzipFetch(u, e.request));
  else if ((m = u.pathname.match(PLAYERS_RE))) e.respondWith(players(decodeURIComponent(m[1])));
  else if ((m = u.pathname.match(HEAD_RE))) e.respondWith(head(decodeURIComponent(m[1])));
});

async function gunzipFetch(u, req) {
  let r;
  try {
    r = await fetch(u.origin + u.pathname + '.gz' + u.search, { cache: req.cache === 'no-cache' ? 'no-cache' : 'default', mode: 'cors', credentials: 'omit' });
  } catch (err) { return new Response(null, { status: 504 }); }
  if (!r.ok) return new Response(null, { status: r.status });
  const buf = await r.arrayBuffer();
  const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  const type = u.pathname.endsWith('.json') ? 'application/json' : 'application/octet-stream';
  // хостинг мог сам отдать Content-Encoding: gzip (тогда браузер уже распаковал) — проверяем сигнатуру 1f 8b
  if (b.length === 2 && b[0] === 0x1f && b[1] === 0x8b) {
    const out = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(await new Response(out).arrayBuffer(), { status: 200, headers: { 'Content-Type': type } });
  }
  return new Response(buf, { status: 200, headers: { 'Content-Type': type } });
}

// ник идёт в разметку BlueMap (innerHTML) — оставляем только безопасные символы
const safe = (s) => String(s || '').replace(/[^A-Za-z0-9_.\-]/g, '').slice(0, 32);

async function players(mapId) {
  let list = [];
  try {
    const r = await fetch(API_PLAYERS, { cache: 'no-store', mode: 'cors', credentials: 'omit' });
    const j = await r.json();
    list = (j.players || []).filter((p) => safe(p.name)).map((p) => ({
      uuid: safe(p.name), name: safe(p.name), foreign: p.world !== mapId,
      position: { x: +p.x || 0, y: +p.y || 0, z: +p.z || 0 }, rotation: { yaw: +p.yaw || 0, pitch: 0, roll: 0 },
    }));
  } catch (err) { /* API недоступен — просто без игроков */ }
  return new Response(JSON.stringify({ players: list }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function head(name) {
  try {
    const r = await fetch('https://mc-heads.net/avatar/' + encodeURIComponent(safe(name)) + '/32', { mode: 'no-cors', credentials: 'omit' });
    if (r.ok || r.type === 'opaque') return r;
  } catch (err) { /* ниже — Стив */ }
  return fetch(new URL('assets/steve.png', self.registration.scope));
}
