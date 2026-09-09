/* ZenDocz service worker — v6 (production hardening)

   What changed from v5, and why:
   - The precache list used to include an icon that did not exist. `addAll()`
     is all-or-nothing, so that single 404 made the whole install-time cache
     fail — silently, because the error was swallowed. The app therefore had
     no offline shell at all. Files are now cached individually, so one
     missing file can never take the rest down with it.
   - The offline fallback used to return index.html for ANY failed same-origin
     GET, so a failed image resolved to a page of HTML instead of failing
     cleanly. The shell fallback is now limited to real navigations.
   - The cache grew without limit. Runtime entries are now capped and trimmed.
   - Taking over an open tab silently could leave stale JS talking to a new
     cache. The page is now told when a new version has activated so it can
     offer a reload.
*/
const VERSION = 'v6';
const SHELL_CACHE = 'zendocz-shell-' + VERSION;
const RUNTIME_CACHE = 'zendocz-runtime-' + VERSION;
const RUNTIME_MAX = 80;

/* Everything the app needs to start with no network at all. */
const SHELL = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './icon-maskable-512.png',
    './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        /* Cached one at a time on purpose: a single missing optional file
           must never stop index.html from being cached. */
        await Promise.all(SHELL.map(async (url) => {
            try {
                const res = await fetch(new Request(url, { cache: 'reload' }));
                if (res && res.ok) await cache.put(url, res);
                else console.warn('[zd-sw] skipped (not ok):', url, res && res.status);
            } catch (err) {
                console.warn('[zd-sw] skipped (failed):', url, err);
            }
        }));
    })());
});

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter(k => k.startsWith('zendocz-') && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map(k => caches.delete(k)));
        if (self.registration.navigationPreload) {
            try { await self.registration.navigationPreload.enable(); } catch (err) {}
        }
        await self.clients.claim();
        /* Tell every open tab a new version is live so it can offer a reload
           instead of running stale code against a new cache. */
        const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        cs.forEach(c => c.postMessage({ type: 'zd-sw-updated', version: VERSION }));
    })());
});

async function trimCache(name, max) {
    try {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        if (keys.length <= max) return;
        for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
    } catch (e) {}
}

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;

    let url;
    try { url = new URL(req.url); } catch (err) { return; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    /* The app's own runtime (Tailwind, Quill, the Firebase SDK, fonts) is
       served from other origins. v5 skipped every cross-origin request, so
       with no network the page loaded unstyled and without an editor — the
       "works fully offline" promise only held if the browser's HTTP cache
       happened to still have them. These are now cached explicitly,
       stale-while-revalidate, so a cold offline start works.
       Firebase's live data channels are deliberately excluded: they must
       always hit the network and must never be served from a cache. */
    if (url.origin !== location.origin) {
        const host = url.hostname;
        const isRuntime =
            host === 'cdn.tailwindcss.com' || host === 'cdn.quilljs.com' ||
            host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com' ||
            (host === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0);
        if (!isRuntime) return;                      /* Firestore/Auth traffic: untouched */
        e.respondWith((async () => {
            const cache = await caches.open(RUNTIME_CACHE);
            const hit = await cache.match(req);
            const net = fetch(req).then(res => {
                /* opaque responses are fine to store and replay for scripts/CSS */
                if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
                return res;
            }).catch(() => null);
            return hit || (await net) || new Response('', { status: 504, statusText: 'Offline' });
        })());
        return;
    }

    const isNavigation = req.mode === 'navigate' || req.destination === 'document';

    e.respondWith((async () => {
        try {
            const preload = e.preloadResponse ? await e.preloadResponse : null;
            const res = preload || await fetch(req);
            /* Only cache real, complete, same-origin successes. */
            if (res && res.ok && res.status === 200 && res.type === 'basic') {
                const target = SHELL.some(p => url.pathname.endsWith(p.replace('./', '')))
                    ? SHELL_CACHE : RUNTIME_CACHE;
                const copy = res.clone();
                caches.open(target)
                    .then(c => c.put(req, copy))
                    .then(() => { if (target === RUNTIME_CACHE) trimCache(RUNTIME_CACHE, RUNTIME_MAX); })
                    .catch(() => {});
            }
            return res;
        } catch (err) {
            const hit = await caches.match(req);
            if (hit) return hit;
            /* The app shell stands in for a page we could not load. It must NOT
               stand in for a missing image, font or JSON file. */
            if (isNavigation) {
                const shell = await caches.match('./index.html');
                if (shell) return shell;
            }
            return new Response('', { status: 504, statusText: 'Offline and not cached' });
        }
    })());
});

self.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'zd-skip-waiting') self.skipWaiting();
    if (d.type === 'zd-clear-cache') {
        e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('zendocz-')).map(k => caches.delete(k)))));
    }
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
        if (cs.length) {
            try { await cs[0].focus(); } catch (err) {}
            cs[0].postMessage({ type: 'zd-open', tag });
        } else if (self.clients.openWindow) {
            await self.clients.openWindow('./');
        }
    })());
});