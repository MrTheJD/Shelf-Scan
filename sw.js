// Offline support for Shelfie (formerly Shelf Scan): the app shell is cached on install; the voice library and its
// runtime are cached the first time they load. The downloaded voice models are NOT handled here: the
// model library keeps them in its own cache, and they must never be fetched behind the person's back.
const CACHE = "shelfscan-v2100-v47";
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
  // Network first for the page itself so updates show up, but never more than 3 seconds: on weak in-store signal the saved copy opens
  // instead (the network answer still lands in the cache for next time). Only a good answer replaces the saved copy, never an error page.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const net = fetch(req, { cache: "no-cache" }).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put("index.html", copy)).catch(() => {}); } return r; });
      const saved = await caches.match("index.html");
      if (!saved) return net;
      e.waitUntil(net.catch(() => {}));   // let a slow answer finish and refresh the cache
      try { const r = await Promise.race([net, new Promise(res => setTimeout(() => res(null), 3000))]); if (r && r.ok) return r; } catch (err) {}
      return saved;
    })());
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.status === 200) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
    return r;
  })));
});
