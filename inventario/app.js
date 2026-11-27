// Inventario TG — conteos a ciegas, usos internos y transferencias. No escribe en Bims.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  collection, doc, setDoc, updateDoc, addDoc, onSnapshot, query, where, orderBy, limit,
  serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAOFcpSMEp2hsP9FWcc7f_zhyiH4Sm6G2Y",
  authDomain: "tg-apps-bbde7.firebaseapp.com",
  projectId: "tg-apps-bbde7",
  storageBucket: "tg-apps-bbde7.firebasestorage.app",
  messagingSenderId: "1058376237664",
  appId: "1:1058376237664:web:b3d63e5d6de5c759b57905"
};

export const APP_VERSION = "v17 (27/11)";
// Cuenta compartida del personal (solo puede usar Inventario). La clave del equipo se escribe una vez por celular.
const CUENTA_PERSONAL = "personal.inventario@tg-apps-bbde7.firebaseapp.com";
const USUARIOS = ["Tomás", "Felix", "Tatiana", "Elías", "Junior", "Belén"];
const DEPOSITOS = [
  { id: "agro", nombre: "Almacén agropecuario", centro: "Almacén Agropecuario" },
  { id: "carnes", nombre: "Almacén De Carnes Itacurubi", centro: "Almacén de Carnes" },
  { id: "itakua", nombre: "Deposito Itakua", centro: "Cabaña Ita Kua" },
];
// Depósito de práctica, solo con ?prueba en la URL (no es un depósito real)
if (new URLSearchParams(location.search).has("prueba")) DEPOSITOS.push({ id: "prueba", nombre: "PRUEBA (práctica, no es real)", centro: "Almacén Agropecuario" });
const UNIDAD_CORTA = { Unidades: "unid.", Kilogramos: "kg", Litros: "L", Gramos: "g" };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const fmt = (n) => (Math.round(Number(n) * 1000) / 1000).toLocaleString("es-PY", { maximumFractionDigits: 3 });
const parseCant = (s) => { const t = String(s ?? "").trim().replace(/\s/g, "").replace(",", "."); if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return NaN; return Number(t); };
const hoyISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fechaHora = (ms) => ms ? new Date(ms).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const sinCeros = (s) => String(s ?? "").replace(/^0+(?=\d)/, "");
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

function toast(msg, ms = 2600) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), ms);
}

// ---------- Estado ----------
const st = {
  usuario: localStorage.getItem("inv_usuario") || null,
  deposito: localStorage.getItem("inv_deposito") || null,
  conteoId: null,
  conteoOk: false,     // el conteo activo está abierto, es de hoy y es de este usuario
  catalogo: [],
  items: new Map(),     // items del conteo activo
  uid: null,
  pendientes: 0,
  unsub: {},
};
const dep = () => DEPOSITOS.find((d) => d.id === st.deposito);

// ---------- Firebase ----------
const app = initializeApp(firebaseConfig, "inventario");
const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  try { db = initializeFirestore(app, { localCache: memoryLocalCache() }); }
  catch { db = getFirestore(app); }
}
window.__inv = { app, db, auth, st };

function rastrear(p) {
  st.pendientes++; pintarSync();
  return p.catch((e) => { console.error(e); toast("No se pudo guardar: " + (e.code || e.message)); throw e; })
    .finally(() => { st.pendientes--; pintarSync(); });
}
// ---------- Cola local de respaldo (v14) ----------
// Además de la cola de Firestore, cada escritura queda en localStorage hasta que el servidor la confirma.
// Si la app se cierra sin señal (o el caché de Firestore no es persistente), al volver se reenvía a la MISMA ruta.
const COLA_KEY = "inv_cola_v1";
const ST_MARK = "__serverTimestamp__";
const leerCola = () => { try { return JSON.parse(localStorage.getItem(COLA_KEY) || "{}"); } catch { return {}; } };
const grabarCola = (c) => { try { localStorage.setItem(COLA_KEY, JSON.stringify(c)); } catch (e) { console.warn("cola", e); } };
const hidratar = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === ST_MARK ? serverTimestamp() : v]));
function aCola(ruta, datos) {
  const c = leerCola(); const marca = Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  c[ruta] = { d: { ...(c[ruta] ? c[ruta].d : {}), ...datos }, m: marca };
  grabarCola(c); return marca;
}
function deCola(ruta, marca) { const c = leerCola(); if (c[ruta] && c[ruta].m === marca) { delete c[ruta]; grabarCola(c); } pintarSync(); }
// escribe en Firestore (merge) y deja respaldo; "respaldo" son datos planos (sin increment) que se reenvían tal cual
function escribir(ruta, vivo, respaldo) {
  const marca = aCola(ruta, respaldo);
  return rastrear(setDoc(doc(db, ruta), vivo, { merge: true }).then(() => deCola(ruta, marca), (e) => { descartarSiRechazo(e, ruta, marca); throw e; }));
}
// si el servidor rechaza la escritura para siempre (permisos/datos inválidos) no se reintenta en bucle
function descartarSiRechazo(e, ruta, marca) { if (e && (e.code === "permission-denied" || e.code === "invalid-argument")) deCola(ruta, marca); }
let reenviando = false;
function reenviarCola() {
  if (!st.uid || !navigator.onLine || reenviando) return;
  const c = leerCola(); const rutas = Object.keys(c); if (!rutas.length) return;
  reenviando = true;
  Promise.allSettled(rutas.map((r) => { const { d, m } = c[r];
    const datos = { ...hidratar(d), reenviadoLocal: Date.now() };
    if (r.includes("/usos_internos/") || r.includes("/transferencias/")) delete datos.estado; // el reenvío nunca pisa el estado (usos o transferencias)
    return rastrear(setDoc(doc(db, r), datos, { merge: true }).then(() => deCola(r, m), (e) => { descartarSiRechazo(e, r, m); throw e; }));
  })).finally(() => { reenviando = false; });
}
addEventListener("online", reenviarCola);
function pintarSync() {
  const el = $("#sync");
  if (!navigator.onLine) { el.className = "sync off"; el.textContent = "Sin conexión, se guarda y sube después"; return; }
  if (!st.uid) { el.className = "sync off"; el.textContent = authListo ? "Falta la clave del equipo" : "Conectando…"; return; }
  const enCola = Object.keys(leerCola()).length;
  if (st.pendientes > 0 || enCola > 0) { el.className = "sync pend"; el.textContent = `Subiendo ${Math.max(st.pendientes, enCola)}…`; return; }
  el.className = "sync ok"; el.textContent = "Sincronizado";
}
addEventListener("online", pintarSync);
addEventListener("offline", pintarSync);

let authListo = false;
onAuthStateChanged(auth, (u) => {
  // Las sesiones anónimas viejas ya no tienen permiso: se cierran y se pide la clave del equipo.
  if (u && u.isAnonymous) { signOut(auth).catch(() => {}); return; }
  authListo = true;
  st.uid = u ? u.uid : null; pintarSync();
  router();
  reenviarCola();
});
async function entrarConClave(ev) {
  ev && ev.preventDefault();
  const inp = $("#claveEquipo"), msg = $("#claveMsg"), btn = $("#btnClave");
  const clave = String(inp.value || "").trim();
  if (!clave) { msg.textContent = "Escribí la clave del equipo."; return; }
  if (!navigator.onLine) { msg.textContent = "Necesitás señal para entrar la primera vez."; return; }
  btn.disabled = true; msg.textContent = "Entrando…";
  try {
    await signInWithEmailAndPassword(auth, CUENTA_PERSONAL, clave);
    inp.value = ""; msg.textContent = "";
  } catch (e) {
    console.warn("auth", e.code);
    msg.textContent = e.code === "auth/too-many-requests" ? "Demasiados intentos. Esperá unos minutos."
      : e.code === "auth/network-request-failed" ? "Sin conexión. Probá de nuevo con señal."
      : "Clave incorrecta. Pedísela a Tomás.";
  } finally { btn.disabled = false; }
}
$("#formClave").addEventListener("submit", entrarConClave);
$("#btnVerClave")?.addEventListener("click", () => {
  const inp = $("#claveEquipo"), btn = $("#btnVerClave");
  const mostrar = inp.type === "password";
  inp.type = mostrar ? "text" : "password";
  btn.textContent = mostrar ? "Ocultar" : "Ver";
  btn.setAttribute("aria-pressed", mostrar ? "true" : "false");
});

// ---------- Catálogo ----------
async function cargarCatalogo() {
  const r = await fetch("catalogo.json", { cache: "no-cache" });
  st.catalogo = (await r.json()).map((p) => ({ ...p, _n: norm(p.p), _c: norm(p.c), _c2: norm(p.c2), _w: norm(p.p).split(/[^a-z0-9]+/).filter(Boolean), _cz: sinCeros(norm(p.c)), _c2z: sinCeros(norm(p.c2)) }));
}
// Alias y tolerancia a errores de tipeo
const ALIAS = { electrolitico: "eletrolitico", vernil: "vetnil", desengrasante: "antigrasa" };
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let minFila = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < minFila) minFila = cur[j];
    }
    if (minFila > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
const tolerancia = (w) => (w.length >= 7 ? 2 : w.length >= 4 ? 1 : 0);
// ¿La palabra buscada coincide (exacta, parcial o con un error de tipeo) con alguna palabra del nombre?
function palabraCoincide(w, p) {
  if (p._n.includes(w)) return 2;
  const alias = ALIAS[w]; if (alias && p._n.includes(alias)) return 2;
  const tol = tolerancia(w); if (!tol) return 0;
  for (const nw of p._w) {
    if (nw.length < 3) continue;
    for (const L of [w.length - 1, w.length, w.length + 1]) {
      if (L < 3 || L > nw.length) continue;
      if (lev(w, nw.slice(0, L), tol) <= tol) return 1;
    }
  }
  return 0;
}
function buscar(q) {
  const nq = norm(q); if (!nq) return [];
  const palabras = nq.split(/\s+/).filter(Boolean);
  const res = [];
  for (const p of st.catalogo) {
    let score = -1;
    if (p._c === nq || p._c2 === nq || p.id === nq || (/^\d{6,}$/.test(nq) && (p._cz === sinCeros(nq) || p._c2z === sinCeros(nq)))) score = 100;
    else if (p._c2 && nq.length >= 6 && p._c2.includes(nq)) score = 80;
    else if (p._c.startsWith(nq)) score = 70;
    else if (palabras.every((w) => p._n.includes(w))) score = p._n.startsWith(palabras[0]) ? 60 : 50;
    else {
      const m = palabras.map((w) => palabraCoincide(w, p));
      if (m.every((x) => x > 0)) score = 30 + m.reduce((a, b) => a + b, 0);
    }
    if (score < 0) continue;
    if (p.d.includes(st.deposito)) score += 5;
    res.push([score, p]);
  }
  res.sort((a, b) => b[0] - a[0] || a[1].p.localeCompare(b[1].p));
  return res.slice(0, 40).map((x) => x[1]);
}
function porCodigoBarras(code) {
  const nc = norm(code), nz = sinCeros(nc);
  return st.catalogo.filter((p) => p._c2 === nc || p._c === nc || p._cz === nz || p._c2z === nz || (p._c2 && p._c2.split(/[\s,;/]+/).includes(nc)));
}

// ---------- Buscador reutilizable ----------
const buscadores = {};
function montarBuscador(cont, onPick) {
  cont.appendChild($("#tplBuscador").content.cloneNode(true));
  const inp = $(".q", cont), out = $(".resultados", cont);
  const pintar = () => {
    const q = inp.value; out.innerHTML = "";
    if (!norm(q)) return;
    const res = buscar(q);
    for (const p of res) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "res" + (p.d.includes(st.deposito) ? "" : " otro");
      b.innerHTML = `<div class="n">${esc(p.p)}</div><div class="m">Ficha ${esc(p.id)} · Cód. ${esc(p.c)}${p.c2 ? " · " + esc(p.c2) : ""} · ${esc(p.u)}${p.d.includes(st.deposito) ? "" : ' <span class="tag">otro depósito</span>'}</div>`;
      b.onclick = () => { inp.value = ""; out.innerHTML = ""; onPick(p); };
      out.appendChild(b);
    }
    const sf = document.createElement("button");
    sf.type = "button"; sf.className = "res";
    sf.innerHTML = `<div class="n">No lo encuentro: cargar “${esc(q.trim())}” sin ficha</div><div class="m">Queda marcado para que lo revise el encargado</div>`;
    sf.onclick = () => { const t = q.trim(); inp.value = ""; out.innerHTML = ""; onPick({ id: null, c: "", p: t, u: "Unidades", sinFicha: true }); };
    if (!res.length) out.insertAdjacentHTML("beforeend", '<p class="muted">No hay productos con ese nombre o código.</p>');
    out.appendChild(sf);
  };
  inp.addEventListener("input", pintar);
  $(".scan", cont).onclick = () => escanear((code) => {
    const m = porCodigoBarras(code);
    if (m.length === 1) { onPick(m[0]); toast("Encontrado: " + m[0].p); }
    else { inp.value = code; pintar(); toast(m.length ? "Hay varios, elegí uno" : "Código " + code + " no está en el catálogo"); }
  });
  return { limpiar: () => { inp.value = ""; out.innerHTML = ""; } };
}

// ---------- Escáner ----------
let scanStop = null;
async function escanear(onCode) {
  const ov = $("#scanner"), video = $("#scanVideo"), msg = $("#scanMsg");
  ov.classList.remove("hidden"); msg.textContent = "Apuntá la cámara al código de barras";
  let terminado = false;
  const fin = (code) => { if (terminado) return; terminado = true; cerrarScanner(); if (code) onCode(code); };
  try {
    if ("BarcodeDetector" in window) {
      const formatos = await BarcodeDetector.getSupportedFormats();
      if (formatos.length) {
        const det = new BarcodeDetector({ formats: formatos });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.classList.remove("hidden"); video.srcObject = stream; await video.play();
        let vivo = true;
        scanStop = () => { vivo = false; stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
        const loop = async () => {
          if (!vivo) return;
          try { const c = await det.detect(video); if (c.length) return fin(c[0].rawValue); } catch {}
          requestAnimationFrame(loop);
        };
        loop(); return;
      }
    }
    // Respaldo: html5-qrcode (iPhone/iPad Safari no tiene BarcodeDetector)
    video.classList.add("hidden");
    if (!window.Html5Qrcode) await cargarScript("https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js");
    const h = new Html5Qrcode("scanQr", { verbose: false });
    await h.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 280, height: 140 } }, (txt) => fin(txt), () => {});
    scanStop = () => { h.stop().then(() => h.clear()).catch(() => {}); };
  } catch (e) {
    console.error(e);
    msg.textContent = "No se pudo abrir la cámara. Revisá el permiso o escribí el código.";
  }
}
function cerrarScanner() { try { scanStop && scanStop(); } catch {} scanStop = null; $("#scanner").classList.add("hidden"); $("#scanVideo").classList.remove("hidden"); }
function cargarScript(src) { return new Promise((ok, mal) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => mal(new Error("Sin conexión para el escáner")); document.head.appendChild(s); }); }
$("#btnScanCerrar").onclick = () => cerrarScanner();

// ---------- Navegación ----------
function mostrar(id) { $$(".view").forEach((v) => v.classList.toggle("hidden", v.id !== id)); }
function router() {
  $$(".nomUsuario").forEach((e) => (e.textContent = st.usuario || ""));
  if (!authListo) return;
  if (!st.uid) { salirDeposito(); depActivo = null; return mostrar("vClave"); }
  if (!st.usuario) return mostrar("vNombre");
  if (!dep()) return mostrar("vDeposito");
  $("#nomDeposito").textContent = dep().nombre;
  mostrar("vApp");
  entrarDeposito();
}
$("#listaNombres").innerHTML = USUARIOS.map((u) => `<button class="btn huge" data-u="${esc(u)}">${esc(u)}</button>`).join("");
$("#listaNombres").onclick = (e) => { const b = e.target.closest("[data-u]"); if (!b) return; st.usuario = b.dataset.u; localStorage.setItem("inv_usuario", st.usuario); router(); };
$("#listaDepositos").innerHTML = DEPOSITOS.map((d) => `<button class="btn big huge" data-d="${d.id}">${esc(d.nombre)}</button>`).join("");
$("#listaDepositos").onclick = (e) => { const b = e.target.closest("[data-d]"); if (!b) return; st.deposito = b.dataset.d; localStorage.setItem("inv_deposito", st.deposito); st.conteoId = null; router(); };
const cambiarNombre = () => { st.usuario = null; localStorage.removeItem("inv_usuario"); salirDeposito(); router(); };
$("#btnCambiarNombre1").onclick = cambiarNombre;
$("#btnCambiarNombre2").onclick = cambiarNombre;
$("#btnCambiarDep").onclick = () => { st.deposito = null; localStorage.removeItem("inv_deposito"); salirDeposito(); router(); };
$$(".tab").forEach((t) => (t.onclick = () => {
  $$(".tab").forEach((x) => x.classList.toggle("active", x === t));
  $$(".tabpane").forEach((p) => p.classList.toggle("hidden", p.id !== t.dataset.tab));
}));

function salirDeposito() { Object.values(st.unsub).forEach((f) => f && f()); st.unsub = {}; st.conteoId = null; }
let depActivo = null;
function entrarDeposito() {
  if (!st.uid) return;
  const clave = st.deposito + "|" + st.usuario;
  if (depActivo === clave && st.unsub.conteos) return;
  salirDeposito(); depActivo = clave;
  escucharConteos(); escucharUsos(); resetUso(); prepararXfer(); escucharTransferencias();
  const kG = `inv_conteo_${st.deposito}_${st.usuario}`, guardado = localStorage.getItem(kG);
  // v14: nunca retomar un conteo de otro día (el id empieza con la fecha); si ya fue enviado, abrirConteo lo cierra
  if (guardado && guardado.startsWith(`${hoyISO()}_${slug(st.usuario)}_`)) abrirConteo(guardado);
  else { localStorage.removeItem(kG); verListaConteos(); }
}

// ---------- CONTEOS ----------
const colConteos = () => collection(db, "inventario", st.deposito, "conteos");
function escucharConteos() {
  // v14: solo conteos de HOY. Los abiertos de otros días ya no se pueden continuar; se empieza uno nuevo.
  const q = query(colConteos(), where("fecha", "==", hoyISO()));
  st.unsub.conteos = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    const todos = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.actualizadoLocal || 0) - (a.actualizadoLocal || 0));
    const arr = todos.filter((c) => c.estado === "abierto" && c.usuario === st.usuario);
    const env = todos.filter((c) => c.estado === "enviado");
    const cont = $("#conteosAbiertos");
    cont.innerHTML = !arr.length ? '<p class="muted">No tenés conteos abiertos hoy. Empezá uno nuevo.</p>'
      : arr.map((c) => `<button class="res" data-c="${esc(c.id)}"><div class="n">Conteo de ${esc(c.usuario)} · ${esc(c.fecha || "")}</div><div class="m">Último cambio ${fechaHora(c.actualizadoLocal)}${snapPend(c, snap) ? ' <span class="tag pend">sin subir</span>' : ""} · tocá para continuar</div></button>`).join("");
    const ce = $("#conteosEnviados");
    if (ce) ce.innerHTML = !env.length ? '<p class="muted">Todavía no se envió ningún conteo hoy.</p>'
      : env.map((c) => `<div class="card item"><div><div class="n"><b>Conteo de ${esc(c.usuario)}</b>${snapPend(c, snap) ? '<span class="tag pend">sin subir</span>' : ""}</div><div class="muted small">Enviado ${fechaHora(c.enviadoLocal)}${c.productos != null ? " · " + esc(c.productos) + " productos" : ""}</div></div></div>`).join("");
  }, (e) => { console.error(e); $("#conteosAbiertos").innerHTML = '<p class="muted">No se pudo leer: ' + esc(e.code) + "</p>"; });
}
function snapPend(c, snap) { const d = snap.docs.find((x) => x.id === c.id); return d && d.metadata.hasPendingWrites; }
$("#conteosAbiertos").onclick = (e) => { const b = e.target.closest("[data-c]"); if (b) abrirConteo(b.dataset.c); };
function verListaConteos() {
  if (st.unsub.items) { st.unsub.items(); st.unsub.items = null; st.unsub.conteo && st.unsub.conteo(); st.unsub.conteo = null; }
  st.conteoId = null; st.conteoOk = false; localStorage.removeItem(`inv_conteo_${st.deposito}_${st.usuario}`);
  $("#conteoLista").classList.remove("hidden"); $("#conteoActivo").classList.add("hidden");
}
$("#btnSalirConteo").onclick = verListaConteos;
$("#btnNuevoConteo").onclick = () => {
  const id = `${hoyISO()}_${slug(st.usuario)}_${Math.random().toString(36).slice(2, 7)}`;
  const ahora = Date.now();
  const datos = {
    usuario: st.usuario, deposito: st.deposito, depositoNombre: dep().nombre, estado: "abierto", fecha: hoyISO(),
    creado: ST_MARK, actualizado: ST_MARK, enviado: null,
    creadoLocal: ahora, actualizadoLocal: ahora, app: "inventario-tg", appVersion: APP_VERSION,
  };
  escribir(`inventario/${st.deposito}/conteos/${id}`, hidratar(datos), datos).catch(() => {});
  abrirConteo(id, true);
};
function abrirConteo(id, nuevo = false) {
  st.conteoId = id; st.conteoOk = !!nuevo; localStorage.setItem(`inv_conteo_${st.deposito}_${st.usuario}`, id);
  $("#conteoLista").classList.add("hidden"); $("#conteoActivo").classList.remove("hidden");
  $("#panelConteo").classList.add("hidden");
  $("#conteoTitulo").textContent = id;
  st.unsub.conteo && st.unsub.conteo();
  st.unsub.conteo = onSnapshot(doc(colConteos(), id), (d) => {
    if (!d.exists()) { $("#conteoMeta").textContent = "Preparando…"; return; }
    const c = d.data();
    $("#conteoTitulo").textContent = `de ${c.usuario} · ${c.fecha || ""}`;
    $("#conteoMeta").textContent = `${dep().nombre} · estado: ${c.estado}`;
    // v14: un conteo enviado, de otro día o de otra persona no se retoma
    if (c.estado !== "abierto") { st.conteoOk = false; toast("Este conteo ya fue enviado. Empezá uno nuevo."); verListaConteos(); return; }
    if ((c.fecha || "") !== hoyISO() || c.usuario !== st.usuario) { st.conteoOk = false; toast("Ese conteo es de otro día. Empezá uno nuevo."); verListaConteos(); return; }
    st.conteoOk = true;
  });
  st.unsub.items && st.unsub.items();
  st.items = new Map();
  st.unsub.items = onSnapshot(collection(colConteos(), id, "items"), { includeMetadataChanges: true }, (snap) => {
    st.items = new Map(snap.docs.map((d) => [d.id, { ...d.data(), _pend: d.metadata.hasPendingWrites }]));
    pintarItems();
  });
}
function pintarItems() {
  const arr = [...st.items.entries()].filter(([, it]) => !it.eliminado).sort((a, b) => (b[1].actualizadoLocal || 0) - (a[1].actualizadoLocal || 0));
  $("#conteoCant").textContent = arr.length;
  $("#conteoItems").innerHTML = arr.length ? arr.map(([k, it]) => `
    <div class="card item" data-k="${esc(k)}">
      <div><div class="n"><b>${esc(it.producto)}</b>${it.sinFicha ? '<span class="tag sf">sin ficha</span>' : ""}${it._pend ? '<span class="tag pend">sin subir</span>' : ""}</div>
      <div class="muted small">${it.id ? "Ficha " + esc(it.id) + " · " : ""}${it.codigo ? "Cód. " + esc(it.codigo) + " · " : ""}${esc(it.usuario || "")}</div></div>
      <div class="q">${fmt(it.cantidad)} <span class="small">${esc(UNIDAD_CORTA[it.unidad] || it.unidad)}</span></div>
    </div>`).join("") : '<p class="muted">Todavía no cargaste nada. Buscá o escaneá un producto.</p>';
}
$("#conteoItems").onclick = (e) => {
  const c = e.target.closest("[data-k]"); if (!c) return;
  const it = st.items.get(c.dataset.k);
  const p = it.sinFicha ? { id: null, c: "", p: it.producto, u: it.unidad, sinFicha: true, _key: c.dataset.k } : (st.catalogo.find((x) => x.id === it.id) || { id: it.id, c: it.codigo, p: it.producto, u: it.unidad });
  panelConteo(p, c.dataset.k);
};
function claveItem(p) { return p._key || (p.sinFicha ? "sf_" + (slug(p.p) || Date.now()) : String(p.id)); }
function panelConteo(p, claveExistente) {
  const k = claveExistente || claveItem(p);
  const prev = st.items.get(k);
  const yaEsta = prev && !prev.eliminado;
  const pan = $("#panelConteo");
  pan.classList.remove("hidden");
  pan.innerHTML = `
    <div class="prod-title">${esc(p.p)} ${p.sinFicha ? '<span class="tag sf">sin ficha</span>' : ""}</div>
    <div class="muted">${p.id ? "Ficha " + esc(p.id) + " · " : ""}${p.c ? "Cód. " + esc(p.c) + " · " : ""}Unidad de la ficha: <b>${esc(p.u)}</b></div>
    ${p.sinFicha ? `<label>Unidad<select id="pcUnidad"><option>Unidades</option><option>Kilogramos</option><option>Litros</option></select></label>` : ""}
    ${yaEsta ? `<p class="card info">Ya está cargado: <b>${fmt(prev.cantidad)} ${esc(UNIDAD_CORTA[prev.unidad] || prev.unidad)}</b>. Podés sumar lo nuevo o reemplazar el total.</p>` : ""}
    <label>Cantidad en ${esc(p.u)}
      <input id="pcCant" inputmode="decimal" placeholder="${p.u === "Unidades" ? "Ej.: 12" : "Ej.: 2,5"}" autocomplete="off"></label>
    <div class="row">
      ${yaEsta ? `<button class="btn big" id="pcSumar">Sumar</button><button class="btn big primary" id="pcReemplazar">Reemplazar</button>`
               : `<button class="btn big primary" id="pcGuardar">Guardar</button>`}
    </div>
    <div class="row">
      <button class="btn big" id="pcCancelar">Cancelar</button>
      ${yaEsta ? `<button class="btn big warn" id="pcQuitar">Quitar del conteo</button>` : ""}
    </div>`;
  if (p.sinFicha && prev) $("#pcUnidad").value = prev.unidad;
  const inp = $("#pcCant"); setTimeout(() => inp.focus(), 50);
  pan.scrollIntoView({ behavior: "smooth", block: "start" });
  const guardar = (modo) => {
    if (!st.conteoId || !st.conteoOk) { toast("Este conteo ya no está abierto. Empezá uno nuevo."); verListaConteos(); return; }
    const n = parseCant(inp.value);
    if (!(n >= 0) || Number.isNaN(n)) { toast("Escribí una cantidad válida (podés usar coma)"); inp.focus(); return; }
    if (p.u === "Unidades" && !p.sinFicha && !Number.isInteger(n) && !confirm(`La ficha es por Unidades y pusiste ${fmt(n)}. ¿Está bien?`)) return;
    const unidad = p.sinFicha ? $("#pcUnidad").value : p.u;
    const ahora = Date.now();
    const data = {
      id: p.id ?? null, codigo: p.c || "", producto: p.p, unidad, usuario: st.usuario,
      actualizado: serverTimestamp(), actualizadoLocal: ahora, eliminado: false, sinFicha: !!p.sinFicha,
      cantidad: modo === "sumar" ? increment(n) : n,
    };
    const base = st.items.get(k);
    const total = modo === "sumar" ? (base && !base.eliminado ? Number(base.cantidad) || 0 : 0) + n : n;
    escribir(`inventario/${st.deposito}/conteos/${st.conteoId}/items/${k}`, data, { ...data, actualizado: ST_MARK, cantidad: total }).catch(() => {});
    tocarConteo();
    pan.classList.add("hidden"); buscadores.conteo.limpiar();
    toast(modo === "sumar" ? `Sumado ${fmt(n)} a ${p.p}` : `Guardado: ${p.p} = ${fmt(n)}`);
  };
  const b = (id, f) => { const el = $(id, pan); if (el) el.onclick = f; };
  b("#pcGuardar", () => guardar("reemplazar"));
  b("#pcReemplazar", () => guardar("reemplazar"));
  b("#pcSumar", () => guardar("sumar"));
  b("#pcCancelar", () => pan.classList.add("hidden"));
  b("#pcQuitar", () => {
    if (!confirm(`¿Quitar ${p.p} de este conteo?`)) return;
    if (!st.conteoId || !st.conteoOk) { toast("Este conteo ya no está abierto."); verListaConteos(); return; }
    const q = { eliminado: true, usuario: st.usuario, actualizado: ST_MARK, actualizadoLocal: Date.now() };
    escribir(`inventario/${st.deposito}/conteos/${st.conteoId}/items/${k}`, hidratar(q), q).catch(() => {});
    tocarConteo(); pan.classList.add("hidden");
  });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") guardar(yaEsta ? "reemplazar" : "reemplazar"); });
}
function tocarConteo() {
  const q = { actualizado: ST_MARK, actualizadoLocal: Date.now() };
  escribir(`inventario/${st.deposito}/conteos/${st.conteoId}`, hidratar(q), q).catch(() => {});
}
$("#btnEnviarConteo").onclick = () => {
  const n = [...st.items.values()].filter((i) => !i.eliminado).length;
  if (!st.conteoId || !st.conteoOk) { toast("Este conteo ya no está abierto."); return verListaConteos(); }
  if (!n) return toast("El conteo está vacío");
  if (!confirm(`¿Enviar el conteo con ${n} productos? Después ya no se puede cambiar.`)) return;
  const ahora = Date.now();
  const q = { estado: "enviado", enviado: ST_MARK, enviadoPor: st.usuario, enviadoLocal: ahora, actualizado: ST_MARK, actualizadoLocal: ahora, productos: n };
  escribir(`inventario/${st.deposito}/conteos/${st.conteoId}`, hidratar(q), q).catch(() => {});
  st.conteoOk = false;
  toast(navigator.onLine ? "Conteo enviado. ¡Gracias!" : "Conteo enviado. Sube cuando vuelva la señal.", 3500);
  verListaConteos();
};

// ---------- USOS INTERNOS ----------
let usoProd = null;
const colUsos = () => collection(db, "inventario", st.deposito, "usos_internos");
function resetUso() {
  usoProd = null; $("#formUso").classList.add("hidden"); $("#formUso").reset();
  $("#usoCentro").value = dep().centro; $("#usoFecha").value = hoyISO(); $("#lblConceptoOtro").classList.add("hidden");
}
function elegirUso(p) {
  usoProd = p;
  $("#formUso").classList.remove("hidden");
  $("#usoProducto").innerHTML = `<div class="prod-title">${esc(p.p)} ${p.sinFicha ? '<span class="tag sf">sin ficha</span>' : ""}</div><div class="muted">${p.id ? "Ficha " + esc(p.id) + " · " : ""}${p.c ? "Cód. " + esc(p.c) + " · " : ""}Unidad: <b>${esc(p.u)}</b></div>`;
  $("#usoUnidad").textContent = "(" + p.u + ")";
  if (!$("#usoCentro").value) $("#usoCentro").value = dep().centro;
  if (!$("#usoFecha").value) $("#usoFecha").value = hoyISO();
  setTimeout(() => $("#usoCantidad").focus(), 50);
}
$("#usoConcepto").onchange = () => $("#lblConceptoOtro").classList.toggle("hidden", $("#usoConcepto").value !== "Otro");
$("#btnUsoCancelar").onclick = resetUso;
$("#formUso").onsubmit = (e) => {
  e.preventDefault();
  if (!usoProd) return;
  const n = parseCant($("#usoCantidad").value);
  if (!(n > 0)) return toast("Escribí una cantidad mayor a cero");
  const motivo = $("#usoMotivo").value.trim(); if (!motivo) return toast("Escribí el motivo");
  let concepto = $("#usoConcepto").value;
  if (concepto === "Otro") { const o = $("#usoConceptoOtro").value.trim(); concepto = o ? "Otro: " + o : "Otro"; }
  const ahora = Date.now();
  // v15: id propio (no addDoc) para que el respaldo local reenvíe al MISMO doc.
  // El respaldo NO lleva "estado": si el doc ya existe (p. ej. marcado "cargado" en Bims) nunca se vuelve a "pendiente".
  const ref = doc(colUsos());
  const datos = {
    productoId: usoProd.id ?? null, codigo: usoProd.c || "", producto: usoProd.p, unidad: usoProd.u, sinFicha: !!usoProd.sinFicha,
    cantidad: n, motivo, centroCosto: $("#usoCentro").value, concepto, fecha: $("#usoFecha").value,
    deposito: st.deposito, depositoNombre: dep().nombre, usuario: st.usuario,
    creado: ST_MARK, creadoLocal: ahora, app: "inventario-tg", appVersion: APP_VERSION,
  };
  escribir(ref.path, { ...hidratar(datos), estado: ESTADO_USO.pendiente }, datos).catch(() => {});
  toast("Uso interno guardado"); resetUso(); buscadores.uso.limpiar();
};
// Estados de usos_internos: "pendiente" (lo crea la app) y "cargado" (lo marca el encargado cuando ya está en Bims,
// con bims_ref, cargado_por y cargado_at opcionales). Sin estado = pendiente. La app nunca escribe "cargado" ni pisa estado.
const ESTADO_USO = { pendiente: "pendiente", cargado: "cargado" };
const usoCargado = (u) => u.estado === ESTADO_USO.cargado;
const fechaCarga = (t) => { if (!t) return ""; const d = typeof t.toDate === "function" ? t.toDate() : new Date(t); return isNaN(d) ? String(t) : fechaHora(d.getTime()); };
function tarjetaUso(d) {
  const u = d.data(), carg = usoCargado(u);
  const estado = carg
    ? `<span class="tag ok">Cargado en Bims${u.bims_ref ? " " + esc(u.bims_ref) : ""}</span>${u.cargado_por || u.cargado_at ? ` <span class="muted">${esc(u.cargado_por || "")}${u.cargado_por && u.cargado_at ? " · " : ""}${esc(fechaCarga(u.cargado_at))}</span>` : ""}`
    : "<i>pendiente de cargar en Bims</i>";
  return `
      <div class="card item${carg ? " cargado" : ""}"><div><div><b>${esc(u.producto)}</b>${u.sinFicha ? '<span class="tag sf">sin ficha</span>' : ""}${d.metadata.hasPendingWrites ? '<span class="tag pend">sin subir</span>' : ""}</div>
      <div class="muted small">${u.productoId ? "Ficha " + esc(u.productoId) + " · " : ""}${esc(u.fecha)} · ${esc(u.usuario)} · ${esc(u.centroCosto)} · ${esc(u.concepto)}</div>
      <div class="small">${esc(u.motivo)} · ${estado}</div></div>
      <div class="q">${fmt(u.cantidad)} <span class="small">${esc(UNIDAD_CORTA[u.unidad] || u.unidad)}</span></div></div>`;
}
function escucharUsos() {
  const q = query(colUsos(), orderBy("creadoLocal", "desc"), limit(40));
  st.unsub.usos = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    const cont = $("#usosLista");
    if (snap.empty) { cont.innerHTML = '<p class="muted">Todavía no hay usos internos en este depósito.</p>'; return; }
    const pend = snap.docs.filter((d) => !usoCargado(d.data())), carg = snap.docs.filter((d) => usoCargado(d.data()));
    cont.innerHTML = `<h3>Pendientes de cargar en Bims <span class="pill">${pend.length}</span></h3>`
      + (pend.length ? pend.map(tarjetaUso).join("") : '<p class="muted">No hay usos internos pendientes.</p>')
      + (carg.length ? `<h3>Ya cargados en Bims <span class="pill">${carg.length}</span></h3>` + carg.map(tarjetaUso).join("") : "");
  }, (e) => { console.error(e); $("#usosLista").innerHTML = '<p class="muted">No se pudo leer: ' + esc(e.code) + "</p>"; });
}


// ---------- TRANSFERENCIAS ----------
// La app solo crea ítems en estado "pendiente". "transferido" lo marca Inventario General / BIMS
// (bims_ref, transferido_por, transferido_at). El reenvío local nunca pisa el estado.
// "prueba" (u otro valor que no sea pendiente/transferido) no lo debe cargar BIMS.
const ESTADO_XFER = { pendiente: "pendiente", transferido: "transferido", prueba: "prueba" };
const colXfer = () => collection(db, "inventario", st.deposito, "transferencias");
let xferProd = null;
let xferItems = []; // lista local de lo que se lleva, todavía no guardada

function prepararXfer() {
  xferItems = [];
  xferProd = null;
  $("#formXferItem").classList.add("hidden");
  $("#formXferItem").reset();
  $("#xferOrigen").textContent = dep() ? dep().nombre : "";
  const sel = $("#xferDestino");
  const prev = sel.value;
  const dests = DEPOSITOS.filter((d) => d.id !== st.deposito);
  sel.innerHTML = '<option value="">Elegí a dónde se lleva</option>' + dests.map((d) => `<option value="${esc(d.id)}">${esc(d.nombre)}</option>`).join("");
  if (prev && dests.some((d) => d.id === prev)) sel.value = prev;
  pintarListaXfer();
}
function elegirXfer(p) {
  xferProd = p;
  $("#formXferItem").classList.remove("hidden");
  $("#xferProducto").innerHTML = `<div class="prod-title">${esc(p.p)} ${p.sinFicha ? '<span class="tag sf">sin ficha</span>' : ""}</div><div class="muted">${p.id ? "Ficha " + esc(p.id) + " · " : ""}${p.c ? "Cód. " + esc(p.c) + " · " : ""}Unidad: <b>${esc(p.u)}</b></div>`;
  $("#xferUnidad").textContent = "(" + p.u + ")";
  $("#xferCantidad").value = "";
  $("#xferNotaItem").value = $("#xferNotaLote").value || "";
  setTimeout(() => $("#xferCantidad").focus(), 50);
}
function pintarListaXfer() {
  const box = $("#xferLista"), n = $("#xferListaCant");
  if (n) n.textContent = String(xferItems.length);
  if (!xferItems.length) {
    box.innerHTML = '<p class="muted">Todavía no hay ítems. Buscá un producto y agregalo.</p>';
    return;
  }
  box.innerHTML = xferItems.map((it, i) => `
    <div class="card item xfer-item"><div>
      <div><b>${esc(it.producto)}</b>${it.sinFicha ? '<span class="tag sf">sin ficha</span>' : ""}</div>
      <div class="muted small">${it.producto_id ? "Ficha " + esc(it.producto_id) : "Sin ficha"}${it.nota ? " · " + esc(it.nota) : ""}</div>
      <button type="button" class="btn mini warn quit" data-xqi="${i}">Quitar</button>
    </div>
    <div class="q">${fmt(it.cantidad)} <span class="small">${esc(UNIDAD_CORTA[it.unidad] || it.unidad)}</span></div></div>`).join("");
  box.querySelectorAll("[data-xqi]").forEach((b) => b.onclick = () => { xferItems.splice(Number(b.dataset.xqi), 1); pintarListaXfer(); });
}
$("#btnXferCancelarItem").onclick = () => { xferProd = null; $("#formXferItem").classList.add("hidden"); $("#formXferItem").reset(); };
$("#formXferItem").onsubmit = (e) => {
  e.preventDefault();
  if (!xferProd) return;
  const n = parseCant($("#xferCantidad").value);
  if (!(n > 0)) return toast("Escribí una cantidad mayor a cero");
  xferItems.push({
    producto: xferProd.p,
    producto_id: xferProd.id ?? null,
    codigo: xferProd.c || "",
    unidad: xferProd.u,
    sinFicha: !!xferProd.sinFicha,
    cantidad: n,
    nota: $("#xferNotaItem").value.trim(),
  });
  toast("Agregado a la lista");
  xferProd = null;
  $("#formXferItem").classList.add("hidden");
  $("#formXferItem").reset();
  if (buscadores.xfer) buscadores.xfer.limpiar();
  pintarListaXfer();
};
$("#btnXferGuardar").onclick = () => {
  if (!xferItems.length) return toast("Agregá al menos un producto a la lista");
  const destId = $("#xferDestino").value;
  if (!destId) return toast("Elegí el depósito destino");
  if (destId === st.deposito) return toast("El destino no puede ser el mismo depósito");
  const dest = DEPOSITOS.find((d) => d.id === destId);
  if (!dest) return toast("Destino inválido");
  const notaLote = $("#xferNotaLote").value.trim();
  const ahora = Date.now();
  const lote_id = `${hoyISO()}_${slug(st.usuario)}_${ahora.toString(36)}`;
  for (const it of xferItems) {
    const ref = doc(colXfer());
    const nota = it.nota || notaLote || "";
    const datos = {
      deposito_origen: st.deposito,
      deposito_destino: dest.id,
      deposito_origen_nombre: dep().nombre,
      deposito_destino_nombre: dest.nombre,
      producto: it.producto,
      producto_id: it.producto_id,
      productoId: it.producto_id, // convención de usos_internos
      codigo: it.codigo,
      cantidad: it.cantidad,
      unidad: it.unidad,
      sinFicha: it.sinFicha,
      fecha_hora: ST_MARK,
      fecha_horaLocal: ahora,
      fecha: hoyISO(),
      usuario: st.usuario,
      nota,
      lote_id,
      deposito: st.deposito,
      depositoNombre: dep().nombre,
      creado: ST_MARK,
      creadoLocal: ahora,
      app: "inventario-tg",
      appVersion: APP_VERSION,
    };
    // El respaldo NO lleva "estado": si BIMS ya lo marcó, el reenvío no lo vuelve a pendiente.
    escribir(ref.path, { ...hidratar(datos), estado: ESTADO_XFER.pendiente }, datos).catch(() => {});
  }
  const n = xferItems.length;
  toast(n === 1 ? "Transferencia guardada (1 ítem)" : `Transferencia guardada (${n} ítems)`);
  xferItems = [];
  $("#xferNotaLote").value = "";
  pintarListaXfer();
};
const xferHecha = (u) => u.estado === ESTADO_XFER.transferido;
function etiquetaXfer(u) {
  if (xferHecha(u)) {
    return `<span class="tag ok">Transferido en Bims${u.bims_ref ? " " + esc(u.bims_ref) : ""}</span>${u.transferido_por || u.transferido_at ? ` <span class="muted">${esc(u.transferido_por || "")}${u.transferido_por && u.transferido_at ? " · " : ""}${esc(fechaCarga(u.transferido_at))}</span>` : ""}`;
  }
  if (u.estado === ESTADO_XFER.prueba) return '<span class="tag sf">Prueba (no transferir)</span>';
  if (u.estado && u.estado !== ESTADO_XFER.pendiente) return `<span class="tag">${esc(u.estado)}</span>`;
  return "<i>pendiente de transferir en Bims</i>";
}
function tarjetaXfer(d) {
  const u = d.data();
  const dest = u.deposito_destino_nombre || u.deposito_destino || "";
  return `
      <div class="card item${xferHecha(u) ? " cargado" : ""}"><div><div><b>${esc(u.producto)}</b>${u.sinFicha ? '<span class="tag sf">sin ficha</span>' : ""}${d.metadata.hasPendingWrites ? '<span class="tag pend">sin subir</span>' : ""}</div>
      <div class="muted small">${u.producto_id || u.productoId ? "Ficha " + esc(u.producto_id || u.productoId) + " · " : ""}A ${esc(dest)} · ${esc(u.usuario)} · lote ${esc(u.lote_id || "—")}</div>
      <div class="small">${u.nota ? esc(u.nota) + " · " : ""}${etiquetaXfer(u)}</div></div>
      <div class="q">${fmt(u.cantidad)} <span class="small">${esc(UNIDAD_CORTA[u.unidad] || u.unidad)}</span></div></div>`;
}
function escucharTransferencias() {
  const q = query(colXfer(), orderBy("creadoLocal", "desc"), limit(40));
  st.unsub.xfer = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    const cont = $("#xferRecientes");
    if (snap.empty) { cont.innerHTML = '<p class="muted">Todavía no hay transferencias desde este depósito.</p>'; return; }
    const pend = snap.docs.filter((d) => !xferHecha(d.data()) && d.data().estado !== ESTADO_XFER.prueba && (!d.data().estado || d.data().estado === ESTADO_XFER.pendiente));
    const otras = snap.docs.filter((d) => !pend.includes(d) && !xferHecha(d.data()));
    const hechas = snap.docs.filter((d) => xferHecha(d.data()));
    let html = `<h3>Pendientes de transferir en Bims <span class="pill">${pend.length}</span></h3>`;
    html += pend.length ? pend.map(tarjetaXfer).join("") : '<p class="muted">No hay transferencias pendientes.</p>';
    if (otras.length) html += `<h3>Otras <span class="pill">${otras.length}</span></h3>` + otras.map(tarjetaXfer).join("");
    if (hechas.length) html += `<h3>Ya transferidas en Bims <span class="pill">${hechas.length}</span></h3>` + hechas.map(tarjetaXfer).join("");
    cont.innerHTML = html;
  }, (e) => { console.error(e); $("#xferRecientes").innerHTML = '<p class="muted">No se pudo leer: ' + esc(e.code) + "</p>"; });
}


// ---------- Inicio ----------
buscadores.conteo = montarBuscador($('.buscador[data-modo="conteo"]'), (p) => panelConteo(p));
buscadores.uso = montarBuscador($('.buscador[data-modo="uso"]'), elegirUso);
buscadores.xfer = montarBuscador($('.buscador[data-modo="xfer"]'), elegirXfer);
cargarCatalogo().then(() => { window.__invReady = true; pintarVersion(); }).catch((e) => toast("No se pudo cargar el catálogo"));
pintarSync();
router();
function pintarVersion() {
  const el = document.getElementById("versionApp");
  if (el) el.textContent = `App ${APP_VERSION} · ${st.catalogo.length ? st.catalogo.length + " productos" : "cargando catálogo…"}`;
}
pintarVersion();

// ---------- Actualización automática (sirve también con la app anclada al inicio) ----------
if ("serviceWorker" in navigator) {
  let recargado = false;
  const habiaControlador = !!navigator.serviceWorker.controller; // la primera instalación no recarga
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!habiaControlador || recargado || sessionStorage.getItem("inv_recarga") === APP_VERSION) return;
    recargado = true; sessionStorage.setItem("inv_recarga", APP_VERSION);
    location.reload();
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    const buscarActualizacion = () => reg.update().catch(() => {});
    buscarActualizacion();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") buscarActualizacion(); });
    addEventListener("online", buscarActualizacion);
  }).catch((e) => console.warn("sw", e));
}
