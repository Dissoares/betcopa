const CACHE = 'betcopa-v1';
const PRECACHE = [
  '/',
  '/manifest.json',
  '/favicon.svg',
];

// ── Install: pre-cache shell ──────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
});

// ── Activate: purge old caches ────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // API calls: network only — never cache
  if (url.pathname.startsWith('/api/')) return;

  // Imagens (bandeiras, logos): cache-first — servem do cache imediatamente
  // após a primeira visita, sem esperar a rede
  if (e.request.destination === 'image') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached ?? new Response('', { status: 404 }));
      })
    );
    return;
  }

  // Demais recursos: network-first, cache fallback
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then(cached => cached ?? caches.match('/'))
      )
  );
});

// ── Push notifications ────────────────────────────────────────
self.addEventListener('push', e => {
  const data  = e.data?.json?.() ?? {};
  const title = data.title ?? 'BetCopa';
  const opts  = {
    body:  data.body  ?? '',
    icon:  '/favicon-192.png',
    badge: '/favicon-192.png',
    data:  { url: data.url ?? '/' },
    vibrate: [200, 100, 200],
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const target = e.notification.data?.url ?? '/';
      const existing = list.find(c => c.url.includes(location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(location.origin + target);
      } else {
        clients.openWindow(target);
      }
    })
  );
});
