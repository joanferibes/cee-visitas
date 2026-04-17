/* ============================================================================
 * CEE VISITAS · PWA v5
 * Joanfe Ribes Oficina Tècnica
 * ---------------------------------------------------------------------------
 * Arquitectura:
 *   - IndexedDB = caché local (funciona offline)
 *   - Google Sheets (vía Apps Script) = fuente de verdad compartida
 *   - Comunicación = JSONP (evita CORS de Apps Script)
 *   - Sincronización = automática al abrir + botón manual
 * ========================================================================= */
(function(){
"use strict";

// ============================================================================
// CONFIGURACIÓN POR DEFECTO
// ============================================================================
const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwPku0mbVvbmkk1j0oSi5gi2picbTmhADFwlJYE2CjCRK5hDmLMc_fW7Jodd3sNPwnPWQ/exec";

const MUNIS = [
  "", "Pedreguer","Dénia","Ondara","Xàbia","Teulada","Gata de Gorgos",
  "El Verger","Benitatxell","Els Poblets","Benissa","Calp","Moraira",
  "Jesús Pobre","Orba","Parcent","Senija","Lliber","Otro"
];

// ============================================================================
// INDEXEDDB
// ============================================================================
const DB_NAME = "cee_visitas_v5";
const DB_VER = 1;

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("expedientes")) {
        db.createObjectStore("expedientes", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("config")) {
        db.createObjectStore("config", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(store){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, "readonly").objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

async function dbGet(store, key){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, "readonly").objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

async function dbPut(store, obj){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(obj);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(store, key){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbClear(store){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================================
// JSONP — comunicación con Apps Script evitando CORS
// ============================================================================
let _jsonpCounter = 0;
function jsonp(url, params, timeoutMs){
  timeoutMs = timeoutMs || 25000;
  return new Promise((resolve, reject) => {
    const cbName = "_gasCb_" + (Date.now()) + "_" + (++_jsonpCounter);
    const qs = Object.keys(params || {}).map(k =>
      encodeURIComponent(k) + "=" + encodeURIComponent(params[k])
    ).join("&");
    const fullUrl = url + (url.indexOf("?") > -1 ? "&" : "?")
      + qs + (qs ? "&" : "") + "callback=" + cbName;

    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Tiempo de espera agotado"));
    }, timeoutMs);

    function cleanup(){
      clearTimeout(timer);
      try { delete window[cbName]; } catch(e) { window[cbName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = function(data){
      cleanup();
      resolve(data);
    };
    script.onerror = function(){
      cleanup();
      reject(new Error("Error de red al llamar al Apps Script"));
    };
    script.src = fullUrl;
    document.head.appendChild(script);
  });
}

// ============================================================================
// BACKEND (Apps Script) — wrappers concretos
// ============================================================================
async function backendUrl(){
  const cfg = await getCfg();
  return cfg.scriptUrl || DEFAULT_SCRIPT_URL;
}

async function apiStatus(){
  return jsonp(await backendUrl(), { action: "status" }, 10000);
}

async function apiListarSolicitudes(){
  return jsonp(await backendUrl(), { action: "listar" });
}

async function apiDetalleSolicitud(id){
  return jsonp(await backendUrl(), { action: "detalle", id });
}

async function apiActualizarEstadoSolicitud(id, estado){
  return jsonp(await backendUrl(), { action: "actualizar_estado", id, estado });
}

async function apiListarExpedientes(since){
  return jsonp(await backendUrl(), { action: "listar_exp", since: since || "" });
}

async function apiGuardarExpediente(id, datos, estado){
  // Codificar datos en base64 para evitar problemas con caracteres especiales
  // y fotos (que están como dataURL) en URL larga
  const json = JSON.stringify(datos);
  const datosB64 = btoa(unescape(encodeURIComponent(json)));
  return jsonp(await backendUrl(), {
    action: "guardar_exp",
    id: id,
    datos: datosB64,
    estado: estado || "pendiente"
  }, 40000);
}

async function apiBorrarExpediente(id){
  return jsonp(await backendUrl(), { action: "borrar_exp", id });
}

// ============================================================================
// CONFIGURACIÓN LOCAL
// ============================================================================
async function getCfg(){
  const cfg = await dbGet("config", "main");
  return cfg || {
    key: "main",
    scriptUrl: DEFAULT_SCRIPT_URL,
    emailColab: "",
    firma: "Un saludo,\n\nJuan Felipe Ribes Aranda\nArquitecto Técnico · col. 3.184\nJoanfe Ribes Oficina Tècnica\nTel. 605 875 899\nadministracion@joanferibes.com",
    lastSync: ""
  };
}

async function saveCfg(cfg){
  cfg.key = "main";
  await dbPut("config", cfg);
}

// ============================================================================
// ESTADO DE LA APP
// ============================================================================
const state = {
  currentTab: "pendiente",
  expCurrent: null,  // expediente que se está editando
  online: navigator.onLine
};

// ============================================================================
// HELPERS DOM
// ============================================================================
const $ = (id) => document.getElementById(id);
const byClass = (root, sel) => root.querySelectorAll(sel);

function go(screenId){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const t = $("screen-" + screenId);
  if (t) t.classList.add("active");
  window.scrollTo(0,0);
}

function toast(msg, ms){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), ms || 2500);
}

function showSync(msg){
  const bar = $("sync-bar");
  $("sync-text").textContent = msg;
  bar.classList.add("visible");
}

function hideSync(){
  $("sync-bar").classList.remove("visible");
}

function setStatus(online){
  state.online = online;
  const dot = $("status-dot");
  const txt = $("status-text");
  if (online) {
    dot.className = "dot on";
    txt.textContent = "Online";
  } else {
    dot.className = "dot off";
    txt.textContent = "Offline";
  }
}

// ============================================================================
// EXPEDIENTES — CRUD local + push al backend
// ============================================================================
function nuevoExpedienteVacio(){
  return {
    id: "exp_" + Date.now() + "_" + Math.random().toString(36).slice(2,7),
    origen: "manual",
    fechaCreacion: new Date().toISOString(),
    fechaActualizacion: new Date().toISOString(),
    estado: "pendiente",
    solicitudId: "",
    datos: {
      nombre: "", tipoDocumento: "DNI", numeroDocumento: "",
      telefono: "", email: "",
      direccion: "", municipio: "", codigoPostal: "",
      referenciaCatastral: "",
      fechaVisita: "", observaciones: ""
    },
    checklist: {
      envolvente: "",
      calefSistema: "", calefPct: "",
      refriSistema: "", refriPct: "",
      acs: "",
      renTipo: "", renKw: "",
      observaciones: ""
    },
    fotos: { fachada: "", croq1: "", croq2: "" },
    pendienteSync: false
  };
}

async function guardarExpedienteLocal(exp){
  exp.fechaActualizacion = new Date().toISOString();
  exp.pendienteSync = true;
  await dbPut("expedientes", exp);
}

async function pushExpediente(exp){
  try {
    const res = await apiGuardarExpediente(exp.id, {
      origen: exp.origen,
      fechaCreacion: exp.fechaCreacion,
      solicitudId: exp.solicitudId,
      datos: exp.datos,
      checklist: exp.checklist,
      // No subimos las fotos a Sheets (demasiado grandes). Se quedan en local
      // y se adjuntan al email cuando se envía al colaborador.
    }, exp.estado);
    if (res && res.status === "ok") {
      exp.pendienteSync = false;
      exp.fechaActualizacion = res.fechaActualizacion || exp.fechaActualizacion;
      await dbPut("expedientes", exp);
      return true;
    }
    return false;
  } catch(e) {
    console.warn("push fallido:", e);
    return false;
  }
}

// ============================================================================
// SINCRONIZACIÓN
// ============================================================================
async function sincronizar(){
  showSync("Sincronizando…");
  try {
    // 1) Subir cambios locales pendientes
    const todos = await dbGetAll("expedientes");
    const pendientes = todos.filter(e => e.pendienteSync);
    let pushedOk = 0, pushedFail = 0;
    for (const exp of pendientes) {
      const ok = await pushExpediente(exp);
      if (ok) pushedOk++; else pushedFail++;
    }

    // 2) Descargar cambios del servidor
    const res = await apiListarExpedientes("");
    let pulled = 0;
    if (res && res.status === "ok" && Array.isArray(res.expedientes)) {
      for (const remoto of res.expedientes) {
        const local = await dbGet("expedientes", remoto.id);
        if (!local) {
          // Nuevo: crear en local (sin fotos, que se quedan donde se crearon)
          const exp = nuevoExpedienteVacio();
          exp.id = remoto.id;
          exp.fechaActualizacion = remoto.fechaActualizacion || exp.fechaActualizacion;
          exp.estado = remoto.estado || "pendiente";
          if (remoto.datos) {
            if (remoto.datos.datos) exp.datos = Object.assign(exp.datos, remoto.datos.datos);
            if (remoto.datos.checklist) exp.checklist = Object.assign(exp.checklist, remoto.datos.checklist);
            if (remoto.datos.origen) exp.origen = remoto.datos.origen;
            if (remoto.datos.solicitudId) exp.solicitudId = remoto.datos.solicitudId;
            if (remoto.datos.fechaCreacion) exp.fechaCreacion = remoto.datos.fechaCreacion;
          }
          exp.pendienteSync = false;
          await dbPut("expedientes", exp);
          pulled++;
        } else if (!local.pendienteSync) {
          // Comparar fechas: si el remoto es más reciente, sobrescribir
          const remotoFecha = new Date(remoto.fechaActualizacion || 0).getTime();
          const localFecha = new Date(local.fechaActualizacion || 0).getTime();
          if (remotoFecha > localFecha) {
            local.fechaActualizacion = remoto.fechaActualizacion;
            local.estado = remoto.estado || local.estado;
            if (remoto.datos) {
              if (remoto.datos.datos) local.datos = Object.assign(local.datos, remoto.datos.datos);
              if (remoto.datos.checklist) local.checklist = Object.assign(local.checklist, remoto.datos.checklist);
            }
            await dbPut("expedientes", local);
            pulled++;
          }
        }
      }
    }

    // 3) Actualizar última sincronización
    const cfg = await getCfg();
    cfg.lastSync = new Date().toISOString();
    await saveCfg(cfg);

    setStatus(true);
    hideSync();
    renderHome();

    const msg = `↑${pushedOk} ↓${pulled}` + (pushedFail ? ` · ${pushedFail} fallo(s)` : "");
    toast("Sincronizado · " + msg);
    return true;
  } catch(e) {
    console.warn("Error sync:", e);
    setStatus(false);
    hideSync();
    toast("Sin conexión — datos guardados en local");
    return false;
  }
}

// ============================================================================
// RENDER HOME
// ============================================================================
async function renderHome(){
  const exps = await dbGetAll("expedientes");
  const pend = exps.filter(e => e.estado === "pendiente");
  const vis  = exps.filter(e => e.estado === "visitado");
  const env  = exps.filter(e => e.estado === "enviado");

  $("cnt-pend").textContent = pend.length;
  $("cnt-vis").textContent = vis.length;
  $("cnt-env").textContent = env.length;

  const tab = state.currentTab;
  const list = tab === "pendiente" ? pend : (tab === "visitado" ? vis : env);
  list.sort((a,b) => new Date(b.fechaActualizacion||0) - new Date(a.fechaActualizacion||0));

  const cont = $("list-exps");
  cont.innerHTML = "";

  if (list.length === 0) {
    $("empty-list").style.display = "block";
    return;
  }
  $("empty-list").style.display = "none";

  for (const exp of list) {
    const badge = exp.estado === "pendiente" ? "pend"
                : exp.estado === "visitado" ? "vis" : "env";
    const dir = exp.datos.direccion || "(sin dirección)";
    const muni = exp.datos.municipio ? ", " + exp.datos.municipio : "";
    const nombre = exp.datos.nombre || "(sin nombre)";
    const fechaStr = exp.datos.fechaVisita
      ? "Visita: " + exp.datos.fechaVisita
      : ("Últ. mod: " + formatFecha(exp.fechaActualizacion));
    const pendSync = exp.pendienteSync ? " · ↑ pendiente" : "";

    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div class="li-title">${escape(dir)}${escape(muni)}</div>
      <div class="li-sub">${escape(nombre)}</div>
      <div class="li-meta">
        <span>${escape(fechaStr)}${escape(pendSync)}</span>
        <span class="badge ${badge}">${escape(exp.estado)}</span>
      </div>
    `;
    item.onclick = () => abrirExpediente(exp.id);
    cont.appendChild(item);
  }
}

function escape(s){
  return String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function formatFecha(iso){
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES") + " " + d.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"});
  } catch(e) { return "—"; }
}

// ============================================================================
// ABRIR EXPEDIENTE
// ============================================================================
async function abrirExpediente(id){
  const exp = await dbGet("expedientes", id);
  if (!exp) { toast("Expediente no encontrado"); return; }
  state.expCurrent = exp;
  rellenarFormDatos(exp);
  rellenarChecklist(exp);
  $("datos-title").textContent = exp.datos.direccion || "Expediente";
  go("datos");
}

// ============================================================================
// IMPORTAR DESDE FORMULARIO WEB
// ============================================================================
async function mostrarImportar(){
  go("importar");
  await cargarSolicitudes();
}

async function cargarSolicitudes(){
  const cont = $("list-solicitudes");
  cont.innerHTML = "<p class='muted'>Cargando…</p>";
  $("empty-sol").style.display = "none";

  try {
    const res = await apiListarSolicitudes();
    cont.innerHTML = "";
    if (!res || res.status !== "ok") {
      cont.innerHTML = "<p class='muted'>Error: " + escape(res && res.message || "desconocido") + "</p>";
      return;
    }
    const sols = res.solicitudes || [];
    if (sols.length === 0) {
      $("empty-sol").style.display = "block";
      return;
    }
    for (const s of sols) {
      const item = document.createElement("div");
      item.className = "list-item";
      const dir = s.direccion || "(sin dirección)";
      const muni = s.municipio ? ", " + s.municipio : "";
      item.innerHTML = `
        <div class="li-title">${escape(dir)}${escape(muni)}</div>
        <div class="li-sub">${escape(s.nombre || "")}</div>
        <div class="li-meta">
          <span>${escape(s.fecha || "")}</span>
          <span class="badge ${s.estado === "visitado" ? "vis" : "pend"}">${escape(s.estado || "pendiente")}</span>
        </div>
      `;
      item.onclick = () => importarSolicitud(s.id);
      cont.appendChild(item);
    }
  } catch(e) {
    cont.innerHTML = "<p class='muted'>No se pudo conectar: " + escape(e.message) + "</p>";
  }
}

async function importarSolicitud(id){
  toast("Importando solicitud…");
  try {
    const res = await apiDetalleSolicitud(id);
    if (!res || res.status !== "ok" || !res.solicitud) {
      toast("No se pudo cargar la solicitud");
      return;
    }
    const s = res.solicitud;

    // Comprobar si ya existe un expediente para esta solicitud
    const todos = await dbGetAll("expedientes");
    let exp = todos.find(e => e.solicitudId === String(id));
    if (!exp) {
      exp = nuevoExpedienteVacio();
      exp.origen = "formulario";
      exp.solicitudId = String(id);
    }
    exp.datos.nombre = s.nombre || "";
    exp.datos.tipoDocumento = s.tipoDocumento || "DNI";
    exp.datos.numeroDocumento = s.numeroDocumento || "";
    exp.datos.telefono = s.telefono || "";
    exp.datos.email = s.email || "";
    exp.datos.direccion = s.direccion || "";
    exp.datos.municipio = matchMuni(s.municipio);
    exp.datos.codigoPostal = s.codigoPostal || "";
    exp.datos.referenciaCatastral = s.referenciaCatastral || "";
    exp.datos.fechaVisita = normalizarFecha(s.fechaVisita);
    exp.datos.observaciones = s.observaciones || "";

    await guardarExpedienteLocal(exp);
    state.expCurrent = exp;

    // Intentar push inmediato
    pushExpediente(exp).catch(()=>{});

    rellenarFormDatos(exp);
    rellenarChecklist(exp);
    $("datos-title").textContent = exp.datos.direccion || "Expediente importado";
    go("datos");
    toast("Solicitud importada ✓");
  } catch(e) {
    toast("Error al importar: " + e.message);
  }
}

function matchMuni(m){
  if (!m) return "";
  const target = String(m).trim().toLowerCase();
  for (const opt of MUNIS) {
    if (opt.toLowerCase() === target) return opt;
  }
  return "Otro";
}

function normalizarFecha(f){
  if (!f) return "";
  try {
    if (/^\d{4}-\d{2}-\d{2}/.test(f)) return f.slice(0,10);
    const d = new Date(f);
    if (!isNaN(d)) return d.toISOString().slice(0,10);
  } catch(e){}
  return "";
}

// ============================================================================
// FORMULARIO DATOS
// ============================================================================
function rellenarFormDatos(exp){
  const d = exp.datos;
  $("f-nombre").value = d.nombre || "";
  $("f-tipodoc").value = d.tipoDocumento || "DNI";
  $("f-numdoc").value = d.numeroDocumento || "";
  $("f-tel").value = d.telefono || "";
  $("f-email").value = d.email || "";
  $("f-direccion").value = d.direccion || "";

  // Poblar municipios
  const sel = $("f-muni");
  sel.innerHTML = MUNIS.map(m => `<option value="${escape(m)}"${m===d.municipio?" selected":""}>${escape(m||"—")}</option>`).join("");

  $("f-cp").value = d.codigoPostal || "";
  $("f-refcat").value = d.referenciaCatastral || "";
  $("f-fechavisita").value = d.fechaVisita || "";
  $("f-obs").value = d.observaciones || "";
}

function leerFormDatos(exp){
  exp.datos.nombre = $("f-nombre").value.trim();
  exp.datos.tipoDocumento = $("f-tipodoc").value;
  exp.datos.numeroDocumento = $("f-numdoc").value.trim();
  exp.datos.telefono = $("f-tel").value.trim();
  exp.datos.email = $("f-email").value.trim();
  exp.datos.direccion = $("f-direccion").value.trim();
  exp.datos.municipio = $("f-muni").value;
  exp.datos.codigoPostal = $("f-cp").value.trim();
  exp.datos.referenciaCatastral = $("f-refcat").value.trim();
  exp.datos.fechaVisita = $("f-fechavisita").value;
  exp.datos.observaciones = $("f-obs").value.trim();
}

// ============================================================================
// CHECKLIST
// ============================================================================
function rellenarChecklist(exp){
  const c = exp.checklist;
  $("c-envolvente").value = c.envolvente || "";
  $("c-calef-sis").value = c.calefSistema || "";
  $("c-calef-pct").value = c.calefPct || "";
  $("c-refri-sis").value = c.refriSistema || "";
  $("c-refri-pct").value = c.refriPct || "";
  $("c-acs").value = c.acs || "";
  $("c-ren-tipo").value = c.renTipo || "";
  $("c-ren-kw").value = c.renKw || "";
  $("c-obs").value = c.observaciones || "";

  // Fotos
  if (exp.fotos.fachada) {
    $("fachada-preview").src = exp.fotos.fachada;
    $("fachada-preview").style.display = "block";
    $("fachada-info").textContent = "Guardada";
  } else {
    $("fachada-preview").style.display = "none";
    $("fachada-info").textContent = "—";
  }
  if (exp.fotos.croq1) {
    $("croq1-preview").src = exp.fotos.croq1;
    $("croq1-preview").style.display = "block";
    $("croq1-info").textContent = "Guardado";
  } else {
    $("croq1-preview").style.display = "none";
    $("croq1-info").textContent = "—";
  }
  if (exp.fotos.croq2) {
    $("croq2-preview").src = exp.fotos.croq2;
    $("croq2-preview").style.display = "block";
    $("croq2-info").textContent = "Guardado";
  } else {
    $("croq2-preview").style.display = "none";
    $("croq2-info").textContent = "—";
  }
}

function leerChecklist(exp){
  const c = exp.checklist;
  c.envolvente = $("c-envolvente").value.trim();
  c.calefSistema = $("c-calef-sis").value;
  c.calefPct = $("c-calef-pct").value;
  c.refriSistema = $("c-refri-sis").value;
  c.refriPct = $("c-refri-pct").value;
  c.acs = $("c-acs").value;
  c.renTipo = $("c-ren-tipo").value;
  c.renKw = $("c-ren-kw").value;
  c.observaciones = $("c-obs").value.trim();
}

// ============================================================================
// FOTOS
// ============================================================================
function setupFotoInput(btnId, inputId, key){
  $(btnId).onclick = () => $(inputId).click();
  $(inputId).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await redimensionar(file, 1600, 0.85);
    if (!state.expCurrent) return;
    state.expCurrent.fotos[key] = dataUrl;
    rellenarChecklist(state.expCurrent);
    toast("Imagen guardada");
  };
}

function redimensionar(file, maxDim, quality){
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = h * maxDim / w; w = maxDim; }
        else if (h > maxDim) { w = w * maxDim / h; h = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// EMAIL AL COLABORADOR
// ============================================================================
async function abrirPantallaEmail(){
  if (!state.expCurrent) return;
  const exp = state.expCurrent;
  const cfg = await getCfg();

  $("e-to").value = cfg.emailColab || "";
  const dir = exp.datos.direccion || "";
  $("e-asunto").value = "CEE · Datos de visita · " + dir;

  const c = exp.checklist;
  const cuerpo =
`Hola,

Adjunto los datos de la visita para el certificado energético:

DATOS DEL INMUEBLE
- Cliente: ${exp.datos.nombre}
- Dirección: ${exp.datos.direccion}
- Municipio: ${exp.datos.municipio} (CP ${exp.datos.codigoPostal})
- Ref. catastral: ${exp.datos.referenciaCatastral}
- Fecha de visita: ${exp.datos.fechaVisita}

CHECKLIST
- Envolvente: ${c.envolvente || "—"}
- Calefacción: ${c.calefSistema || "—"} (${c.calefPct || 0}% vivienda)
- Refrigeración: ${c.refriSistema || "—"} (${c.refriPct || 0}% vivienda)
- ACS: ${c.acs || "—"}
- Renovables: ${c.renTipo || "—"}${c.renKw ? " (" + c.renKw + " kW)" : ""}
- Observaciones: ${c.observaciones || "—"}

${cfg.firma || ""}`;

  $("e-body").value = cuerpo;
  go("email");
}

async function enviarEmail(){
  if (!state.expCurrent) return;
  const to = $("e-to").value.trim();
  const asunto = $("e-asunto").value.trim();
  const body = $("e-body").value;
  if (!to) { toast("Falta destinatario"); return; }

  // Abrir cliente de correo
  const mailto = "mailto:" + encodeURIComponent(to)
    + "?subject=" + encodeURIComponent(asunto)
    + "&body=" + encodeURIComponent(body);
  window.location.href = mailto;

  // Marcar como enviado
  state.expCurrent.estado = "enviado";
  await guardarExpedienteLocal(state.expCurrent);
  pushExpediente(state.expCurrent).catch(()=>{});

  // Actualizar también solicitud origen si viene del formulario
  if (state.expCurrent.solicitudId) {
    apiActualizarEstadoSolicitud(state.expCurrent.solicitudId, "enviado").catch(()=>{});
  }

  toast("Email abierto · expediente marcado como enviado");
}

// ============================================================================
// CONFIGURACIÓN UI
// ============================================================================
async function cargarCfgUI(){
  const cfg = await getCfg();
  $("cfg-url").value = cfg.scriptUrl || DEFAULT_SCRIPT_URL;
  $("cfg-colab").value = cfg.emailColab || "";
  $("cfg-firma").value = cfg.firma || "";
  $("sync-info").textContent = cfg.lastSync
    ? "Última sincronización: " + formatFecha(cfg.lastSync)
    : "Sin sincronizar todavía";
}

async function guardarCfgUI(){
  const cfg = await getCfg();
  cfg.scriptUrl = $("cfg-url").value.trim() || DEFAULT_SCRIPT_URL;
  cfg.emailColab = $("cfg-colab").value.trim();
  cfg.firma = $("cfg-firma").value;
  await saveCfg(cfg);
  toast("Configuración guardada");
}

async function testConexion(){
  showSync("Probando conexión…");
  try {
    const res = await apiStatus();
    hideSync();
    if (res && res.status === "ok") {
      setStatus(true);
      toast("✓ Conectado · " + (res.service || "OK") + " v" + (res.version || "?"));
    } else {
      toast("Respuesta inesperada: " + JSON.stringify(res));
    }
  } catch(e) {
    hideSync();
    setStatus(false);
    toast("Sin conexión: " + e.message);
  }
}

// ============================================================================
// INICIALIZACIÓN Y EVENTOS
// ============================================================================
async function init(){
  // Service worker
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("sw.js?v=5"); } catch(e) {}
  }

  // Volver atrás
  document.querySelectorAll("[data-go]").forEach(btn => {
    btn.onclick = () => go(btn.getAttribute("data-go"));
  });

  // Tabs home
  document.querySelectorAll(".tab").forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      state.currentTab = tab.getAttribute("data-tab");
      renderHome();
    };
  });

  // Botones home
  $("btn-nuevo").onclick = () => go("nuevo");
  $("btn-sync").onclick = () => sincronizar();
  $("btn-cfg").onclick = async () => { await cargarCfgUI(); go("cfg"); };

  // Nuevo expediente
  $("btn-origen-web").onclick = () => mostrarImportar();
  $("btn-origen-manual").onclick = () => {
    state.expCurrent = nuevoExpedienteVacio();
    rellenarFormDatos(state.expCurrent);
    rellenarChecklist(state.expCurrent);
    $("datos-title").textContent = "Nuevo expediente";
    go("datos");
  };

  // Importar
  $("btn-importar-reload").onclick = () => cargarSolicitudes();

  // Datos → Checklist
  $("btn-ir-checklist").onclick = async () => {
    if (!state.expCurrent) return;
    leerFormDatos(state.expCurrent);
    await guardarExpedienteLocal(state.expCurrent);
    pushExpediente(state.expCurrent).catch(()=>{});
    go("checklist");
  };

  // Checklist → Guardar
  $("btn-guardar").onclick = async () => {
    if (!state.expCurrent) return;
    leerChecklist(state.expCurrent);
    state.expCurrent.estado = state.expCurrent.estado === "enviado" ? "enviado" : "visitado";
    await guardarExpedienteLocal(state.expCurrent);
    const ok = await pushExpediente(state.expCurrent);
    toast(ok ? "Guardado y sincronizado ✓" : "Guardado en local (pendiente de subir)");
    renderHome();
    go("home");
  };

  // Checklist → Enviar
  $("btn-enviar").onclick = async () => {
    if (!state.expCurrent) return;
    leerChecklist(state.expCurrent);
    await guardarExpedienteLocal(state.expCurrent);
    await abrirPantallaEmail();
  };

  // Email
  $("btn-email-send").onclick = () => enviarEmail();

  // Fotos
  setupFotoInput("btn-foto-fachada", "inp-fachada", "fachada");
  setupFotoInput("btn-croquis-1", "inp-croq1", "croq1");
  setupFotoInput("btn-croquis-2", "inp-croq2", "croq2");

  // Config
  $("btn-save-cfg").onclick = () => guardarCfgUI();
  $("btn-sync-now").onclick = () => sincronizar();
  $("btn-test-conn").onclick = () => testConexion();
  $("btn-reset-local").onclick = async () => {
    if (!confirm("¿Seguro que quieres borrar todos los datos locales? Los expedientes en el servidor no se tocarán.")) return;
    await dbClear("expedientes");
    toast("Datos locales borrados");
    renderHome();
  };

  // Online/offline
  window.addEventListener("online", () => { setStatus(true); sincronizar(); });
  window.addEventListener("offline", () => setStatus(false));
  setStatus(navigator.onLine);

  // Render inicial
  await renderHome();

  // Si viene con ?id=... importa esa solicitud directamente
  const params = new URLSearchParams(location.search);
  const idParam = params.get("id");
  if (idParam) {
    await mostrarImportar();
    await importarSolicitud(idParam);
  }

  // Sincronización inicial en segundo plano
  if (navigator.onLine) {
    setTimeout(() => sincronizar(), 500);
  }
}

document.addEventListener("DOMContentLoaded", init);

})();
