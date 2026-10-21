const CACHE = "migraines-v4";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-512.png", "./three.min.js", "./head3d.js?v=2"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("migraines-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Réseau d'abord, copie en cache pour fonctionner hors ligne.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  if (e.request.url.endsWith("three.min.js")) { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))); return; }
  e.respondWith(fetch(e.request, { cache: "no-store" }).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); return res; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html"))));
});
