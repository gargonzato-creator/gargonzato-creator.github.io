// Reservas AC — mapa de mesas de Almacén de Carnes. No escribe en Bims ni en Google Calendar.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  collection, doc, setDoc, onSnapshot, query, where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAOFcpSMEp2hsP9FWcc7f_zhyiH4Sm6G2Y",
  authDomain: "tg-apps-bbde7.firebaseapp.com",
  projectId: "tg-apps-bbde7",
  storageBucket: "tg-apps-bbde7.firebasestorage.app",
  messagingSenderId: "1058376237664",
  appId: "1:1058376237664:web:b3d63e5d6de5c759b57905"
};

export const APP_VERSION = "v3 (27/11)";
// Misma cuenta compartida del personal que Inventario. No se crean claves nuevas.
const CUENTA_PERSONAL = "personal.inventario@tg-apps-bbde7.firebaseapp.com";
const TZ = "America/Asuncion";
const COL_ROOT = "reservas_carnes";
const PATH_CONFIG = `${COL_ROOT}/config`;
const PATH_MESAS = `${PATH_CONFIG}/mesas`;
const PATH_RESERVAS = `${PATH_CONFIG}/reservas`;

const TURNO_DEFAULT = { id: "sabado-noche", nombre: "Sábado noche", llegada_desde: "20:00", llegada_hasta: "22:00" };
const MAPA_VERSION = "bims-pos-v3";
const SECTORES = [
  { id: "mayoria", nombre: "Salón Mayoría", corto: "Mayoría" },
  { id: "patio", nombre: "Patio", corto: "Patio" },
  { id: "granero", nombre: "Granero", corto: "Granero" },
  { id: "tienda", nombre: "Tienda", corto: "Tienda" },
];
const ZONAS = SECTORES.map((s) => s.nombre);
const SECTOR_MAPA = {
  "Salón Mayoría": { bw: 858, bh: 408, minRect: 40 },
  "Patio": { bw: 776, bh: 492, minRect: 39 },
  "Granero": { bw: 584, bh: 420, minRect: 43 },
  "Tienda": { bw: 983, bh: 556, minRect: 78 },
};
const CANALES = [
  { id: "whatsapp", nombre: "WhatsApp" },
  { id: "llamada", nombre: "Llamada" },
  { id: "instagram", nombre: "Instagram" },
  { id: "facebook", nombre: "Facebook" },
  { id: "sin_reserva", nombre: "Sin reserva" },
];
const ESTADOS = [
  { id: "confirmada", nombre: "Confirmada" },
  { id: "llego", nombre: "Llegó" },
  { id: "no_se_presento", nombre: "No se presentó" },
  { id: "cancelada", nombre: "Cancelada" },
];
const USUARIOS_BASE = ["Tomás"];

// Mapa del POS CARNES de Bims (27/11/2026). Mesa Especial no se incluye.
// Posiciones en % del recuadro de cada sector, proporcionales al plano. Sin mesa 5 en Patio.
const MESAS_BIMS = [
  { id: "mayoria-13", zona: "Salón Mayoría", numero: "13", nombre: "13", forma: "rect", capacidad: 2, cliente: true, x: 8.0, y: 15.5, w: 7.7, h: 13.3, orden: 1 },
  { id: "mayoria-12", zona: "Salón Mayoría", numero: "12", nombre: "12", forma: "alargada", capacidad: 4, cliente: true, x: 30.4, y: 14.5, w: 17.7, h: 6.4, orden: 2 },
  { id: "mayoria-11", zona: "Salón Mayoría", numero: "11", nombre: "11", forma: "rect", capacidad: 2, cliente: true, x: 56.3, y: 25.3, w: 5.1, h: 11.8, orden: 3 },
  { id: "mayoria-8", zona: "Salón Mayoría", numero: "8", nombre: "8", forma: "rect", capacidad: 2, cliente: true, x: 19.0, y: 59.1, w: 5.8, h: 11.5, orden: 4 },
  { id: "mayoria-10", zona: "Salón Mayoría", numero: "10", nombre: "10", forma: "rect", capacidad: 2, cliente: true, x: 63.5, y: 57.7, w: 5.8, h: 9.8, orden: 5 },
  { id: "mayoria-7", zona: "Salón Mayoría", numero: "7", nombre: "7", forma: "rect", capacidad: 2, cliente: true, x: 19.2, y: 85.9, w: 6.4, h: 10.6, orden: 6 },
  { id: "mayoria-9", zona: "Salón Mayoría", numero: "9", nombre: "9", forma: "alargada", capacidad: 4, cliente: true, x: 43.0, y: 82.0, w: 15.8, h: 8.6, orden: 7 },
  { id: "mayoria-barra", zona: "Salón Mayoría", numero: "barra", nombre: "Barra Mayoría", forma: "barra", capacidad: 6, cliente: true, x: 89.1, y: 53.5, w: 13.4, h: 64.0, orden: 8 },
  { id: "patio-barra-parrilla", zona: "Patio", numero: "barra-parrilla", nombre: "Barra Parrilla", forma: "barra", capacidad: 6, cliente: true, x: 62.8, y: 15.0, w: 65.2, h: 15.4, orden: 1 },
  { id: "patio-tambor", zona: "Patio", numero: "tambor", nombre: "Tambor", forma: "rect", capacidad: 2, cliente: true, x: 10.2, y: 50.8, w: 11.1, h: 11.6, orden: 2 },
  { id: "patio-1", zona: "Patio", numero: "1", nombre: "1", forma: "rect", capacidad: 2, cliente: true, x: 31.8, y: 84.5, w: 6.4, h: 8.5, orden: 3 },
  { id: "patio-2", zona: "Patio", numero: "2", nombre: "2", forma: "rect", capacidad: 2, cliente: true, x: 50.9, y: 63.8, w: 6.1, h: 9.3, orden: 4 },
  { id: "patio-3", zona: "Patio", numero: "3", nombre: "3", forma: "rect", capacidad: 2, cliente: true, x: 63.9, y: 53.4, w: 7.3, h: 11.6, orden: 5 },
  { id: "patio-4", zona: "Patio", numero: "4", nombre: "4", forma: "rect", capacidad: 2, cliente: true, x: 77.7, y: 52.2, w: 8.9, h: 18.9, orden: 6 },
  { id: "patio-6", zona: "Patio", numero: "6", nombre: "6", forma: "rect", capacidad: 2, cliente: true, x: 61.1, y: 86.9, w: 5.0, h: 11.6, orden: 7 },
  { id: "granero-6", zona: "Granero", numero: "6", nombre: "6", forma: "rect", capacidad: 2, cliente: true, x: 11.0, y: 15.2, w: 9.8, h: 13.3, orden: 1 },
  { id: "granero-4", zona: "Granero", numero: "4", nombre: "4", forma: "rect", capacidad: 2, cliente: true, x: 39.9, y: 16.0, w: 10.8, h: 11.2, orden: 2 },
  { id: "granero-5", zona: "Granero", numero: "5", nombre: "5", forma: "rect", capacidad: 2, cliente: true, x: 12.4, y: 51.9, w: 10.9, h: 14.8, orden: 3 },
  { id: "granero-3", zona: "Granero", numero: "3", nombre: "3", forma: "rect", capacidad: 2, cliente: true, x: 37.6, y: 52.4, w: 9.4, h: 12.6, orden: 4 },
  { id: "granero-1", zona: "Granero", numero: "1", nombre: "1", forma: "rect", capacidad: 2, cliente: true, x: 89.1, y: 51.2, w: 7.5, h: 10.2, orden: 5 },
  { id: "granero-2", zona: "Granero", numero: "2", nombre: "2", forma: "rect", capacidad: 2, cliente: true, x: 89.1, y: 86.2, w: 9.6, h: 10.5, orden: 6 },
  { id: "tienda-para-llevar-1", zona: "Tienda", numero: "para-llevar-1", nombre: "Para llevar 1", forma: "alargada", capacidad: 4, cliente: false, x: 11.5, y: 17.8, w: 15.0, h: 8.1, orden: 1 },
  { id: "tienda-para-llevar-2", zona: "Tienda", numero: "para-llevar-2", nombre: "Para llevar 2", forma: "alargada", capacidad: 4, cliente: false, x: 11.3, y: 36.9, w: 15.4, h: 8.3, orden: 2 },
  { id: "tienda-para-llevar-3", zona: "Tienda", numero: "para-llevar-3", nombre: "Para llevar 3", forma: "alargada", capacidad: 4, cliente: false, x: 11.6, y: 54.5, w: 15.9, h: 7.6, orden: 3 },
  { id: "tienda-bebidas-interno", zona: "Tienda", numero: "bebidas-interno", nombre: "Bebidas interno", forma: "alargada", capacidad: 4, cliente: false, x: 51.4, y: 11.9, w: 18.2, h: 10.3, orden: 4 },
  { id: "tienda-funcionarios", zona: "Tienda", numero: "funcionarios", nombre: "Funcionarios", forma: "alargada", capacidad: 4, cliente: false, x: 51.3, y: 28.6, w: 18.4, h: 9.2, orden: 5 },
  { id: "tienda-tomas", zona: "Tienda", numero: "tomas", nombre: "Tomás", forma: "rect", capacidad: 2, cliente: false, x: 70.2, y: 13.5, w: 10.2, h: 14.0, orden: 6 },
  { id: "tienda-butaca-1", zona: "Tienda", numero: "butaca-1", nombre: "Butaca 1", forma: "alargada", capacidad: 4, cliente: true, x: 18.6, y: 67.5, w: 10.7, h: 5.9, orden: 7 },
  { id: "tienda-butaca-2", zona: "Tienda", numero: "butaca-2", nombre: "Butaca 2", forma: "alargada", capacidad: 4, cliente: true, x: 35.2, y: 67.5, w: 10.6, h: 6.5, orden: 8 },
  { id: "tienda-butaca-3", zona: "Tienda", numero: "butaca-3", nombre: "Butaca 3", forma: "alargada", capacidad: 4, cliente: true, x: 53.2, y: 67.9, w: 11.1, h: 6.8, orden: 9 },
  { id: "tienda-butaca-4", zona: "Tienda", numero: "butaca-4", nombre: "Butaca 4", forma: "alargada", capacidad: 4, cliente: true, x: 71.9, y: 67.5, w: 9.4, h: 7.0, orden: 10 },
  { id: "tienda-butaca-5", zona: "Tienda", numero: "butaca-5", nombre: "Butaca 5", forma: "alargada", capacidad: 4, cliente: true, x: 90.7, y: 67.5, w: 11.3, h: 7.0, orden: 11 },
  { id: "tienda-barra", zona: "Tienda", numero: "barra", nombre: "Barra Tienda", forma: "barra", capacidad: 6, cliente: true, x: 47.0, y: 85.5, w: 52.3, h: 16.0, orden: 12 },
];
function cortoZona(zona) {
  const s = SECTORES.find((x) => x.nombre === zona);
  return s ? s.corto : (zona || "");
}
function idSector(zona) {
  const s = SECTORES.find((x) => x.nombre === zona);
  return s ? s.id : "mesa";
}
function etiquetaMesa(m) {
  if (!m) return "";
  if (m.etiqueta) return m.etiqueta;
  const corto = cortoZona(m.zona);
  const nom = String(m.nombre || m.numero || "").trim();
  if (!nom) return corto || "Mesa";
  if (/^\d+$/.test(nom)) return `${corto} ${nom}`.trim();
  return corto ? `${corto} · ${nom}` : nom;
}
function textoMesaReserva(r) {
  if (r?.mesaEtiqueta) return r.mesaEtiqueta;
  if (r?.mesaId) {
    const m = st.mesas.find((x) => x.id === r.mesaId);
    if (m) return etiquetaMesa(m);
  }
  if (r?.mesaNumero) {
    const c = cortoZona(r.zona);
    return c ? `${c} ${r.mesaNumero}` : `Mesa ${r.mesaNumero}`;
  }
  return "Sin mesa";
}
function zonasActivas() {
  return (Array.isArray(st.config?.zonas) && st.config.zonas.length) ? st.config.zonas : ZONAS;
}

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tzParts = (d = new Date()) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t)?.value;
  return { iso: `${g("year")}-${g("month")}-${g("day")}`, wd: g("weekday") };
};
const hoyISO = () => tzParts().iso;
const proximoSabadoISO = () => {
  // Si hoy es sábado, ese es el servicio. Si no, el próximo sábado.
  let d = new Date();
  for (let i = 0; i < 8; i++) {
    const t = tzParts(d);
    if (t.wd === "Sat") return t.iso;
    d = new Date(d.getTime() + 24 * 3600 * 1000);
  }
  return hoyISO();
};
const isoADateLocal = (iso) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const addDaysISO = (iso, days) => {
  const d = isoADateLocal(iso);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};
const sabadoCercano = (iso, dir) => {
  let d = addDaysISO(iso, dir > 0 ? 1 : -1);
  for (let i = 0; i < 8; i++) {
    if (isoADateLocal(d).getDay() === 6) return d;
    d = addDaysISO(d, dir > 0 ? 1 : -1);
  }
  return iso;
};
const fmtFechaLarga = (iso) => {
  const d = isoADateLocal(iso);
  const s = d.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const nomCanal = (id) => CANALES.find((c) => c.id === id)?.nombre || id || "";
const nomEstado = (id) => ESTADOS.find((e) => e.id === id)?.nombre || id || "";
const horaValida = (h) => {
  const t = String(h || "").trim();
  if (!t) return null; // nunca inventar una hora
  return /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : null;
};

function toast(msg, ms = 2600) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), ms);
}

const st = {
  usuario: localStorage.getItem("resac_usuario") || null,
  uid: null,
  pendientes: 0,
  fecha: proximoSabadoISO(),
  turnoId: TURNO_DEFAULT.id,
  sector: (typeof sessionStorage !== "undefined" && sessionStorage.getItem("resac_sector")) || "Salón Mayoría",
  config: null,
  mesas: [],
  reservas: [],
  editando: false,
  sembrando: false,
  unsub: {},
  sembrado: false,
  configCargado: false,
  mesasCargadas: false,
};

const usuarios = () => {
  const extra = Array.isArray(st.config?.usuarios) ? st.config.usuarios : [];
  return [...new Set([...USUARIOS_BASE, ...extra])].filter(Boolean);
};
const turnos = () => {
  const t = Array.isArray(st.config?.turnos) && st.config.turnos.length ? st.config.turnos : [TURNO_DEFAULT];
  return t;
};
const turnoActual = () => turnos().find((t) => t.id === st.turnoId) || turnos()[0];
const mesasVivas = () => {
  const zi = (z) => { const i = zonasActivas().indexOf(z); return i < 0 ? 99 : i; };
  return st.mesas.filter((m) => !m.deleted).sort((a, b) => {
    const za = zi(a.zona), zb = zi(b.zona);
    if (za !== zb) return za - zb;
    const oa = Number(a.orden), ob = Number(b.orden);
    if (Number.isFinite(oa) && Number.isFinite(ob) && oa !== ob) return oa - ob;
    return etiquetaMesa(a).localeCompare(etiquetaMesa(b), "es");
  });
};

// ---------- Firebase ----------
const app = initializeApp(firebaseConfig, "reservas-carnes");
const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  try { db = initializeFirestore(app, { localCache: memoryLocalCache() }); }
  catch { db = getFirestore(app); }
}
window.__resac = { app, db, auth, st };

function rastrear(p) {
  st.pendientes++; pintarSync();
  return p.catch((e) => { console.error(e); toast("No se pudo guardar: " + (e.code || e.message)); throw e; })
    .finally(() => { st.pendientes--; pintarSync(); });
}
const COLA_KEY = "resac_cola_v1";
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
function escribir(ruta, vivo, respaldo) {
  const marca = aCola(ruta, respaldo);
  return rastrear(setDoc(doc(db, ruta), vivo, { merge: true }).then(() => deCola(ruta, marca), (e) => { if (e && (e.code === "permission-denied" || e.code === "invalid-argument")) deCola(ruta, marca); throw e; }));
}
let reenviando = false;
function reenviarCola() {
  if (!st.uid || !navigator.onLine || reenviando) return;
  const c = leerCola(); const rutas = Object.keys(c); if (!rutas.length) return;
  reenviando = true;
  Promise.allSettled(rutas.map((r) => {
    const { d, m } = c[r];
    return rastrear(setDoc(doc(db, r), { ...hidratar(d), reenviadoLocal: Date.now() }, { merge: true })
      .then(() => deCola(r, m), (e) => { if (e && (e.code === "permission-denied" || e.code === "invalid-argument")) deCola(r, m); throw e; }));
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
  if (u && u.isAnonymous) { signOut(auth).catch(() => {}); return; }
  authListo = true;
  st.uid = u ? u.uid : null; pintarSync();
  router();
  if (st.uid) { escuchar(); reenviarCola(); }
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

function guardarConfig(cambios) {
  const vivo = { ...cambios, updatedAt: serverTimestamp(), por: st.usuario || "" };
  const respaldo = { ...cambios, updatedAt: ST_MARK, por: st.usuario || "" };
  return escribir(PATH_CONFIG, vivo, respaldo);
}
function guardarMesa(mesa, cambios) {
  const id = mesa.id || mesa;
  const vivo = { ...cambios, updatedAt: serverTimestamp(), por: st.usuario || "" };
  const respaldo = { ...cambios, updatedAt: ST_MARK, por: st.usuario || "" };
  return escribir(`${PATH_MESAS}/${id}`, vivo, respaldo);
}
function idReservaNueva() {
  return "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function guardarReserva(id, datos) {
  const vivo = { ...datos, updatedAt: serverTimestamp(), por: st.usuario || "" };
  const respaldo = { ...datos, updatedAt: ST_MARK, por: st.usuario || "" };
  return escribir(`${PATH_RESERVAS}/${id}`, vivo, respaldo);
}

function camposMesaBims(m) {
  return {
    numero: m.numero,
    nombre: m.nombre,
    zona: m.zona,
    capacidad: m.capacidad,
    forma: m.forma,
    x: m.x, y: m.y, w: m.w, h: m.h,
    orden: m.orden,
    cliente: m.cliente !== false,
    habilitada: m.cliente !== false,
    deleted: false,
    mapa: MAPA_VERSION,
    provisorio: false,
  };
}
async function sembrarSiFalta() {
  if (st.sembrando || !st.uid) return;
  if (!st.configCargado || !st.mesasCargadas) return;
  const versionOk = st.config?.mapa_version === MAPA_VERSION;
  const faltan = MESAS_BIMS.filter((m) => !st.mesas.some((x) => x.id === m.id));
  if (versionOk && !faltan.length) { st.sembrado = true; return; }
  st.sembrando = true;
  try {
    if (!versionOk) {
      const idsNuevos = new Set(MESAS_BIMS.map((m) => m.id));
      for (const m of st.mesas) {
        const vieja = m.provisorio === true || /^m\d+$/.test(String(m.id || ""));
        if (!m.deleted && vieja && !idsNuevos.has(m.id)) {
          await guardarMesa(m.id, { deleted: true, retirada_por: "mapa-bims-v3", retiradaLocal: Date.now() });
        }
      }
    }
    for (const m of faltan) {
      await guardarMesa(m.id, camposMesaBims(m));
    }
    if (!st.config || !versionOk) {
      const base = st.config ? {} : { turnos: [TURNO_DEFAULT], usuarios: USUARIOS_BASE, calendar_sync: false };
      await guardarConfig({
        ...base,
        zonas: ZONAS,
        mapa_version: MAPA_VERSION,
        mesas_provisorias: false,
      });
    }
  } catch (e) {
    console.warn("sembrar", e);
  } finally {
    st.sembrando = false;
    st.sembrado = true;
  }
}

function escuchar() {
  Object.values(st.unsub).forEach((fn) => { try { fn(); } catch {} });
  st.unsub = {};
  st.unsub.config = onSnapshot(doc(db, PATH_CONFIG), (snap) => {
    st.config = snap.exists() ? snap.data() : null;
    st.configCargado = true;
    if (st.config && !turnos().some((t) => t.id === st.turnoId)) st.turnoId = turnos()[0].id;
    sembrarSiFalta();
    pintar();
  }, (e) => { console.warn("config", e); toast("No se pudo leer la configuración"); });
  st.unsub.mesas = onSnapshot(collection(db, PATH_MESAS), (snap) => {
    st.mesas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    st.mesasCargadas = true;
    sembrarSiFalta();
    pintar();
  }, (e) => { console.warn("mesas", e); toast("No se pudieron leer las mesas"); });
  escucharReservas();
}
function escucharReservas() {
  if (st.unsub.reservas) { try { st.unsub.reservas(); } catch {} }
  if (!st.uid || !st.fecha) return;
  const q = query(collection(db, PATH_RESERVAS), where("fecha", "==", st.fecha));
  st.unsub.reservas = onSnapshot(q, (snap) => {
    st.reservas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    pintar();
  }, (e) => { console.warn("reservas", e); toast("No se pudieron leer las reservas"); });
}

// ---------- Estado de mesas (derivado de reservas del día/turno) ----------
function reservasDelTurno() {
  const tid = turnoActual().id;
  return st.reservas.filter((r) => (r.turnoId || TURNO_DEFAULT.id) === tid);
}
function reservasActivasEnMesa(mesaId) {
  return reservasDelTurno().filter((r) => r.mesaId === mesaId && r.estado !== "cancelada" && r.estado !== "no_se_presento");
}
function estadoMesa(mesa) {
  if (mesa.habilitada === false) return "deshabilitada";
  const rs = reservasActivasEnMesa(mesa.id);
  if (rs.some((r) => r.estado === "llego")) return "ocupada";
  if (rs.some((r) => r.estado === "confirmada")) return "reservada";
  return "libre";
}
function reservaDeMesa(mesaId) {
  const rs = reservasActivasEnMesa(mesaId);
  return rs.find((r) => r.estado === "llego") || rs.find((r) => r.estado === "confirmada") || rs[0] || null;
}

// ---------- Router / pintado ----------
function router() {
  $$(".view").forEach((v) => v.classList.add("hidden"));
  if (!authListo) return;
  if (!st.uid) { $("#vClave").classList.remove("hidden"); return; }
  if (!st.usuario) { pintarNombres(); $("#vNombre").classList.remove("hidden"); return; }
  $("#vApp").classList.remove("hidden");
  $$(".nomUsuario").forEach((el) => { el.textContent = st.usuario; });
  pintar();
}

function pintarNombres() {
  const box = $("#listaNombres");
  box.innerHTML = usuarios().map((u) => `<button class="btn big" type="button" data-u="${esc(u)}">${esc(u)}</button>`).join("");
}
$("#listaNombres").onclick = (e) => {
  const b = e.target.closest("[data-u]"); if (!b) return;
  elegirNombre(b.dataset.u);
};
$("#formOtroNombre").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const n = String($("#otroNombre").value || "").trim();
  if (!n) { toast("Escribí tu nombre."); return; }
  const lista = usuarios();
  if (!lista.includes(n)) guardarConfig({ usuarios: [...lista, n] });
  elegirNombre(n);
});
function elegirNombre(n) {
  st.usuario = n;
  localStorage.setItem("resac_usuario", n);
  router();
}
$("#btnCambiarNombre").onclick = () => {
  st.usuario = null; localStorage.removeItem("resac_usuario"); router();
};

function pintar() {
  if (!$("#vApp") || $("#vApp").classList.contains("hidden")) return;
  $("#fechaTexto").textContent = fmtFechaLarga(st.fecha);
  $("#fechaInput").value = st.fecha;
  const ts = turnos();
  const sel = $("#selTurno");
  if (sel.innerHTML === "" || sel.dataset.hash !== ts.map((t) => t.id + t.nombre).join("|")) {
    sel.dataset.hash = ts.map((t) => t.id + t.nombre).join("|");
    sel.innerHTML = ts.map((t) => `<option value="${esc(t.id)}">${esc(t.nombre)}</option>`).join("");
  }
  sel.value = turnoActual().id;
  $("#labTurno").classList.toggle("hidden", ts.length <= 1 && !st.editando);
  const aviso = $("#avisoProvisorio");
  if (aviso) aviso.classList.add("hidden");
  $("#panelDia").classList.toggle("hidden", st.editando);
  $("#panelEditar").classList.toggle("hidden", !st.editando);
  if (st.editando) { pintarMapa($("#mapaEditar"), true); pintarTurnosEditar(); }
  else { pintarResumen(); pintarMapa($("#mapaZonas"), false); pintarLista(); }
  const el = $("#versionApp");
  if (el) el.textContent = `App ${APP_VERSION}`;
}

function pintarResumen() {
  const rs = reservasDelTurno();
  const activas = rs.filter((r) => r.estado === "confirmada" || r.estado === "llego");
  const llegaron = rs.filter((r) => r.estado === "llego");
  const noShow = rs.filter((r) => r.estado === "no_se_presento");
  const pers = (arr) => arr.reduce((a, r) => a + (Number(r.personas) || 0), 0);
  const mesas = mesasVivas();
  const libres = mesas.filter((m) => estadoMesa(m) === "libre").length;
  const cap = mesas.filter((m) => m.habilitada !== false).reduce((a, m) => a + (Number(m.capacidad) || 0), 0);
  const t = turnoActual();
  const ventana = t.llegada_desde && t.llegada_hasta ? `Llegada ${t.llegada_desde}–${t.llegada_hasta}` : t.nombre;
  $("#resumen").innerHTML = [
    `<span class="chip">${activas.length} reservas · ${pers(activas)} personas</span>`,
    `<span class="chip">Llegaron ${pers(llegaron)}</span>`,
    noShow.length ? `<span class="chip">${noShow.length} no se presentaron</span>` : "",
    `<span class="chip">${libres} mesas libres · ${cap} lugares</span>`,
    `<span class="chip">${esc(ventana)}</span>`,
  ].filter(Boolean).join("");
}

function sectorActual() {
  const zonas = zonasActivas();
  if (zonas.includes(st.sector)) return st.sector;
  st.sector = zonas[0] || "Salón Mayoría";
  return st.sector;
}
function pintarSectorNav(root) {
  if (!root) return;
  const actual = sectorActual();
  root.innerHTML = zonasActivas().map((z) =>
    `<button type="button" class="sector${z === actual ? " active" : ""}" data-zona="${esc(z)}">${esc(z)}</button>`
  ).join("");
  root.querySelectorAll("[data-zona]").forEach((b) => {
    b.onclick = () => {
      st.sector = b.dataset.zona;
      try { sessionStorage.setItem("resac_sector", st.sector); } catch {}
      pintar();
    };
  });
}
function medidasMapa(zona, availW) {
  const meta = SECTOR_MAPA[zona] || { bw: 800, bh: 400, minRect: 48 };
  const scaleMin = 52 / (meta.minRect || 48);
  const scaleFit = (availW || 320) / meta.bw;
  const scale = scaleFit >= scaleMin ? scaleFit : scaleMin;
  return { w: Math.round(meta.bw * scale), h: Math.round(meta.bh * scale) };
}
function pintarMapa(root, editando) {
  if (!root) return;
  pintarSectorNav(editando ? $("#navSectoresEditar") : $("#navSectores"));
  const zona = sectorActual();
  const mz = mesasVivas().filter((m) => (m.zona || "") === zona);
  const cap = mz.filter((m) => m.habilitada !== false).reduce((a, m) => a + (Number(m.capacidad) || 0), 0);
  const hab = mz.filter((m) => m.habilitada !== false).length;
  root.innerHTML = `<section class="zona" data-zona="${esc(zona)}">
    <h3>${esc(zona)} <span class="cap">${hab} habilitadas · ${cap} pers.</span></h3>
    <div class="zona-mapa-scroll"><div class="zona-mapa" data-zona="${esc(zona)}">${mz.map((m) => htmlMesa(m, editando)).join("")}</div></div>
  </section>`;
  const scroll = root.querySelector(".zona-mapa-scroll");
  const mapa = root.querySelector(".zona-mapa");
  const avail = (scroll && scroll.clientWidth) || root.clientWidth || 320;
  const med = medidasMapa(zona, avail);
  if (mapa) {
    mapa.style.width = med.w + "px";
    mapa.style.height = med.h + "px";
  }
  root.querySelectorAll(".mesa").forEach((el) => engancharMesa(el, editando));
}
function htmlMesa(m, editando) {
  const est = editando ? (m.habilitada === false ? "deshabilitada" : "libre") : estadoMesa(m);
  const r = !editando ? reservaDeMesa(m.id) : null;
  const sub = r ? (r.nombre || "Reserva") : `${m.capacidad || "?"}p`;
  const label = m.nombre || m.numero || "";
  const forma = m.forma || "rect";
  const nocli = m.cliente === false ? " nocli" : "";
  return `<button type="button" class="mesa ${est} ${forma}${editando ? " editando" : ""}${nocli}" data-id="${esc(m.id)}"
    data-w="${Number(m.w) || 10}" data-h="${Number(m.h) || 10}"
    style="left:${Number(m.x) || 50}%;top:${Number(m.y) || 50}%;width:${Number(m.w) || 10}%;height:${Number(m.h) || 10}%"
    aria-label="${esc(etiquetaMesa(m))}">
    <span class="n">${esc(label)}</span>
    <span class="c">${esc(sub)}</span>
  </button>`;
}
function engancharMesa(el, editando) {
  if (!editando) {
    el.addEventListener("click", () => abrirMesa(el.dataset.id));
    return;
  }
  let dragging = false, moved = false, px = 0, py = 0;
  const start = (ev) => {
    ev.preventDefault();
    dragging = true; moved = false;
    const p = ev.touches ? ev.touches[0] : ev;
    px = p.clientX; py = p.clientY;
    el.classList.add("arrastrando");
    el.setPointerCapture?.(ev.pointerId);
  };
  const move = (ev) => {
    if (!dragging) return;
    const p = ev.touches ? ev.touches[0] : ev;
    const mapa = el.parentElement.getBoundingClientRect();
    if (Math.hypot(p.clientX - px, p.clientY - py) > 6) moved = true;
    const wr = Math.max(4, (Number(el.dataset.w) || 10) / 2);
    const hr = Math.max(4, (Number(el.dataset.h) || 10) / 2);
    const x = Math.min(100 - wr, Math.max(wr, ((p.clientX - mapa.left) / mapa.width) * 100));
    const y = Math.min(100 - hr, Math.max(hr, ((p.clientY - mapa.top) / mapa.height) * 100));
    el.style.left = x + "%"; el.style.top = y + "%";
    el.dataset.x = String(Math.round(x * 10) / 10);
    el.dataset.y = String(Math.round(y * 10) / 10);
  };
  const end = () => {
    if (!dragging) return;
    dragging = false; el.classList.remove("arrastrando");
    if (moved) {
      const mesa = st.mesas.find((m) => m.id === el.dataset.id);
      if (mesa) guardarMesa(mesa.id, { x: Number(el.dataset.x), y: Number(el.dataset.y) });
    } else {
      abrirEditarMesa(el.dataset.id);
    }
  };
  el.addEventListener("pointerdown", start);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

function pintarLista() {
  const box = $("#listaReservas");
  const rs = reservasDelTurno().slice().sort((a, b) => {
    const ha = horaValida(a.hora), hb = horaValida(b.hora);
    if (ha && hb && ha !== hb) return ha < hb ? -1 : 1;
    if (ha && !hb) return -1;
    if (!ha && hb) return 1;
    return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
  });
  if (!rs.length) {
    box.innerHTML = `<p class="muted">No hay reservas cargadas para este sábado. Tocá «+ Reserva» o «Ocasional».</p>`;
    return;
  }
  box.innerHTML = rs.map((r) => {
    const hora = horaValida(r.hora) || "Sin hora";
    const mesa = textoMesaReserva(r);
    const zona = (r.zona && !String(mesa).includes(r.zona) && !String(mesa).includes(cortoZona(r.zona))) ? ` · ${r.zona}` : "";
    const canal = nomCanal(r.canal);
    return `<button type="button" class="item ${esc(r.estado || "")}" data-rid="${esc(r.id)}">
      <div class="top"><span class="nom">${esc(r.nombre || "Sin nombre")}${r.ocasional ? '<span class="badge ocasional">Ocasional</span>' : ""} <span class="badge ${esc(r.estado)}">${esc(nomEstado(r.estado))}</span></span><span class="hora">${esc(hora)}</span></div>
      <div class="meta">${esc(String(r.personas || "?"))} pers. · ${esc(mesa)}${esc(zona)}${canal ? " · " + esc(canal) : ""}${r.notas ? " · " + esc(r.notas) : ""}</div>
    </button>`;
  }).join("");
  box.querySelectorAll("[data-rid]").forEach((b) => b.addEventListener("click", () => abrirReserva(b.dataset.rid)));
}

function pintarTurnosEditar() {
  const box = $("#listaTurnos");
  box.innerHTML = turnos().map((t) => `<div class="card"><b>${esc(t.nombre)}</b>
    <div class="muted small">${t.llegada_desde && t.llegada_hasta ? `Llegada ${t.llegada_desde}–${t.llegada_hasta}` : "Sin horario de llegada"}</div>
    ${turnos().length > 1 ? `<button class="btn mini warn" type="button" data-del-turno="${esc(t.id)}">Quitar</button>` : ""}</div>`).join("");
  box.querySelectorAll("[data-del-turno]").forEach((b) => b.onclick = () => {
    const resto = turnos().filter((t) => t.id !== b.dataset.delTurno);
    if (!resto.length) return;
    guardarConfig({ turnos: resto });
    if (st.turnoId === b.dataset.delTurno) st.turnoId = resto[0].id;
  });
}

// ---------- Hojas / formularios ----------
function cerrarSheet() { $("#sheet").classList.add("hidden"); $("#sheetBox").innerHTML = ""; }
function abrirSheet(html) {
  $("#sheetBox").innerHTML = html;
  $("#sheet").classList.remove("hidden");
  const close = $("#sheetBox").querySelector("[data-close]");
  if (close) close.onclick = cerrarSheet;
}
$("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") cerrarSheet(); });

function opcionesMesa(selected, zona) {
  const libres = mesasVivas().filter((m) => m.habilitada !== false);
  const opts = [`<option value="">Sin asignar (se puede después)</option>`];
  let lastZ = null;
  for (const m of libres) {
    if (m.zona && m.zona !== lastZ) {
      if (lastZ) opts.push(`</optgroup>`);
      opts.push(`<optgroup label="${esc(m.zona)}">`);
      lastZ = m.zona;
    }
    const est = estadoMesa(m);
    const marca = est === "libre" ? "libre" : est;
    const sel = m.id === selected ? " selected" : "";
    opts.push(`<option value="${esc(m.id)}"${sel}>${esc(etiquetaMesa(m))} · ${m.capacidad}p (${marca})</option>`);
  }
  if (lastZ) opts.push(`</optgroup>`);
  return opts.join("");
}
function radiosCanal(sel) {
  return `<div class="canales">${CANALES.map((c) => `<button type="button" class="btn${c.id === sel ? " on" : ""}" data-canal="${c.id}">${esc(c.nombre)}</button>`).join("")}</div>`;
}

function formReservaHTML(opts = {}) {
  const r = opts.reserva || {};
  const ocasional = !!opts.ocasional || !!r.ocasional;
  const canal = r.canal || (ocasional ? "sin_reserva" : "whatsapp");
  const hora = horaValida(r.hora) || "";
  const titulo = r.id ? (ocasional ? "Ocasional" : "Reserva") : (ocasional ? "Ocasional" : "Nueva reserva");
  return `<h2>${esc(titulo)}</h2>
    <form id="formReserva" class="stack" autocomplete="off">
      <input type="hidden" id="resId" value="${esc(r.id || "")}">
      <input type="hidden" id="resOcasional" value="${ocasional ? "1" : "0"}">
      <input type="hidden" id="resCanal" value="${esc(canal)}">
      <label>Nombre
        <input id="resNombre" required maxlength="80" value="${esc(r.nombre || (ocasional ? "Ocasional" : ""))}" placeholder="${ocasional ? "Nombre, si lo sabés" : "Nombre"}">
      </label>
      <label>Cantidad de personas
        <input id="resPersonas" required inputmode="numeric" pattern="[0-9]*" value="${esc(r.personas || "")}" placeholder="2">
      </label>
      <label>Hora <span class="muted small">(opcional; si no te dijeron la hora, dejalo vacío)</span>
        <input id="resHora" type="time" value="${esc(hora)}">
      </label>
      <label>Mesa <span class="muted small">(se asigna el mismo día; puede quedar vacía)</span>
        <select id="resMesa">${opcionesMesa(r.mesaId || opts.mesaId || "")}</select>
      </label>
      <label>Sector
        <select id="resZona">
          <option value="">Sin sector</option>
          ${zonasActivas().map((z) => `<option value="${esc(z)}"${(r.zona || opts.zona || "") === z ? " selected" : ""}>${esc(z)}</option>`).join("")}
        </select>
      </label>
      <div><div class="muted small" style="font-weight:700">Canal</div>${radiosCanal(canal)}</div>
      <label>Teléfono <span class="muted small">(opcional)</span>
        <input id="resTel" type="tel" inputmode="tel" maxlength="30" value="${esc(r.telefono || "")}">
      </label>
      <label>Notas
        <textarea id="resNotas" maxlength="400" placeholder="Sin notas">${esc(r.notas || "")}</textarea>
      </label>
      ${r.id ? `<label>Estado
        <select id="resEstado">${ESTADOS.map((e) => `<option value="${e.id}"${r.estado === e.id ? " selected" : ""}>${esc(e.nombre)}</option>`).join("")}</select>
      </label>` : `<input type="hidden" id="resEstado" value="${esc(r.estado || (ocasional ? "llego" : "confirmada"))}">`}
      <div class="row">
        <button type="button" class="btn big" data-close>Cerrar</button>
        <button type="submit" class="btn big primary">Guardar</button>
      </div>
    </form>`;
}

function datosDelFormulario() {
  const nombre = String($("#resNombre").value || "").trim();
  const personas = parseInt(String($("#resPersonas").value || "").trim(), 10);
  const hora = horaValida($("#resHora").value);
  const mesaId = $("#resMesa").value || null;
  const mesa = mesaId ? st.mesas.find((m) => m.id === mesaId) : null;
  let zona = $("#resZona").value || null;
  if (!zona && mesa) zona = mesa.zona || null;
  const canal = $("#resCanal").value || "whatsapp";
  const telefono = String($("#resTel").value || "").trim();
  const notas = String($("#resNotas").value || "").trim();
  const ocasional = $("#resOcasional").value === "1" || canal === "sin_reserva";
  const estado = $("#resEstado").value || (ocasional ? "llego" : "confirmada");
  return {
    nombre, personas, hora, mesaId, mesaNumero: mesa ? String(mesa.numero || mesa.nombre || "") : null, mesaEtiqueta: mesa ? etiquetaMesa(mesa) : null, zona,
    canal, telefono, notas, ocasional, estado,
  };
}

function abrirNueva(opts = {}) {
  abrirSheet(formReservaHTML(opts));
  engancharFormReserva();
}
function engancharFormReserva() {
  const form = $("#formReserva");
  form.querySelectorAll("[data-canal]").forEach((b) => b.onclick = () => {
    form.querySelectorAll("[data-canal]").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    $("#resCanal").value = b.dataset.canal;
    if (b.dataset.canal === "sin_reserva") $("#resOcasional").value = "1";
  });
  $("#resMesa").addEventListener("change", () => {
    const mesa = st.mesas.find((m) => m.id === $("#resMesa").value);
    if (mesa && mesa.zona && !$("#resZona").value) $("#resZona").value = mesa.zona;
  });
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const d = datosDelFormulario();
    if (!d.nombre) { toast("Falta el nombre."); return; }
    if (!d.personas || d.personas < 1) { toast("Indicá la cantidad de personas."); return; }
    const id = $("#resId").value || idReservaNueva();
    const existente = st.reservas.find((r) => r.id === id);
    const payload = {
      fecha: st.fecha,
      turnoId: turnoActual().id,
      nombre: d.nombre,
      personas: d.personas,
      hora: d.hora, // null si no la cargaron; nunca se inventa
      mesaId: d.mesaId,
      mesaNumero: d.mesaNumero,
      mesaEtiqueta: d.mesaEtiqueta,
      zona: d.zona,
      canal: d.canal,
      telefono: d.telefono,
      notas: d.notas,
      estado: d.estado,
      ocasional: d.ocasional,
      calendar_event_id: existente?.calendar_event_id ?? null,
      app: "reservas-ac",
      appVersion: APP_VERSION,
    };
    if (!existente) payload.creadoLocal = Date.now();
    guardarReserva(id, payload).then(() => { toast("Reserva guardada"); cerrarSheet(); });
  });
}

function abrirMesa(mesaId) {
  const mesa = st.mesas.find((m) => m.id === mesaId);
  if (!mesa) return;
  const est = estadoMesa(mesa);
  const r = reservaDeMesa(mesa.id);
  if (r) { abrirReserva(r.id, mesa); return; }
  if (est === "deshabilitada") {
    abrirSheet(`<h2>${esc(etiquetaMesa(mesa))}</h2>
      <p class="muted">Esta mesa está deshabilitada${mesa.cliente === false ? " (en el POS no es una mesa de cliente)" : ""}.</p>
      <div class="stack">
        <button class="btn big primary" type="button" id="btnHab">Habilitar mesa</button>
        <button class="btn big" type="button" data-close>Cerrar</button>
      </div>`);
    $("#btnHab").onclick = () => { guardarMesa(mesa.id, { habilitada: true }); cerrarSheet(); };
    return;
  }
  abrirSheet(`<h2>${esc(etiquetaMesa(mesa))}</h2>
    <p class="muted">${esc(mesa.zona || "")} · ${mesa.capacidad} personas · Libre</p>
    <div class="stack">
      <button class="btn big primary" type="button" id="btnOc">Ocasional en esta mesa</button>
      <button class="btn big" type="button" id="btnRv">Cargar reserva</button>
      <button class="btn big warn" type="button" id="btnDes">Deshabilitar mesa</button>
      <button class="btn big" type="button" data-close>Cerrar</button>
    </div>`);
  $("#btnOc").onclick = () => abrirNueva({ ocasional: true, mesaId: mesa.id, zona: mesa.zona });
  $("#btnRv").onclick = () => abrirNueva({ mesaId: mesa.id, zona: mesa.zona });
  $("#btnDes").onclick = () => { guardarMesa(mesa.id, { habilitada: false }); cerrarSheet(); };
}

function abrirReserva(id) {
  const r = st.reservas.find((x) => x.id === id);
  if (!r) return;
  const mesaTxt = (textoMesaReserva(r) === "Sin mesa") ? "Sin mesa asignada" : textoMesaReserva(r);
  const horaTxt = horaValida(r.hora) || "Sin hora";
  abrirSheet(`<h2>${esc(r.nombre || "Reserva")}</h2>
    <p>${esc(String(r.personas || "?"))} pers. · ${esc(horaTxt)} · ${esc(mesaTxt)}${(r.zona && !String(mesaTxt).includes(r.zona) && !String(mesaTxt).includes(cortoZona(r.zona))) ? " · " + esc(r.zona) : ""}</p>
    <p class="muted small">${esc(nomCanal(r.canal))}${r.telefono ? " · " + esc(r.telefono) : ""}${r.notas ? " · " + esc(r.notas) : ""}</p>
    <p><span class="badge ${esc(r.estado)}">${esc(nomEstado(r.estado))}</span>${r.ocasional ? ' <span class="badge ocasional">Ocasional</span>' : ""}</p>
    <div class="stack">
      ${r.estado === "confirmada" ? `<button class="btn big primary estado" type="button" data-est="llego">Marcar que llegó</button>` : ""}
      ${r.estado === "confirmada" ? `<button class="btn big warn estado" type="button" data-est="no_se_presento">No se presentó</button>` : ""}
      ${r.estado === "llego" && r.mesaId ? `<button class="btn big" type="button" id="btnLiberar">Liberar mesa</button>` : ""}
      ${r.estado !== "cancelada" && r.estado !== "no_se_presento" ? `<button class="btn big warn estado" type="button" data-est="cancelada">Cancelar reserva</button>` : ""}
      ${r.estado === "cancelada" || r.estado === "no_se_presento" ? `<button class="btn big estado" type="button" data-est="confirmada">Volver a confirmada</button>` : ""}
      <button class="btn big" type="button" id="btnEditarRes">Editar datos</button>
      <button class="btn big" type="button" data-close>Cerrar</button>
    </div>
    <p class="muted small">Las reservas no se borran; solo cambia el estado.</p>`);
  $$("[data-est]", $("#sheetBox")).forEach((b) => b.onclick = () => {
    const extra = {};
    if (b.dataset.est === "no_se_presento" || b.dataset.est === "cancelada") {
      // al cancelar o no presentarse, la mesa queda libre
      extra.mesaId = null;
    }
    guardarReserva(r.id, { estado: b.dataset.est, ...extra }).then(() => { toast(nomEstado(b.dataset.est)); cerrarSheet(); });
  });
  const lib = $("#btnLiberar");
  if (lib) lib.onclick = () => {
    guardarReserva(r.id, { mesaId: null, mesaLiberadaLocal: Date.now() }).then(() => { toast("Mesa liberada"); cerrarSheet(); });
  };
  $("#btnEditarRes").onclick = () => abrirNueva({ reserva: r, ocasional: r.ocasional });
}

function abrirEditarMesa(mesaId) {
  const mesa = st.mesas.find((m) => m.id === mesaId);
  if (!mesa) return;
  const zonas = zonasActivas();
  const forma = mesa.forma || "rect";
  abrirSheet(`<h2>${esc(etiquetaMesa(mesa))}</h2>
    <form id="formMesa" class="stack" autocomplete="off">
      <label>Nombre en el mapa
        <input id="mesaNumero" required value="${esc(mesa.nombre || mesa.numero)}" maxlength="40">
      </label>
      <label>Capacidad
        <input id="mesaCap" required inputmode="numeric" pattern="[0-9]*" value="${esc(mesa.capacidad || "")}">
      </label>
      <label>Sector
        <select id="mesaZona">${zonas.map((z) => `<option value="${esc(z)}"${mesa.zona === z ? " selected" : ""}>${esc(z)}</option>`).join("")}</select>
      </label>
      <label>Forma
        <select id="mesaForma">
          <option value="rect"${forma === "rect" ? " selected" : ""}>Rectángulo</option>
          <option value="alargada"${forma === "alargada" ? " selected" : ""}>Alargada</option>
          <option value="barra"${forma === "barra" ? " selected" : ""}>Barra</option>
        </select>
      </label>
      <label class="row" style="align-items:center;font-weight:600">
        <input type="checkbox" id="mesaHab" ${mesa.habilitada === false ? "" : "checked"} style="width:auto"> Habilitada
      </label>
      <label class="row" style="align-items:center;font-weight:600">
        <input type="checkbox" id="mesaCli" ${mesa.cliente === false ? "" : "checked"} style="width:auto"> Es mesa de cliente
      </label>
      ${mesa.cliente === false ? `<p class="muted small">En el POS esto no es una mesa de cliente. Se puede habilitar si hace falta.</p>` : ""}
      <div class="row">
        <button type="button" class="btn big" data-close>Cerrar</button>
        <button type="submit" class="btn big primary">Guardar</button>
      </div>
      <button type="button" class="btn big warn" id="btnBorrarMesa">Quitar mesa del mapa</button>
    </form>`);
  $("#formMesa").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const nombre = String($("#mesaNumero").value || "").trim();
    const capacidad = parseInt($("#mesaCap").value, 10);
    if (!nombre || !capacidad) { toast("Faltan el nombre o la capacidad."); return; }
    const numero = /^\d+$/.test(nombre) ? nombre : (mesa.numero || nombre);
    guardarMesa(mesa.id, {
      numero, nombre, capacidad,
      zona: $("#mesaZona").value,
      forma: $("#mesaForma").value || "rect",
      habilitada: $("#mesaHab").checked,
      cliente: $("#mesaCli").checked,
      deleted: false,
    }).then(() => { toast("Mesa actualizada"); cerrarSheet(); });
  });
  $("#btnBorrarMesa").onclick = () => {
    if (!confirm(`¿Quitamos ${etiquetaMesa(mesa)} del mapa? Las reservas no se borran.`)) return;
    guardarMesa(mesa.id, { deleted: true }).then(() => { toast("Mesa quitada del mapa"); cerrarSheet(); });
  };
}

// ---------- Eventos de la vista ----------
$("#btnSabAnt").onclick = () => { st.fecha = sabadoCercano(st.fecha, -1); escucharReservas(); pintar(); };
$("#btnSabSig").onclick = () => { st.fecha = sabadoCercano(st.fecha, 1); escucharReservas(); pintar(); };
$("#fechaInput").addEventListener("change", () => {
  if ($("#fechaInput").value) { st.fecha = $("#fechaInput").value; escucharReservas(); pintar(); }
});
$("#selTurno").addEventListener("change", () => { st.turnoId = $("#selTurno").value; pintar(); });
$("#btnOcasional").onclick = () => abrirNueva({ ocasional: true });
$("#btnNuevaReserva").onclick = () => abrirNueva({});
$$(".tab").forEach((t) => t.onclick = () => {
  $$(".tab").forEach((x) => x.classList.remove("active"));
  t.classList.add("active");
  $("#tMapa").classList.toggle("hidden", t.dataset.tab !== "tMapa");
  $("#tLista").classList.toggle("hidden", t.dataset.tab !== "tLista");
});
$("#btnEditarSalon").onclick = () => { st.editando = true; pintar(); };
$("#btnSalirEditar").onclick = () => { st.editando = false; pintar(); };
$("#btnAgregarMesa").onclick = () => {
  const zona = sectorActual();
  const delSector = mesasVivas().filter((m) => m.zona === zona);
  const nums = delSector.map((m) => parseInt(m.numero, 10)).filter((n) => Number.isFinite(n));
  const n = String((nums.length ? Math.max(...nums) : 0) + 1);
  const id = idSector(zona) + "-" + Date.now().toString(36);
  guardarMesa(id, {
    numero: n, nombre: n, zona, capacidad: 2, forma: "rect",
    x: 50, y: 50, w: 10, h: 14,
    habilitada: true, cliente: true, deleted: false, provisorio: false, mapa: MAPA_VERSION,
    orden: delSector.length + 1,
  }).then(() => toast(`${cortoZona(zona)} ${n} agregada`));
};
$("#formTurno").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const nombre = String($("#turnoNombre").value || "").trim();
  if (!nombre) return;
  const id = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "turno";
  const nuevo = { id: id + "-" + Math.random().toString(36).slice(2, 5), nombre, llegada_desde: horaValida($("#turnoDesde").value), llegada_hasta: horaValida($("#turnoHasta").value) };
  guardarConfig({ turnos: [...turnos(), nuevo] }).then(() => { $("#formTurno").reset(); toast("Turno agregado"); });
});

pintarSync();
router();
$("#versionApp").textContent = `App ${APP_VERSION}`;

if ("serviceWorker" in navigator) {
  let recargado = false;
  const habiaControlador = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!habiaControlador || recargado || sessionStorage.getItem("resac_recarga") === APP_VERSION) return;
    recargado = true; sessionStorage.setItem("resac_recarga", APP_VERSION);
    location.reload();
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    const buscarActualizacion = () => reg.update().catch(() => {});
    buscarActualizacion();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") buscarActualizacion(); });
    addEventListener("online", buscarActualizacion);
  }).catch((e) => console.warn("sw", e));
}
