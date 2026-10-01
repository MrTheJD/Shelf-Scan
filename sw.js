// Offline support for Shelf Scan Beta 4: the app shell is cached on install; the voice library and its
// runtime are cached the first time they load. The downloaded voice models are NOT handled here: the
// model library keeps them in its own cache, and they must never be fetched behind the person's back.
const CACHE = "shelfscan-b6-v6";
const SHELL = ["./", "index.html", "ai-worker.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
const NEVER = ["api.github.com", "huggingface.co", "hf.co", "cdn-lfs.huggingface.co", "xethub.hf.co", "raw.githubusercontent.com", "objects.githubusercontent.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("shelfscan") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (NEVER.some(h => url.hostname === h || url.hostname.endsWith("." + h)) || url.pathname.includes("/data/")) return;
  if (req.headers.has("range")) return;   // model files are fetched in ranges; leave those alone
  // Network first for the page itself so updates show up; cached copy as the offline fallback.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req, { cache: "no-cache" }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put("index.html", copy)); return r; })
      .catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.status === 200) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
    return r;
  })));
});
