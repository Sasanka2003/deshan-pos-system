// DESHAN TEXTILE POS v4 — Service Worker
const CACHE = 'deshan-pos-v4';
const OFFLINE_ASSETS = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(OFFLINE_ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('supabase.co') || url.hostname.includes('googleapis.com') || e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/assets/') || url.pathname.match(/\.(js|css|png|svg|ico|woff2?)$/)) {
    e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).then(res => { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); return res; })));
  } else {
    e.respondWith(fetch(e.request).then(res => { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); return res; }).catch(() => caches.match(e.request).then(c => c || caches.match('/index.html'))));
  }
});
