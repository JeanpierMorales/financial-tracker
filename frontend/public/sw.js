const CACHE_NAME = 'norte-shell-v1'
const APP_SHELL = ['/', '/manifest.webmanifest', '/app-icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  const cacheableDestination = ['document', 'script', 'style', 'image', 'font', 'manifest'].includes(request.destination)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || !cacheableDestination) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || (request.mode === 'navigate' ? caches.match('/') : undefined)))
  )
})
