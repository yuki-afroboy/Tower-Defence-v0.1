/* オフラインでも遊べるようにするための Service Worker
   (一度読み込めば、あとは電波がなくても起動します) */
var CACHE = 'lfd-v1';
var FILES = [
  './',
  './index.html',
  './css/style.css',
  './src/config.js',
  './src/engine.js',
  './src/renderer.js',
  './src/sfx.js',
  './src/ui.js',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  if (ev.request.method !== 'GET') return;
  ev.respondWith(
    caches.match(ev.request).then(function (hit) {
      return hit || fetch(ev.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(ev.request, copy); });
        return res;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
