/* Nay Estudos — service worker: offline + lembrete diário */
const CACHE = 'nay-estudos-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './vendor/jszip.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { mode: u.startsWith('http') ? 'cors' : 'same-origin' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  const cacheable = same || url.hostname === 'cdnjs.cloudflare.com' || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (!cacheable) return; // áudios/imagens das questões vêm direto da internet
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', cp)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});

function readMeta() {
  return new Promise(res => {
    const r = indexedDB.open('nayEstudos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => { try { const g = r.result.transaction('kv').objectStore('kv').get('meta'); g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); } catch (e) { res(null); } };
    r.onerror = () => res(null);
  });
}
const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

self.addEventListener('periodicsync', e => {
  if (e.tag !== 'lembrete') return;
  e.waitUntil((async () => {
    const m = await readMeta();
    if (!m || !m.reminder || !m.reminder.on) return;
    const now = new Date();
    if (m.last === dkey(now)) return;
    const [h, mi] = (m.reminder.time || '19:00').split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() < h * 60 + mi) return;
    await self.registration.showNotification('Hora de estudar! 📚', {
      body: m.streak ? `Sua ofensiva de ${m.streak} dias está em risco 🔥` : 'Que tal uma lição rapidinha hoje?',
      icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'lembrete', data: { url: './?go=continue' }
    });
    if (self.navigator.setAppBadge) self.navigator.setAppBadge(1).catch(() => {});
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => { for (const c of cs) if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } return self.clients.openWindow(url); }));
});
