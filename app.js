/* ============================================================================
 * CEE VISITAS · PWA v6 — RECUPERACIÓN COMPLETA
 * Recupera checklist CE3X real + envío colaborador con borrador Gmail.
 * Añade sincronización Sheets + importación formulario web.
 * ========================================================================= */
(function(){
"use strict";

const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwPku0mbVvbmkk1j0oSi5gi2picbTmhADFwlJYE2CjCRK5hDmLMc_fW7Jodd3sNPwnPWQ/exec";

const MUNIS = ["",
  "Pedreguer","Dénia","Ondara","Xàbia","Teulada","Gata de Gorgos",
  "El Verger","El Poble Nou de Benitatxell","Els Poblets",
  "Benissa","Calp","Moraira","Jesús Pobre","Orba","Parcent","Senija","Lliber","Otro"
];

const MUNI_ALIAS = {
  "benitachell":"El Poble Nou de Benitatxell",
  "benitatxell":"El Poble Nou de Benitatxell",
  "el poble nou de benitatxell":"El Poble Nou de Benitatxell",
  "poble nou de benitatxell":"El Poble Nou de Benitatxell",
  "el poble nou":"El Poble Nou de Benitatxell",
  "denia":"Dénia","jabea":"Xàbia","javea":"Xàbia",
  "el vergel":"El Verger","calpe":"Calp"
};

// ---------- IndexedDB ----------
const DB_NAME="cee_visitas_v6", DB_VER=1;
function openDB(){ return new Promise((res,rej)=>{
  const req=indexedDB.open(DB_NAME,DB_VER);
  req.onupgradeneeded=(e)=>{
    const db=e.target.result;
    if(!db.objectStoreNames.contains("expedientes")) db.createObjectStore("expedientes",{keyPath:"id"});
    if(!db.objectStoreNames.contains("config")) db.createObjectStore("config",{keyPath:"key"});
  };
  req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error);
});}
async function dbGetAll(s){ const db=await openDB(); return new Promise((r,j)=>{ const q=db.transaction(s,"readonly").objectStore(s).getAll(); q.onsuccess=()=>r(q.result||[]); q.onerror=()=>j(q.error); }); }
async function dbGet(s,k){ const db=await openDB(); return new Promise((r,j)=>{ const q=db.transaction(s,"readonly").objectStore(s).get(k); q.onsuccess=()=>r(q.result||null); q.onerror=()=>j(q.error); }); }
async function dbPut(s,o){ const db=await openDB(); return new Promise((r,j)=>{ const tx=db.transaction(s,"readwrite"); tx.objectStore(s).put(o); tx.oncomplete=()=>r(); tx.onerror=()=>j(tx.error); }); }
async function dbClear(s){ const db=await openDB(); return new Promise((r,j)=>{ const tx=db.transaction(s,"readwrite"); tx.objectStore(s).clear(); tx.oncomplete=()=>r(); tx.onerror=()=>j(tx.error); }); }

// ---------- JSONP ----------
let _cb=0;
function jsonp(url,params,timeout){ timeout=timeout||25000; return new Promise((resolve,reject)=>{
  const cbName="_gasCb_"+Date.now()+"_"+(++_cb);
  const qs=Object.keys(params||{}).map(k=>encodeURIComponent(k)+"="+encodeURIComponent(params[k])).join("&");
  const full=url+(url.indexOf("?")>-1?"&":"?")+qs+(qs?"&":"")+"callback="+cbName;
  const sc=document.createElement("script");
  const t=setTimeout(()=>{clean(); reject(new Error("Tiempo agotado"));},timeout);
  function clean(){ clearTimeout(t); try{delete window[cbName];}catch(e){window[cbName]=undefined;} if(sc.parentNode) sc.parentNode.removeChild(sc); }
  window[cbName]=(data)=>{clean(); resolve(data);};
  sc.onerror=()=>{clean(); reject(new Error("Error de red"));};
  sc.src=full;
  document.head.appendChild(sc);
});}

// ---------- Backend ----------
async function backendUrl(){ const c=await getCfg(); return c.scriptUrl||DEFAULT_SCRIPT_URL; }
async function apiStatus(){ return jsonp(await backendUrl(),{action:"status"},10000); }
async function apiListarSolicitudes(){ return jsonp(await backendUrl(),{action:"listar"}); }
async function apiDetalleSolicitud(id){ return jsonp(await backendUrl(),{action:"detalle",id}); }
async function apiActualizarEstadoSolicitud(id,estado){ return jsonp(await backendUrl(),{action:"actualizar_estado",id,estado}); }
async function apiListarExpedientes(){ return jsonp(await backendUrl(),{action:"listar_exp"}); }
async function apiGuardarExpediente(id,datos,estado){
  const json=JSON.stringify(datos);
  const b64=btoa(unescape(encodeURIComponent(json)));
  return jsonp(await backendUrl(),{action:"guardar_exp",id,datos:b64,estado:estado||"pendiente"},40000);
}

// ---------- Config ----------
async function getCfg(){
  const c=await dbGet("config","main");
  return c||{ key:"main", scriptUrl:DEFAULT_SCRIPT_URL, emailColab:"",
    firma:"Un saludo,\n\nJuan Felipe Ribes Aranda\nArquitecto Técnico · col. 3.184\nJoanfe Ribes Oficina Tècnica\nTel. 605 875 899\nadministracion@joanferibes.com",
    lastSync:"" };
}
async function saveCfg(c){ c.key="main"; await dbPut("config",c); }

// ---------- Estado ----------
const state={currentTab:"pendiente", expCurrent:null, online:navigator.onLine};

// ---------- Helpers ----------
const $=(id)=>document.getElementById(id);
function go(id){ document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active")); const t=$("screen-"+id); if(t) t.classList.add("active"); window.scrollTo(0,0); }
function toast(m,ms){ const t=$("toast"); t.textContent=m; t.classList.add("show"); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove("show"),ms||2800); }
function showSync(m){ const b=$("sync-bar"); $("sync-text").textContent=m; b.classList.add("visible"); }
function hideSync(){ $("sync-bar").classList.remove("visible"); }
function setStatus(on){ state.online=on; const d=$("status-dot"), t=$("status-text");
  if(on){ d.className="dot on"; t.textContent="Online"; } else { d.className="dot off"; t.textContent="Offline"; } }
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function formatFecha(iso){ if(!iso) return "—"; try{const d=new Date(iso); return d.toLocaleDateString("es-ES")+" "+d.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"});}catch(e){return "—";} }
function matchMuni(m){ if(!m) return ""; const t=String(m).trim().toLowerCase(); if(MUNI_ALIAS[t]) return MUNI_ALIAS[t]; for(const o of MUNIS){ if(o.toLowerCase()===t) return o; } return "Otro"; }
function normFecha(f){ if(!f) return ""; try{ if(/^\d{4}-\d{2}-\d{2}/.test(f)) return f.slice(0,10); const d=new Date(f); if(!isNaN(d)) return d.toISOString().slice(0,10);}catch(e){} return ""; }

// ---------- Modelo ----------
function nuevoExpedienteVacio(){
  return {
    id:"exp_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),
    origen:"manual",
    fechaCreacion:new Date().toISOString(),
    fechaActualizacion:new Date().toISOString(),
    estado:"pendiente", solicitudId:"", numExp:"",
    datos:{
      nombre:"", tipoDocumento:"DNI", numeroDocumento:"",
      telefono:"", email:"",
      direccion:"", municipio:"", codigoPostal:"",
      referenciaCatastral:"", fechaVisita:"", observaciones:""
    },
    checklist:{
      tipoViv:"", reformaImportante:false, reformaAnyo:"",
      fachadaTipo:"", posAislamiento:"", murosEspesor:"",
      carpinteria:"", acristalamiento:"", permeabilidad:"",
      techo:"", techoAislada:"", suelo:"",
      calTipo:"", calComb:"", calDist:"", calAntig:"", calPct:"",
      refTipo:"", refComb:"", refAntig:"", refPct:"",
      acsTipo:"", acsModalidad:"", acsAcum:"", acsComb:"", acsMixta:false,
      renPaneles:false, renPotencia:"", renAnyo:"",
      observaciones:""
    },
    fotos:{fachada:"", croq1:"", croq2:""},
    pendienteSync:false
  };
}

async function guardarExpedienteLocal(exp){ exp.fechaActualizacion=new Date().toISOString(); exp.pendienteSync=true; await dbPut("expedientes",exp); }

async function pushExpediente(exp){
  try{
    const res=await apiGuardarExpediente(exp.id,{
      origen:exp.origen, fechaCreacion:exp.fechaCreacion,
      solicitudId:exp.solicitudId, numExp:exp.numExp,
      datos:exp.datos, checklist:exp.checklist
    },exp.estado);
    if(res && res.status==="ok"){
      exp.pendienteSync=false;
      exp.fechaActualizacion=res.fechaActualizacion||exp.fechaActualizacion;
      await dbPut("expedientes",exp);
      return true;
    }
    return false;
  }catch(e){ return false; }
}

// ---------- Sincronización ----------
async function sincronizar(){
  showSync("Sincronizando…");
  try{
    const todos=await dbGetAll("expedientes");
    const pend=todos.filter(e=>e.pendienteSync);
    let pOk=0, pFail=0;
    for(const exp of pend){ const ok=await pushExpediente(exp); if(ok) pOk++; else pFail++; }

    const res=await apiListarExpedientes();
    let pull=0;
    if(res && res.status==="ok" && Array.isArray(res.expedientes)){
      for(const r of res.expedientes){
        const local=await dbGet("expedientes",r.id);
        if(!local){
          const exp=nuevoExpedienteVacio();
          exp.id=r.id; exp.fechaActualizacion=r.fechaActualizacion||exp.fechaActualizacion;
          exp.estado=r.estado||"pendiente";
          if(r.datos){
            if(r.datos.datos) exp.datos=Object.assign(exp.datos,r.datos.datos);
            if(r.datos.checklist) exp.checklist=Object.assign(exp.checklist,r.datos.checklist);
            if(r.datos.origen) exp.origen=r.datos.origen;
            if(r.datos.solicitudId) exp.solicitudId=r.datos.solicitudId;
            if(r.datos.numExp) exp.numExp=r.datos.numExp;
            if(r.datos.fechaCreacion) exp.fechaCreacion=r.datos.fechaCreacion;
          }
          exp.pendienteSync=false;
          await dbPut("expedientes",exp); pull++;
        } else if(!local.pendienteSync){
          const rF=new Date(r.fechaActualizacion||0).getTime();
          const lF=new Date(local.fechaActualizacion||0).getTime();
          if(rF>lF){
            local.fechaActualizacion=r.fechaActualizacion;
            local.estado=r.estado||local.estado;
            if(r.datos){
              if(r.datos.datos) local.datos=Object.assign(local.datos,r.datos.datos);
              if(r.datos.checklist) local.checklist=Object.assign(local.checklist,r.datos.checklist);
              if(r.datos.numExp) local.numExp=r.datos.numExp;
            }
            await dbPut("expedientes",local); pull++;
          }
        }
      }
    }
    const cfg=await getCfg(); cfg.lastSync=new Date().toISOString(); await saveCfg(cfg);
    setStatus(true); hideSync(); renderHome();
    toast(`Sincronizado · ↑${pOk} ↓${pull}`+(pFail?` · ${pFail} fallo`:""));
    return true;
  }catch(e){ setStatus(false); hideSync(); toast("Sin conexión — guardado en local"); return false; }
}

// ---------- Home ----------
async function renderHome(){
  const exps=await dbGetAll("expedientes");
  const pend=exps.filter(e=>e.estado==="pendiente");
  const vis =exps.filter(e=>e.estado==="visitado");
  const env =exps.filter(e=>e.estado==="enviado");
  $("cnt-pend").textContent=pend.length; $("cnt-vis").textContent=vis.length; $("cnt-env").textContent=env.length;
  const tab=state.currentTab;
  const list = tab==="pendiente"?pend: tab==="visitado"?vis: env;
  list.sort((a,b)=>new Date(b.fechaActualizacion||0)-new Date(a.fechaActualizacion||0));
  const cont=$("list-exps"); cont.innerHTML="";
  if(list.length===0){ $("empty-list").style.display="block"; return; }
  $("empty-list").style.display="none";
  for(const exp of list){
    const badge = exp.estado==="pendiente"?"pend": exp.estado==="visitado"?"vis":"env";
    const dir=exp.datos.direccion||"(sin dirección)";
    const muni=exp.datos.municipio?", "+exp.datos.municipio:"";
    const nombre=exp.datos.nombre||"(sin nombre)";
    const numExp=exp.numExp?"Exp. "+exp.numExp+" · ":"";
    const fechaStr=exp.datos.fechaVisita?"Visita: "+exp.datos.fechaVisita:("Últ. "+formatFecha(exp.fechaActualizacion));
    const pSync=exp.pendienteSync?" · ↑":"";
    const item=document.createElement("div"); item.className="list-item";
    item.innerHTML=`<div class="li-title">${esc(dir)}${esc(muni)}</div><div class="li-sub">${esc(nombre)}</div><div class="li-meta"><span>${esc(numExp+fechaStr+pSync)}</span><span class="badge ${badge}">${esc(exp.estado)}</span></div>`;
    item.onclick=()=>abrirExpediente(exp.id);
    cont.appendChild(item);
  }
}

async function abrirExpediente(id){
  const exp=await dbGet("expedientes",id);
  if(!exp){ toast("No encontrado"); return; }
  state.expCurrent=exp;
  rellenarFormDatos(exp); rellenarChecklist(exp);
  $("datos-title").textContent=exp.datos.direccion||"Expediente";
  go("datos");
}

// ---------- Importar ----------
async function mostrarImportar(){ go("importar"); await cargarSolicitudes(); }
async function cargarSolicitudes(){
  const cont=$("list-solicitudes"); cont.innerHTML="<p class='muted'>Cargando…</p>"; $("empty-sol").style.display="none";
  try{
    const res=await apiListarSolicitudes();
    cont.innerHTML="";
    if(!res || res.status!=="ok"){ cont.innerHTML="<p class='muted'>Error: "+esc(res&&res.message||"desconocido")+"</p>"; return; }
    const sols=res.solicitudes||[];
    if(sols.length===0){ $("empty-sol").style.display="block"; return; }
    for(const s of sols){
      const item=document.createElement("div"); item.className="list-item";
      const dir=s.direccion||"(sin dirección)"; const muni=s.municipio?", "+s.municipio:"";
      item.innerHTML=`<div class="li-title">${esc(dir)}${esc(muni)}</div><div class="li-sub">${esc(s.nombre||"")}</div><div class="li-meta"><span>${esc(s.fecha||"")}</span><span class="badge ${s.estado==="visitado"?"vis":"pend"}">${esc(s.estado||"pendiente")}</span></div>`;
      item.onclick=()=>importarSolicitud(s.id);
      cont.appendChild(item);
    }
  }catch(e){ cont.innerHTML="<p class='muted'>No se pudo conectar: "+esc(e.message)+"</p>"; }
}

async function importarSolicitud(id){
  toast("Importando…");
  try{
    const res=await apiDetalleSolicitud(id);
    if(!res || res.status!=="ok" || !res.solicitud){ toast("No se pudo cargar"); return; }
    const s=res.solicitud;
    const todos=await dbGetAll("expedientes");
    let exp=todos.find(e=>e.solicitudId===String(id));
    if(!exp){ exp=nuevoExpedienteVacio(); exp.origen="formulario"; exp.solicitudId=String(id); }
    exp.datos.nombre=s.nombre||""; exp.datos.tipoDocumento=s.tipoDocumento||"DNI";
    exp.datos.numeroDocumento=s.numeroDocumento||""; exp.datos.telefono=s.telefono||"";
    exp.datos.email=s.email||""; exp.datos.direccion=s.direccion||"";
    exp.datos.municipio=matchMuni(s.municipio); exp.datos.codigoPostal=s.codigoPostal||"";
    exp.datos.referenciaCatastral=s.referenciaCatastral||""; exp.datos.fechaVisita=normFecha(s.fechaVisita);
    exp.datos.observaciones=s.observaciones||"";
    await guardarExpedienteLocal(exp);
    state.expCurrent=exp;
    pushExpediente(exp).catch(()=>{});
    rellenarFormDatos(exp); rellenarChecklist(exp);
    $("datos-title").textContent=exp.datos.direccion||"Expediente";
    go("datos");
    toast("Importada ✓");
  }catch(e){ toast("Error: "+e.message); }
}

// ---------- Datos ----------
function rellenarFormDatos(exp){
  const d=exp.datos;
  $("f-numexp").value=exp.numExp||"";
  $("f-nombre").value=d.nombre||""; $("f-tipodoc").value=d.tipoDocumento||"DNI";
  $("f-numdoc").value=d.numeroDocumento||""; $("f-tel").value=d.telefono||"";
  $("f-email").value=d.email||""; $("f-direccion").value=d.direccion||"";
  const sel=$("f-muni"); sel.innerHTML=MUNIS.map(m=>`<option value="${esc(m)}"${m===d.municipio?" selected":""}>${esc(m||"— seleccionar —")}</option>`).join("");
  $("f-cp").value=d.codigoPostal||""; $("f-refcat").value=d.referenciaCatastral||"";
  $("f-fechavisita").value=d.fechaVisita||""; $("f-obs").value=d.observaciones||"";
}
function leerFormDatos(exp){
  exp.numExp=$("f-numexp").value.trim();
  exp.datos.nombre=$("f-nombre").value.trim(); exp.datos.tipoDocumento=$("f-tipodoc").value;
  exp.datos.numeroDocumento=$("f-numdoc").value.trim(); exp.datos.telefono=$("f-tel").value.trim();
  exp.datos.email=$("f-email").value.trim(); exp.datos.direccion=$("f-direccion").value.trim();
  exp.datos.municipio=$("f-muni").value; exp.datos.codigoPostal=$("f-cp").value.trim();
  exp.datos.referenciaCatastral=$("f-refcat").value.trim(); exp.datos.fechaVisita=$("f-fechavisita").value;
  exp.datos.observaciones=$("f-obs").value.trim();
}

// ---------- Checklist ----------
function rellenarChecklist(exp){
  const c=exp.checklist;
  $("c-tipoViv").value=c.tipoViv||"";
  $("c-reforma").checked=!!c.reformaImportante; $("c-reformaAnyo").value=c.reformaAnyo||"";
  $("c-reformaAnyo-row").style.display=c.reformaImportante?"block":"none";
  $("c-fachadaTipo").value=c.fachadaTipo||""; $("c-posAisl").value=c.posAislamiento||"";
  $("c-murosEspesor").value=c.murosEspesor||"";
  $("c-carpinteria").value=c.carpinteria||""; $("c-acristalamiento").value=c.acristalamiento||"";
  $("c-permeabilidad").value=c.permeabilidad||"";
  $("c-techo").value=c.techo||""; $("c-techoAislada").value=c.techoAislada||""; $("c-suelo").value=c.suelo||"";
  $("c-calTipo").value=c.calTipo||""; $("c-calComb").value=c.calComb||"";
  $("c-calDist").value=c.calDist||""; $("c-calAntig").value=c.calAntig||""; $("c-calPct").value=c.calPct||"";
  toggleCalef();
  $("c-refTipo").value=c.refTipo||""; $("c-refComb").value=c.refComb||"";
  $("c-refAntig").value=c.refAntig||""; $("c-refPct").value=c.refPct||"";
  toggleRefri();
  $("c-acsTipo").value=c.acsTipo||""; $("c-acsModalidad").value=c.acsModalidad||"";
  $("c-acsAcum").value=c.acsAcum||""; $("c-acsComb").value=c.acsComb||"";
  $("c-acsMixta").checked=!!c.acsMixta;
  $("c-renPaneles").checked=!!c.renPaneles; $("c-renPotencia").value=c.renPotencia||""; $("c-renAnyo").value=c.renAnyo||"";
  $("c-ren-row").style.display=c.renPaneles?"block":"none";
  $("c-obs").value=c.observaciones||"";
  pintarFoto("fachada",exp.fotos.fachada); pintarFoto("croq1",exp.fotos.croq1); pintarFoto("croq2",exp.fotos.croq2);
}
function pintarFoto(k,v){
  const p=$(k+"-preview"), i=$(k+"-info");
  if(v){
    // si es PDF, mostrar icono en vez de imagen
    if(v.startsWith("data:application/pdf")){ p.style.display="none"; i.textContent="✓ PDF guardado"; }
    else{ p.src=v; p.style.display="block"; i.textContent="✓ Guardada"; }
  } else{ p.style.display="none"; i.textContent="—"; }
}
function leerChecklist(exp){
  const c=exp.checklist;
  c.tipoViv=$("c-tipoViv").value;
  c.reformaImportante=$("c-reforma").checked; c.reformaAnyo=$("c-reformaAnyo").value.trim();
  c.fachadaTipo=$("c-fachadaTipo").value; c.posAislamiento=$("c-posAisl").value; c.murosEspesor=$("c-murosEspesor").value;
  c.carpinteria=$("c-carpinteria").value; c.acristalamiento=$("c-acristalamiento").value; c.permeabilidad=$("c-permeabilidad").value;
  c.techo=$("c-techo").value; c.techoAislada=$("c-techoAislada").value; c.suelo=$("c-suelo").value;
  c.calTipo=$("c-calTipo").value; c.calComb=$("c-calComb").value;
  c.calDist=$("c-calDist").value; c.calAntig=$("c-calAntig").value; c.calPct=$("c-calPct").value;
  c.refTipo=$("c-refTipo").value; c.refComb=$("c-refComb").value;
  c.refAntig=$("c-refAntig").value; c.refPct=$("c-refPct").value;
  c.acsTipo=$("c-acsTipo").value; c.acsModalidad=$("c-acsModalidad").value;
  c.acsAcum=$("c-acsAcum").value; c.acsComb=$("c-acsComb").value; c.acsMixta=$("c-acsMixta").checked;
  c.renPaneles=$("c-renPaneles").checked; c.renPotencia=$("c-renPotencia").value; c.renAnyo=$("c-renAnyo").value;
  c.observaciones=$("c-obs").value.trim();
}
function toggleCalef(){ $("c-calef-detalle").style.display=$("c-calTipo").value==="No tiene instalada"?"none":"block"; }
function toggleRefri(){ $("c-refri-detalle").style.display=$("c-refTipo").value==="No tiene instalada"?"none":"block"; }
function toggleReforma(){ $("c-reformaAnyo-row").style.display=$("c-reforma").checked?"block":"none"; }
function toggleRen(){ $("c-ren-row").style.display=$("c-renPaneles").checked?"block":"none"; }

// ---------- Fotos ----------
function setupFotoInput(btnId,inputId,key){
  $(btnId).onclick=()=>$(inputId).click();
  $(inputId).onchange=async (e)=>{
    const f=e.target.files[0]; if(!f) return;
    if(f.type==="application/pdf"){
      const r=new FileReader();
      r.onload=async (ev)=>{
        if(!state.expCurrent) return;
        state.expCurrent.fotos[key]=ev.target.result;
        pintarFoto(key,state.expCurrent.fotos[key]);
        await guardarExpedienteLocal(state.expCurrent);
        toast("PDF guardado");
      };
      r.readAsDataURL(f); return;
    }
    const url=await redimensionar(f,1600,0.85);
    if(!state.expCurrent) return;
    state.expCurrent.fotos[key]=url; pintarFoto(key,url);
    await guardarExpedienteLocal(state.expCurrent);
    toast("Imagen guardada");
  };
}
function redimensionar(file,maxDim,q){ return new Promise((resolve)=>{
  const r=new FileReader();
  r.onload=(e)=>{
    const img=new Image();
    img.onload=()=>{
      let w=img.width,h=img.height;
      if(w>h && w>maxDim){ h=h*maxDim/w; w=maxDim; } else if(h>maxDim){ w=w*maxDim/h; h=maxDim; }
      const c=document.createElement("canvas"); c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      resolve(c.toDataURL("image/jpeg",q));
    };
    img.src=e.target.result;
  };
  r.readAsDataURL(file);
});}

// ---------- PDF Checklist ----------
async function generateChecklistPDF(exp){
  const JsPDF=window.jspdf.jsPDF;
  const doc=new JsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  const lm=20, pw=170;
  let y=15;

  doc.setFillColor(74,138,128); doc.rect(0,0,210,28,"F");
  doc.setTextColor(255,255,255); doc.setFontSize(16); doc.setFont("helvetica","bold");
  doc.text("CHECKLIST VISITA CEE",lm,12);
  doc.setFontSize(10); doc.setFont("helvetica","normal");
  doc.text("Joanfe Ribes · Oficina Tècnica",lm,19);
  doc.text("Tel. 605 875 899 · joanferibes.com",lm,24);
  if(exp.numExp){ doc.setFontSize(11); doc.setFont("helvetica","bold"); doc.text("Exp. "+exp.numExp,200,12,{align:"right"}); }
  doc.setFontSize(9); doc.setFont("helvetica","normal");
  doc.text(new Date().toLocaleDateString("es-ES"),200,19,{align:"right"});

  y=36; doc.setTextColor(0,0,0);

  function title(t){
    if(y>260){ doc.addPage(); y=15; }
    doc.setFillColor(74,138,128); doc.rect(lm,y-4,pw,7,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(10); doc.setFont("helvetica","bold");
    doc.text(t,lm+3,y+1);
    doc.setTextColor(0,0,0); y+=10;
  }
  function row(label,value){
    if(y>275){ doc.addPage(); y=15; }
    doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.text(label+":",lm,y);
    doc.setFont("helvetica","normal");
    const v=String(value==null||value===""?"—":value);
    const lines=doc.splitTextToSize(v,pw-55);
    doc.text(lines,lm+55,y);
    y+=5.5*Math.max(1,lines.length);
  }

  const d=exp.datos, c=exp.checklist;

  title("DATOS GENERALES");
  row("Dirección",(d.direccion||"")+(d.codigoPostal?", "+d.codigoPostal:""));
  row("Municipio",d.municipio);
  row("Cliente",d.nombre);
  row(d.tipoDocumento||"DNI",d.numeroDocumento);
  row("Teléfono",d.telefono);
  row("Email",d.email);
  row("Ref. catastral",d.referenciaCatastral);
  row("Fecha visita",d.fechaVisita);
  row("Tipo vivienda",c.tipoViv);
  row("Reforma importante", c.reformaImportante?("Sí — Año "+(c.reformaAnyo||"?")):"No");
  y+=3;

  title("ENVOLVENTE — MUROS / FACHADA");
  row("Tipo fachada",c.fachadaTipo);
  row("Posibilidad aislamiento",c.posAislamiento);
  row("Espesor muros",c.murosEspesor?c.murosEspesor+" cm":"");
  y+=2;

  title("ENVOLVENTE — HUECOS");
  row("Carpintería",c.carpinteria);
  row("Acristalamiento",c.acristalamiento);
  row("Permeabilidad",c.permeabilidad);
  y+=2;

  title("ENVOLVENTE — CUBIERTA Y SUELO");
  row("Techo",(c.techo||"")+(c.techoAislada?" · "+c.techoAislada:""));
  row("Suelo",c.suelo);
  y+=2;

  title("CALEFACCIÓN");
  if(c.calTipo==="No tiene instalada"){ row("Sistema","No tiene instalada"); }
  else{
    row("Sistema",c.calTipo);
    row("Combustible",c.calComb);
    row("Distribución",c.calDist);
    row("Antigüedad (años)",c.calAntig);
    row("% vivienda calefactada",c.calPct?c.calPct+" %":"");
  }
  y+=2;

  title("REFRIGERACIÓN");
  if(c.refTipo==="No tiene instalada"){ row("Sistema","No tiene instalada"); }
  else{
    row("Sistema",c.refTipo);
    row("Combustible",c.refComb);
    row("Antigüedad (años)",c.refAntig);
    row("% vivienda climatizada",c.refPct?c.refPct+" %":"");
  }
  y+=2;

  title("ACS");
  row("Tipo",c.acsTipo);
  row("Modalidad",c.acsModalidad);
  row("Acumulación",c.acsAcum);
  row("Combustible",c.acsComb);
  row("Mixta con calefacción",c.acsMixta?"Sí":"No");
  y+=2;

  title("ENERGÍAS RENOVABLES");
  if(c.renPaneles){
    row("Paneles solares","Sí");
    row("Potencia instalada",c.renPotencia?c.renPotencia+" kW":"");
    row("Año instalación",c.renAnyo);
  } else{ row("Paneles solares","No dispone"); }
  y+=2;

  if(c.observaciones){
    title("OBSERVACIONES");
    doc.setFontSize(9); doc.setFont("helvetica","normal");
    const lines=doc.splitTextToSize(c.observaciones,pw);
    doc.text(lines,lm,y);
  }

  return doc.output("datauristring");
}

// ---------- Envío colaborador ----------
async function abrirPantallaEmail(){
  if(!state.expCurrent) return;
  const exp=state.expCurrent; const cfg=await getCfg();
  $("e-to").value=cfg.emailColab||"";
  const dir=exp.datos.direccion||"";
  const numExp=exp.numExp?exp.numExp+"_":"";
  $("e-asunto").value="CEE "+numExp+dir;
  const c=exp.checklist;
  const cuerpo=
`Hola,

Adjunto datos y documentación de la visita para el certificado energético:

DATOS DEL INMUEBLE
- Expediente: ${exp.numExp||"—"}
- Cliente: ${exp.datos.nombre}
- Dirección: ${exp.datos.direccion}
- Municipio: ${exp.datos.municipio} (CP ${exp.datos.codigoPostal})
- Ref. catastral: ${exp.datos.referenciaCatastral}
- Teléfono: ${exp.datos.telefono}
- Fecha de visita: ${exp.datos.fechaVisita}
- Tipo vivienda: ${c.tipoViv}
${c.reformaImportante?"- Reforma importante: Sí (año "+(c.reformaAnyo||"?")+")":""}

ENVOLVENTE
- Fachada: ${c.fachadaTipo||"—"} (aislamiento posible: ${c.posAislamiento||"—"})
- Espesor muros: ${c.murosEspesor||"—"} cm
- Carpintería: ${c.carpinteria||"—"} · Acristalamiento: ${c.acristalamiento||"—"} · Permeabilidad: ${c.permeabilidad||"—"}
- Techo: ${c.techo||"—"}${c.techoAislada?" ("+c.techoAislada+")":""}
- Suelo: ${c.suelo||"—"}

INSTALACIONES
- Calefacción: ${c.calTipo||"—"}${c.calTipo&&c.calTipo!=="No tiene instalada"?` · ${c.calComb||""} · ${c.calPct||0}% vivienda`:""}
- Refrigeración: ${c.refTipo||"—"}${c.refTipo&&c.refTipo!=="No tiene instalada"?` · ${c.refComb||""} · ${c.refPct||0}% vivienda`:""}
- ACS: ${c.acsTipo||"—"}${c.acsModalidad?" · "+c.acsModalidad:""}${c.acsAcum?" · "+c.acsAcum:""}${c.acsComb?" · "+c.acsComb:""}${c.acsMixta?" · mixta con calefacción":""}
- Renovables: ${c.renPaneles?"Paneles "+(c.renPotencia||"?")+" kW ("+(c.renAnyo||"?")+")":"No dispone"}

OBSERVACIONES
${c.observaciones||"—"}

Se adjuntan: checklist en PDF, foto de fachada y croquis.

${cfg.firma||""}`;
  $("e-body").value=cuerpo;
  go("email");
}

async function crearBorradorGmail(){
  if(!state.expCurrent) return;
  const exp=state.expCurrent;
  const to=$("e-to").value.trim();
  const subject=$("e-asunto").value.trim();
  const body=$("e-body").value;
  if(!to){ toast("Falta destinatario"); return; }
  if(!window.jspdf){ toast("jsPDF no cargado, reintenta"); return; }

  showSync("Generando PDF del checklist…");
  try{
    const pdfDataUrl=await generateChecklistPDF(exp);
    showSync("Creando borrador en Gmail…");
    await enviarBorradorPostForm({
      to, subject, body,
      numExp:exp.numExp||"sin",
      direccion:exp.datos.direccion||"",
      checklistPdf:pdfDataUrl,
      fotoFachada:exp.fotos.fachada||"",
      croquis1:exp.fotos.croq1||"",
      croquis2:exp.fotos.croq2||""
    });
    hideSync();
    toast("✓ Borrador creado en Gmail · revisa borradores");
    exp.estado="enviado";
    await guardarExpedienteLocal(exp);
    pushExpediente(exp).catch(()=>{});
    if(exp.solicitudId) apiActualizarEstadoSolicitud(exp.solicitudId,"enviado").catch(()=>{});
    setTimeout(()=>{ go("home"); renderHome(); },1800);
  }catch(e){
    hideSync();
    toast("Error: "+e.message);
  }
}

// POST al Apps Script vía formulario + iframe oculto (evita preflight CORS)
function enviarBorradorPostForm(payload){
  return new Promise(async (resolve,reject)=>{
    const url=await backendUrl();
    const iframeName="gas_iframe_"+Date.now();
    const iframe=document.createElement("iframe");
    iframe.name=iframeName; iframe.style.display="none";
    document.body.appendChild(iframe);

    const form=document.createElement("form");
    form.method="POST"; form.action=url; form.target=iframeName;
    form.enctype="application/x-www-form-urlencoded";

    const inp=document.createElement("input");
    inp.type="hidden"; inp.name="payload"; inp.value=JSON.stringify(payload);
    form.appendChild(inp);
    document.body.appendChild(form);

    let done=false;
    const timer=setTimeout(()=>{
      if(done) return; done=true;
      try{ document.body.removeChild(iframe); document.body.removeChild(form); }catch(e){}
      resolve(true);
    },10000);

    iframe.onload=()=>{
      if(done) return; done=true;
      clearTimeout(timer);
      try{ document.body.removeChild(iframe); document.body.removeChild(form); }catch(e){}
      resolve(true);
    };
    iframe.onerror=()=>{
      if(done) return; done=true;
      clearTimeout(timer);
      try{ document.body.removeChild(iframe); document.body.removeChild(form); }catch(e){}
      reject(new Error("No se pudo enviar al servidor"));
    };
    form.submit();
  });
}

// ---------- Config UI ----------
async function cargarCfgUI(){
  const cfg=await getCfg();
  $("cfg-url").value=cfg.scriptUrl||DEFAULT_SCRIPT_URL;
  $("cfg-colab").value=cfg.emailColab||"";
  $("cfg-firma").value=cfg.firma||"";
  $("sync-info").textContent=cfg.lastSync?"Última sincronización: "+formatFecha(cfg.lastSync):"Sin sincronizar todavía";
}
async function guardarCfgUI(){
  const cfg=await getCfg();
  cfg.scriptUrl=$("cfg-url").value.trim()||DEFAULT_SCRIPT_URL;
  cfg.emailColab=$("cfg-colab").value.trim();
  cfg.firma=$("cfg-firma").value;
  await saveCfg(cfg);
  toast("Configuración guardada");
}
async function testConexion(){
  showSync("Probando conexión…");
  try{
    const res=await apiStatus();
    hideSync();
    if(res && res.status==="ok"){ setStatus(true); toast("✓ Conectado · "+(res.service||"OK")+" v"+(res.version||"?")); }
    else toast("Respuesta inesperada");
  }catch(e){ hideSync(); setStatus(false); toast("Sin conexión: "+e.message); }
}

// ---------- Init ----------
async function init(){
  if("serviceWorker" in navigator){ try{ await navigator.serviceWorker.register("sw.js?v=6"); }catch(e){} }
  document.querySelectorAll("[data-go]").forEach(b=>{ b.onclick=()=>go(b.getAttribute("data-go")); });
  document.querySelectorAll(".tab").forEach(t=>{ t.onclick=()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    t.classList.add("active"); state.currentTab=t.getAttribute("data-tab"); renderHome();
  };});
  $("btn-nuevo").onclick=()=>go("nuevo");
  $("btn-sync").onclick=()=>sincronizar();
  $("btn-cfg").onclick=async()=>{ await cargarCfgUI(); go("cfg"); };
  $("btn-origen-web").onclick=()=>mostrarImportar();
  $("btn-origen-manual").onclick=()=>{
    state.expCurrent=nuevoExpedienteVacio();
    rellenarFormDatos(state.expCurrent); rellenarChecklist(state.expCurrent);
    $("datos-title").textContent="Nuevo expediente"; go("datos");
  };
  $("btn-importar-reload").onclick=()=>cargarSolicitudes();
  $("btn-ir-checklist").onclick=async()=>{
    if(!state.expCurrent) return;
    leerFormDatos(state.expCurrent);
    await guardarExpedienteLocal(state.expCurrent);
    pushExpediente(state.expCurrent).catch(()=>{});
    go("checklist");
  };
  $("btn-guardar").onclick=async()=>{
    if(!state.expCurrent) return;
    leerChecklist(state.expCurrent);
    if(state.expCurrent.estado!=="enviado") state.expCurrent.estado="visitado";
    await guardarExpedienteLocal(state.expCurrent);
    const ok=await pushExpediente(state.expCurrent);
    toast(ok?"Guardado ✓":"Guardado en local (↑ pendiente)");
    renderHome(); go("home");
  };
  $("btn-enviar").onclick=async()=>{
    if(!state.expCurrent) return;
    leerChecklist(state.expCurrent);
    await guardarExpedienteLocal(state.expCurrent);
    await abrirPantallaEmail();
  };
  $("btn-crear-borrador").onclick=()=>crearBorradorGmail();

  $("c-reforma").onchange=toggleReforma;
  $("c-calTipo").onchange=toggleCalef;
  $("c-refTipo").onchange=toggleRefri;
  $("c-renPaneles").onchange=toggleRen;

  setupFotoInput("btn-foto-fachada","inp-fachada","fachada");
  setupFotoInput("btn-croquis-1","inp-croq1","croq1");
  setupFotoInput("btn-croquis-2","inp-croq2","croq2");

  $("btn-save-cfg").onclick=()=>guardarCfgUI();
  $("btn-sync-now").onclick=()=>sincronizar();
  $("btn-test-conn").onclick=()=>testConexion();
  $("btn-reset-local").onclick=async()=>{
    if(!confirm("¿Borrar datos locales? Los del servidor se mantienen.")) return;
    await dbClear("expedientes"); toast("Datos locales borrados"); renderHome();
  };

  window.addEventListener("online",()=>{ setStatus(true); sincronizar(); });
  window.addEventListener("offline",()=>setStatus(false));
  setStatus(navigator.onLine);

  await renderHome();
  const params=new URLSearchParams(location.search);
  const idParam=params.get("id");
  if(idParam){ await mostrarImportar(); await importarSolicitud(idParam); }
  if(navigator.onLine) setTimeout(()=>sincronizar(),500);
}
document.addEventListener("DOMContentLoaded",init);
})();
