const CACHE = 'unscripted-v27';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './text-style.js', './recording-player.js', './manifest.webmanifest', './icon.svg', './icon-192.svg', './icon-512.svg', './icon-192.png', './icon-512.png', './install.js', './backup-crypto.js', './cloud-backup.js', './profile-quiz.js', './interview-topics.js', './perspective.js', './clarify-question.js', './dialogs.js', './passkey-client.js', './app-lock-init.js', './app-lock.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('unscripted-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const requested = new URL(event.request.url);
  const allowed = ASSETS.map(path => new URL(path, self.registration.scope).pathname);
  if (event.request.method !== 'GET' || requested.origin !== self.location.origin || !allowed.includes(requested.pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && !response.headers.get('Content-Security-Policy')?.includes("default-src 'none'")) { const copy = response.clone(); caches.open(CACHE).then(c => c.put(event.request, copy)); }
    return response;
  }).catch(() => caches.match(event.request)));
});
