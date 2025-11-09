self.addEventListener('install', e => {
  e.waitUntil(caches.open('indoor-v1').then(c => c.addAll([
    './', './index.html', './app.js', './building.geojson',
    './floor0.svg','./floor1.svg','./floor2.svg','./manifest.webmanifest'
  ])));
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
