// Ao publicar qualquer alteração, aumente a versão abaixo (v10 -> v11...)
const C = 'h5-ccb-v10';
const A = ['./','./index.html','./css/style.css?v=10','./js/app.js?v=10','./manifest.json',
           './dados/hinos.json','./icons/icon-192.png','./icons/icon-512.png',
           './js/pdfjs/pdf.min.mjs','./js/pdfjs/pdf.worker.min.mjs',
           './finais/final1.pdf','./finais/final2.pdf','./finais/final3.pdf','./finais/final4.pdf',
           './finais/final5.pdf','./finais/final6.pdf','./finais/final7.pdf'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => Promise.all(A.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // no-cache: sempre confere com o servidor se há versão nova
    fetch(e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' })).then(r => {
      if (r.ok && r.status === 200) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
