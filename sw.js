/* マワル MAP service worker v3
   - アプリ本体: network-first（常に最新、オフライン時のみキャッシュ）
   - 地図タイル・Leaflet: cache-first＋上限つき（圏外でも直近の地図が見える） */
const CACHE = "mawaru-v7";
const TILE_CACHE = "mawaru-tiles-v1";
const TILE_MAX = 400;
const CORE = ["./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE && k !== TILE_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

async function trimCache(cache, max) {
  const keys = await cache.keys();
  if (keys.length <= max) return;
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // 地図タイルとLeaflet本体: cache-first（オフラインでも直近エリアの地図が出る）
  const isTile = url.hostname === "tile.openstreetmap.org" || url.hostname === "cyberjapandata.gsi.go.jp";
  const isLib = url.hostname === "unpkg.com" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (isTile || isLib) {
    e.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE);
      const hit = await cache.match(e.request);
      if (hit) return hit;
      try {
        const res = await fetch(e.request);
        if (res && (res.ok || res.type === "opaque")) {
          cache.put(e.request, res.clone());
          if (isTile) trimCache(cache, TILE_MAX);
        }
        return res;
      } catch (err) {
        return hit || Response.error();
      }
    })());
    return;
  }

  // GAS APIなど他のクロスオリジンはキャッシュしない（常に最新）
  if (url.origin !== location.origin) return;

  // アプリ本体: network-first
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(m => m || caches.match("./index.html")))
  );
});
