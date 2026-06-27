/* ===== ADAPTEKK · "Mangueras hidráulicas" dentro del configurador (v3) =====
   Asistente paso a paso. Conector: mallas -> estándar (agrupado, sin duplicados) -> macho/hembra -> ángulo -> medida.
   Ensamble: presión + largo, luego cada extremo igual PERO sin elegir mallas (el motor decide la manguera).
   El motor solo ofrece lo que existe en catálogo (predicados acumulados, cualquier orden). Renderiza en #cfg-body. */
(function(){
  'use strict';
  if(!window.ATConfigurador||!window.DATA){ console.warn('mcfg: falta ATConfigurador/DATA'); return; }
  var AC=window.ATConfigurador, DATA=window.DATA, HOSES=DATA.hoses, CONNS=DATA.conns;
  var FICHAS=window.FICHAS_MANGUERAS||{}, APLIS=window.APLICACIONES_MANGUERA||{}, FLU=window.FLUIDOS_NBR||{aptos:[],noAptos:[]};
  var NAVY='#001F5B', ROJO='#C8102E';

  // info de cada sistema para el paso de presión/mallas (tabla Strobbe + presiones de referencia)
  var SYS_INFO={
    DuoFit:{serie:'Megafit · Serie 210', mallas:'1 a 2 mallas', presion:'Media-alta · hasta ~5,800 psi', desc:'Hidráulica general e industrial. La opción más flexible.', uso:'Maquinaria general, agrícola y construcción'},
    TetraFit:{serie:'Xtrafit · Serie 223', mallas:'2 mallas / 4 espirales', presion:'Alta · hasta ~6,500 psi', desc:'Hidráulica móvil y trabajo pesado. Construcción robusta.', uso:'Equipo pesado y alto impulso'},
    HexaFit:{serie:'Spiralfit · Serie 240', mallas:'4 a 6 espirales', presion:'Muy alta · hasta ~6,000 psi', desc:'Trabajo pesado extremo. Máxima resistencia.', uso:'Minería, gran caudal e impulsos severos'}
  };
  var SYS_ORDER=['DuoFit','TetraFit','HexaFit'];

  function E(id){return document.getElementById(id);}
  function el(tag,cls,html){var d=document.createElement(tag);if(cls)d.className=cls;if(html!=null)d.innerHTML=html;return d;}
  function money(n){return '$'+Number(n).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function dnum(d){return parseInt(d,10);}
  function body(){ return E('cfg-body'); }

  // agrupadores (segmentación limpia)
  function familia(c){ return c.sl.replace(/\s*giratori[ao]\s*/ig,' ').replace(/\s+/g,' ').trim(); }
  function terminal(c){
    if(c.g==='M') return /giratori/i.test(c.sl)?'Macho giratorio':'Macho';
    if(c.g==='H') return 'Hembra giratoria';
    if(c.g==='B') return 'Brida'; if(c.g==='C') return 'CAT'; return c.sl;
  }

  function card(label,sub,onClick,sel){
    var d=el('div','config-opt');
    d.innerHTML='<div class="config-opt-label">'+label+'</div>'+(sub?'<div class="config-opt-sub">'+sub+'</div>':'');
    if(sel){ d.style.borderColor=ROJO; d.style.boxShadow='0 0 0 3px rgba(200,16,46,.1)'; }
    d.addEventListener('click',onClick); return d;
  }
  function grid(min){var g=el('div','config-options');if(min)g.style.gridTemplateColumns='repeat(auto-fill,minmax('+min+'px,1fr))';return g;}
  function primaryBtn(label,onClick){
    var b=el('button',null,label);
    b.style.cssText='margin-top:16px;background:'+NAVY+';color:#fff;border:none;border-radius:12px;padding:15px 22px;font-size:16px;font-weight:600;cursor:pointer;width:100%;font-family:inherit;';
    b.addEventListener('click',onClick); return b;
  }
  function numInput(id,ph,val){
    var i=el('input'); i.id=id; i.type='number'; i.min='0'; i.placeholder=ph||''; if(val)i.value=val;
    i.style.cssText='width:100%;padding:14px 16px;border:1.5px solid #e8e8ed;border-radius:12px;font-size:17px;color:'+NAVY+';font-weight:600;outline:none;font-family:inherit;';
    i.addEventListener('focus',function(){i.style.borderColor=NAVY;}); i.addEventListener('blur',function(){i.style.borderColor='#e8e8ed';}); return i;
  }
  function fieldLabel(txt){var l=el('div',null,txt);l.style.cssText='font-size:13px;font-weight:600;color:'+NAVY+';margin:0 0 7px 2px;';return l;}
  function crumbBar(crumbs){
    var bar=el('div'); bar.style.cssText='display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:18px;min-height:22px;';
    crumbs.forEach(function(c,i){
      if(i>0){ var s=el('span',null,'›'); s.style.cssText='color:#c7c7cc;font-size:13px;'; bar.appendChild(s); }
      var ch=el('span',null,c.label); ch.style.cssText='font-size:12px;font-weight:600;color:'+NAVY+';background:#EEF4FF;border-radius:999px;padding:4px 11px;cursor:'+(c.onClick?'pointer':'default')+';';
      if(c.onClick) ch.addEventListener('click',c.onClick); bar.appendChild(ch);
    });
    return bar;
  }
  function stepHead(preg,onBack){
    var w=el('div'); w.style.cssText='display:flex;align-items:center;gap:12px;margin-bottom:20px;';
    if(onBack){ var b=el('button',null,'&#8592;'); b.style.cssText='flex:none;width:38px;height:38px;border-radius:50%;border:1.5px solid #e8e8ed;background:#fff;color:'+NAVY+';font-size:18px;cursor:pointer;line-height:1;'; b.title='Regresar un paso'; b.addEventListener('click',onBack); w.appendChild(b); }
    var qd=el('div','config-panel-q',preg); qd.style.margin='0'; qd.style.textAlign='left'; qd.style.flex='1'; w.appendChild(qd); return w;
  }

  // ====== motor de opciones disponibles (predicados acumulados) ======
  // steps: [{key, group(c), ...}]. devuelve valores distintos del group del paso idx, entre los que cumplen pasos < idx
  function opcionesDe(steps, sel, idx, scope){
    var seen={}, out=[];
    (scope||CONNS).forEach(function(c){
      for(var i=0;i<idx;i++){ var s=steps[i]; if(s.group(c)!==sel[s.key]) return; }
      var v=steps[idx].group(c); if(v==null) return;
      if(!(v in seen)){ seen[v]=c; out.push({v:v,item:c}); }
    });
    return out;
  }
  function matchAll(steps, sel, scope){
    return (scope||CONNS).filter(function(c){ for(var i=0;i<steps.length;i++){ var s=steps[i]; if(sel[s.key]!=null && s.group(c)!==sel[s.key]) return false; } return true; });
  }

  // ====== definición de pasos ======
  var STEP_SYS ={key:'sys', preg:'¿Para cuánta presión?', group:function(c){return c.sys;}};
  var STEP_FAM ={key:'fam', preg:'¿Qué estándar de conexión?', group:familia, crumb:function(v){return v;}};
  var STEP_TERM={key:'term',preg:'¿Macho o hembra?', group:terminal, crumb:function(v){return v;}};
  var STEP_AK  ={key:'ak',  preg:'¿Qué ángulo?', group:function(c){return c.ak;}, label:function(it){return it.aL;}, crumb:function(v,it){return it?it.aL:v;}};
  var STEP_TH  ={key:'th',  preg:'¿Qué medida?', group:function(c){return c.th;}, label:function(it){return it.ml;}, crumb:function(v,it){return it?it.ml:v;}, numeric:true};
  var CONN_STEPS=[STEP_SYS,STEP_FAM,STEP_TERM,STEP_AK,STEP_TH];
  var EXT_STEPS =[STEP_FAM,STEP_TERM,STEP_AK,STEP_TH];

  // ====== estado ======
  var M={};
  window.mcfgStart=function(){ M={view:'menu'}; window._cfgOnBack=function(){ if(typeof window.cfgReset==='function') window.cfgReset(); }; render(); };
  window.mcfgBack=function(){ if(typeof window._cfgOnBack==='function') window._cfgOnBack(); };
  window.abrirMangueras=function(){ if(typeof window.showPage==='function') window.showPage('cfg'); setTimeout(function(){ if(window.mcfgStart) window.mcfgStart(); }, 70); };
  function setHeader(t,s){ var a=E('cfg-title'),b=E('cfg-sub'); if(a)a.textContent=t; if(b)b.textContent=s||''; }

  function render(){
    var b=body(); if(!b) return; b.innerHTML='';
    var p=el('div','config-panel active'); b.appendChild(p);
    if(M.view==='menu')     return renderMenu(p);
    if(M.view==='conector') return renderConector(p);
    if(M.view==='metros')   return renderMetros(p);
    if(M.view==='ensamble') return renderEnsamble(p);
  }

  // ====== MENU ======
  function renderMenu(p){
    setHeader('Mangueras hidráulicas','¿Qué necesitas?');
    window._cfgOnBack=function(){ if(typeof window.cfgReset==='function') window.cfgReset(); };
    p.appendChild(stepHead('¿Qué necesitas?', window._cfgOnBack));
    var g=grid(220);
    g.appendChild(card('Armar mi manguera','Ensamble: manguera + 2 extremos',function(){ M={view:'ensamble',stage:'datos',A:{},B:{},ai:0,bi:0}; render(); }));
    g.appendChild(card('Conector de manguera','Espiga o terminal para prensar',function(){ M={view:'conector',sel:{},idx:0}; render(); }));
    g.appendChild(card('Manguera por metro','Cortada a la medida que necesitas',function(){ M={view:'metros',sel:{},idx:0}; render(); }));
    p.appendChild(g);
  }

  // ====== paso de SISTEMA (mallas/presión) con explicación tipo tabla ======
  function sysStep(p, onPick, onBack, scope){
    p.appendChild(stepHead('¿Para cuánta presión?', onBack));
    var intro=el('div',null,'Elige según la presión de trabajo. Si no sabes las mallas, guíate por la presión.');
    intro.style.cssText='font-size:13px;color:#86868b;margin:-8px 0 16px 2px;'; p.appendChild(intro);
    var disp={}; (scope||CONNS).forEach(function(c){disp[c.sys]=1;});
    var g=grid(240);
    SYS_ORDER.forEach(function(sys){ if(!disp[sys]) return; var info=SYS_INFO[sys];
      var d=el('div','config-opt'); d.style.cssText+=';text-align:left;align-items:stretch;min-height:0;padding:18px 18px;';
      d.innerHTML='<div style="font-size:17px;font-weight:800;color:'+NAVY+';">'+sys+'</div>'
        +'<div style="font-size:11px;font-weight:600;color:#86868b;margin:2px 0 10px;">'+info.serie+'</div>'
        +'<div style="font-size:12px;font-weight:700;color:'+ROJO+';margin-bottom:6px;">'+info.presion+'</div>'
        +'<div style="font-size:12px;color:#5b6577;line-height:1.5;margin-bottom:6px;">'+info.desc+'</div>'
        +'<div style="font-size:11px;color:#9aa3b2;">'+info.mallas+' · '+info.uso+'</div>';
      d.addEventListener('click',function(){ onPick(sys); });
      g.appendChild(d);
    });
    p.appendChild(g);
  }

  // ====== CONECTOR ======
  function renderConector(p){
    setHeader('Conector de manguera','Espiga para prensar');
    var sel=M.sel, idx=M.idx||0, steps=CONN_STEPS;
    // migajas
    var crumbs=[]; for(var i=0;i<idx;i++){ (function(i){ var s=steps[i], it=opcionesDe(steps,sel,i).filter(function(o){return o.v===sel[s.key];})[0];
      crumbs.push({label:(s.crumb?s.crumb(sel[s.key],it&&it.item):sel[s.key]), onClick:function(){ M.idx=i; render(); }}); })(i); }
    if(crumbs.length) p.appendChild(crumbBar(crumbs));
    if(idx>=steps.length){ // resultado
      window._cfgOnBack=function(){ M.idx=steps.length-1; render(); };
      var match=matchAll(steps,sel).sort(function(a,b){return a.s-b.s;})[0];
      if(match) p.appendChild(resultPieza(match,'espiga'));
      else p.appendChild(noResult('No hay una espiga con esa combinación.'));
      return;
    }
    var onBack=function(){ if(idx===0){ M={view:'menu'}; render(); } else { M.idx=idx-1; render(); } };
    window._cfgOnBack=onBack;
    if(steps[idx].key==='sys'){ sysStep(p, function(v){ sel.sys=v; M.idx=1; render(); }, onBack); return; }
    var s=steps[idx];
    p.appendChild(stepHead(s.preg, onBack));
    var ops=opcionesDe(steps,sel,idx); if(s.numeric) ops.sort(function(a,b){return dnum(a.v)-dnum(b.v);});
    var g=grid(s.key==='th'?110:150);
    ops.forEach(function(o){ var lab=s.label?s.label(o.item):o.v; g.appendChild(card(lab,null,function(){ sel[s.key]=o.v; M.idx=idx+1; render(); }, sel[s.key]===o.v)); });
    p.appendChild(g);
  }

  // ====== ENSAMBLE ======
  function renderEnsamble(p){
    setHeader('Armar mi manguera','Manguera + 2 extremos');
    if(M.stage==='datos'){
      window._cfgOnBack=function(){ M={view:'menu'}; render(); };
      p.appendChild(stepHead('Datos del ensamble', window._cfgOnBack));
      var wrap=el('div'); wrap.style.maxWidth='520px';
      var w1=el('div'); w1.style.marginBottom='16px'; w1.appendChild(fieldLabel('Presión de trabajo (PSI)')); w1.appendChild(numInput('mcfg-pres','Ej. 3000',M.pres)); wrap.appendChild(w1);
      var w2=el('div'); w2.appendChild(fieldLabel('Largo total de la manguera (metros)')); w2.appendChild(numInput('mcfg-largo','Ej. 5',M.largo)); wrap.appendChild(w2);
      wrap.appendChild(primaryBtn('Continuar a los extremos →', function(){
        var P=parseFloat(E('mcfg-pres').value), L=parseFloat(E('mcfg-largo').value);
        if(!P||P<=0){ alert('Indica la presión de trabajo en PSI.'); return; }
        if(!L||L<=0){ alert('Indica el largo total en metros.'); return; }
        M.pres=P; M.largo=L; M.stage='A'; M.ai=0; render();
      }));
      p.appendChild(wrap); return;
    }
    if(M.stage==='A'||M.stage==='B'){
      var lado=M.stage, sel=M[lado], idx=(lado==='A'?M.ai:M.bi)||0, steps=EXT_STEPS;
      p.appendChild(extremosBar(lado));
      // migajas del extremo
      var crumbs=[{label:'Extremo '+lado}]; for(var i=0;i<idx;i++){ (function(i){ var s=steps[i], it=opcionesDe(steps,sel,i).filter(function(o){return o.v===sel[s.key];})[0];
        crumbs.push({label:(s.crumb?s.crumb(sel[s.key],it&&it.item):sel[s.key]), onClick:function(){ setIdx(lado,i); render(); }}); })(i); }
      p.appendChild(crumbBar(crumbs));
      if(idx>=steps.length){ // extremo completo
        window._cfgOnBack=function(){ setIdx(lado,steps.length-1); render(); };
        if(lado==='A') p.appendChild(primaryBtn('Continuar al extremo B →', function(){ M.stage='B'; M.bi=0; render(); }));
        else p.appendChild(primaryBtn('Ver mi manguera →', function(){ M.stage='result'; render(); }));
        return;
      }
      var onBack=function(){ if(idx===0){ if(lado==='A'){ M.stage='datos'; } else { M.stage='A'; } render(); } else { setIdx(lado,idx-1); render(); } };
      window._cfgOnBack=onBack;
      var s=steps[idx];
      p.appendChild(stepHead(s.preg, onBack));
      var ops=opcionesDe(steps,sel,idx); if(s.numeric) ops.sort(function(a,b){return dnum(a.v)-dnum(b.v);});
      var g=grid(s.key==='th'?110:150);
      ops.forEach(function(o){ var lab=s.label?s.label(o.item):o.v; g.appendChild(card(lab,null,function(){ sel[s.key]=o.v; setIdx(lado,idx+1); render(); }, sel[s.key]===o.v)); });
      p.appendChild(g); return;
    }
    if(M.stage==='result'){
      window._cfgOnBack=function(){ M.stage='B'; render(); };
      p.appendChild(stepHead('Tu manguera', window._cfgOnBack));
      var A=derivaExtremo(M.A), B=derivaExtremo(M.B);
      if(!A||!B){ p.appendChild(noResult('Falta completar algún extremo.')); return; }
      var r=AC.cotizar({largo:M.largo,presion:M.pres,A:A,B:B});
      if(r.error){ p.appendChild(noResult(r.error)); return; }
      p.appendChild(resultEnsamble(r)); return;
    }
  }
  function setIdx(lado,v){ if(lado==='A') M.ai=v; else M.bi=v; }
  // deriva {g,sk,th,ak} del extremo para el motor (familia+terminal -> sk único)
  function derivaExtremo(sel){ var c=matchAll(EXT_STEPS,sel)[0]; if(!c) return null; return {g:c.g,sk:c.sk,th:c.th,ak:c.ak}; }

  // resumen de ambos extremos (visible durante la selección)
  function extremosBar(activo){
    function cardLado(lado){
      var sel=M[lado], done=(lado==='A'?M.ai:M.bi)>=EXT_STEPS.length;
      var on=(lado===activo); var partes=[];
      EXT_STEPS.forEach(function(s){ if(sel[s.key]!=null){ var it=matchAll(EXT_STEPS, pick(sel,s.key))[0]; partes.push(s.crumb?s.crumb(sel[s.key],it):sel[s.key]); } });
      var det=partes.length?partes.join(' · '):'Sin definir';
      var ac=done?'#1d7d34':(on?ROJO:'#c7c7cc');
      return '<div style="flex:1;min-width:0;background:'+(done?'#f1f9f3':(on?'#fdf4f5':'#fbfbfd'))+';border:1.5px solid '+(done?'#bfe6c8':(on?'#f3c9d0':'#ececf0'))+';border-radius:14px;padding:11px 13px;">'
        +'<div style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:'+ac+';">Extremo '+lado+'</div>'
        +'<div style="margin-top:5px;font-size:13px;font-weight:'+(partes.length?'600':'400')+';color:'+(partes.length?NAVY:'#b0b0b8')+';line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+det+'</div></div>';
    }
    var d=el('div'); d.style.cssText='margin-bottom:16px;';
    d.innerHTML='<div style="display:flex;gap:18px;font-size:13px;margin-bottom:10px;"><span>Presión: <b style="color:'+NAVY+'">'+M.pres+' PSI</b></span><span>Largo: <b style="color:'+NAVY+'">'+M.largo+' m</b></span></div>'
      +'<div style="display:flex;gap:10px;">'+cardLado('A')+cardLado('B')+'</div>';
    return d;
  }
  function pick(sel,upto){ var o={}; for(var i=0;i<EXT_STEPS.length;i++){ var k=EXT_STEPS[i].key; if(sel[k]!=null) o[k]=sel[k]; if(k===upto) break; } return o; }

  // ====== METROS ======
  function renderMetros(p){
    setHeader('Manguera por metro','Cortada a la medida');
    var s=M.sel, idx=M.idx||0;
    function tipos(apl){ var t={}; HOSES.forEach(function(h){ var tp=h.code.split('-')[1], fi=FICHAS[tp]; if(!apl||(fi&&fi.aplicaciones&&fi.aplicaciones.indexOf(apl)>=0)) t[tp]=1; }); return Object.keys(t); }
    var crumbs=[]; if(s.apl!==undefined&&idx>0) crumbs.push({label:(s.apl?(APLIS[s.apl]?APLIS[s.apl].label:s.apl):'Todas'),onClick:function(){M.idx=0;render();}});
    if(s.tipo) crumbs.push({label:s.tipo,onClick:function(){M.idx=1;render();}});
    if(s.hose) crumbs.push({label:s.hose.dl+'"',onClick:function(){M.idx=2;render();}});
    if(crumbs.length) p.appendChild(crumbBar(crumbs));
    if(idx===0){
      window._cfgOnBack=function(){ M={view:'menu'}; render(); };
      p.appendChild(stepHead('¿Para qué aplicación?', window._cfgOnBack));
      var g=grid(180);
      g.appendChild(card('Todas','Ver todas las mangueras',function(){ s.apl=null; M.idx=1; render(); }));
      var us={}; HOSES.forEach(function(h){ var fi=FICHAS[h.code.split('-')[1]]; if(fi&&fi.aplicaciones) fi.aplicaciones.forEach(function(a){us[a]=1;}); });
      Object.keys(us).forEach(function(a){ var info=APLIS[a]||{label:a}; g.appendChild(card(info.label,info.sub||'',function(){ s.apl=a; M.idx=1; render(); }, s.apl===a)); });
      p.appendChild(g); return;
    }
    if(idx===1){
      window._cfgOnBack=function(){ M.idx=0; render(); };
      p.appendChild(stepHead('Tipo de manguera', window._cfgOnBack));
      var g=grid(150);
      tipos(s.apl).sort().forEach(function(t){ var fi=FICHAS[t]||{}; g.appendChild(card(fi.nombre||t, fi.norma||'', function(){ s.tipo=t; M.idx=2; render(); }, s.tipo===t)); });
      p.appendChild(g); return;
    }
    if(idx===2){
      window._cfgOnBack=function(){ M.idx=1; render(); };
      p.appendChild(stepHead('Medida', window._cfgOnBack));
      var g=grid(110);
      HOSES.filter(function(h){return h.code.split('-')[1]===s.tipo;}).sort(function(a,b){return dnum(a.dash)-dnum(b.dash);}).forEach(function(h){ g.appendChild(card(h.dl+'"','PT '+h.wp+' psi',function(){ s.hose=h; M.idx=3; render(); }, s.hose&&s.hose.code===h.code)); });
      p.appendChild(g); return;
    }
    window._cfgOnBack=function(){ M.idx=2; render(); };
    p.appendChild(stepHead('¿Cuántos metros?', window._cfgOnBack));
    var wrap=el('div'); wrap.style.maxWidth='520px';
    var w=el('div'); w.style.marginBottom='10px'; w.appendChild(fieldLabel('Metros')); w.appendChild(numInput('mcfg-metros','Ej. 10',s.metros)); wrap.appendChild(w);
    var out=el('div'); out.id='mcfg-out'; wrap.appendChild(out);
    function calc(){ out.innerHTML=''; var mt=parseFloat(E('mcfg-metros').value); if(!mt||mt<=0) return; s.metros=mt; out.appendChild(resultPieza(s.hose,'manguera',mt)); out.appendChild(fichaManguera(s.tipo)); }
    wrap.querySelector('#mcfg-metros').addEventListener('input',calc);
    p.appendChild(wrap); if(s.metros) calc();
  }

  // ====== fichas y resultados ======
  function fichaManguera(tipo){
    var fi=FICHAS[tipo]; var w=el('div'); w.style.cssText='margin-top:14px;border:1px solid #e8e8ed;border-radius:14px;padding:16px 18px;font-size:13px;color:#5b6577;line-height:1.6;';
    var h='<div style="font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:'+NAVY+';margin-bottom:8px;">Ficha técnica</div>';
    if(fi){ h+='<div><b>Norma:</b> '+fi.norma+'</div><div><b>Refuerzo:</b> '+fi.refuerzo+'</div>'; if(fi.tempC) h+='<div><b>Temperatura:</b> '+fi.tempC[0]+'°C a +'+fi.tempC[1]+'°C</div>'; if(fi.msha) h+='<div><b>MSHA:</b> retardante de flama (minería)</div>'; }
    if(FLU.aptos&&FLU.aptos.length) h+='<div style="margin-top:8px;"><b>Fluidos aptos:</b> '+FLU.aptos.join(', ')+'.</div>';
    if(FLU.noAptos&&FLU.noAptos.length) h+='<div style="margin-top:4px;color:#8a6100;"><b>No apta para:</b> '+FLU.noAptos.join(', ')+'.</div>';
    w.innerHTML=h; return w;
  }
  function noResult(msg){ var d=el('div'); d.style.cssText='background:#FFF7E6;border:1px solid #f0d9a0;border-radius:14px;padding:18px 20px;color:#8a6100;font-size:15px;font-weight:500;'; d.textContent=msg; return d; }

  function resultEnsamble(r){
    var w=el('div'); w.style.maxWidth='560px';
    var head=el('div'); head.style.cssText='display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:18px;';
    head.innerHTML='<div><span style="display:inline-block;background:#EEF4FF;color:'+NAVY+';font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;">'+r.sistema+'</span> <span style="display:inline-block;background:#f1f1f4;color:#5b6577;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;">'+r.mallas+'</span><div style="margin-top:10px;font-size:13px;color:#86868b;">Presión: <b style="color:'+NAVY+'">'+M.pres+' PSI</b></div></div><div style="text-align:right;"><div style="font-size:11px;color:#86868b;font-weight:600;text-transform:uppercase;">Precio</div><div style="font-size:26px;font-weight:800;color:'+NAVY+';line-height:1;">'+money(r.precio)+'</div></div>';
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
    w.appendChild(primaryBtn('Agregar a mi cotización', function(){ window.MCFG_PENDING=window.MCFG_PENDING||[]; window.MCFG_PENDING.push({tipo:'ensamble',sistema:r.sistema,largoTotal:r.largoTotal,metros:r.metros,precio:r.precio,desglose:r.desglose}); if(typeof window.showToast==='function') window.showToast('\u2713 Ensamble guardado en tu cotización'); else alert('Ensamble guardado.'); }));
    var alt=el('div'); alt.style.cssText='text-align:center;margin-top:12px;'; var a=el('span',null,'Armar otra manguera'); a.style.cssText='font-size:14px;font-weight:600;color:'+NAVY+';cursor:pointer;'; a.addEventListener('click',function(){ M={view:'ensamble',stage:'datos',A:{},B:{},ai:0,bi:0}; render(); }); alt.appendChild(a); w.appendChild(alt);
    return w;
  }

  function resultPieza(item,kind,metros){
    var w=el('div'); w.style.cssText='border:1px solid #e8e8ed;border-radius:16px;padding:18px 20px;margin-top:8px;max-width:520px;';
    var precio=kind==='manguera'?item.s*(metros||1):item.s, cant=kind==='manguera'?(metros+' m'):'1 pza';
    var medida = kind==='espiga' ? '<div style="font-size:12px;color:#86868b;margin-top:4px;">Medida de conexión: <b style="color:'+NAVY+'">'+(item.ml||item.th)+'</b></div>' : '';
    w.innerHTML='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;"><div style="min-width:0;"><div style="font-weight:800;color:'+NAVY+';font-size:17px;">'+item.code+'</div><div style="font-size:13px;color:#86868b;margin-top:3px;">'+(item.name||'')+'</div>'+medida+'<div style="font-size:12px;color:#86868b;margin-top:6px;">Cantidad: <b style="color:'+NAVY+'">'+cant+'</b></div></div><div style="text-align:right;"><div style="font-size:11px;color:#86868b;font-weight:600;text-transform:uppercase;">Precio</div><div style="font-size:23px;font-weight:800;color:'+NAVY+';line-height:1;">'+money(precio)+'</div></div></div>';
    w.appendChild(primaryBtn('Agregar a mi cotización',function(){ window.MCFG_PENDING=window.MCFG_PENDING||[]; window.MCFG_PENDING.push({tipo:kind,code:item.code,name:item.name,qty:kind==='manguera'?metros:1,precio:precio}); if(typeof window.showToast==='function') window.showToast('\u2713 '+item.code+' agregado a tu cotización'); else alert(item.code+' agregado.'); }));
    return w;
  }
})();
