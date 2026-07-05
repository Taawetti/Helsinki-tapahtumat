const CACHE = 'hki-v3'
const API_CACHE = 'hki-api-v1'
const QUICK_CACHE = 'hki-quick-v1'
const STATIC = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png']
const API_TTL = 5 * 60 * 1000     // full fetch: 5 min fresh
const API_MAX_AGE = 60 * 60 * 1000 // full fetch: 1 h max stale
const QUICK_TTL = 60 * 1000        // quick fetch: 1 min fresh (LinkedEvents only)

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== API_CACHE && k !== QUICK_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  if (url.pathname === '/api/events' && e.request.method === 'GET') {
    if (url.searchParams.get('quick') === '1') {
      // quick=1: cache-first with 1 min TTL — makes phase 1 instant on repeat visits
      e.respondWith(handleQuickApi(e.request))
    } else {
      // full fetch: stale-while-revalidate with 5 min TTL
      e.respondWith(handleEventsApi(e.request))
    }
    return
  }

  // All other API routes and Next.js internals: skip (no caching)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) return
  if (e.request.method !== 'GET') return

  // Static assets: cache-first, network fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if (res.ok && res.type !== 'opaque') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()))
        }
        return res
      }).catch(() => cached)
      return cached || fresh
    })
  )
})

async function handleQuickApi(request) {
  const cache = await caches.open(QUICK_CACHE)
  const cached = await cache.match(request)
  if (cached) {
    const age = Date.now() - Number(cached.headers.get('sw-cached-at') || 0)
    if (age < QUICK_TTL) return cached // fresh — serve instantly
  }
  // Fetch fresh and cache
  try {
    return await fetchAndCache(cache, request)
  } catch {
    if (cached) return cached
    throw new Error('Ei verkkoyhteyttä')
  }
}

async function handleEventsApi(request) {
  const cache = await caches.open(API_CACHE)
  const cached = await cache.match(request)

  if (cached) {
    const age = Date.now() - Number(cached.headers.get('sw-cached-at') || 0)

    if (age < API_TTL) {
      // Fresh: serve immediately, skip revalidation
      return cached
    }

    if (age < API_MAX_AGE) {
      // Stale but usable: serve immediately, revalidate in background
      fetchAndCache(cache, request)
      return cached
    }
    // Too old: fall through to network fetch
  }

  // Cache miss or expired: fetch from network
  try {
    return await fetchAndCache(cache, request)
  } catch {
    // Network error — return expired cache as last resort
    if (cached) return cached
    throw new Error('Ei verkkoyhteyttä eikä välimuistia')
  }
}

async function fetchAndCache(cache, request) {
  const res = await fetch(request)
  if (res.ok) {
    const headers = new Headers(res.headers)
    headers.set('sw-cached-at', String(Date.now()))
    res.clone().arrayBuffer().then(body =>
      cache.put(request, new Response(body, { status: res.status, statusText: res.statusText, headers }))
    )
  }
  return res
}

// ── Push notifications ───────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return
  const { title, body } = e.data.json()
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'hki-events',
      renotify: true,
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(clients.openWindow('/'))
})
