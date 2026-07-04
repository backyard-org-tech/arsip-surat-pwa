// ════════════════════════════════════════════════════════════
//  Service Worker — PWA Shell "Arsip Surat Elektronik"
//  Catatan: SW ini hanya meng-cache SHELL (halaman pembungkus +
//  ikon), BUKAN konten aplikasi Apps Script itu sendiri (yang
//  hidup di dalam iframe dan selalu butuh koneksi ke Google).
//  Ini cukup untuk memenuhi kriteria "installable" browser dan
//  memberi splash/offline-fallback yang layak saat sinyal jelek.
// ════════════════════════════════════════════════════════════

const CACHE_NAME = 'arsip-surat-shell-v2';
const SHELL_ASSETS = [
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// index.html/halaman utama SELALU diambil dari jaringan dulu (network-first) —
// supaya update kode langsung aktif tanpa perlu clear cache manual. Fallback
// ke cache hanya kalau benar-benar offline.
// Aset statis (ikon, manifest) tetap cache-first karena jarang berubah.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isAppShellDoc = event.request.mode === 'navigate' ||
    url.pathname.endsWith('/') || url.pathname.endsWith('index.html');

  if (isAppShellDoc) {
    event.respondWith(
      fetch(event.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      }).catch(() => caches.match(event.request).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => caches.match('./index.html'));
    })
  );
});

// ── PUSH NOTIFICATION ───────────────────────────────────────
// Payload dikirim oleh backend Apps Script lewat FCM HTTP v1 API.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}

  const notif = data.notification || {};
  const title = notif.title || 'Arsip Surat Elektronik';
  const options = {
    body: notif.body || 'Ada pembaruan baru.',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    data: { link: (data.fcmOptions && data.fcmOptions.link) || './index.html' },
    vibrate: [120, 60, 120],
    tag: 'arsip-surat-notif',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Klik notifikasi → fokuskan/buka window shell yang sudah ada.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.link) || './index.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
