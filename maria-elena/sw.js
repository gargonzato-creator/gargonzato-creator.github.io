/* Registros María Elena. Solo atiende /maria-elena/ y los módulos del SDK de Firebase (para abrir sin señal).
   Nunca toca firebaseapp.com, googleapis.com, apis.google.com ni accounts.google.com (login y datos van directo a la red). */
const PREFIJO = "me-registros-";
const CACHE = PREFIJO + "v14";
const ASSETS = ["./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./logo-header.png"];
const SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
const SDK_FILES = ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"].map(function (f) { return SDK + f; });

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS).then(function () {
        return Promise.all(SDK_FILES.map(function (u) {
          return fetch(u, { mode: "cors" }).then(function (r) { if (r && r.ok) return cache.put(u, r); }).catch(function () {});
        }));
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      // Solo borra cachés viejas de esta app; las demás apps del sitio comparten el mismo origen.
      return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIJO) === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isHtmlNavigation(request) {
  if (request.mode === "navigate") return true;
  try {
    var path = new URL(request.url).pathname;
    return path === "/maria-elena/" || path === "/maria-elena" || path === "/maria-elena/index.html";
  } catch (e) {
    return false;
  }
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  if (SDK_FILES.indexOf(url.href) >= 0) {
    event.respondWith(
      caches.match(url.href).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (resp) {
          if (resp && resp.ok) { var copy = resp.clone(); caches.open(CACHE).then(function (c) { c.put(url.href, copy); }); }
          return resp;
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/maria-elena/") !== 0 && url.pathname !== "/maria-elena") return;

  if (isHtmlNavigation(req)) {
    event.respondWith(
      fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (cache) { cache.put("./index.html", copy); });
        }
        return resp;
      }).catch(function () {
        return caches.match("./index.html");
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
