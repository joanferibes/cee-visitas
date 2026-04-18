// CEE Visitas — Service Worker v8
const CACHE_NAME = "cee-visitas-v8";
const BASE = self.location.pathname.replace("sw.js", "");

const urlsToCache = [
  BASE, BASE + "index.html",
  BASE + "style.css?v=8", BASE + "app.js?v=8",
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
  const url = new URL(e.request.url);
  if (url.hostname.includes("script.google.com") || url.hostname.includes("googleusercontent.com")) return;
  e.respondWith(
    caches.match(e.request).then((r) =>
      r || fetch(e.request).catch(() => caches.match(BASE + "index.html"))
    )
  );
});
