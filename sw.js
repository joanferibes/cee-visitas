// CEE Visitas — Service Worker v9
const CACHE_NAME = "cee-visitas-v9";
const BASE = self.location.pathname.replace("sw.js", "");

const urlsToCache = [
  BASE, BASE + "index.html",
  BASE + "style.css?v=9", BASE + "app.js?v=9",
  BASE + "manifest.json",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(urlsToCache).catch(()=>{})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (e.request.url.indexOf("script.google.com") > -1) return;
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => {
      if (!resp || resp.status !== 200) return resp;
      const copy = resp.clone();
      caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
      return resp;
    }).catch(() => caches.match(BASE + "index.html")))
  );
});
