/* ZenDocz service worker — v5 (ZenDocz rebrand + cleanup) */
const CACHE = 'zendocz-shell-v5';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png'];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    const url = new URL(e.request.url);
    if (url.origin !== location.origin) return; /* never intercept Firebase/CDNs */
    e.respondWith(
        fetch(e.request).then(res => {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
            return res;
        }).catch(() =>
            caches.match(e.request).then(m => m || caches.match('./index.html'))
        )
    );
});

/* Snooze / Open buttons on reminder notifications */
self.addEventListener('notificationclick', (e) => {
    const tag = e.notification.tag || '';
    e.notification.close();
    e.waitUntil((async () => {
        const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (e.action === 'snooze') {
            if (cs.length) cs[0].postMessage({ type: 'zd-snooze', tag });
            return;
        }
        if (cs.length) { cs[0].focus(); cs[0].postMessage({ type: 'zd-open', tag }); }
        else self.clients.openWindow('./');
    })());
});
