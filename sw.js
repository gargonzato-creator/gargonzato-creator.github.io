/* Formulador TG (raíz). Solo atiende la raíz (/, /index.html y sus íconos); las otras apps
   (/maria-elena/, /rancho-rufino/, /finanzas/, /inventario/) quedan afuera y sus cachés no se tocan. */
const CACHE = "formulador-tg-v11";
const ASSETS = ["./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-512.png"];
const SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
const SDK_FILES = ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"];
const LIBS = [
  "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"
];
const PROPIAS = ["/manifest.webmanifest", "/icon-180.png", "/icon-512.png"];
const ESPERA_RED_MS = 4000;

self.addEventListener("install", function (event) {
  // La instalación nunca depende de la red de terceros: si un archivo falla, igual se instala.
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(ASSETS.map(function (u) {
        return fetch(u, { cache: "no-store" }).then(function (r) { if (r && r.ok && !r.redirected) return cache.put(u, r); }).catch(function () {});
      }).concat(SDK_FILES.map(function (f) { return SDK + f; }).concat(LIBS).map(function (u) {
        return fetch(u, { mode: "cors" }).then(function (r) { if (r && r.ok) return cache.put(u, r); }).catch(function () {});
      })));
    }).catch(function () {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf("formulador-tg-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).catch(function () {}).then(function () { return self.clients.claim(); })
  );
});

function paginaSinSenal() {
  return new Response(
    '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Formulador TG</title></head><body style="font-family:-apple-system,system-ui,sans-serif;background:#f4f1ea;padding:32px;text-align:center">' +
    '<h2>Formulador TG</h2><p>No hay señal y todavía no quedó guardada una copia en este aparato.</p>' +
    '<button style="padding:12px 20px;font-size:16px" onclick="location.reload()">Reintentar</button></body></html>',
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function copiaLimpia(resp) {
  // Safari no acepta respuestas "redirigidas" para una navegación: se guarda una copia limpia.
  return resp.blob().then(function (b) {
    return new Response(b, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  });
}

function indexDesdeRed(req) {
  return fetch(req, { cache: "no-cache" }).then(function (resp) {
    if (!resp || !resp.ok) throw new Error("http " + (resp && resp.status));
    return copiaLimpia(resp.clone()).then(function (copia) {
      caches.open(CACHE).then(function (c) { return c.put("./index.html", copia); }).catch(function () {});
      return resp.redirected ? copiaLimpia(resp) : resp;
    });
  });
}

function atenderIndex(event) {
  var red = indexDesdeRed(new Request(self.registration.scope + "index.html", { credentials: "same-origin" }));
  var guardada = caches.open(CACHE).then(function (c) { return c.match("./index.html"); }).catch(function () { return undefined; });
  red.catch(function () {});
  return new Promise(function (resolve) {
    var listo = false;
    function dar(r) { if (!listo && r) { listo = true; resolve(r); } }
    // 1) La red, si contesta rápido.
    red.then(dar, function () {
      guardada.then(function (g) { dar(g || paginaSinSenal()); });
    });
    // 2) Si la red tarda más de 4 s, la copia guardada (la red sigue y actualiza la copia).
    setTimeout(function () {
      guardada.then(function (g) {
        if (g) dar(g);
      });
    }, ESPERA_RED_MS);
    // 3) Nunca colgado: a los 20 s, lo que haya.
    setTimeout(function () {
      guardada.then(function (g) { dar(g || paginaSinSenal()); });
    }, 20000);
  });
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  if (url.href.indexOf(SDK) === 0 || LIBS.indexOf(url.href) >= 0) {
    event.respondWith(
      caches.match(req.url).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (resp) {
          if (resp && resp.ok) { var copy = resp.clone(); caches.open(CACHE).then(function (c) { c.put(req.url, copy); }).catch(function () {}); }
          return resp;
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/" || url.pathname === "/index.html") {
    event.respondWith(atenderIndex(event));
    return;
  }

  if (PROPIAS.indexOf(url.pathname) < 0) return;
  event.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req);
    })
  );
});
