// CEE Visitas — Joanfe Ribes Oficina Tècnica
// app.js — v9 PWA

(function(){
"use strict";

// ========== DATABASE ==========
var DB_NAME="cee_visitas";var DB_VER=1;
function openDB(){
  return new Promise(function(resolve,reject){
    var req=indexedDB.open(DB_NAME,DB_VER);
    req.onupgradeneeded=function(e){
      var db=e.target.result;
      if(!db.objectStoreNames.contains("expedientes"))db.createObjectStore("expedientes",{keyPath:"id"});
      if(!db.objectStoreNames.contains("config"))db.createObjectStore("config",{keyPath:"key"});
    };
    req.onsuccess=function(){resolve(req.result)};
    req.onerror=function(){reject(req.error)};
  });
}
function dbGetAll(){
  return openDB().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction("expedientes","readonly");
      var r=tx.objectStore("expedientes").getAll();
      r.onsuccess=function(){resolve(r.result)};r.onerror=function(){reject(r.error)};
    });
  });
}
function dbPut(data){
  return openDB().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction("expedientes","readwrite");
      tx.objectStore("expedientes").put(data);
      tx.oncomplete=function(){resolve()};tx.onerror=function(){reject(tx.error)};
    });
  });
}
function dbGetConfig(){
  return openDB().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction("config","readonly");
      var r=tx.objectStore("config").get("emailConfig");
      r.onsuccess=function(){resolve(r.result||null)};r.onerror=function(){reject(r.error)};
    });
  });
}
function dbPutConfig(data){
  data.key="emailConfig";
  return openDB().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction("config","readwrite");
      tx.objectStore("config").put(data);
      tx.oncomplete=function(){resolve()};tx.onerror=function(){reject(tx.error)};
    });
  });
}

// ========== STATE ==========
var MUNI=["Pedreguer","Dénia","Ondara","Xàbia","Teulada","Gata de Gorgos","El Verger","Benitatxell","Els Poblets","Otro"];
var exps=[];
var cur=null;
var isNew=true;
var cfg={email:"",nombre:"",firma:"Saludos,\nJuan Felipe Ribes\nArquitecto Técnico — col. 3.184\nTel. 605 875 899"};
var method="manual";

function mkExp(){
  return{
    id:Date.now().toString(),nombre:"",dni:"",telefono:"",direccion:"",cp:"",refCatastral:"",municipio:"",municipioOtro:"",
    estado:"pendiente",tipoViv:"",reformaImportante:false,reformaAnyo:"",
    fachadaTipo:"",murosEspesor:"",carpinteria:"",acristalamiento:"",permeabilidad:"",
    techo:"",techoAislada:"",suelo:"",
    calTipo:"",calComb:"",calDist:"",calAntig:"",calPct:"",calPotencia:"",calRendimiento:"",
    refTipo:"",refComb:"",refAntig:"",refPct:"",refPotencia:"",refRendimiento:"",
    acsTipo:"",acsModalidad:"",acsAcum:"",acsComb:"",acsMixta:false,
    renPaneles:false,renPotencia:"",renAnyo:"",
    obs:"",fFach:null,fDet:null,fCroq1:null,fCroq2:null,numExp:"",
    fecha:new Date().toISOString()
  };
}

function getMuni(){return cur.municipio==="Otro"?cur.municipioOtro:cur.municipio}

// ========== SCREENS ==========
var screens={};
var currentScreen="home";

function go(name){
  var el=document.getElementById("screen-"+currentScreen);
  if(el)el.classList.add("hidden");
  currentScreen=name;
  if(typeof screens[name]==="function")screens[name]();
  var el2=document.getElementById("screen-"+name);
  if(el2)el2.classList.remove("hidden");
  window.scrollTo(0,0);
}

function toast(msg){
  var t=document.getElementById("toast");
  t.textContent=msg;t.classList.add("show");
  setTimeout(function(){t.classList.remove("show")},2500);
}

// ========== RENDER HELPERS ==========
function $(id){return document.getElementById(id)}
function html(id,h){var el=$(id);if(el)el.innerHTML=h}
function show(id){var el=$(id);if(el)el.classList.remove("hidden")}
function hide(id){var el=$(id);if(el)el.classList.add("hidden")}
function val(id,v){var el=$(id);if(el){if(v!==undefined)el.value=v;return el.value}}

// ========== INIT ==========
async function init(){
  try{
    exps=await dbGetAll();
    exps.sort(function(a,b){return new Date(b.fecha)-new Date(a.fecha)});
    var c=await dbGetConfig();
    if(c)cfg=c;
  }catch(e){console.error(e)}
  renderHome();
  go("home");

  // Online status
  function updateOnline(){
    var dots=document.querySelectorAll(".online-dot");
    var labels=document.querySelectorAll(".online-label");
    var on=navigator.onLine;
    dots.forEach(function(d){d.className="dot "+(on?"dot-on":"dot-off")});
    labels.forEach(function(l){l.textContent=on?" Online":" Offline"});
  }
  window.addEventListener("online",updateOnline);
  window.addEventListener("offline",updateOnline);
  updateOnline();
}

// ========== HOME ==========
screens.home=function(){
  var p=exps.filter(function(e){return e.estado==="pendiente"}).length;
  var v=exps.filter(function(e){return e.estado==="visitado"}).length;
  var en=exps.filter(function(e){return e.estado==="enviado"}).length;
  $("stat-p").textContent=p;$("stat-v").textContent=v;$("stat-e").textContent=en;
};

function renderHome(){
  $("btn-expedientes").onclick=function(){renderExpedientes();go("expedientes")};
  $("btn-nuevo").onclick=function(){cur=mkExp();isNew=true;method="manual";renderDatos();go("datos")};
}

// ========== EXPEDIENTES ==========
screens.expedientes=function(){renderExpedientes()};

function renderExpedientes(){
  var c=document.getElementById("exp-list");
  if(exps.length===0){c.innerHTML='<div style="text-align:center;padding:40px;color:#bbb;font-size:14px">No hay expedientes. Crea uno nuevo.</div>';return}
  var h="";
  exps.forEach(function(e){
    var bc=e.estado==="pendiente"?"badge-p":e.estado==="visitado"?"badge-v":"badge-e";
    var label=e.estado.charAt(0).toUpperCase()+e.estado.slice(1);
    h+='<div class="exp-item" data-id="'+e.id+'">';
    h+='<div class="exp-addr">'+(e.direccion||"Sin dirección")+'</div>';
    h+='<div class="exp-cli">'+(e.nombre||"Sin nombre")+'</div>';
    h+='<div class="exp-meta"><span class="badge '+bc+'">'+label+'</span><span class="exp-ref">'+(e.numExp?"Exp. "+e.numExp:"")+'</span></div>';
    h+='</div>';
  });
  c.innerHTML=h;
  c.querySelectorAll(".exp-item").forEach(function(el){
    el.onclick=function(){
      var id=el.getAttribute("data-id");
      cur=JSON.parse(JSON.stringify(exps.find(function(e){return e.id===id})));
      isNew=false;renderDatos();go("datos");
    };
  });
}

// ========== DATOS (Step 1) ==========
screens.datos=function(){renderDatos()};

function renderDatos(){
  $("datos-title").textContent=isNew?"Nuevo expediente":"Editar expediente";
  var ms=$("method-section");
  if(isNew){ms.classList.remove("hidden")}else{ms.classList.add("hidden")}
  document.querySelectorAll(".method-card").forEach(function(el){
    el.classList.toggle("sel",el.getAttribute("data-method")===method);
    el.onclick=function(){method=el.getAttribute("data-method");renderDatos()};
  });
  // Fill fields
  ["nombre","dni","telefono","direccion","cp","refCatastral"].forEach(function(f){val("d-"+f,cur[f])});
  val("d-municipio",cur.municipio);
  if(cur.municipio==="Otro"){show("d-municipioOtro-wrap");val("d-municipioOtro",cur.municipioOtro)}else{hide("d-municipioOtro-wrap")}
  $("d-municipio").onchange=function(){cur.municipio=this.value;if(this.value==="Otro"){show("d-municipioOtro-wrap")}else{hide("d-municipioOtro-wrap")}};
  ["nombre","dni","telefono","direccion","cp","refCatastral","municipioOtro"].forEach(function(f){
    var el=$("d-"+f);if(el)el.oninput=function(){cur[f]=this.value};
  });
  $("btn-to-visita").onclick=function(){
    cur.municipio=val("d-municipio");
    renderVisita();go("visita");
  };
}

// ========== VISITA (Step 2) ==========
screens.visita=function(){renderVisita()};

function renderVisita(){
  // Tipo vivienda
  val("v-tipoViv",cur.tipoViv);$("v-tipoViv").onchange=function(){cur.tipoViv=this.value};

  // Reforma
  var ckRef=$("v-reforma-ck");
  ckRef.className="ck-box"+(cur.reformaImportante?" checked":"");
  ckRef.textContent=cur.reformaImportante?"✓":"";
  ckRef.onclick=function(){cur.reformaImportante=!cur.reformaImportante;renderVisita()};
  if(cur.reformaImportante){show("v-reformaAnyo-wrap");val("v-reformaAnyo",cur.reformaAnyo)}else{hide("v-reformaAnyo-wrap")}
  $("v-reformaAnyo").oninput=function(){cur.reformaAnyo=this.value};

  // Envolvente
  ["fachadaTipo","carpinteria","acristalamiento","permeabilidad","techo","techoAislada","suelo"].forEach(function(f){
    var el=$("v-"+f);if(el){val("v-"+f,cur[f]);el.onchange=function(){cur[f]=this.value}}
  });
  val("v-murosEspesor",cur.murosEspesor);$("v-murosEspesor").oninput=function(){cur.murosEspesor=this.value};

  // Calefaccion
  val("v-calTipo",cur.calTipo);$("v-calTipo").onchange=function(){cur.calTipo=this.value;renderVisita()};
  var noCal=cur.calTipo==="No tiene instalada";
  if(noCal){hide("cal-fields")}else{show("cal-fields")}
  ["calComb","calDist","calAntig"].forEach(function(f){
    var el=$("v-"+f);if(el){val("v-"+f,cur[f]);el.onchange=function(){cur[f]=this.value}}
  });
  ["calPct","calPotencia","calRendimiento"].forEach(function(f){
    var el=$("v-"+f);if(el){val("v-"+f,cur[f]);el.oninput=function(){cur[f]=this.value}}
  });

  // Refrigeracion
  val("v-refTipo",cur.refTipo);$("v-refTipo").onchange=function(){cur.refTipo=this.value;renderVisita()};
  var noRef=cur.refTipo==="No tiene instalada";
  if(noRef){hide("ref-fields")}else{show("ref-fields")}
  ["refComb","refAntig"].forEach(function(f){
    var el=$("v-"+f);if(el){val("v-"+f,cur[f]);el.onchange=function(){cur[f]=this.value}}
  });
  ["refPct","refPotencia","refRendimiento"].forEach(function(f){
    var el=$("v-"+f);if(el){val("v-"+f,cur[f]);el.oninput=function(){cur[f]=this.value}}
  });

  // ACS
  ["acsTipo","acsModalidad","acsAcum","acsComb"].forEach(function(f){
    var el=$("v-"+f);if(el){val("v-"+f,cur[f]);el.onchange=function(){cur[f]=this.value}}
  });
  var ckMixta=$("v-acsMixta-ck");
  ckMixta.className="ck-box"+(cur.acsMixta?" checked":"");
  ckMixta.textContent=cur.acsMixta?"✓":"";
  ckMixta.onclick=function(){cur.acsMixta=!cur.acsMixta;renderVisita()};

  // Renovables
  var ckRen=$("v-ren-ck");
  ckRen.className="ck-box"+(cur.renPaneles?" checked":"");
  ckRen.textContent=cur.renPaneles?"✓":"";
  ckRen.onclick=function(){cur.renPaneles=!cur.renPaneles;renderVisita()};
  if(cur.renPaneles){show("ren-fields")}else{hide("ren-fields")}
  val("v-renPotencia",cur.renPotencia);$("v-renPotencia").oninput=function(){cur.renPotencia=this.value};
  val("v-renAnyo",cur.renAnyo);$("v-renAnyo").oninput=function(){cur.renAnyo=this.value};

  // Photos
  setupPhoto("fFach","photo-fachada","file-fachada");
  setupPhoto("fDet","photo-detalle","file-detalle");
  setupPhoto("fCroq1","photo-croq1","file-croq1");
  setupPhoto("fCroq2","photo-croq2","file-croq2");

  // Obs
  val("v-obs",cur.obs);$("v-obs").oninput=function(){cur.obs=this.value};

  $("btn-to-guardar").onclick=function(){renderGuardar();go("guardar")};
}

function setupPhoto(field,slotId,fileId){
  var slot=$(slotId);var fileEl=$(fileId);
  if(cur[field]){
    slot.className="photo-slot has";
    slot.innerHTML='<img src="'+cur[field]+'" style="width:100%;height:100%;object-fit:cover" alt="">';
  }else{
    slot.className="photo-slot";
    var label=field==="fFach"?"Fachada":field==="fDet"?"Detalle":field==="fCroq1"?"Croquis 1":"Croquis 2";
    slot.innerHTML='<span style="color:#bbb"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg></span><span class="pl">'+label+'</span>';
  }
  slot.onclick=function(){fileEl.click()};
  fileEl.onchange=function(e){
    var file=e.target.files&&e.target.files[0];if(!file)return;
    var reader=new FileReader();
    reader.onload=function(ev){cur[field]=ev.target.result;renderVisita()};
    reader.readAsDataURL(file);
  };
}

// ========== GUARDAR (Step 3) ==========
screens.guardar=function(){renderGuardar()};

function renderGuardar(){
  // Summary
  html("sum-nombre",cur.nombre||"—");
  html("sum-dir",cur.direccion||"—");
  html("sum-muni",getMuni()||"—");
  html("sum-tipo",cur.tipoViv||"—");
  html("sum-fachada",(cur.fachadaTipo||"—")+(cur.murosEspesor?" ("+cur.murosEspesor+" cm)":""));
  html("sum-huecos",(cur.carpinteria||"—")+" / "+(cur.acristalamiento||"—")+" / "+(cur.permeabilidad||"—"));
  html("sum-techo",(cur.techo||"—")+(cur.techoAislada?" (aisl: "+cur.techoAislada+")":""));
  html("sum-suelo",cur.suelo||"—");
  var nC=cur.calTipo==="No tiene instalada";
  html("sum-cal",nC?"No tiene":(cur.calTipo||"—")+(cur.calPct?" "+cur.calPct+"%":""));
  var nR=cur.refTipo==="No tiene instalada";
  html("sum-ref",nR?"No tiene":(cur.refTipo||"—")+(cur.refPct?" "+cur.refPct+"%":""));
  html("sum-acs",(cur.acsTipo||"—")+" "+(cur.acsModalidad||"")+(cur.acsMixta?" (mixta)":""));
  html("sum-ren",cur.renPaneles?cur.renPotencia+" kW":"No");
  html("sum-fotos",[cur.fFach&&"fachada",cur.fDet&&"detalle"].filter(Boolean).join(", ")||"—");
  html("sum-croq",[cur.fCroq1&&"croquis 1",cur.fCroq2&&"croquis 2"].filter(Boolean).join(", ")||"—");

  // Num exp
  val("g-numExp",cur.numExp);$("g-numExp").oninput=function(){cur.numExp=this.value;renderEmailPreview()};

  // Email preview
  html("g-email-to",cfg.email||"sin configurar");
  renderEmailPreview();

  // Croquis download buttons
  if(cur.fCroq1){show("dl-croq1")}else{hide("dl-croq1")}
  if(cur.fCroq2){show("dl-croq2")}else{hide("dl-croq2")}

  // PDF downloads
  $("dl-checklist").onclick=function(){dlChecklist()};
  $("dl-croq1").onclick=function(){dlCroquis(1)};
  $("dl-croq2").onclick=function(){dlCroquis(2)};

  // Buttons
  $("btn-save").onclick=doSave;
  $("btn-preview-email").onclick=function(){renderEmail();go("email")};
  $("btn-mailto").onclick=openMailto;
  $("btn-cfg-email").onclick=function(){renderCfg();go("cfgmail")};
}

function renderEmailPreview(){
  html("g-email-asunto",genAsunto());
}

function genAsunto(){return"CEE ("+(cur.numExp||"")+")"+"_"+(cur.direccion||"")}

function genBody(){
  var nC=cur.calTipo==="No tiene instalada";var nR=cur.refTipo==="No tiene instalada";
  return "Hola,\n\nDatos de la visita CEE:\n\nDirección: "+cur.direccion+", CP "+cur.cp+"\nCliente: "+cur.nombre+" — DNI: "+cur.dni+"\nRef. catastral: "+cur.refCatastral+"\nMunicipio: "+getMuni()+"\nTipo: "+cur.tipoViv+(cur.reformaImportante?" — Reforma: "+cur.reformaAnyo:"")+"\n\n--- ENVOLVENTE ---\nFachada: "+(cur.fachadaTipo||"—")+(cur.murosEspesor?" ("+cur.murosEspesor+" cm)":"")+"\nCarpintería: "+(cur.carpinteria||"—")+" / "+(cur.acristalamiento||"—")+" / "+(cur.permeabilidad||"—")+"\nTecho: "+(cur.techo||"—")+(cur.techoAislada?" (aislada: "+cur.techoAislada+")":"")+"\nSuelo: "+(cur.suelo||"—")+"\n\n--- CALEFACCIÓN ---\n"+(nC?"No tiene instalada":"Tipo: "+(cur.calTipo||"—")+"\nCombustible: "+(cur.calComb||"—")+"\nDistribución: "+(cur.calDist||"—")+"\nAntigüedad: "+(cur.calAntig||"—")+"\nPotencia: "+(cur.calPotencia?cur.calPotencia+" kW":"—")+"\nRendimiento: "+(cur.calRendimiento||"—")+"\n% vivienda: "+(cur.calPct?cur.calPct+"%":"—"))+"\n\n--- REFRIGERACIÓN ---\n"+(nR?"No tiene instalada":"Tipo: "+(cur.refTipo||"—")+"\nCombustible: "+(cur.refComb||"—")+"\nAntigüedad: "+(cur.refAntig||"—")+"\nPotencia: "+(cur.refPotencia?cur.refPotencia+" kW":"—")+"\nRendimiento: "+(cur.refRendimiento||"—")+"\n% climatizada: "+(cur.refPct?cur.refPct+"%":"—"))+"\n\n--- ACS ---\nTipo: "+(cur.acsTipo||"—")+"\nModalidad: "+(cur.acsModalidad||"—")+(cur.acsMixta?" (mixta)":"")+"\nAcumulación: "+(cur.acsAcum||"—")+"\nCombustible: "+(cur.acsComb||"—")+"\n\n--- RENOVABLES ---\nPaneles: "+(cur.renPaneles?"Sí — "+cur.renPotencia+" kW — Año: "+cur.renAnyo:"No")+"\n\nObs: "+(cur.obs||"sin observaciones")+"\n\nAdjunto: PDF checklist, foto fachada, PDF croquis\n\n"+cfg.firma;
}

async function doSave(){
  if(cur.estado==="pendiente")cur.estado="visitado";
  await dbPut(cur);
  exps=await dbGetAll();
  exps.sort(function(a,b){return new Date(b.fecha)-new Date(a.fecha)});
  toast("Expediente guardado");
  setTimeout(function(){go("home");screens.home()},800);
}

async function doSend(){
  cur.estado="enviado";
  await dbPut(cur);
  exps=await dbGetAll();
  exps.sort(function(a,b){return new Date(b.fecha)-new Date(a.fecha)});
  toast("Marcado como enviado");
  setTimeout(function(){go("home");screens.home()},1200);
}

// ========== PDF GENERATION ==========
async function dlChecklist(){
  try{
    var jsPDF=window.jspdf&&window.jspdf.jsPDF;
    if(!jsPDF){toast("Cargando generador PDF...");return}
    var doc=new jsPDF("p","mm","a4");
    var y=15,lm=20,pw=170;

    // Header
    doc.setFillColor(74,138,128);doc.rect(0,0,210,28,"F");
    doc.setTextColor(255,255,255);doc.setFontSize(16);doc.setFont("helvetica","bold");
    doc.text("CHECKLIST VISITA CEE",lm,12);
    doc.setFontSize(10);doc.setFont("helvetica","normal");
    doc.text("Joanfe Ribes — Oficina Tècnica — Tel. 605 875 899",lm,19);
    if(cur.numExp){doc.setFontSize(12);doc.text("Exp. "+cur.numExp,190,12,{align:"right"})}
    doc.setFontSize(9);doc.text(new Date().toLocaleDateString("es-ES"),190,19,{align:"right"});
    y=35;doc.setTextColor(0,0,0);

    function title(t){
      if(y>265){doc.addPage();y=15}
      doc.setFillColor(74,138,128);doc.rect(lm,y-4,pw,7,"F");
      doc.setTextColor(255,255,255);doc.setFontSize(10);doc.setFont("helvetica","bold");
      doc.text(t,lm+3,y+1);doc.setTextColor(0,0,0);y+=10;
    }
    function row(l,v){
      if(y>275){doc.addPage();y=15}
      doc.setFontSize(9);doc.setFont("helvetica","bold");doc.text(l+":",lm+2,y);
      doc.setFont("helvetica","normal");doc.text(String(v||"—"),lm+55,y);y+=5.5;
    }

    title("DATOS GENERALES");
    row("Dirección",cur.direccion+(cur.cp?", CP "+cur.cp:""));
    row("Cliente",cur.nombre);row("DNI",cur.dni);row("Teléfono",cur.telefono);
    row("Ref. catastral",cur.refCatastral);row("Municipio",getMuni());
    row("Tipo",cur.tipoViv);
    if(cur.reformaImportante)row("Reforma","Sí — Año "+cur.reformaAnyo);
    y+=3;

    title("ENVOLVENTE — MUROS");
    row("Fachada",cur.fachadaTipo);row("Espesor",cur.murosEspesor?cur.murosEspesor+" cm":"—");y+=2;

    title("ENVOLVENTE — HUECOS");
    row("Carpintería",cur.carpinteria);row("Acristalamiento",cur.acristalamiento);row("Permeabilidad",cur.permeabilidad);y+=2;

    title("CUBIERTA Y SUELO");
    row("Techo",cur.techo+(cur.techoAislada?" (aislada: "+cur.techoAislada+")":""));row("Suelo",cur.suelo);y+=3;

    var noCal=cur.calTipo==="No tiene instalada";
    title("CALEFACCIÓN");
    if(noCal){row("Sistema","No tiene")}else{
      row("Tipo",cur.calTipo);row("Combustible",cur.calComb);row("Distribución",cur.calDist);
      row("Antigüedad",cur.calAntig);row("% vivienda",cur.calPct?cur.calPct+"%":"—");
      row("Potencia",cur.calPotencia?cur.calPotencia+" kW":"—");row("Rendimiento",cur.calRendimiento||"—");
    }y+=3;

    var noRef=cur.refTipo==="No tiene instalada";
    title("REFRIGERACIÓN");
    if(noRef){row("Sistema","No tiene")}else{
      row("Tipo",cur.refTipo);row("Combustible",cur.refComb);row("Antigüedad",cur.refAntig);
      row("% climatizada",cur.refPct?cur.refPct+"%":"—");
      row("Potencia",cur.refPotencia?cur.refPotencia+" kW":"—");row("Rendimiento",cur.refRendimiento||"—");
    }y+=3;

    title("ACS");
    row("Tipo",cur.acsTipo);
    row("Modalidad",cur.acsModalidad+(cur.acsMixta?" (mixta con calefacción)":""));
    row("Acumulación",cur.acsAcum);row("Combustible",cur.acsComb);y+=3;

    title("RENOVABLES");
    if(cur.renPaneles){row("Paneles","Sí");row("Potencia",cur.renPotencia+" kW");row("Año",cur.renAnyo)}
    else{row("Paneles","No")}y+=3;

    title("OBSERVACIONES");
    doc.setFontSize(9);doc.setFont("helvetica","normal");
    var lines=doc.splitTextToSize(cur.obs||"Sin observaciones",pw-6);
    doc.text(lines,lm+3,y);

    // Footer
    var pages=doc.getNumberOfPages();
    for(var i=1;i<=pages;i++){
      doc.setPage(i);doc.setFillColor(74,138,128);doc.rect(0,287,210,10,"F");
      doc.setTextColor(255,255,255);doc.setFontSize(8);
      doc.text("Joanfe Ribes Oficina Tècnica — joanferibes@gmail.com — Plaça Major, 15 · 2n · Pedreguer · 03750",105,293,{align:"center"});
    }

    var name="checklist_CEE_"+(cur.numExp||"sin")+"_"+cur.direccion.replace(/[^a-zA-Z0-9]/g,"_").substring(0,25)+".pdf";
    doc.save(name);
    toast("PDF checklist descargado");
  }catch(e){toast("Error: "+e.message);console.error(e)}
}

async function dlCroquis(num){
  var data=num===1?cur.fCroq1:cur.fCroq2;
  if(!data){toast("No hay croquis "+num);return}
  try{
    var jsPDF=window.jspdf&&window.jspdf.jsPDF;
    if(!jsPDF){toast("Cargando generador PDF...");return}
    var doc=new jsPDF("l","mm","a4");
    doc.setFillColor(74,138,128);doc.rect(0,0,297,12,"F");
    doc.setTextColor(255,255,255);doc.setFontSize(11);doc.setFont("helvetica","bold");
    doc.text("CROQUIS "+num+" — "+(cur.direccion||""),10,8);
    doc.setFontSize(8);doc.setFont("helvetica","normal");
    doc.text("Joanfe Ribes — Oficina Tècnica",287,8,{align:"right"});
    doc.addImage(data,"JPEG",10,18,277,175);
    var name="croquis"+num+"_CEE_"+(cur.numExp||"")+".pdf";
    doc.save(name);
    toast("Croquis "+num+" descargado");
  }catch(e){toast("Error: "+e.message);console.error(e)}
}

function openMailto(){
  var a=document.createElement("a");
  a.href="mailto:"+encodeURIComponent(cfg.email)+"?subject="+encodeURIComponent(genAsunto())+"&body="+encodeURIComponent(genBody());
  a.click();
}

// ========== EMAIL SCREEN ==========
screens.email=function(){renderEmail()};
function renderEmail(){
  val("e-to",cfg.email);val("e-asunto",genAsunto());val("e-body",genBody());
  $("btn-email-back").onclick=function(){go("guardar")};
  $("btn-email-send").onclick=function(){openMailto();doSend()};
}

// ========== CONFIG EMAIL ==========
screens.cfgmail=function(){renderCfg()};
function renderCfg(){
  val("cfg-email",cfg.email);val("cfg-nombre",cfg.nombre);val("cfg-firma",cfg.firma);
  $("btn-save-cfg").onclick=async function(){
    cfg.email=val("cfg-email");cfg.nombre=val("cfg-nombre");cfg.firma=val("cfg-firma");
    await dbPutConfig(cfg);toast("Configuración guardada");
    setTimeout(function(){go("guardar")},600);
  };
}

// ========== START ==========
document.addEventListener("DOMContentLoaded",init);

// Back buttons
document.addEventListener("click",function(e){
  var t=e.target.closest("[data-back]");
  if(t){go(t.getAttribute("data-back"))}
});

})();
