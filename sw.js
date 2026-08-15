/* オフラインでも遊べるようにするための Service Worker
   (一度読み込めば、あとは電波がなくても起動します) */
var CACHE = 'lfd-v2';
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

/* キャッシュをすぐ返しつつ、裏で新しい版を取り直す方式。
   ・オフラインでもすぐ起動する
   ・ゲームを更新したときも、次に開いたときには新しい版になる */
self.addEventListener('fetch', function (ev) {
  if (ev.request.method !== 'GET') return;
  if (new URL(ev.request.url).origin !== self.location.origin) return;
  ev.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(ev.request).then(function (hit) {
        var fromNet = fetch(ev.request).then(function (res) {
          if (res && res.ok) cache.put(ev.request, res.clone());
          return res;
        }).catch(function () {
          return hit || cache.match('./index.html');
        });
        return hit || fromNet;
      });
    })
  );
});
