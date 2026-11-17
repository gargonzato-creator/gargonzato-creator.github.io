/* Formulador TG (raíz). Solo atiende la raíz; las otras apps (/maria-elena/, /rancho-rufino/, /finanzas/, /inventario/) quedan afuera. */
const CACHE = "formulador-tg-v8";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-512.png"];
const SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
const SDK_FILES = ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"];
const PROPIAS = ["/", "/index.html", "/manifest.webmanifest", "/icon-180.png", "/icon-512.png"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS).then(function () {
        return Promise.all(SDK_FILES.map(function (f) {
          return fetch(SDK + f, { mode: "cors" }).then(function (r) { if (r && r.ok) return cache.put(SDK + f, r); }).catch(function () {});
        }));
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf("formulador-tg-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  if (url.href.indexOf(SDK) === 0) {
    event.respondWith(
      caches.match(req.url).then(function (cached) {
        var red = fetch(req).then(function (resp) {
          if (resp && resp.ok) { var copy = resp.clone(); caches.open(CACHE).then(function (c) { c.put(req.url, copy); }); }
          return resp;
        });
        return cached || red;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (PROPIAS.indexOf(url.pathname) < 0) return;

  if (url.pathname === "/" || url.pathname === "/index.html") {
    event.respondWith(
      fetch(req).then(function (resp) {
        if (resp && resp.ok) { var copy = resp.clone(); caches.open(CACHE).then(function (c) { c.put("./index.html", copy); }); }
        return resp;
      }).catch(function () {
        return caches.match("./index.html").then(function (r) { return r || caches.match("./"); });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req);
    })
  );
});
