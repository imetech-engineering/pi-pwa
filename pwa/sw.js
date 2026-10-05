/* Service worker: offline de app-schil. API-calls gaan altijd direct naar de Pi. */
const CACHE = "pi-v1";
const SCHIL = ["./", "index.html", "manifest.json", "css/style.css", "css/pi.css", "js/opslag.js", "js/api.js", "js/install.js", "js/app.js", "js/terug.js", "js/imetech-apps.js", "icons/icon-192.png", "icons/icon-512.png", "branding/logo-zwart.png", "branding/logo-wit.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SCHIL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(r => { const kopie = r.clone(); caches.open(CACHE).then(c => c.put(e.request, kopie)); return r; }).catch(() => caches.match(e.request)));
});
