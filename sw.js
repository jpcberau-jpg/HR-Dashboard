// ============================================================
// sw.js — Service Worker HRD Dashboard
// Versi cache diupdate setiap deploy baru
// ============================================================

const CACHE_NAME = 'hrd-dashboard-v1';
const CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  // CDN libraries (di-cache supaya bisa offline)
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Barlow+Condensed:wght@400;500;600;700;800&display=swap'
];

// ── INSTALL: cache semua aset penting ──────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching app shell');
      // addAll gagal total jika 1 url error, pakai loop agar lebih toleran
      return Promise.allSettled(
        CACHE_URLS.map(url => cache.add(url).catch(err => {
          console.warn('[SW] Gagal cache:', url, err.message);
        }))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: hapus cache lama ─────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Menghapus cache lama:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: strategi Cache First, fallback ke Network ───────
self.addEventListener('fetch', event => {
  // Hanya handle GET request
  if (event.request.method !== 'GET') return;

  // Jangan intercept request ke Google Apps Script (pengiriman data)
  if (event.request.url.includes('script.google.com')) return;

  // Jangan intercept request ke Google Fonts API (biarkan network)
  // tapi kalau sudah di cache, pakai cache
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Ada di cache — pakai cache, update di background
        fetch(event.request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, networkResponse.clone());
              });
            }
          })
          .catch(() => {}); // gagal update cache tidak masalah
        return cachedResponse;
      }

      // Tidak ada di cache — ambil dari network, simpan ke cache
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Offline & tidak ada cache — tampilkan fallback
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ── MESSAGE: handle perintah dari app ──────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0].postMessage({ status: 'cache cleared' });
    });
  }
});
