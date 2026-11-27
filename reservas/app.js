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

export const APP_VERSION = "v2 (27/11)";
// Misma cuenta compartida del personal que Inventario. No se crean claves nuevas.
const CUENTA_PERSONAL = "personal.inventario@tg-apps-bbde7.firebaseapp.com";
const TZ = "America/Asuncion";
const COL_ROOT = "reservas_carnes";
const PATH_CONFIG = `${COL_ROOT}/config`;
const PATH_MESAS = `${PATH_CONFIG}/mesas`;
const PATH_RESERVAS = `${PATH_CONFIG}/reservas`;

const TURNO_DEFAULT = { id: "sabado-noche", nombre: "Sábado noche", llegada_desde: "20:00", llegada_hasta: "22:00" };
const ZONAS = ["Salón", "Afuera"];
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

// Disposición provisoria: 13 mesas, ~32 personas. Se puede reacomodar en la app.
const MESAS_PROVISORIAS = [
  { id: "m1", numero: "1", zona: "Salón", capacidad: 2, x: 14, y: 28 },
  { id: "m2", numero: "2", zona: "Salón", capacidad: 4, x: 38, y: 28 },
  { id: "m3", numero: "3", zona: "Salón", capacidad: 2, x: 62, y: 28 },
  { id: "m4", numero: "4", zona: "Salón", capacidad: 2, x: 86, y: 28 },
  { id: "m5", numero: "5", zona: "Salón", capacidad: 4, x: 14, y: 70 },
  { id: "m6", numero: "6", zona: "Salón", capacidad: 2, x: 38, y: 70 },
  { id: "m7", numero: "7", zona: "Salón", capacidad: 2, x: 62, y: 70 },
  { id: "m8", numero: "8", zona: "Salón", capacidad: 2, x: 86, y: 70 },
  { id: "m9", numero: "9", zona: "Afuera", capacidad: 2, x: 20, y: 30 },
  { id: "m10", numero: "10", zona: "Afuera", capacidad: 4, x: 50, y: 30 },
  { id: "m11", numero: "11", zona: "Afuera", capacidad: 2, x: 80, y: 30 },
  { id: "m12", numero: "12", zona: "Afuera", capacidad: 2, x: 35, y: 72 },
  { id: "m13", numero: "13", zona: "Afuera", capacidad: 2, x: 65, y: 72 },
];

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
  config: null,
  mesas: [],
  reservas: [],
  editando: false,
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
const mesasVivas = () => st.mesas.filter((m) => !m.deleted).sort((a, b) => Number(a.numero) - Number(b.numero) || String(a.numero).localeCompare(String(b.numero)));

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

async function sembrarSiFalta() {
  if (st.sembrado || !st.uid) return;
  if (!st.configCargado || !st.mesasCargadas) return;
  if (st.config && mesasVivas().length) { st.sembrado = true; return; }
  st.sembrado = true;
  if (!st.config) {
    await guardarConfig({
      turnos: [TURNO_DEFAULT],
      usuarios: USUARIOS_BASE,
      zonas: ZONAS,
      mesas_provisorias: true,
      capacidad_objetivo: 32,
      calendar_sync: false, // v1: no se sincroniza con Google Calendar
    });
  }
  if (!mesasVivas().length) {
    for (const m of MESAS_PROVISORIAS) {
      await guardarMesa(m.id, {
        numero: m.numero, zona: m.zona, capacidad: m.capacidad, x: m.x, y: m.y,
        habilitada: true, deleted: false, provisorio: true,
      });
    }
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
  const prov = st.config?.mesas_provisorias !== false;
  $("#avisoProvisorio").classList.toggle("hidden", !prov || st.editando);
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

function pintarMapa(root, editando) {
  const mesas = mesasVivas();
  const zonas = (Array.isArray(st.config?.zonas) && st.config.zonas.length ? st.config.zonas : ZONAS);
  root.innerHTML = `<div class="zonas">${zonas.map((z) => {
    const mz = mesas.filter((m) => (m.zona || "Salón") === z);
    const cap = mz.filter((m) => m.habilitada !== false).reduce((a, m) => a + (Number(m.capacidad) || 0), 0);
    return `<section class="zona" data-zona="${esc(z)}">
      <h3>${esc(z)} <span class="cap">${mz.length} mesas · ${cap} pers.</span></h3>
      <div class="zona-mapa" data-zona="${esc(z)}">${mz.map((m) => htmlMesa(m, editando)).join("")}</div>
    </section>`;
  }).join("")}</div>`;
  root.querySelectorAll(".mesa").forEach((el) => engancharMesa(el, editando));
}
function htmlMesa(m, editando) {
  const est = editando ? (m.habilitada === false ? "deshabilitada" : "libre") : estadoMesa(m);
  const r = !editando ? reservaDeMesa(m.id) : null;
  const sub = r ? (r.nombre || "Reserva") : `${m.capacidad || "?"}p`;
  return `<button type="button" class="mesa ${est}${editando ? " editando" : ""}" data-id="${esc(m.id)}"
    style="left:${Number(m.x) || 50}%;top:${Number(m.y) || 50}%"
    aria-label="Mesa ${esc(m.numero)}">
    <span class="n">${esc(m.numero)}</span>
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
    const x = Math.min(92, Math.max(8, ((p.clientX - mapa.left) / mapa.width) * 100));
    const y = Math.min(88, Math.max(12, ((p.clientY - mapa.top) / mapa.height) * 100));
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
    const mesa = r.mesaNumero ? `Mesa ${r.mesaNumero}` : "Sin mesa";
    const zona = r.zona ? ` · ${r.zona}` : "";
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
  for (const m of libres) {
    const est = estadoMesa(m);
    const marca = est === "libre" ? "libre" : est;
    const sel = m.id === selected ? " selected" : "";
    opts.push(`<option value="${esc(m.id)}"${sel}>Mesa ${esc(m.numero)} · ${esc(m.zona)} · ${m.capacidad}p (${marca})</option>`);
  }
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
      <label>Zona
        <select id="resZona">
          <option value="">Sin zona</option>
          ${ZONAS.map((z) => `<option value="${esc(z)}"${(r.zona || opts.zona || "") === z ? " selected" : ""}>${esc(z)}</option>`).join("")}
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
    nombre, personas, hora, mesaId, mesaNumero: mesa ? String(mesa.numero) : null, zona,
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
    abrirSheet(`<h2>Mesa ${esc(mesa.numero)}</h2>
      <p class="muted">Esta mesa está deshabilitada.</p>
      <div class="stack">
        <button class="btn big primary" type="button" id="btnHab">Habilitar mesa</button>
        <button class="btn big" type="button" data-close>Cerrar</button>
      </div>`);
    $("#btnHab").onclick = () => { guardarMesa(mesa.id, { habilitada: true }); cerrarSheet(); };
    return;
  }
  abrirSheet(`<h2>Mesa ${esc(mesa.numero)} · ${esc(mesa.zona)}</h2>
    <p class="muted">${mesa.capacidad} personas · Libre</p>
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
  const mesaTxt = r.mesaNumero ? `Mesa ${r.mesaNumero}` : "Sin mesa asignada";
  const horaTxt = horaValida(r.hora) || "Sin hora";
  abrirSheet(`<h2>${esc(r.nombre || "Reserva")}</h2>
    <p>${esc(String(r.personas || "?"))} pers. · ${esc(horaTxt)} · ${esc(mesaTxt)}${r.zona ? " · " + esc(r.zona) : ""}</p>
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
  abrirSheet(`<h2>Editar mesa</h2>
    <form id="formMesa" class="stack" autocomplete="off">
      <label>Número (igual al QR del Waiter)
        <input id="mesaNumero" required value="${esc(mesa.numero)}" maxlength="12">
      </label>
      <label>Capacidad
        <input id="mesaCap" required inputmode="numeric" pattern="[0-9]*" value="${esc(mesa.capacidad || "")}">
      </label>
      <label>Zona
        <select id="mesaZona">${ZONAS.map((z) => `<option${mesa.zona === z ? " selected" : ""}>${esc(z)}</option>`).join("")}</select>
      </label>
      <label class="row" style="align-items:center;font-weight:600">
        <input type="checkbox" id="mesaHab" ${mesa.habilitada === false ? "" : "checked"} style="width:auto"> Habilitada
      </label>
      <div class="row">
        <button type="button" class="btn big" data-close>Cerrar</button>
        <button type="submit" class="btn big primary">Guardar</button>
      </div>
      <button type="button" class="btn big warn" id="btnBorrarMesa">Quitar mesa del mapa</button>
    </form>`);
  $("#formMesa").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const numero = String($("#mesaNumero").value || "").trim();
    const capacidad = parseInt($("#mesaCap").value, 10);
    if (!numero || !capacidad) { toast("Faltan el número o la capacidad."); return; }
    guardarMesa(mesa.id, { numero, capacidad, zona: $("#mesaZona").value, habilitada: $("#mesaHab").checked, deleted: false })
      .then(() => { toast("Mesa actualizada"); cerrarSheet(); });
  });
  $("#btnBorrarMesa").onclick = () => {
    if (!confirm(`¿Quitamos la mesa ${mesa.numero} del mapa? Las reservas no se borran.`)) return;
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
  const nums = mesasVivas().map((m) => parseInt(m.numero, 10)).filter((n) => Number.isFinite(n));
  const n = String((nums.length ? Math.max(...nums) : 0) + 1);
  const id = "m" + Date.now().toString(36);
  guardarMesa(id, { numero: n, zona: "Salón", capacidad: 2, x: 50, y: 50, habilitada: true, deleted: false, provisorio: false })
    .then(() => toast(`Mesa ${n} agregada`));
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
