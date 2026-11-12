/* 118hillside.com service worker (r43). Small and conservative; the tour page registers it (tour/index.html, "r43 service worker").
   What it does:
   - Pages (HTML) always go to the network first. The tour page is 2.7 MB (0.9 MB compressed) and every game opens it again under a new address
     (tour/?deck=1 ...), which the browser's own cache treats as a different page: here, a page already held under any query is revalidated with
     its ETag, and a 304 answer serves the held copy, so starting a game on a phone does not download the tour again. Offline, the held copy.
   - Versioned static files (same site, ?v= in the address: scripts, styles, data) are served from this cache and refreshed behind the scenes
     (stale-while-revalidate). A new ?v= is a new address, so an edit is picked up as soon as the page that asks for it is.
   - Nothing else is touched: other sites (the three.js CDN, fonts, analytics), unversioned files (the model, textures) and non-GET requests
     go straight to the network and the browser's own cache.
   - Old caches are deleted when a new version of this file activates.
   Turning it off: set ENABLED = false below and publish; every visitor's copy then clears its caches and unregisters itself on its next check
   (browsers check this file at least once a day, and on every page load the tour does). ?sw=0 on any tour address does the same for one browser.
   It is registered only on 118hillside.com itself (not on raw.githack.com previews or local servers) unless the address has ?sw=1. */
const ENABLED = true;
const VERSION = 'hillside-r43-1';
const PAGES = VERSION + '-pages', FILES = VERSION + '-files';

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = ENABLED ? [PAGES, FILES] : [];
    for(const k of await caches.keys()) if(/^hillside-/.test(k) && !keep.includes(k)) await caches.delete(k);
    if(!ENABLED){ await self.registration.unregister(); return; }
    await self.clients.claim(); })());
});

const sameSite = u => u.origin === self.location.origin;
const versioned = u => /[?&]v=[^&]+/.test(u.search) && /\.(js|mjs|css|json|wasm|txt)$/i.test(u.pathname);
const pageKey = u => u.origin + u.pathname;   // one held copy per page, whatever its query

const bare = r => new Response(r.body, {status: r.status, statusText: r.statusText, headers: r.headers});   // no response URL of its own: the page keeps the address it was opened with (its ?game=1)

async function page(e){
  const req = e.request, u = new URL(req.url), cache = await caches.open(PAGES), key = pageKey(u);
  const held = await cache.match(key);
  try{
    let res = null;
    const tag = held && held.headers.get('etag'), mod = held && held.headers.get('last-modified');
    if(tag || mod){
      const r = await fetch(req.url, {headers: tag ? {'If-None-Match': tag} : {'If-Modified-Since': mod}, credentials: 'same-origin', redirect: 'manual', cache: 'no-store'});
      if(r.status === 304) return bare(held);
      if(r.status === 200 && r.type === 'basic') res = r;
    }
    if(!res) res = await fetch(req);
    if(res.status === 200 && res.type === 'basic' && !res.redirected && /text\/html/.test(res.headers.get('content-type') || '')) e.waitUntil(cache.put(key, res.clone()));
    return res;
  }catch(err){ if(held) return bare(held); throw err; }
}

async function file(e){
  const req = e.request, u = new URL(req.url), cache = await caches.open(FILES);
  const held = await cache.match(req);
  const fresh = fetch(req).then(async res => {
    if(res.status === 200 && res.type === 'basic'){
      await cache.put(req, res.clone());
      for(const k of await cache.keys()){ const q = new URL(k.url); if(q.pathname === u.pathname && q.search !== u.search) await cache.delete(k); }   // older versions of the same file
    }
    return res; });
  if(held){ e.waitUntil(fresh.catch(() => {})); return held; }
  return fresh;
}

self.addEventListener('fetch', e => {
  if(!ENABLED) return;
  const req = e.request; if(req.method !== 'GET') return;
  let u; try{ u = new URL(req.url); }catch(x){ return; }
  if(!sameSite(u)) return;
  if(req.mode === 'navigate'){ if(/\/$|\.html$/.test(u.pathname)) e.respondWith(page(e)); return; }
  if(versioned(u)) e.respondWith(file(e));
});
