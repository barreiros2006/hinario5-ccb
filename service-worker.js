// Ao publicar qualquer alteração, aumente a versão abaixo (v3 -> v4...)
const C = 'h5-ccb-v3';
const A = ['./','./index.html','./css/style.css','./js/app.js','./manifest.json',
           './dados/hinos.json','./icons/icon-192.png','./icons/icon-512.png',
           './js/pdfjs/pdf.min.mjs','./js/pdfjs/pdf.worker.min.mjs',
           './finais/final1.pdf','./finais/final2.pdf','./finais/final3.pdf','./finais/final4.pdf',
           './finais/final5.pdf','./finais/final6.pdf','./finais/final7.pdf'];

// Baixa tudo na instalação (inclusive as 7 finais) para funcionar 100% offline
self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => Promise.all(A.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Rede primeiro (pega atualização), cache como reserva (offline)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
