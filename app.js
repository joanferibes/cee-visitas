(function(){
"use strict";

// ========== DATABASE ==========
var DB_NAME="cee_visitas";var DB_VER=2;
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
function dbGetAll(){return openDB().then(function(db){return new Promise(function(resolve,reject){var tx=db.transaction("expedientes","readonly");var r=tx.objectStore("expedientes").getAll();r.onsuccess=function(){resolve(r.result)};r.onerror=function(){reject(r.error)}})})}
function dbPut(data){return openDB().then(function(db){return new Promise(function(resolve,reject){var tx=db.transaction("expedientes","readwrite");tx.objectStore("expedientes").put(data);tx.oncomplete=function(){resolve()};tx.onerror=function(){reject(tx.error)}})})}
function dbGetConfig(){return openDB().then(function(db){return new Promise(function(resolve,reject){var tx=db.transaction("config","readonly");var r=tx.objectStore("config").get("emailConfig");r.onsuccess=function(){resolve(r.result||null)};r.onerror=function(){reject(r.error)}})})}
function dbPutConfig(data){data.key="emailConfig";return openDB().then(function(db){return new Promise(function(resolve,reject){var tx=db.transaction("config","readwrite");tx.objectStore("config").put(data);tx.oncomplete=function(){resolve()};tx.onerror=function(){reject(tx.error)}})})}

// ========== STATE ==========
var MUNI=["Pedreguer","Dénia","Ondara","Xàbia","Teulada","Gata de Gorgos","El Verger","Benitatxell","Els Poblets","Otro"];
var exps=[];var cur=null;var isNew=true;
var cfg={email:"",nombre:"",firma:"Saludos,\nJuan Felipe Ribes\nArquitecto Técnico — col. 3.184\nTel. 605 875 899",scriptUrl:""};

function mkExp(){return{
  id:Date.now().toString(),numExp:"",nombre:"",dni:"",telefono:"",direccion:"",cp:"",refCatastral:"",municipio:"",municipioOtro:"",
  estado:"pendiente",tipoViv:"",reformaImportante:false,reformaAnyo:"",
  fachadaTipo:"",fachadaAislamiento:"",murosEspesor:"",carpinteria:"",acristalamiento:"",permeabilidad:"",
  techo:"",techoAislada:"",suelo:"",
  calTipo:"",calComb:"",calDist:"",calAntig:"",calPct:"",calPotencia:"",calRendimiento:"",
  refTipo:"",refComb:"",refAntig:"",refPct:"",refPotencia:"",refRendimiento:"",
  acsTipo:"",acsModalidad:"",acsAcum:"",acsComb:"",acsMixta:false,
  renPaneles:false,renPotencia:"",renAnyo:"",
  obs:"",fFach:null,fDet:null,fCroq1:null,fCroq2:null,
  fecha:new Date().toISOString()
}}

function getMuni(){return cur.municipio==="Otro"?cur.municipioOtro:cur.municipio}
function fmtDate(d){try{return new Date(d).toLocaleDateString("es-ES")}catch(e){return""}}

// ========== HELPERS ==========
var currentScreen="home";
function $(id){return document.getElementById(id)}
function html(id,h){var el=$(id);if(el)el.innerHTML=h}
function show(id){var el=$(id);if(el)el.classList.remove("hidden")}
function hide(id){var el=$(id);if(el)el.classList.add("hidden")}
function val(id,v){var el=$(id);if(!el)return"";if(v!==undefined)el.value=v;return el.value}
function go(name){
  var el=$("screen-"+currentScreen);if(el)el.classList.add("hidden");
  currentScreen=name;
  if(typeof screens[name]==="function")screens[name]();
  var el2=$("screen-"+name);if(el2)el2.classList.remove("hidden");
  window.scrollTo(0,0);
}
function toast(msg){var t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(function(){t.classList.remove("show")},2500)}

var screens={};

// ========== INIT ==========
async function init(){
  try{
    exps=await dbGetAll();exps.sort(function(a,b){return new Date(b.fecha)-new Date(a.fecha)});
    var c=await dbGetConfig();if(c)cfg=c;
  }catch(e){console.error(e)}
  renderHome();go("home");
  function updateOnline(){
    document.querySelectorAll(".online-dot").forEach(function(d){d.className="dot "+(navigator.onLine?"dot-on":"dot-off")});
    document.querySelectorAll(".online-label").forEach(function(l){l.textContent=navigator.onLine?" Online":" Offline"});
  }
  window.addEventListener("online",updateOnline);window.addEventListener("offline",updateOnline);updateOnline();
}

// ========== HOME ==========
screens.home=function(){
  $("stat-p").textContent=exps.filter(function(e){return e.estado==="pendiente"}).length;
  $("stat-v").textContent=exps.filter(function(e){return e.estado==="visitado"}).length;
  $("stat-e").textContent=exps.filter(function(e){return e.estado==="enviado"}).length;
};
function renderHome(){
  $("btn-expedientes").onclick=function(){renderExpedientes();go("expedientes")};
  $("btn-nuevo").onclick=function(){cur=mkExp();isNew=true;renderDatos();go("datos")};
}

// ========== EXPEDIENTES ==========
screens.expedientes=function(){renderExpedientes()};
function renderExpedientes(){
  var c=$("exp-list");
  if(exps.length===0){c.innerHTML='<div style="text-align:center;padding:40px;color:#bbb;font-size:14px">No hay expedientes. Crea uno nuevo.</div>';return}
  var h="";
  exps.forEach(function(e){
    var bc=e.estado==="pendiente"?"badge-p":e.estado==="visitado"?"badge-v":"badge-e";
    var label=e.estado.charAt(0).toUpperCase()+e.estado.slice(1);
    h+='<div class="exp-item" data-id="'+e.id+'">';
    h+='<div class="exp-addr">'+(e.direccion||"Sin dirección")+'</div>';
    h+='<div class="exp-cli">'+(e.numExp?"Exp. "+e.numExp+" — ":"")+(e.nombre||"Sin nombre")+'</div>';
    h+='<div class="exp-meta"><span class="badge '+bc+'">'+label+'</span><span class="exp-ref">'+fmtDate(e.fecha)+'</span></div>';
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
  if(isNew){show("method-section")}else{hide("method-section")}
  // Fields
  ["numExp","nombre","dni","telefono","direccion","cp","refCatastral"].forEach(function(f){val("d-"+f,cur[f])});
  val("d-municipio",cur.municipio);
  if(cur.municipio==="Otro"){show("d-municipioOtro-wrap");val("d-municipioOtro",cur.municipioOtro)}else{hide("d-municipioOtro-wrap")}
  $("d-municipio").onchange=function(){cur.municipio=this.value;if(this.value==="Otro"){show("d-municipioOtro-wrap")}else{hide("d-municipioOtro-wrap")}};
  ["numExp","nombre","dni","telefono","direccion","cp","refCatastral","municipioOtro"].forEach(function(f){
    var el=$("d-"+f);if(el)el.oninput=function(){cur[f]=this.value};
  });
  $("btn-to-visita").onclick=function(){cur.municipio=val("d-municipio");renderVisita();go("visita")};
}

// ========== VISITA (Step 2) ==========
screens.visita=function(){renderVisita()};
function renderVisita(){
  val("v-tipoViv",cur.tipoViv);$("v-tipoViv").onchange=function(){cur.tipoViv=this.value};

  // Reforma
  var ckRef=$("v-reforma-ck");
  ckRef.className="ck-box"+(cur.reformaImportante?" checked":"");ckRef.textContent=cur.reformaImportante?"✓":"";
  ckRef.onclick=function(){cur.reformaImportante=!cur.reformaImportante;renderVisita()};
  if(cur.reformaImportante){show("v-reformaAnyo-wrap");val("v-reformaAnyo",cur.reformaAnyo)}else{hide("v-reformaAnyo-wrap")}
  $("v-reformaAnyo").oninput=function(){cur.reformaAnyo=this.value};

  // Envolvente
  ["fachadaTipo","fachadaAislamiento","carpinteria","acristalamiento","permeabilidad","techo","techoAislada","suelo"].forEach(function(f){
    var el=$("v-"+f);if(el){val("v-"+f,cur[f]);el.onchange=function(){cur[f]=this.value}}
  });
  val("v-murosEspesor",cur.murosEspesor);$("v-murosEspesor").oninput=function(){cur.murosEspesor=this.value};

  // Calefaccion
  val("v-calTipo",cur.calTipo);$("v-calTipo").onchange=function(){cur.calTipo=this.value;renderVisita()};
  if(cur.calTipo==="No tiene instalada"){hide("cal-fields")}else{show("cal-fields")}
  ["calComb","calDist","calAntig"].forEach(function(f){var el=$("v-"+f);if(el){val("v-"+f,cur[f]);el.onchange=function(){cur[f]=this.value}}});
  ["calPct","calPotencia","calRendimiento"].forEach(function(f){var el=$("v-"+f);if(el){val("v-"+f,cur[f]);el.oninput=function(){cur[f]=this.value}}});

  // Refrigeracion
  val("v-refTipo",cur.refTipo);$("v-refTipo").onchange=function(){cur.refTipo=this.value;renderVisita()};
  if(cur.refTipo==="No tiene instalada"){hide("ref-fields")}else{show("ref-fields")}
  ["refComb","refAntig"].forEach(function(f){var el=$("v-"+f);if(el){val("v-"+f,cur[f]);el.onchange=function(){cur[f]=this.value}}});
  ["refPct","refPotencia","refRendimiento"].forEach(function(f){var el=$("v-"+f);if(el){val("v-"+f,cur[f]);el.oninput=function(){cur[f]=this.value}}});

  // ACS
  ["acsTipo","acsModalidad","acsAcum","acsComb"].forEach(function(f){var el=$("v-"+f);if(el){val("v-"+f,cur[f]);el.onchange=function(){cur[f]=this.value}}});
  var ckMixta=$("v-acsMixta-ck");ckMixta.className="ck-box"+(cur.acsMixta?" checked":"");ckMixta.textContent=cur.acsMixta?"✓":"";
  ckMixta.onclick=function(){cur.acsMixta=!cur.acsMixta;renderVisita()};

  // Renovables
  var ckRen=$("v-ren-ck");ckRen.className="ck-box"+(cur.renPaneles?" checked":"");ckRen.textContent=cur.renPaneles?"✓":"";
  ckRen.onclick=function(){cur.renPaneles=!cur.renPaneles;renderVisita()};
  if(cur.renPaneles){show("ren-fields")}else{hide("ren-fields")}
  val("v-renPotencia",cur.renPotencia);$("v-renPotencia").oninput=function(){cur.renPotencia=this.value};
  val("v-renAnyo",cur.renAnyo);$("v-renAnyo").oninput=function(){cur.renAnyo=this.value};

  // Photos
  setupPhoto("fFach","photo-fachada","file-fachada","Fachada");
  setupPhoto("fDet","photo-detalle","file-detalle","Detalle");
  setupPhoto("fCroq1","photo-croq1","file-croq1","Croquis 1");
  setupPhoto("fCroq2","photo-croq2","file-croq2","Croquis 2");

  val("v-obs",cur.obs);$("v-obs").oninput=function(){cur.obs=this.value};
  $("btn-to-guardar").onclick=function(){renderGuardar();go("guardar")};
}

function setupPhoto(field,slotId,fileId,label){
  var slot=$(slotId);var fileEl=$(fileId);
  if(cur[field]){
    slot.className="photo-slot has";
    slot.innerHTML='<img src="'+cur[field]+'" alt="">';
  }else{
    slot.className="photo-slot";
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
  html("sum-nombre",cur.nombre||"—");
  html("sum-dir",cur.direccion||"—");
  html("sum-muni",getMuni()||"—");
  html("sum-tipo",cur.tipoViv||"—");
  html("sum-numexp",cur.numExp||"—");
  if(cur.reformaImportante){html("sum-reforma","Sí — Año "+(cur.reformaAnyo||"?"));show("sum-reforma-row")}else{hide("sum-reforma-row")}
  html("sum-fachada",(cur.fachadaTipo||"—")+(cur.fachadaAislamiento?" / Aisl: "+cur.fachadaAislamiento:"")+(cur.murosEspesor?" ("+cur.murosEspesor+" cm)":""));
  html("sum-huecos",(cur.carpinteria||"—")+" / "+(cur.acristalamiento||"—")+" / "+(cur.permeabilidad||"—"));
  html("sum-techo",(cur.techo||"—")+(cur.techoAislada?" (aisl: "+cur.techoAislada+")":""));
  html("sum-suelo",cur.suelo||"—");
  var nC=cur.calTipo==="No tiene instalada";var nR=cur.refTipo==="No tiene instalada";
  html("sum-cal",nC?"No tiene":(cur.calTipo||"—")+(cur.calPct?" "+cur.calPct+"%":""));
  html("sum-ref",nR?"No tiene":(cur.refTipo||"—")+(cur.refPct?" "+cur.refPct+"%":""));
  html("sum-acs",(cur.acsTipo||"—")+" "+(cur.acsModalidad||"")+(cur.acsMixta?" (mixta)":""));
  html("sum-ren",cur.renPaneles?cur.renPotencia+" kW":"No");
  html("sum-fotos",[cur.fFach&&"fachada",cur.fDet&&"detalle"].filter(Boolean).join(", ")||"—");
  html("sum-croq",[cur.fCroq1&&"croquis 1",cur.fCroq2&&"croquis 2"].filter(Boolean).join(", ")||"—");

  html("g-email-to",cfg.email||"sin configurar");
  if(cur.fCroq1){show("dl-croq1")}else{hide("dl-croq1")}
  if(cur.fCroq2){show("dl-croq2")}else{hide("dl-croq2")}

  $("dl-checklist").onclick=dlChecklist;
  $("dl-croq1").onclick=function(){dlCroquis(1)};
  $("dl-croq2").onclick=function(){dlCroquis(2)};
  $("btn-save").onclick=doSave;
  $("btn-preview-email").onclick=function(){renderEmail();go("email")};
  $("btn-mailto").onclick=openMailto;
  $("btn-cfg-email").onclick=function(){renderCfg();go("cfgmail")};
  $("btn-gmail-draft").onclick=createGmailDraft;
}

function genAsunto(){return"CEE ("+(cur.numExp||"")+")"+"_"+(cur.direccion||"")}

function genBody(){
  var nC=cur.calTipo==="No tiene instalada";var nR=cur.refTipo==="No tiene instalada";
  var t="Datos de la visita CEE\n\n";
  t+="Nº Expediente: "+(cur.numExp||"—")+"\n";
  t+="Dirección: "+cur.direccion+", CP "+cur.cp+"\n";
  t+="Cliente: "+cur.nombre+" — DNI: "+cur.dni+"\n";
  t+="Ref. catastral: "+cur.refCatastral+"\n";
  t+="Municipio: "+getMuni()+"\n";
  t+="Tipo: "+cur.tipoViv+(cur.reformaImportante?" — Reforma: Sí, año "+cur.reformaAnyo:"")+"\n";
  t+="\n--- ENVOLVENTE ---\n";
  t+="Fachada: "+(cur.fachadaTipo||"—")+(cur.fachadaAislamiento?" / Aislamiento: "+cur.fachadaAislamiento:"")+(cur.murosEspesor?" ("+cur.murosEspesor+" cm)":"")+"\n";
  t+="Carpintería: "+(cur.carpinteria||"—")+" / "+(cur.acristalamiento||"—")+" / "+(cur.permeabilidad||"—")+"\n";
  t+="Techo: "+(cur.techo||"—")+(cur.techoAislada?" (aislada: "+cur.techoAislada+")":"")+"\n";
  t+="Suelo: "+(cur.suelo||"—")+"\n";
  t+="\n--- CALEFACCIÓN ---\n";
  if(nC){t+="No tiene instalada\n"}else{
    t+="Tipo: "+(cur.calTipo||"—")+"\nCombustible: "+(cur.calComb||"—")+"\nDistribución: "+(cur.calDist||"—")+"\n";
    t+="Antigüedad: "+(cur.calAntig||"—")+"\nPotencia: "+(cur.calPotencia?cur.calPotencia+" kW":"—")+"\nRendimiento: "+(cur.calRendimiento||"—")+"\n% vivienda: "+(cur.calPct?cur.calPct+"%":"—")+"\n";
  }
  t+="\n--- REFRIGERACIÓN ---\n";
  if(nR){t+="No tiene instalada\n"}else{
    t+="Tipo: "+(cur.refTipo||"—")+"\nCombustible: "+(cur.refComb||"—")+"\nAntigüedad: "+(cur.refAntig||"—")+"\n";
    t+="Potencia: "+(cur.refPotencia?cur.refPotencia+" kW":"—")+"\nRendimiento: "+(cur.refRendimiento||"—")+"\n% climatizada: "+(cur.refPct?cur.refPct+"%":"—")+"\n";
  }
  t+="\n--- ACS ---\n";
  t+="Tipo: "+(cur.acsTipo||"—")+"\nModalidad: "+(cur.acsModalidad||"—")+(cur.acsMixta?" (mixta con calefacción)":"")+"\nAcumulación: "+(cur.acsAcum||"—")+"\nCombustible: "+(cur.acsComb||"—")+"\n";
  t+="\n--- RENOVABLES ---\n";
  t+="Paneles: "+(cur.renPaneles?"Sí — "+cur.renPotencia+" kW — Año: "+cur.renAnyo:"No")+"\n";
  t+="\nObs: "+(cur.obs||"sin observaciones")+"\n\n"+cfg.firma;
  return t;
}

async function doSave(){
  if(cur.estado==="pendiente")cur.estado="visitado";
  await dbPut(cur);exps=await dbGetAll();exps.sort(function(a,b){return new Date(b.fecha)-new Date(a.fecha)});
  toast("Expediente guardado");setTimeout(function(){go("home");screens.home()},800);
}

// ========== PDF GENERATION ==========
async function dlChecklist(){
  try{
    var jsPDF=window.jspdf&&window.jspdf.jsPDF;
    if(!jsPDF){toast("Cargando PDF... inténtalo de nuevo en 2s");return}
    var doc=new jsPDF("p","mm","a4");var y=15,lm=20,pw=170;

    doc.setFillColor(74,138,128);doc.rect(0,0,210,28,"F");
    doc.setTextColor(255,255,255);doc.setFontSize(16);doc.setFont("helvetica","bold");
    doc.text("CHECKLIST VISITA CEE",lm,12);
    doc.setFontSize(10);doc.setFont("helvetica","normal");
    doc.text("Joanfe Ribes — Oficina Tècnica",lm,19);
    if(cur.numExp){doc.setFontSize(12);doc.text("Exp. "+cur.numExp,190,12,{align:"right"})}
    doc.setFontSize(9);doc.text(new Date().toLocaleDateString("es-ES"),190,19,{align:"right"});
    y=35;doc.setTextColor(0,0,0);

    function tt(t){if(y>265){doc.addPage();y=15}doc.setFillColor(74,138,128);doc.rect(lm,y-4,pw,7,"F");doc.setTextColor(255,255,255);doc.setFontSize(10);doc.setFont("helvetica","bold");doc.text(t,lm+3,y+1);doc.setTextColor(0,0,0);y+=10}
    function rr(l,v){if(y>275){doc.addPage();y=15}doc.setFontSize(9);doc.setFont("helvetica","bold");doc.text(l+":",lm+2,y);doc.setFont("helvetica","normal");doc.text(String(v||"—"),lm+55,y);y+=5.5}

    tt("DATOS GENERALES");
    rr("Nº Expediente",cur.numExp);
    rr("Dirección",cur.direccion+(cur.cp?", CP "+cur.cp:""));
    rr("Cliente",cur.nombre);rr("DNI",cur.dni);
    rr("Ref. catastral",cur.refCatastral);rr("Municipio",getMuni());
    rr("Tipo",cur.tipoViv);
    if(cur.reformaImportante)rr("Reforma","Sí — Año "+cur.reformaAnyo);
    y+=3;

    tt("ENVOLVENTE — MUROS");
    rr("Fachada",cur.fachadaTipo);
    rr("Aislamiento fachada",cur.fachadaAislamiento||"—");
    rr("Espesor",cur.murosEspesor?cur.murosEspesor+" cm":"—");y+=2;

    tt("ENVOLVENTE — HUECOS");
    rr("Carpintería",cur.carpinteria);rr("Acristalamiento",cur.acristalamiento);rr("Permeabilidad",cur.permeabilidad);y+=2;

    tt("CUBIERTA Y SUELO");
    rr("Techo",cur.techo+(cur.techoAislada?" (aislada: "+cur.techoAislada+")":""));rr("Suelo",cur.suelo);y+=3;

    var noCal=cur.calTipo==="No tiene instalada";
    tt("CALEFACCIÓN");
    if(noCal){rr("Sistema","No tiene")}else{
      rr("Tipo",cur.calTipo);rr("Combustible",cur.calComb);rr("Distribución",cur.calDist);
      rr("Antigüedad",cur.calAntig);rr("% vivienda",cur.calPct?cur.calPct+"%":"—");
      rr("Potencia",cur.calPotencia?cur.calPotencia+" kW":"—");rr("Rendimiento",cur.calRendimiento||"—");
    }y+=3;

    var noRef=cur.refTipo==="No tiene instalada";
    tt("REFRIGERACIÓN");
    if(noRef){rr("Sistema","No tiene")}else{
      rr("Tipo",cur.refTipo);rr("Combustible",cur.refComb);rr("Antigüedad",cur.refAntig);
      rr("% climatizada",cur.refPct?cur.refPct+"%":"—");
      rr("Potencia",cur.refPotencia?cur.refPotencia+" kW":"—");rr("Rendimiento",cur.refRendimiento||"—");
    }y+=3;

    tt("ACS");
    rr("Tipo",cur.acsTipo);rr("Modalidad",cur.acsModalidad+(cur.acsMixta?" (mixta)":""));
    rr("Acumulación",cur.acsAcum);rr("Combustible",cur.acsComb);y+=3;

    tt("RENOVABLES");
    if(cur.renPaneles){rr("Paneles","Sí");rr("Potencia",cur.renPotencia+" kW");rr("Año",cur.renAnyo)}
    else{rr("Paneles","No")}y+=3;

    tt("OBSERVACIONES");
    doc.setFontSize(9);doc.setFont("helvetica","normal");
    var lines=doc.splitTextToSize(cur.obs||"Sin observaciones",pw-6);doc.text(lines,lm+3,y);

    var pages=doc.getNumberOfPages();
    for(var i=1;i<=pages;i++){
      doc.setPage(i);doc.setFillColor(74,138,128);doc.rect(0,287,210,10,"F");
      doc.setTextColor(255,255,255);doc.setFontSize(8);
      doc.text("Joanfe Ribes Oficina Tècnica — joanferibes@gmail.com — Plaça Major, 15 · 2n · Pedreguer · 03750",105,293,{align:"center"});
    }
    doc.save("checklist_CEE_"+(cur.numExp||"sin")+".pdf");
    toast("PDF checklist descargado");
  }catch(e){toast("Error: "+e.message);console.error(e)}
}

async function dlCroquis(num){
  var data=num===1?cur.fCroq1:cur.fCroq2;
  if(!data){toast("No hay croquis "+num);return}
  try{
    var jsPDF=window.jspdf&&window.jspdf.jsPDF;
    if(!jsPDF){toast("Cargando PDF...");return}
    // If data is a PDF, just download it directly
    if(data.indexOf("data:application/pdf")===0){
      var a=document.createElement("a");a.href=data;a.download="croquis"+num+"_CEE_"+(cur.numExp||"")+".pdf";a.click();
      toast("Croquis "+num+" descargado");return;
    }
    // If image, embed in PDF
    var doc=new jsPDF("l","mm","a4");
    doc.setFillColor(74,138,128);doc.rect(0,0,297,12,"F");
    doc.setTextColor(255,255,255);doc.setFontSize(11);doc.setFont("helvetica","bold");
    doc.text("CROQUIS "+num+" — "+(cur.direccion||"")+" — Exp. "+(cur.numExp||""),10,8);
    doc.setFontSize(8);doc.setFont("helvetica","normal");
    doc.text("Joanfe Ribes — Oficina Tècnica",287,8,{align:"right"});
    // Load image to get dimensions
    var img=new Image();
    img.onload=function(){
      var maxW=277,maxH=180;
      var ratio=Math.min(maxW/img.width,maxH/img.height);
      var w=img.width*ratio,h=img.height*ratio;
      var x=(297-w)/2,yy=15+(180-h)/2;
      doc.addImage(data,"JPEG",x,yy,w,h);
      doc.save("croquis"+num+"_CEE_"+(cur.numExp||"")+".pdf");
      toast("Croquis "+num+" descargado");
    };
    img.onerror=function(){
      doc.setTextColor(0,0,0);doc.setFontSize(14);doc.text("Error al cargar imagen",148,100,{align:"center"});
      doc.save("croquis"+num+"_CEE_"+(cur.numExp||"")+".pdf");
      toast("Croquis descargado (sin imagen)");
    };
    img.src=data;
  }catch(e){toast("Error: "+e.message);console.error(e)}
}

function openMailto(){
  var a=document.createElement("a");
  a.href="mailto:"+encodeURIComponent(cfg.email)+"?subject="+encodeURIComponent(genAsunto())+"&body="+encodeURIComponent(genBody());
  a.click();
}

// ========== GMAIL DRAFT VIA APPS SCRIPT ==========
async function createGmailDraft(){
  if(!cfg.scriptUrl){toast("Configura la URL del Apps Script primero");go("cfgmail");return}
  toast("Creando borrador en Gmail...");

  var payload={
    to:cfg.email,
    subject:genAsunto(),
    body:genBody(),
    fotoFachada:cur.fFach||"",
    croquis1:cur.fCroq1||"",
    croquis2:cur.fCroq2||"",
    numExp:cur.numExp||"",
    direccion:cur.direccion||""
  };

  try{
    var resp=await fetch(cfg.scriptUrl,{
      method:"POST",
      headers:{"Content-Type":"text/plain"},
      body:JSON.stringify(payload)
    });
    var result=await resp.json();
    if(result.success){
      toast("Borrador creado en Gmail con adjuntos");
      cur.estado="enviado";
      await dbPut(cur);exps=await dbGetAll();exps.sort(function(a,b){return new Date(b.fecha)-new Date(a.fecha)});
    }else{
      toast("Error: "+(result.error||"desconocido"));
    }
  }catch(e){
    toast("Error de conexión: "+e.message);
  }
}

// ========== EMAIL SCREEN ==========
screens.email=function(){renderEmail()};
function renderEmail(){
  val("e-to",cfg.email);val("e-asunto",genAsunto());val("e-body",genBody());
  $("btn-email-back").onclick=function(){go("guardar")};
  $("btn-email-send").onclick=function(){openMailto()};
}

// ========== CONFIG EMAIL ==========
screens.cfgmail=function(){renderCfg()};
function renderCfg(){
  val("cfg-email",cfg.email);val("cfg-nombre",cfg.nombre);val("cfg-firma",cfg.firma);
  val("cfg-scriptUrl",cfg.scriptUrl||"");
  $("btn-save-cfg").onclick=async function(){
    cfg.email=val("cfg-email");cfg.nombre=val("cfg-nombre");cfg.firma=val("cfg-firma");cfg.scriptUrl=val("cfg-scriptUrl");
    await dbPutConfig(cfg);toast("Configuración guardada");
    setTimeout(function(){go("guardar")},600);
  };
}

// ========== START ==========
document.addEventListener("DOMContentLoaded",init);
document.addEventListener("click",function(e){var t=e.target.closest("[data-back]");if(t){go(t.getAttribute("data-back"))}});

})();
