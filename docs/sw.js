/**
 * Service worker: cachea el armazón para que la app abra rápido.
 * A la API no se le hace caché nunca.
 * Al publicar un cambio subir V acá y el ?v=N en index.html.
 */
const V = '5';
const CACHE = 'rendiciones-v' + V;
const ARMAZON = ['./', './index.html', './ayuda.html', './manifest.json', './icono.svg', './logos/ingeco-azul.png',
  './estilo.css?v=' + V, './api.js?v=' + V, './app.js?v=' + V];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARMAZON)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Estilo común de la App INGECO: red primero (siempre la última), caché solo sin señal.
const COMUN = 'https://app.ingecosa.com.ar/ingeco.';
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'GET' && e.request.url.startsWith(COMUN)) {
    e.respondWith(fetch(e.request).then((r) => { if (r && r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); } return r; }).catch(() => caches.match(e.request)));
    return;
  }
  if (e.request.method !== 'GET' || url.hostname.indexOf('script.google.com') !== -1 || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
