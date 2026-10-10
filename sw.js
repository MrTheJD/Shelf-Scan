// Offline support for Shelfie (formerly Shelf Scan): the app shell is cached on install, and old caches are deleted on activate.
const CACHE = "shelfscan-v361-v69";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

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
  if (url.origin !== self.location.origin || req.headers.has("range")) return;   // only the app's own files (store lookups etc. go straight to the network)
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
