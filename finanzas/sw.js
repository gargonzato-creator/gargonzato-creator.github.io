const CACHE = "finanzas-tg-v3"
const BASE = "/finanzas"
const PRECACHE_PAGINAS = [
  `${BASE}/`,
  `${BASE}/inicio/`,
  `${BASE}/papa/`,
  `${BASE}/icon-192.png`,
  `${BASE}/icon-512.png`,
]
const PRECACHE_STATIC = [
  "/finanzas/_next/static/PwWDAacTSWTzYUno9LtU0/_buildManifest.js",
  "/finanzas/_next/static/PwWDAacTSWTzYUno9LtU0/_clientMiddlewareManifest.js",
  "/finanzas/_next/static/PwWDAacTSWTzYUno9LtU0/_ssgManifest.js",
  "/finanzas/_next/static/chunks/08xwnusjt1g5_.js",
  "/finanzas/_next/static/chunks/0cz1d0mv5g_q7.js",
  "/finanzas/_next/static/chunks/0jr9exn6vz-cw.js",
  "/finanzas/_next/static/chunks/0wtvtzmuntuk8.js",
  "/finanzas/_next/static/chunks/0x7cqlv2m9t1_.css",
  "/finanzas/_next/static/chunks/100zab0ytxqe3.js",
  "/finanzas/_next/static/chunks/117pykrm5x62m.js",
  "/finanzas/_next/static/chunks/1bca8bhk73_cq.js",
  "/finanzas/_next/static/chunks/1d-3ziz_810o8.js",
  "/finanzas/_next/static/chunks/1ej1ki5deyh2d.js",
  "/finanzas/_next/static/chunks/1i5goj13-zxc9.js",
  "/finanzas/_next/static/chunks/1ux9pqizik_9n.js",
  "/finanzas/_next/static/chunks/1xnmp6d2j1vih.js",
  "/finanzas/_next/static/chunks/1yx_z5xe1xo33.js",
  "/finanzas/_next/static/chunks/310vm2bl3xxpt.js",
  "/finanzas/_next/static/chunks/36s2bz0fwtm0g.js",
  "/finanzas/_next/static/chunks/37pwvi0t-1_w7.js",
  "/finanzas/_next/static/chunks/39_j1bdzreq0m.js",
  "/finanzas/_next/static/chunks/3i9e__lxj94lh.js",
  "/finanzas/_next/static/chunks/3qfy96eoyh-ek.js",
  "/finanzas/_next/static/chunks/turbopack-1zmmldz-6sgg4.js",
  "/finanzas/_next/static/media/191d227036512e10-s.p.0hs6q6udzld4a.woff2",
  "/finanzas/_next/static/media/1ab3e5abcf77747f-s.1d9rlgtqyj_-l.woff2",
  "/finanzas/_next/static/media/38b3f57056672e96-s.3j-lqo2q-puhp.woff2",
  "/finanzas/_next/static/media/8cccf984c8510bbf-s.p.2li_3lqay9qjq.woff2",
  "/finanzas/_next/static/media/ae9e2a5bb156676d-s.061jvc6_x84nn.woff2",
  "/finanzas/_next/static/media/b8ccc630e9b93600-s.2qo5md4hn_gum.woff2",
  "/finanzas/_next/static/media/edb99fec956915f8-s.p.32sris142tqlb.woff2"
]
const PRECACHE = PRECACHE_PAGINAS.concat(PRECACHE_STATIC)

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("finanzas-tg-") && key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (!url.pathname.startsWith(BASE)) return
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
        return response
      })
      .catch(() =>
        caches.match(request).then((hit) => {
          if (hit) return hit
          if (request.mode === "navigate") return caches.match(`${BASE}/`)
          return undefined
        }),
      ),
  )
})
