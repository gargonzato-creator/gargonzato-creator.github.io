const CACHE = "rufino-shell-v10";
const BASE = new URL(self.registration.scope).pathname;

function url(path) {
  if (path === "/") return BASE;
  return BASE + path.replace(/^\//, "");
}

const SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/brand/logo-rancho-rufino.png", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/favicon.ico"].map(url);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("rufino-shell-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const home = (await caches.match(url("/"))) || (await caches.match(url("/index.html")));
      if (home) return home;
      const offline = await caches.match(url("/offline.html"));
      if (offline) return offline;
    }
    return new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  const path = requestUrl.pathname;
  if (path.startsWith("/__/") || path.includes("/__/")) return;
  if (path !== "/rancho-rufino" && !path.startsWith("/rancho-rufino/")) return;
  if (event.request.method !== "GET") return;
  event.respondWith(networkFirst(event.request));
});
