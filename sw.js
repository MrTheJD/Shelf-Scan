// Offline support: app shell is cached on install; the scanner library and
// product images are cached the first time they load. Shared data and GitHub
// calls always go to the network (the app keeps its own copy for offline use).
const CACHE = "shelfscan-v10";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
const SCANNER_LIB = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";
// Barcode decoder (WebAssembly). Cached up front so scanning works offline; its small helper modules
// are cached the first time the camera starts.
const DECODER = ["https://cdn.jsdelivr.net/npm/barcode-detector@3.2.2/ponyfill/+esm",
                 "https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.3/dist/reader/zxing_reader.wasm"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    // cache: "reload" so a new version never stores a stale copy from the browser's HTTP cache.
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))
      .then(() => Promise.all([SCANNER_LIB, ...DECODER].map(u => c.add(u).catch(() => {})))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "api.github.com" || url.pathname.includes("/data/") || url.pathname.includes("/api/v2/product/")) return;
  // Network first for the page itself so updates show up; cache as fallback.
  // cache: "no-cache" revalidates with the server instead of reusing GitHub Pages' 10-minute browser cache.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req, { cache: "no-cache" }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put("index.html", copy)); return r; })
      .catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
