/* ===== ADAPTEKK · "Mangueras hidráulicas" dentro del configurador =====
   Asistente paso a paso: una pregunta a la vez, migajas arriba, flecha de regreso por paso.
   El motor solo ofrece opciones que EXISTEN en el catálogo (filtra en cualquier orden).
   Renderiza en #cfg-body (la misma pantalla del configurador). Usa window._cfgOnBack para la flecha del encabezado.
   Depende de window.ATConfigurador, window.DATA y (opcional) FICHAS_MANGUERAS/APLICACIONES_MANGUERA/FLUIDOS_NBR. */
(function(){
  'use strict';
  if(!window.ATConfigurador||!window.DATA){ console.warn('mcfg: falta ATConfigurador/DATA'); return; }
  var AC=window.ATConfigurador, DATA=window.DATA, HOSES=DATA.hoses, CONNS=DATA.conns;
  var FICHAS=window.FICHAS_MANGUERAS||{}, APLIS=window.APLICACIONES_MANGUERA||{}, FLU=window.FLUIDOS_NBR||{aptos:[],noAptos:[]};
  var NAVY='#001F5B', ROJO='#C8102E';
  var FAM_LABEL={H:'Hembra giratoria',M:'Macho',B:'Brida',C:'Caterpillar (CAT)',O:'Otro'};
  var SYS_SUB={DuoFit:'2 mallas · media-alta presión',TetraFit:'4 espirales · alta presión',HexaFit:'6 espirales · muy alta presión'};
  var SYS_PSI={DuoFit:'hasta ~5,800 psi',TetraFit:'hasta ~6,500 psi',HexaFit:'hasta ~6,000 psi'};

  function E(id){return document.getElementById(id);}
  function el(tag,cls,html){var d=document.createElement(tag);if(cls)d.className=cls;if(html!=null)d.innerHTML=html;return d;}
  function money(n){return '$'+Number(n).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function dnum(d){return parseInt(d,10);}
  function body(){ return E('cfg-body'); }

  // tarjeta de opcion (mismo estandar config-opt)
  function card(label,sub,onClick,accent){
    var d=el('div','config-opt');
    d.innerHTML='<div class="config-opt-label">'+label+'</div>'+(sub?'<div class="config-opt-sub">'+sub+'</div>':'');
    if(accent){ d.style.borderColor=ROJO; }
    d.addEventListener('click',onClick); return d;
  }
  function grid(min){var g=el('div','config-options');if(min)g.style.gridTemplateColumns='repeat(auto-fill,minmax('+min+'px,1fr))';return g;}
  function primaryBtn(label,onClick){
    var b=el('button',null,label);
    b.style.cssText='margin-top:14px;background:'+NAVY+';color:#fff;border:none;border-radius:12px;padding:15px 22px;font-size:16px;font-weight:600;cursor:pointer;width:100%;font-family:inherit;';
    b.addEventListener('click',onClick); return b;
  }
  function numInput(id,ph,val){
    var i=el('input'); i.id=id; i.type='number'; i.min='0'; i.placeholder=ph||''; if(val)i.value=val;
    i.style.cssText='width:100%;padding:14px 16px;border:1.5px solid #e8e8ed;border-radius:12px;font-size:17px;color:'+NAVY+';font-weight:600;outline:none;font-family:inherit;';
    i.addEventListener('focus',function(){i.style.borderColor=NAVY;});
    i.addEventListener('blur',function(){i.style.borderColor='#e8e8ed';});
    return i;
  }
  function fieldLabel(txt){var l=el('div',null,txt);l.style.cssText='font-size:13px;font-weight:600;color:'+NAVY+';margin:0 0 7px 2px;';return l;}

  // ---- migajas: tira discreta de lo elegido, cada una clickeable para regresar a ese paso ----
  function crumbBar(crumbs){
    var bar=el('div'); bar.style.cssText='display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:18px;min-height:24px;';
    crumbs.forEach(function(c,i){
      if(i>0){ var sep=el('span','','›'); sep.style.cssText='color:#c7c7cc;font-size:13px;'; bar.appendChild(sep); }
      var ch=el('span',null,c.label);
      ch.style.cssText='font-size:12px;font-weight:600;color:'+NAVY+';background:#EEF4FF;border-radius:999px;padding:4px 11px;cursor:'+(c.onClick?'pointer':'default')+';';
      if(c.onClick) ch.addEventListener('click',c.onClick);
      bar.appendChild(ch);
    });
    return bar;
  }
  // encabezado del paso: flecha de regreso (en linea) + pregunta
  function stepHead(pregunta,onBack){
    var w=el('div'); w.style.cssText='display:flex;align-items:center;gap:12px;margin-bottom:20px;';
    if(onBack){
      var b=el('button',null,'&#8592;');
      b.style.cssText='flex:none;width:38px;height:38px;border-radius:50%;border:1.5px solid #e8e8ed;background:#fff;color:'+NAVY+';font-size:18px;cursor:pointer;line-height:1;';
      b.title='Regresar un paso'; b.addEventListener('click',onBack); w.appendChild(b);
    }
    var qd=el('div','config-panel-q',pregunta); qd.style.margin='0'; qd.style.textAlign='left'; qd.style.flex='1';
    w.appendChild(qd); return w;
  }

  // ---- motor de opciones disponibles en catalogo ----
  // valores distintos de `campo` entre items (CONNS por defecto) que cumplen `filtros`
  function disponibles(campo, filtros, fuente){
    fuente=fuente||CONNS; var seen={}, out=[];
    fuente.forEach(function(c){
      for(var k in filtros){ if(filtros[k]!=null && c[k]!==filtros[k]) return; }
      var v=c[campo]; if(v==null) return;
      if(!(v in seen)){ seen[v]=c; out.push({v:v,item:c}); }
    });
    return out;
  }

  // ================= ESTADO =================
  var M={};
  window.mcfgStart=function(){ M={view:'menu'}; window._cfgOnBack=function(){ if(typeof window.cfgReset==='function') window.cfgReset(); }; render(); };
  window.mcfgBack=function(){ if(typeof window._cfgOnBack==='function') window._cfgOnBack(); };
  // Acceso directo desde el menu o el catalogo: abre el configurador y arranca el flujo de mangueras
  window.abrirMangueras=function(){ if(typeof window.showPage==='function') window.showPage('cfg'); setTimeout(function(){ if(window.mcfgStart) window.mcfgStart(); }, 70); };

  function setHeader(title,sub){ var t=E('cfg-title'),s=E('cfg-sub'); if(t)t.textContent=title; if(s)s.textContent=sub||''; }

  function render(){
    var b=body(); if(!b) return; b.innerHTML='';
    var p=el('div','config-panel active'); b.appendChild(p);
    if(M.view==='menu')      return renderMenu(p);
    if(M.view==='conector')  return renderConector(p);
    if(M.view==='metros')    return renderMetros(p);
    if(M.view==='ensamble')  return renderEnsamble(p);
  }

  // ================= MENU =================
  function renderMenu(p){
    setHeader('Mangueras hidráulicas','¿Qué necesitas?');
    window._cfgOnBack=function(){ if(typeof window.cfgReset==='function') window.cfgReset(); };
    p.appendChild(stepHead('¿Qué necesitas?', window._cfgOnBack));
    var g=grid(220);
    g.appendChild(card('Armar mi manguera','Ensamble: manguera + 2 extremos', function(){ M={view:'ensamble',stage:'datos',A:{},B:{},ai:0,bi:0}; render(); }));
    g.appendChild(card('Conector de manguera','Espiga o terminal para prensar', function(){ M={view:'conector',sel:{},idx:0}; render(); }));
    g.appendChild(card('Manguera por metro','Cortada a la medida que necesitas', function(){ M={view:'metros',sel:{},idx:0}; render(); }));
    p.appendChild(g);
  }

  // ================= CONECTOR (espiga suelta) =================
  // orden: angulo -> estandar -> genero -> mallas(sistema) -> medida
  var CONN_FIELDS=[
    {key:'ak', preg:'¿Qué ángulo?',        label:function(it){return it.aL;},           crumb:function(it){return it.aL;}},
    {key:'sk', preg:'¿Qué estándar?',      label:function(it){return it.sl;},           crumb:function(it){return it.sl;}},
    {key:'g',  preg:'¿Hembra o macho?',    label:function(it){return FAM_LABEL[it.g];}, crumb:function(it){return FAM_LABEL[it.g];}},
    {key:'sys',preg:'¿Para cuántas mallas?',label:function(it){return it.sys;}, sub:function(it){return SYS_SUB[it.sys]+' · '+SYS_PSI[it.sys];}, crumb:function(it){return it.sys;}},
    {key:'th', preg:'¿Qué medida?',        label:function(it){return it.ml;},           crumb:function(it){return it.ml;}}
  ];
  function renderConector(p){
    setHeader('Conector de manguera','Espiga para prensar');
    runWizard(p, CONN_FIELDS, M.sel, function(){ M.idx=M.idx; }, function(idx){ M.idx=idx; render(); }, function(){ M={view:'menu'}; render(); },
      function(){ // onComplete: mostrar espiga exacta
        var f=M.sel, match=CONNS.filter(function(c){return c.ak===f.ak&&c.sk===f.sk&&c.g===f.g&&c.sys===f.sys&&c.th===f.th;}).sort(function(a,b){return a.s-b.s;})[0];
        if(match) p.appendChild(resultPieza(match,'espiga'));
        else p.appendChild(noResult('No hay una espiga con esa combinación.'));
      }, 'idx');
  }

  // ================= ENSAMBLE =================
  // extremo: angulo -> estandar -> genero -> medida (el sistema/manguera lo decide el motor por presion)
  var EXT_FIELDS=[
    {key:'ak', preg:'Ángulo',          label:function(it){return it.aL;},           crumb:function(it){return it.aL;}},
    {key:'sk', preg:'Estándar',        label:function(it){return it.sl;},           crumb:function(it){return it.sl;}},
    {key:'g',  preg:'Hembra o macho',  label:function(it){return FAM_LABEL[it.g];}, crumb:function(it){return FAM_LABEL[it.g];}},
    {key:'th', preg:'Medida',          label:function(it){return it.ml;},           crumb:function(it){return it.ml;}}
  ];
  function renderEnsamble(p){
    setHeader('Armar mi manguera','Manguera + 2 extremos');
    if(M.stage==='datos'){
      window._cfgOnBack=function(){ M={view:'menu'}; render(); };
      p.appendChild(stepHead('Datos del ensamble', window._cfgOnBack));
      var wrap=el('div'); wrap.style.maxWidth='520px';
      var w1=el('div'); w1.style.marginBottom='16px'; w1.appendChild(fieldLabel('Presión de trabajo (PSI)')); w1.appendChild(numInput('mcfg-pres','Ej. 3000',M.pres)); wrap.appendChild(w1);
      var w2=el('div'); w2.style.marginBottom='8px'; w2.appendChild(fieldLabel('Largo total de la manguera (metros)')); w2.appendChild(numInput('mcfg-largo','Ej. 5',M.largo)); wrap.appendChild(w2);
      wrap.appendChild(primaryBtn('Continuar a los extremos →', function(){
        var P=parseFloat(E('mcfg-pres').value), L=parseFloat(E('mcfg-largo').value);
        if(!P||P<=0){ alert('Indica la presión de trabajo en PSI.'); return; }
        if(!L||L<=0){ alert('Indica el largo total en metros.'); return; }
        M.pres=P; M.largo=L; M.stage='A'; M.ai=0; render();
      }));
      p.appendChild(wrap); return;
    }
    if(M.stage==='A'){
      // barra resumen presion/largo arriba
      p.appendChild(datosResumen());
      runWizard(p, EXT_FIELDS, M.A, null, function(idx){ M.ai=idx; render(); }, function(){ M.stage='datos'; render(); },
        function(){ p.appendChild(primaryBtn('Continuar al extremo B →', function(){ M.stage='B'; M.bi=0; render(); })); }, 'ai', 'Extremo A');
      return;
    }
    if(M.stage==='B'){
      p.appendChild(datosResumen());
      runWizard(p, EXT_FIELDS, M.B, null, function(idx){ M.bi=idx; render(); }, function(){ M.stage='A'; render(); },
        function(){ p.appendChild(primaryBtn('Ver mi manguera →', function(){ M.stage='result'; render(); })); }, 'bi', 'Extremo B');
      return;
    }
    if(M.stage==='result'){
      window._cfgOnBack=function(){ M.stage='B'; render(); };
      p.appendChild(stepHead('Tu manguera', window._cfgOnBack));
      var r=AC.cotizar({largo:M.largo,presion:M.pres,A:M.A,B:M.B});
      if(r.error){ p.appendChild(noResult(r.error)); return; }
      p.appendChild(resultEnsamble(r)); return;
    }
  }
  function datosResumen(){
    var d=el('div'); d.style.cssText='display:flex;gap:18px;margin-bottom:16px;padding:12px 16px;background:#f7f9fc;border-radius:12px;font-size:13px;';
    d.innerHTML='<span>Presión: <b style="color:'+NAVY+'">'+M.pres+' PSI</b></span><span>Largo total: <b style="color:'+NAVY+'">'+M.largo+' m</b></span>';
    return d;
  }

  // ---- wizard generico: una pregunta a la vez + migajas + flecha por paso ----
  // fields: arreglo de campos. sel: objeto de seleccion. idxKey: nombre de la prop de indice en M.
  function runWizard(p, fields, sel, _u, onIdx, onExit0, onComplete, idxKey, titulo){
    var idx = M[idxKey]||0;
    // migajas de pasos ya elegidos
    var crumbs=[]; if(titulo) crumbs.push({label:titulo});
    for(var i=0;i<idx;i++){ (function(i){
      var f=fields[i], val=sel[f.key];
      var it=disponibles(f.key, prefijo(fields,sel,i)).filter(function(o){return o.v===val;})[0];
      crumbs.push({label:f.crumb(it?it.item:({})), onClick:function(){ M[idxKey]=i; render(); }});
    })(i); }
    if(crumbs.length) p.appendChild(crumbBar(crumbs));
    // paso actual o resultado
    if(idx>=fields.length){ if(onComplete) onComplete(); return; }
    var f=fields[idx];
    var onBack=function(){ if(idx===0){ window._cfgOnBack=onExit0; onExit0(); } else { onIdx(idx-1); } };
    window._cfgOnBack=onBack;
    p.appendChild(stepHead(f.preg, onBack));
    var opciones=disponibles(f.key, prefijo(fields,sel,idx));
    // ordenar medidas numericamente
    if(f.key==='th') opciones.sort(function(a,b){return dnum(a.v)-dnum(b.v);});
    var g=grid(f.key==='th'?110:(f.key==='sys'?200:150));
    opciones.forEach(function(o){
      var sub=f.sub?f.sub(o.item):null;
      g.appendChild(card(f.label(o.item),sub,function(){ sel[f.key]=o.v; M[idxKey]=idx+1; render(); }, sel[f.key]===o.v));
    });
    p.appendChild(g);
  }
  // construye el objeto de filtros con lo elegido en los pasos < hasta
  function prefijo(fields,sel,hasta){ var f={}; for(var i=0;i<hasta;i++){ var k=fields[i].key; if(sel[k]!=null) f[k]=sel[k]; } return f; }

  // ================= METROS por aplicación =================
  function renderMetros(p){
    setHeader('Manguera por metro','Cortada a la medida');
    var s=M.sel, idx=M.idx||0;
    var tiposDisp=function(apl){ var t={}; HOSES.forEach(function(h){ var tipo=h.code.split('-')[1]; var fi=FICHAS[tipo];
        if(!apl || (fi&&fi.aplicaciones&&fi.aplicaciones.indexOf(apl)>=0)) t[tipo]=1; }); return Object.keys(t); };
    // migajas
    var crumbs=[]; if(s.apl) crumbs.push({label:(APLIS[s.apl]?APLIS[s.apl].label:s.apl),onClick:function(){M.idx=0;render();}});
    if(s.tipo) crumbs.push({label:s.tipo,onClick:function(){M.idx=1;render();}});
    if(s.dash&&s.hose) crumbs.push({label:s.hose.dl+'"',onClick:function(){M.idx=2;render();}});
    if(crumbs.length) p.appendChild(crumbBar(crumbs));

    // paso 0: aplicacion
    if(idx===0){
      window._cfgOnBack=function(){ M={view:'menu'}; render(); };
      p.appendChild(stepHead('¿Para qué aplicación?', window._cfgOnBack));
      var g=grid(180);
      g.appendChild(card('Todas','Ver todas las mangueras',function(){ s.apl=null; M.idx=1; render(); }));
      var aplsUsadas={}; HOSES.forEach(function(h){ var fi=FICHAS[h.code.split('-')[1]]; if(fi&&fi.aplicaciones) fi.aplicaciones.forEach(function(a){aplsUsadas[a]=1;}); });
      Object.keys(aplsUsadas).forEach(function(a){ var info=APLIS[a]||{label:a}; g.appendChild(card(info.label,info.sub||'',function(){ s.apl=a; M.idx=1; render(); }, s.apl===a)); });
      p.appendChild(g); return;
    }
    // paso 1: tipo de manguera (filtrado por aplicacion)
    if(idx===1){
      window._cfgOnBack=function(){ M.idx=0; render(); };
      p.appendChild(stepHead('Tipo de manguera', window._cfgOnBack));
      var g=grid(150);
      tiposDisp(s.apl).sort().forEach(function(t){ var fi=FICHAS[t]||{};
        g.appendChild(card(fi.nombre||t, fi.norma||'', function(){ s.tipo=t; M.idx=2; render(); }, s.tipo===t)); });
      p.appendChild(g); return;
    }
    // paso 2: medida
    if(idx===2){
      window._cfgOnBack=function(){ M.idx=1; render(); };
      p.appendChild(stepHead('Medida', window._cfgOnBack));
      var g=grid(110);
      HOSES.filter(function(h){return h.code.split('-')[1]===s.tipo;}).sort(function(a,b){return dnum(a.dash)-dnum(b.dash);}).forEach(function(h){
        g.appendChild(card(h.dl+'"','PT '+h.wp+' psi',function(){ s.dash=h.dash; s.hose=h; M.idx=3; render(); }, s.dash===h.dash)); });
      p.appendChild(g); return;
    }
    // paso 3: metros + resultado + ficha
    window._cfgOnBack=function(){ M.idx=2; render(); };
    p.appendChild(stepHead('¿Cuántos metros?', window._cfgOnBack));
    var wrap=el('div'); wrap.style.maxWidth='520px';
    var w=el('div'); w.style.marginBottom='10px'; w.appendChild(fieldLabel('Metros')); w.appendChild(numInput('mcfg-metros','Ej. 10',s.metros)); wrap.appendChild(w);
    var out=el('div'); out.id='mcfg-out'; wrap.appendChild(out);
    function calc(){ out.innerHTML=''; var mt=parseFloat(E('mcfg-metros').value); if(!mt||mt<=0) return; s.metros=mt; out.appendChild(resultPieza(s.hose,'manguera',mt)); out.appendChild(fichaManguera(s.tipo)); }
    wrap.querySelector('#mcfg-metros').addEventListener('input',calc);
    p.appendChild(wrap); if(s.metros) calc();
  }

  // ---- ficha tecnica de manguera (norma, refuerzo, temp, fluidos) ----
  function fichaManguera(tipo){
    var fi=FICHAS[tipo]; var w=el('div'); w.style.cssText='margin-top:14px;border:1px solid #e8e8ed;border-radius:14px;padding:16px 18px;font-size:13px;color:#5b6577;line-height:1.6;';
    var h='<div style="font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:'+NAVY+';margin-bottom:8px;">Ficha técnica</div>';
    if(fi){ h+='<div><b>Norma:</b> '+fi.norma+'</div><div><b>Refuerzo:</b> '+fi.refuerzo+'</div>';
      if(fi.tempC) h+='<div><b>Temperatura:</b> '+fi.tempC[0]+'°C a +'+fi.tempC[1]+'°C</div>';
      if(fi.msha) h+='<div><b>MSHA:</b> retardante de flama (minería)</div>'; }
    if(FLU.aptos&&FLU.aptos.length){ h+='<div style="margin-top:8px;"><b>Fluidos aptos:</b> '+FLU.aptos.join(', ')+'.</div>'; }
    if(FLU.noAptos&&FLU.noAptos.length){ h+='<div style="margin-top:4px;color:#8a6100;"><b>No apta para:</b> '+FLU.noAptos.join(', ')+'.</div>'; }
    w.innerHTML=h; return w;
  }

  // ---- resultados ----
  function noResult(msg){ var d=el('div'); d.style.cssText='background:#FFF7E6;border:1px solid #f0d9a0;border-radius:14px;padding:18px 20px;color:#8a6100;font-size:15px;font-weight:500;'; d.textContent=msg; return d; }

  function resultEnsamble(r){
    var w=el('div'); w.style.maxWidth='560px';
    var head=el('div'); head.style.cssText='display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:18px;';
    head.innerHTML='<div><span style="display:inline-block;background:#EEF4FF;color:'+NAVY+';font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;">'+r.sistema+'</span> <span style="display:inline-block;background:#f1f1f4;color:#5b6577;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;">'+r.mallas+'</span><div style="margin-top:10px;font-size:13px;color:#86868b;">Presión: <b style="color:'+NAVY+'">'+M.pres+' PSI</b></div></div>'
      +'<div style="text-align:right;"><div style="font-size:11px;color:#86868b;font-weight:600;text-transform:uppercase;">Precio</div><div style="font-size:26px;font-weight:800;color:'+NAVY+';line-height:1;">'+money(r.precio)+'</div></div>';
    w.appendChild(head);
    var dz=el('div'); dz.style.cssText='border:1px solid #e8e8ed;border-radius:16px;overflow:hidden;margin-bottom:14px;';
    var rows='<div style="background:#f7f9fc;padding:10px 16px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#86868b;display:flex;justify-content:space-between;"><span>Componente</span><span>Cantidad</span></div>';
    r.desglose.forEach(function(d){ var u=d.unit==='m'?(d.qty+' m'):(d.qty+' pza');
      rows+='<div style="padding:13px 16px;border-top:1px solid #f0f0f2;display:flex;justify-content:space-between;gap:10px;"><div style="min-width:0;"><div style="font-weight:700;color:'+NAVY+';font-size:14px;">'+d.code+'</div><div style="font-size:12px;color:#86868b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+(d.name||'')+'</div></div><div style="font-weight:700;color:'+NAVY+';font-size:14px;white-space:nowrap;">'+u+'</div></div>'; });
    dz.innerHTML=rows; w.appendChild(dz);
    var nota=el('div'); nota.style.cssText='font-size:13px;color:#5b6577;background:#f7f9fc;border-radius:12px;padding:12px 16px;margin-bottom:8px;line-height:1.5;';
    if(r.cutKnown) nota.innerHTML='Largo total <b>'+r.largoTotal+' m</b>. Se corta la manguera a <b style="color:'+NAVY+'">'+r.metros+' m</b> (se descuentan '+r.cutmm+' mm que ocupan los extremos).';
    else nota.innerHTML='Largo total <b>'+r.largoTotal+' m</b>. <span style="color:#8a6100;">El corte exacto queda pendiente: un extremo no tiene su medida de corte cargada.</span>';
    w.appendChild(nota);
    w.appendChild(fichaManguera(r.manguera.code.split('-')[1]));
    w.appendChild(primaryBtn('Agregar a mi cotización', function(){
      window.MCFG_PENDING=window.MCFG_PENDING||[];
      window.MCFG_PENDING.push({tipo:'ensamble',sistema:r.sistema,largoTotal:r.largoTotal,metros:r.metros,precio:r.precio,desglose:r.desglose});
      if(typeof window.showToast==='function') window.showToast('\u2713 Ensamble guardado en tu cotización'); else alert('Ensamble guardado.');
    }));
    var alt=el('div'); alt.style.cssText='text-align:center;margin-top:12px;';
    var a=el('span',null,'Armar otra manguera'); a.style.cssText='font-size:14px;font-weight:600;color:'+NAVY+';cursor:pointer;'; a.addEventListener('click',function(){ M={view:'ensamble',stage:'datos',A:{},B:{},ai:0,bi:0}; render(); }); alt.appendChild(a); w.appendChild(alt);
    return w;
  }

  function resultPieza(item,kind,metros){
    var w=el('div'); w.style.cssText='border:1px solid #e8e8ed;border-radius:16px;padding:18px 20px;margin-top:8px;max-width:520px;';
    var precio=kind==='manguera'?item.s*(metros||1):item.s, cant=kind==='manguera'?(metros+' m'):'1 pza';
    w.innerHTML='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;"><div style="min-width:0;"><div style="font-weight:800;color:'+NAVY+';font-size:17px;">'+item.code+'</div><div style="font-size:13px;color:#86868b;margin-top:3px;">'+(item.name||'')+'</div><div style="font-size:12px;color:#86868b;margin-top:6px;">Cantidad: <b style="color:'+NAVY+'">'+cant+'</b></div></div><div style="text-align:right;"><div style="font-size:11px;color:#86868b;font-weight:600;text-transform:uppercase;">Precio</div><div style="font-size:23px;font-weight:800;color:'+NAVY+';line-height:1;">'+money(precio)+'</div></div></div>';
    w.appendChild(primaryBtn('Agregar a mi cotización',function(){
      window.MCFG_PENDING=window.MCFG_PENDING||[];
      window.MCFG_PENDING.push({tipo:kind,code:item.code,name:item.name,qty:kind==='manguera'?metros:1,precio:precio});
      if(typeof window.showToast==='function') window.showToast('\u2713 '+item.code+' agregado a tu cotización'); else alert(item.code+' agregado.');
    }));
    return w;
  }

})();
