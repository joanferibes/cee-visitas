var CACHE_NAME = 'cee-visitas-v4';
var BASE = self.location.pathname.replace('sw.js','');
var urlsToCache = [
  BASE,
  BASE + 'index.html',
  BASE + 'style.css',
  BASE + 'app.js',
  BASE + 'manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(function(cache) { return cache.addAll(urlsToCache); }));
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response) return response;
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200) return response;
        var responseToCache = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, responseToCache); });
        return response;
      }).catch(function() { return caches.match(BASE + 'index.html'); });
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(names.filter(function(n) { return n !== CACHE_NAME; }).map(function(n) { return caches.delete(n); }));
    })
  );
});
