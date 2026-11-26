/* Only the public offline notice is cached. Clocking and account requests always
   go to the server; no offline queue or cached receipt can imply acceptance. */
const ROOT = new URL('./', self.location.href);
const CACHE_PREFIX = `avilonx-offline:${ROOT.pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = new URL('offline.html', ROOT).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_URL)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const target = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' ||
      target.origin !== ROOT.origin || !target.pathname.startsWith(ROOT.pathname)) return;
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(OFFLINE_URL) || new Response('AvilonX is offline. Reconnect and reload. Clocking needs an internet connection.', {
      status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
    });
  }));
});

/* Push notifications (push.sql, avilonx-push): show them, and open the page on tap. */
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {body: event.data?.text() || ''}; }
  const icon = new URL('assets/images/app-icon-192.png', ROOT).href;
  event.waitUntil(self.registration.showNotification(data.title || 'AvilonX', {
    body: data.body || '', icon, badge: icon, tag: data.tag || undefined,
    data: {url: data.url || ROOT.href}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  let target = new URL(event.notification.data?.url || ROOT.href, ROOT);
  if (target.origin !== ROOT.origin) target = ROOT;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const same = open.find(client => client.url.startsWith(ROOT.href));
    if (same) { await same.focus(); return same.navigate(target.href).catch(() => {}); }
    return self.clients.openWindow(target.href);
  })());
});
