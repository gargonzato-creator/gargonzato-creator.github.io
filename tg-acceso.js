/* TG Acceso v1 (19/11/2026) \u2014 compartido por Formulador, Mar\u00eda Elena y Rancho Rufino.
   1) Navegador interno (WhatsApp, Instagram, Facebook, Telegram, Line, WebView): antes de entrar muestra \u00abAbr\u00ed en Safari\u00bb
      con \u00abCopiar enlace\u00bb y \u00abAbrir en Safari\u00bb (x-safari-https://\u2026). Se puede seguir aqu\u00ed con correo y contrase\u00f1a.
   2) Usuario con sesi\u00f3n pero sin acceso a esta app: deja su pedido en solicitudesAcceso/{uid} (email, nombre, app, fecha).
   3) Admin (accesos/{uid}.rol == "admin"): bot\u00f3n \u00abAccesos\u00bb con los pedidos pendientes de ESTA app y \u00abHabilitar\u00bb
      (escribe accesos/{uid} solo con esta app \u2014 nunca admin ni finanzas \u2014 y, en Rancho Rufino, miembros/{uid} con el rol elegido),
      m\u00e1s \u00abClave de respaldo\u00bb para entrar con correo y contrase\u00f1a en el \u00edcono de inicio si Google falla.
   Usa su propia copia del SDK de Auth (misma app y mismo almacenamiento que la app) y la API REST de Firestore. Sin se\u00f1al no hace nada. */
(function () {
  "use strict";
  var me = document.currentScript;
  var APP = (me && me.getAttribute("data-app")) || "";
  var FBAPP = (me && me.getAttribute("data-fbapp")) || "[DEFAULT]";
  var ROLES = (me && me.getAttribute("data-roles")) || ""; // "personal,propietario" en Rancho Rufino
  var PERMITIDAS = { "rancho-rufino": 1, "formulador": 1, "maria-elena": 1 };
  if (!PERMITIDAS[APP] || window.__tgAcceso) return;
  window.__tgAcceso = true;
  var CFG = {
    apiKey: "AIzaSyAOFcpSMEp2hsP9FWcc7f_zhyiH4Sm6G2Y",
    authDomain: "tg-apps-bbde7.firebaseapp.com",
    projectId: "tg-apps-bbde7",
    storageBucket: "tg-apps-bbde7.firebasestorage.app",
    messagingSenderId: "1058376237664",
    appId: "1:1058376237664:web:b3d63e5d6de5c759b57905"
  };
  var SDK = "https://www.gstatic.com/firebasejs/11.10.0/";
  var FS = "https://firestore.googleapis.com/v1/projects/tg-apps-bbde7/databases/(default)/documents/";
  var T = window.__TG_ACCESO_TEST__ || null; // solo pruebas autom\u00e1ticas
  var ua = String(navigator.userAgent || "");

  function esIOS() { return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  function standalone() {
    try { if (navigator.standalone === true) return true; } catch (e) {}
    try { return !!(window.matchMedia && matchMedia("(display-mode: standalone)").matches); } catch (e) { return false; }
  }
  function enAppInterna() {
    if (/[?&]safari=1(?:&|$)/.test(String(location.search || ""))) return true;
    if (/FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|MicroMessenger|WhatsApp|Twitter|Snapchat|LinkedInApp|GSA\/|Telegram|; wv\)|WebView/i.test(ua)) return true;
    return esIOS() && !standalone() && !/Safari\//.test(ua);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function enlace() { return "https://tg-apps-bbde7.firebaseapp.com" + location.pathname; }
  function copiarTexto(txt, btn, etiqueta) {
    function ok() { if (btn) { btn.textContent = "Copiado \u2713"; setTimeout(function () { btn.textContent = etiqueta; }, 2500); } }
    function viejo() {
      try {
        var t = document.createElement("textarea"); t.value = txt; t.setAttribute("readonly", "");
        t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select(); t.setSelectionRange(0, txt.length);
        var r = document.execCommand("copy"); t.remove(); if (r) ok(); else prompt("Copi\u00e1:", txt);
      } catch (e) { prompt("Copi\u00e1:", txt); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, viejo); else viejo();
  }

  var css = ".tga-velo{position:fixed;inset:0;z-index:2147483000;background:rgba(20,24,20,.55);display:flex;align-items:flex-end;justify-content:center;font:16px/1.4 -apple-system,system-ui,sans-serif;color:#222}" +
    ".tga-caja{background:#fffdf8;width:100%;max-width:520px;max-height:92vh;overflow:auto;border-radius:20px 20px 0 0;padding:20px 18px calc(18px + env(safe-area-inset-bottom));box-sizing:border-box}" +
    ".tga-caja h2{margin:0 0 6px;font-size:21px}.tga-caja p{margin:6px 0}.tga-caja ol{margin:8px 0 10px 20px;padding:0}" +
    ".tga-url{font:12px ui-monospace,Menlo,monospace;background:#f1ede4;border-radius:10px;padding:8px;word-break:break-all;margin:8px 0}" +
    ".tga-b{display:block;width:100%;box-sizing:border-box;text-align:center;padding:13px;border-radius:12px;border:0;background:#1e4634;color:#fff;font-size:16px;font-weight:600;margin-top:8px;text-decoration:none;cursor:pointer}" +
    ".tga-b2{background:#fff;color:#1e4634;border:1px solid #1e4634}.tga-b3{background:none;color:#555;text-decoration:underline;font-weight:400}" +
    ".tga-fab{position:fixed;right:14px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:2147482000;background:#1e4634;color:#fff;border:0;border-radius:22px;padding:10px 14px;font:600 14px -apple-system,system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer}" +
    ".tga-fab i{font-style:normal;background:#d9a441;color:#111;border-radius:10px;padding:1px 7px;margin-left:6px}" +
    ".tga-item{border:1px solid #e3dccd;border-radius:14px;padding:12px;margin:10px 0}.tga-item small{color:#666;word-break:break-all}" +
    ".tga-fila{display:flex;gap:8px;margin-top:8px}.tga-fila>*{flex:1}.tga-sel,.tga-in{width:100%;box-sizing:border-box;padding:11px;border:1px solid #bbb;border-radius:10px;font-size:16px;background:#fff;margin-top:6px}" +
    ".tga-msg{font-size:14px;color:#1e4634;margin-top:6px}.tga-err{color:#a12}";
  function ponerCss() { if (document.getElementById("tga-css")) return; var s = document.createElement("style"); s.id = "tga-css"; s.textContent = css; document.head.appendChild(s); }
  function velo(html) {
    ponerCss(); cerrar();
    var v = document.createElement("div"); v.className = "tga-velo"; v.id = "tga-velo";
    v.innerHTML = '<div class="tga-caja" role="dialog" aria-modal="true">' + html + "</div>";
    document.body.appendChild(v); return v;
  }
  function cerrar() { var v = document.getElementById("tga-velo"); if (v) v.remove(); }

  // ---------- 1) Navegador interno ----------
  function avisoSafari() {
    if (sessionStorage.getItem("tga-seguir-aqui") === "1") return;
    var u = enlace();
    var h = "<h2>Abr\u00ed esta app en Safari</h2>" +
      "<p>Est\u00e1s dentro de WhatsApp u otra app. Google no deja entrar desde ac\u00e1.</p>" +
      "<ol><li>Toc\u00e1 \u00abAbrir en Safari\u00bb (o \u00abCopiar enlace\u00bb y pegalo en Safari).</li><li>Entr\u00e1 con Google.</li><li>En Safari: Compartir \u2192 \u00abAgregar a inicio\u00bb. Desde ah\u00ed abr\u00eds siempre.</li></ol>" +
      '<div class="tga-url">' + esc(u) + "</div>";
    if (esIOS()) h += '<a class="tga-b" data-tga="safari" href="x-safari-' + esc(u) + '">Abrir en Safari</a>';
    h += '<button type="button" class="tga-b ' + (esIOS() ? "tga-b2" : "") + '" data-tga="copiar">Copiar enlace</button>' +
      '<button type="button" class="tga-b tga-b3" data-tga="seguir">Seguir aqu\u00ed con correo y contrase\u00f1a</button>';
    var v = velo(h);
    v.querySelector('[data-tga="copiar"]').onclick = function (ev) { copiarTexto(u, ev.currentTarget, "Copiar enlace"); };
    v.querySelector('[data-tga="seguir"]').onclick = function () { try { sessionStorage.setItem("tga-seguir-aqui", "1"); } catch (e) {} cerrar(); };
  }

  // ---------- Firestore REST ----------
  function val(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === "boolean") return { booleanValue: v };
    if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
    if (typeof v === "object") { var f = {}; for (var k in v) f[k] = val(v[k]); return { mapValue: { fields: f } }; }
    return { stringValue: String(v) };
  }
  function des(x) {
    if (!x) return null;
    if ("stringValue" in x) return x.stringValue; if ("booleanValue" in x) return x.booleanValue;
    if ("integerValue" in x) return Number(x.integerValue); if ("doubleValue" in x) return x.doubleValue;
    if ("timestampValue" in x) return x.timestampValue; if ("nullValue" in x) return null;
    if ("arrayValue" in x) return (x.arrayValue.values || []).map(des);
    if ("mapValue" in x) return campos(x.mapValue.fields || {});
    return null;
  }
  function campos(f) { var o = {}; for (var k in f) o[k] = des(f[k]); return o; }
  function campoVals(o) { var f = {}; for (var k in o) f[k] = val(o[k]); return f; }
  var token = null;
  function api(metodo, ruta, cuerpo) {
    var url = /^https?:/.test(ruta) ? ruta : FS + ruta;
    return fetch(url, { method: metodo, headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
      .then(function (r) { return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {} return { status: r.status, ok: r.ok, json: j }; }); });
  }
  function leer(ruta) { return api("GET", ruta).then(function (r) { if (r.ok) return { existe: true, datos: campos((r.json && r.json.fields) || {}) }; if (r.status === 404) return { existe: false }; if (r.status === 403) return { negado: true }; throw new Error("HTTP " + r.status); }); }
  function commit(writes) {
    return api("POST", FS.replace(/documents\/$/, "documents:commit"), { writes: writes }).then(function (r) {
      if (!r.ok) throw new Error((r.json && r.json.error && r.json.error.message) || ("HTTP " + r.status)); return r.json;
    });
  }
  var DOCS = "projects/tg-apps-bbde7/databases/(default)/documents/";

  // ---------- 2) Pedido de acceso ----------
  function tieneAcceso(uid) {
    return leer("accesos/" + uid).then(function (a) {
      var d = a.datos || {};
      if (a.existe && (d.rol === "admin" || (Array.isArray(d.apps) && d.apps.indexOf(APP) >= 0))) return { ok: true, admin: d.rol === "admin" };
      if (APP !== "rancho-rufino") return { ok: false };
      return leer("establecimientos/rancho-rufino/miembros/" + uid).then(function (m) { return { ok: !!(m.existe && m.datos && m.datos.active !== false) }; });
    });
  }
  function pedirAcceso(u) {
    var k = "tga-pedido-" + APP + "-" + u.uid;
    try { if (Date.now() - Number(localStorage.getItem(k) || 0) < 6 * 3600 * 1000) return Promise.resolve(); } catch (e) {}
    var datos = { uid: u.uid, email: u.email || "", nombre: u.displayName || "", app: APP, fecha: new Date(), ua: ua.slice(0, 180) };
    return commit([{ update: { name: DOCS + "solicitudesAcceso/" + u.uid, fields: campoVals(datos) } }]).then(function () {
      try { localStorage.setItem(k, String(Date.now())); } catch (e) {}
    });
  }

  // ---------- 3) Panel del admin ----------
  var pendientes = [];
  function cargarPendientes() {
    return api("GET", "solicitudesAcceso?pageSize=200").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      pendientes = ((r.json && r.json.documents) || []).map(function (d) { var o = campos(d.fields || {}); o.uid = o.uid || d.name.split("/").pop(); return o; })
        .filter(function (o) { return o.app === APP; })
        .sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
      pintarFab();
    });
  }
  function pintarFab() {
    ponerCss();
    var b = document.getElementById("tga-fab");
    if (!b) { b = document.createElement("button"); b.id = "tga-fab"; b.className = "tga-fab"; b.type = "button"; b.onclick = abrirPanel; document.body.appendChild(b); }
    b.innerHTML = "Accesos" + (pendientes.length ? "<i>" + pendientes.length + "</i>" : "");
    b.style.display = pendientes.length || sessionStorage.getItem("tga-fab") === "1" ? "" : "none";
  }
  function fechaCorta(f) { try { var d = new Date(f); return d.toLocaleString("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
  function abrirPanel() {
    try { sessionStorage.setItem("tga-fab", "1"); } catch (e) {}
    var roles = ROLES ? ROLES.split(",") : [];
    var h = "<h2>Pedidos de acceso</h2><p>Personas que entraron y todav\u00eda no tienen permiso en esta app.</p>";
    if (!pendientes.length) h += "<p><b>No hay pedidos pendientes.</b></p>";
    pendientes.forEach(function (p, i) {
      h += '<div class="tga-item" data-i="' + i + '"><b>' + esc(p.nombre || "(sin nombre)") + "</b><br><small>" + esc(p.email || "sin correo") + " \u00b7 " + esc(fechaCorta(p.fecha)) + "<br>UID " + esc(p.uid) + "</small>";
      if (roles.length) h += '<select class="tga-sel">' + roles.map(function (r) { return '<option value="' + esc(r) + '">' + esc(r === "personal" ? "Personal (carga datos del d\u00eda)" : r === "propietario" ? "Propietario (ve y edita todo)" : r) + "</option>"; }).join("") + "</select>";
      h += '<div class="tga-fila"><button type="button" class="tga-b" data-tga="habilitar">Habilitar</button><button type="button" class="tga-b tga-b2" data-tga="descartar">Descartar</button></div><div class="tga-msg"></div></div>';
    });
    h += '<div class="tga-item"><b>Clave de respaldo</b><p style="font-size:14px">Para entrar con correo y contrase\u00f1a en el \u00edcono de inicio si Google vuelve a fallar. La eleg\u00eds vos (m\u00ednimo 8 letras o n\u00fameros).</p>' +
      '<input class="tga-in" type="password" autocomplete="new-password" placeholder="Clave nueva" data-tga="c1"><input class="tga-in" type="password" autocomplete="new-password" placeholder="Repet\u00ed la clave" data-tga="c2">' +
      '<button type="button" class="tga-b tga-b2" data-tga="clave">Guardar clave</button><div class="tga-msg" data-tga="msgclave"></div></div>';
    h += '<button type="button" class="tga-b tga-b3" data-tga="cerrar">Cerrar</button>';
    var v = velo(h);
    v.querySelector('[data-tga="cerrar"]').onclick = cerrar;
    v.querySelector('[data-tga="clave"]').onclick = guardarClave;
    Array.prototype.forEach.call(v.querySelectorAll(".tga-item[data-i]"), function (el) {
      var p = pendientes[Number(el.getAttribute("data-i"))];
      var msg = el.querySelector(".tga-msg");
      el.querySelector('[data-tga="habilitar"]').onclick = function (ev) {
        var sel = el.querySelector("select"); var rol = sel ? sel.value : "";
        ev.currentTarget.disabled = true; msg.className = "tga-msg"; msg.textContent = "Habilitando\u2026";
        habilitar(p, rol).then(function () { msg.textContent = "Listo: habilitado" + (rol ? " como " + rol : "") + ". Que cierre y vuelva a abrir la app."; quitar(p.uid); },
          function (e) { ev.currentTarget.disabled = false; msg.className = "tga-msg tga-err"; msg.textContent = "No se pudo: " + e.message; });
      };
      el.querySelector('[data-tga="descartar"]').onclick = function (ev) {
        ev.currentTarget.disabled = true;
        commit([{ "delete": DOCS + "solicitudesAcceso/" + p.uid }]).then(function () { msg.textContent = "Descartado."; quitar(p.uid); },
          function (e) { ev.currentTarget.disabled = false; msg.className = "tga-msg tga-err"; msg.textContent = "No se pudo: " + e.message; });
      };
    });
  }
  function quitar(uid) { pendientes = pendientes.filter(function (p) { return p.uid !== uid; }); pintarFab(); }
  function habilitar(p, rol) {
    if (!PERMITIDAS[APP] || /finanzas|admin/i.test(APP)) return Promise.reject(new Error("app no permitida"));
    if (APP === "rancho-rufino" && rol !== "personal" && rol !== "propietario") return Promise.reject(new Error("rol no permitido"));
    var uid = String(p.uid || "");
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return Promise.reject(new Error("UID inv\u00e1lido"));
    var ahora = new Date();
    return leer("accesos/" + uid).then(function (a) {
      var w = [];
      if (a.existe) {
        // Solo agrega esta app a la lista. No toca el rol ni las otras apps.
        w.push({ transform: { document: DOCS + "accesos/" + uid, fieldTransforms: [{ fieldPath: "apps", appendMissingElements: { values: [val(APP)] } }] }, currentDocument: { exists: true } });
      } else {
        w.push({ update: { name: DOCS + "accesos/" + uid, fields: campoVals({ rol: "usuario", apps: [APP], email: p.email || "", nombre: p.nombre || "", habilitadoEl: ahora }) }, currentDocument: { exists: false } });
      }
      if (APP === "rancho-rufino") {
        var mref = DOCS + "establecimientos/rancho-rufino/miembros/" + uid;
        return leer("establecimientos/rancho-rufino/miembros/" + uid).then(function (m) {
          var iso = ahora.toISOString();
          if (m.existe) w.push({ update: { name: mref, fields: campoVals({ role: rol, active: true, updatedAt: iso }) }, updateMask: { fieldPaths: ["role", "active", "updatedAt"] }, currentDocument: { exists: true } });
          else w.push({ update: { name: mref, fields: campoVals({ id: uid, email: String(p.email || "").toLowerCase(), name: p.nombre || p.email || "Sin nombre", role: rol, active: true, createdAt: iso, updatedAt: iso }) }, currentDocument: { exists: false } });
          return w;
        });
      }
      return w;
    }).then(function (w) {
      w.push({ "delete": DOCS + "solicitudesAcceso/" + uid });
      return commit(w);
    });
  }
  var usuario = null, authMod = null, authInst = null;
  function guardarClave() {
    var v = document.getElementById("tga-velo"); var msg = v.querySelector('[data-tga="msgclave"]');
    var c1 = v.querySelector('[data-tga="c1"]').value, c2 = v.querySelector('[data-tga="c2"]').value;
    msg.className = "tga-msg tga-err";
    if (c1.length < 8) { msg.textContent = "Tiene que tener al menos 8 caracteres."; return; }
    if (c1 !== c2) { msg.textContent = "Las dos claves no son iguales."; return; }
    if (!authMod || !usuario || !usuario.email) { msg.textContent = "Tu cuenta no tiene correo."; return; }
    msg.className = "tga-msg"; msg.textContent = "Guardando\u2026";
    var tiene = (usuario.providerData || []).some(function (p) { return p.providerId === "password"; });
    var pr = tiene ? authMod.updatePassword(usuario, c1) : authMod.linkWithCredential(usuario, authMod.EmailAuthProvider.credential(usuario.email, c1));
    pr.then(function () { msg.textContent = "Listo. En el \u00edcono pod\u00e9s entrar con " + usuario.email + " y esta clave."; v.querySelector('[data-tga="c1"]').value = ""; v.querySelector('[data-tga="c2"]').value = ""; },
      function (e) {
        msg.className = "tga-msg tga-err";
        var c = String(e && e.code || "");
        msg.textContent = c === "auth/requires-recent-login" ? "Por seguridad, sal\u00ed y volv\u00e9 a entrar con Google, y despu\u00e9s guard\u00e1 la clave." :
          c === "auth/weak-password" ? "Clave muy d\u00e9bil, eleg\u00ed otra." : "No se pudo guardar (" + (c || e.message) + ").";
      });
  }

  // ---------- Arranque ----------
  function alUsuario(u) {
    usuario = u;
    if (!u || u.isAnonymous) {
      if (!u && enAppInterna()) avisoSafari();
      var f = document.getElementById("tga-fab"); if (f) f.style.display = "none";
      return;
    }
    if (document.getElementById("tga-velo") && !document.querySelector(".tga-item")) cerrar();
    if (navigator.onLine === false) return;
    (T ? Promise.resolve(T.token) : u.getIdToken()).then(function (t) {
      token = t;
      return tieneAcceso(u.uid).then(function (r) {
        if (r.admin) return cargarPendientes();
        if (!r.ok) return pedirAcceso(u);
      });
    }).catch(function (e) { try { console.warn("[tg-acceso]", e && e.message); } catch (x) {} });
  }
  function iniciar() {
    if (T) { alUsuario(T.user); return; }
    if (navigator.onLine === false) return;
    Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js")]).then(function (m) {
      var appMod = m[0]; authMod = m[1];
      var app = appMod.initializeApp(CFG, FBAPP);
      try { authInst = authMod.initializeAuth(app, { persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence] }); }
      catch (e) { authInst = authMod.getAuth(app); }
      authMod.onAuthStateChanged(authInst, alUsuario);
    }).catch(function (e) { try { console.warn("[tg-acceso] sin SDK", e && e.message); } catch (x) {} });
  }
  window.TGAcceso = { abrirPanel: abrirPanel, avisoSafari: avisoSafari, enAppInterna: enAppInterna, _habilitar: habilitar };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(iniciar, 600); });
  else setTimeout(iniciar, 600);
})();
