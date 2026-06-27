/* ===== ADAPTEKK · Flujo "Manguera hidráulica" (configurador de ensamble + espiga + metros) =====
   Reusa el estandar estetico del sitio (clases config-*, page-header, colores navy/rojo).
   Depende de window.ATConfigurador y window.DATA (data_at.js + configurador_motor.js).
   No toca el carrito/checkout: el boton de ensamble queda en modo "cotizacion" hasta el paso 3. */
(function(){
  'use strict';
  if(!window.ATConfigurador||!window.DATA){ console.warn('mcfg: falta ATConfigurador/DATA'); return; }
  var AC=window.ATConfigurador, DATA=window.DATA, HOSES=DATA.hoses, CONNS=DATA.conns;
  var NAVY='#001F5B', ROJO='#C8102E';
  var FAM_LABEL={H:'Hembra giratoria',M:'Macho',B:'Brida',C:'Caterpillar (CAT)',O:'Otro'};
  var SYS_SUB={DuoFit:'2 mallas · baja presión',TetraFit:'4 mallas · media presión',HexaFit:'espiral · alta presión'};

  function E(id){return document.getElementById(id);}
  function el(tag,cls,html){var d=document.createElement(tag);if(cls)d.className=cls;if(html!=null)d.innerHTML=html;return d;}
  function money(n){return '$'+Number(n).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function card(label,sub,onClick){
    var d=el('div','config-opt');
    d.innerHTML='<div class="config-opt-label">'+label+'</div>'+(sub?'<div class="config-opt-sub">'+sub+'</div>':'');
    d.addEventListener('click',onClick); return d;
  }
  function q(text){return el('div','config-panel-q',text);}
  function grid(min){var g=el('div','config-options');if(min)g.style.gridTemplateColumns='repeat(auto-fill,minmax('+min+'px,1fr))';return g;}
  function primaryBtn(label,onClick){
    var b=el('button',null,label);
    b.style.cssText='margin-top:8px;background:'+NAVY+';color:#fff;border:none;border-radius:12px;padding:15px 22px;font-size:16px;font-weight:600;cursor:pointer;width:100%;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
    b.addEventListener('click',onClick); return b;
  }
  function num(id,ph){
    var i=el('input'); i.id=id; i.type='number'; i.min='0'; i.placeholder=ph||'';
    i.style.cssText='width:100%;padding:14px 16px;border:1.5px solid #e8e8ed;border-radius:12px;font-size:17px;color:'+NAVY+';font-weight:600;outline:none;font-family:inherit;';
    i.addEventListener('focus',function(){i.style.borderColor=NAVY;});
    i.addEventListener('blur',function(){i.style.borderColor='#e8e8ed';});
    return i;
  }
  function label(txt){var l=el('div',null,txt);l.style.cssText='font-size:13px;font-weight:600;color:'+NAVY+';margin:0 0 7px 2px;';return l;}

  // ---------- estado ----------
  var M={};
  window.mcfgReset=function(){ M={view:'menu'}; render(); };
  window.mcfgHeaderBack=function(){ if(M._back){ M._back(); } else { window.showPage('catalogo'); } };
  function setHeader(title,sub,back){ var t=E('mcfg-title'),s=E('mcfg-sub'); if(t)t.textContent=title; if(s)s.textContent=sub||''; M._back=back||null; }
  function body(){ return E('mcfg-body'); }

  function render(){
    var b=body(); if(!b) return; b.innerHTML='';
    if(M.view==='menu')      return renderMenu(b);
    if(M.view==='ensamble')  return renderEnsamble(b);
    if(M.view==='conector')  return renderConector(b);
    if(M.view==='metros')    return renderMetros(b);
  }

  // ---------- MENU (3 caminos) ----------
  function renderMenu(b){
    setHeader('Manguera hidráulica','¿Qué necesitas?', function(){ window.showPage('catalogo'); });
    var p=el('div','config-panel active');
    p.appendChild(q('¿Qué necesitas?'));
    var g=grid(200);
    g.appendChild(card('Configurar mi manguera','Ensamble completo: manguera + 2 extremos', function(){ M={view:'ensamble',eStep:0,A:{},B:{}}; render(); }));
    g.appendChild(card('Un conector','Espiga suelta para manguera', function(){ M={view:'conector',sel:{}}; render(); }));
    g.appendChild(card('Metros de manguera','Manguera por metro, sin extremos', function(){ M={view:'metros',sel:{}}; render(); }));
    p.appendChild(g); b.appendChild(p);
  }

  // ---------- cascada de un extremo (familia -> estandar -> medida -> angulo) ----------
  // onDone(side) cuando los 4 estan elegidos. side={g,sk,th,ak}
  function renderCascada(container, side, onChange){
    container.innerHTML='';
    // Familia
    container.appendChild(label('Tipo de extremo'));
    var gf=grid(150);
    AC.familias().forEach(function(f){
      var c=card(f.label,null,function(){ side.g=f.g; side.sk=null; side.th=null; side.ak=null; onChange(); });
      if(side.g===f.g){ c.style.borderColor=ROJO; c.style.boxShadow='0 0 0 3px rgba(200,16,46,.1)'; }
      gf.appendChild(c);
    });
    container.appendChild(gf);
    if(!side.g) return;
    // Estandar
    container.appendChild(label('Estándar de conexión'));
    var ge=grid(150);
    AC.estandares(side.g).forEach(function(e){
      var c=card(e.sl,null,function(){ side.sk=e.sk; side.th=null; side.ak=null; onChange(); });
      if(side.sk===e.sk){ c.style.borderColor=ROJO; c.style.boxShadow='0 0 0 3px rgba(200,16,46,.1)'; }
      ge.appendChild(c);
    });
    container.appendChild(ge);
    if(!side.sk) return;
    // Medida
    container.appendChild(label('Medida'));
    var gm=grid(110);
    AC.medidas(side.g,side.sk).forEach(function(m){
      var c=card(m.ml,null,function(){ side.th=m.th; side.ak=null; onChange(); });
      if(side.th===m.th){ c.style.borderColor=ROJO; c.style.boxShadow='0 0 0 3px rgba(200,16,46,.1)'; }
      gm.appendChild(c);
    });
    container.appendChild(gm);
    if(!side.th) return;
    // Angulo
    container.appendChild(label('Ángulo'));
    var ga=grid(110);
    AC.angulos(side.g,side.sk,side.th).forEach(function(a){
      var c=card(a.aL,null,function(){ side.ak=a.ak; onChange(); });
      if(side.ak===a.ak){ c.style.borderColor=ROJO; c.style.boxShadow='0 0 0 3px rgba(200,16,46,.1)'; }
      ga.appendChild(c);
    });
    container.appendChild(ga);
  }
  function sideDone(s){ return !!(s.g&&s.sk&&s.th&&s.ak); }
  function sideResumen(s){ if(!s.g)return 'Sin definir'; var p=[FAM_LABEL[s.g]]; if(s.sk){var e=AC.estandares(s.g).find(function(x){return x.sk===s.sk;});if(e)p.push(e.sl);} if(s.th){var m=AC.medidas(s.g,s.sk).find(function(x){return x.th===s.th;});if(m)p.push(m.ml);} if(s.ak&&s.ak!=='R'){var a=AC.angulos(s.g,s.sk,s.th).find(function(x){return x.ak===s.ak;});if(a)p.push(a.aL);} return p.join(' · '); }

  // ---------- ENSAMBLE ----------
  function renderEnsamble(b){
    // paso 0: largo + presion
    if(M.eStep===0){
      setHeader('Configurar mi manguera','Largo y presión de trabajo', function(){ M={view:'menu'}; render(); });
      var p=el('div','config-panel active'); p.style.maxWidth='520px'; p.style.margin='0 auto';
      p.appendChild(q('Datos del ensamble'));
      var w1=el('div'); w1.style.marginBottom='18px'; w1.appendChild(label('Largo total de la manguera (metros)')); var li=num('mcfg-largo','Ej. 5'); if(M.largo)li.value=M.largo; w1.appendChild(li); p.appendChild(w1);
      var w2=el('div'); w2.style.marginBottom='22px'; w2.appendChild(label('Presión de trabajo (PSI)')); var pi=num('mcfg-pres','Ej. 3000'); if(M.pres)pi.value=M.pres; w2.appendChild(pi); p.appendChild(w2);
      p.appendChild(primaryBtn('Continuar →', function(){
        var L=parseFloat(E('mcfg-largo').value), P=parseFloat(E('mcfg-pres').value);
        if(!L||L<=0){ alert('Indica el largo total en metros.'); return; }
        if(!P||P<=0){ alert('Indica la presión de trabajo en PSI.'); return; }
        M.largo=L; M.pres=P; M.eStep=1; render();
      }));
      b.appendChild(p); return;
    }
    // paso 1: extremo A
    if(M.eStep===1){
      setHeader('Extremo A','Define el primer extremo', function(){ M.eStep=0; render(); });
      var p=el('div','config-panel active'); var box=el('div'); renderCascada(box,M.A,function(){ renderEnsamble(b); }); p.appendChild(box);
      if(sideDone(M.A)) p.appendChild(primaryBtn('Continuar al extremo B →', function(){ M.eStep=2; render(); }));
      b.appendChild(p); return;
    }
    // paso 2: extremo B
    if(M.eStep===2){
      setHeader('Extremo B','Define el segundo extremo', function(){ M.eStep=1; render(); });
      var p=el('div','config-panel active'); var box=el('div'); renderCascada(box,M.B,function(){ renderEnsamble(b); }); p.appendChild(box);
      if(sideDone(M.B)) p.appendChild(primaryBtn('Ver mi manguera →', function(){ M.eStep=3; render(); }));
      b.appendChild(p); return;
    }
    // paso 3: resultado
    if(M.eStep===3){
      setHeader('Tu manguera','Resumen del ensamble', function(){ M.eStep=2; render(); });
      var r=AC.cotizar({largo:M.largo,presion:M.pres,A:M.A,B:M.B});
      var p=el('div','config-panel active'); p.style.maxWidth='560px'; p.style.margin='0 auto';
      if(r.error){ p.appendChild(resultError(r.error)); p.appendChild(primaryBtn('← Cambiar extremos', function(){ M.eStep=1; render(); })); b.appendChild(p); return; }
      p.appendChild(resultEnsamble(r)); b.appendChild(p); return;
    }
  }

  function resultError(msg){
    var d=el('div'); d.style.cssText='background:#FFF7E6;border:1px solid #f0d9a0;border-radius:14px;padding:18px 20px;color:#8a6100;font-size:15px;font-weight:500;margin-bottom:16px;';
    d.textContent=msg; return d;
  }
  function chip(txt,bg,col){ return '<span style="display:inline-block;background:'+bg+';color:'+col+';font-size:11px;font-weight:700;letter-spacing:.3px;padding:4px 10px;border-radius:999px;">'+txt+'</span>'; }

  function resultEnsamble(r){
    var w=el('div');
    // encabezado sistema + precio
    var head=el('div'); head.style.cssText='display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:18px;';
    head.innerHTML='<div>'+chip(r.sistema,'#EEF4FF',NAVY)+' '+chip(r.mallas,'#f1f1f4','#5b6577')+
      '<div style="margin-top:10px;font-size:13px;color:#86868b;">Presión de trabajo seleccionada: <b style="color:'+NAVY+'">'+M.pres+' PSI</b></div></div>'+
      '<div style="text-align:right;"><div style="font-size:11px;color:#86868b;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Precio</div><div style="font-size:26px;font-weight:800;color:'+NAVY+';line-height:1;">'+money(r.precio)+'</div></div>';
    w.appendChild(head);
    // tarjeta desglose
    var dz=el('div'); dz.style.cssText='border:1px solid #e8e8ed;border-radius:16px;overflow:hidden;margin-bottom:14px;';
    var th='<div style="background:#f7f9fc;padding:10px 16px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#86868b;display:flex;justify-content:space-between;"><span>Componente</span><span>Cantidad</span></div>';
    var rows='';
    r.desglose.forEach(function(d){
      var unidad=d.unit==='m'?(d.qty+' m'):(d.qty+' pza');
      rows+='<div style="padding:13px 16px;border-top:1px solid #f0f0f2;display:flex;justify-content:space-between;align-items:center;gap:10px;">'
        +'<div style="min-width:0;"><div style="font-weight:700;color:'+NAVY+';font-size:14px;">'+d.code+'</div>'
        +'<div style="font-size:12px;color:#86868b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+(d.name||'')+'</div></div>'
        +'<div style="font-weight:700;color:'+NAVY+';font-size:14px;white-space:nowrap;">'+unidad+'</div></div>';
    });
    dz.innerHTML=th+rows; w.appendChild(dz);
    // nota de corte
    var nota=el('div'); nota.style.cssText='font-size:13px;color:#5b6577;background:#f7f9fc;border-radius:12px;padding:12px 16px;margin-bottom:16px;line-height:1.5;';
    if(r.cutKnown){ nota.innerHTML='Largo total <b>'+r.largoTotal+' m</b>. Se corta la manguera a <b style="color:'+NAVY+'">'+r.metros+' m</b> (se descuentan '+r.cutmm+' mm que ocupan los dos extremos).'; }
    else { nota.innerHTML='Largo total <b>'+r.largoTotal+' m</b>. <span style="color:#8a6100;">El corte exacto queda pendiente: uno de los extremos no tiene aún su medida de corte cargada.</span>'; }
    w.appendChild(nota);
    // boton (cotizacion; carrito real = paso 3)
    w.appendChild(primaryBtn('Agregar a mi cotización', function(){
      window.MCFG_PENDING=window.MCFG_PENDING||[];
      window.MCFG_PENDING.push({tipo:'ensamble',sistema:r.sistema,largoTotal:r.largoTotal,metros:r.metros,precio:r.precio,desglose:r.desglose});
      if(typeof window.showToast==='function') window.showToast('\u2713 Ensamble guardado en tu cotización');
      else alert('Ensamble guardado en tu cotización.');
    }));
    var alt=el('div'); alt.style.cssText='text-align:center;margin-top:12px;';
    var a=el('span',null,'Configurar otra manguera'); a.style.cssText='font-size:14px;font-weight:600;color:'+NAVY+';cursor:pointer;'; a.addEventListener('click',function(){ M={view:'ensamble',eStep:0,A:{},B:{}}; render(); }); alt.appendChild(a);
    w.appendChild(alt);
    return w;
  }

  // ---------- CONECTOR (espiga suelta) ----------
  function renderConector(b){
    var s=M.sel;
    // paso mallas/sistema
    setHeader('Conector para manguera','Elige el sistema y la conexión', function(){ if(s.sys){ s.sys=null; s.g=null; s.sk=null; s.th=null; s.ak=null; render(); } else { M={view:'menu'}; render(); } });
    var p=el('div','config-panel active');
    if(!s.sys){
      p.appendChild(q('¿Para cuántas mallas?'));
      var g=grid(200);
      ['DuoFit','TetraFit','HexaFit'].forEach(function(sys){
        g.appendChild(card(sys,SYS_SUB[sys],function(){ s.sys=sys; render(); }));
      });
      p.appendChild(g); b.appendChild(p); return;
    }
    // cascada filtrada por sistema
    var box=el('div');
    renderCascadaSys(box,s,function(){ renderConector(b); });
    p.appendChild(box);
    // resultado: la espiga exacta
    if(sideDone(s)){
      var match=CONNS.filter(function(c){return c.sys===s.sys&&c.g===s.g&&c.sk===s.sk&&c.th===s.th&&c.ak===s.ak;}).sort(function(a,b){return a.s-b.s;})[0];
      if(match) p.appendChild(resultPieza(match,'espiga'));
      else p.appendChild(resultError('No hay una espiga con esa combinación en '+s.sys+'.'));
    }
    b.appendChild(p);
  }
  // cascada igual pero filtrando CONNS por sistema s.sys
  function renderCascadaSys(container,s,onChange){
    container.innerHTML='';
    function opts(field,filterFn,labelFn){ var m={}; CONNS.forEach(function(c){ if(c.sys===s.sys && filterFn(c)) m[c[field]]=labelFn(c); }); return Object.keys(m).map(function(k){return {k:k,l:m[k]};}); }
    container.appendChild(label('Tipo de extremo'));
    var gf=grid(150);
    opts('g',function(){return true;},function(c){return FAM_LABEL[c.g];}).forEach(function(o){
      var c=card(o.l,null,function(){ s.g=o.k; s.sk=null; s.th=null; s.ak=null; onChange(); });
      if(s.g===o.k){ c.style.borderColor=ROJO; c.style.boxShadow='0 0 0 3px rgba(200,16,46,.1)'; } gf.appendChild(c);
    });
    container.appendChild(gf); if(!s.g) return;
    container.appendChild(label('Estándar de conexión'));
    var ge=grid(150);
    opts('sk',function(c){return c.g===s.g;},function(c){return c.sl;}).forEach(function(o){
      var c=card(o.l,null,function(){ s.sk=o.k; s.th=null; s.ak=null; onChange(); });
      if(s.sk===o.k){ c.style.borderColor=ROJO; c.style.boxShadow='0 0 0 3px rgba(200,16,46,.1)'; } ge.appendChild(c);
    });
    container.appendChild(ge); if(!s.sk) return;
    container.appendChild(label('Medida'));
    var gm=grid(110);
    opts('th',function(c){return c.g===s.g&&c.sk===s.sk;},function(c){return c.ml;}).sort(function(a,b){return parseInt(a.k)-parseInt(b.k);}).forEach(function(o){
      var c=card(o.l,null,function(){ s.th=o.k; s.ak=null; onChange(); });
      if(s.th===o.k){ c.style.borderColor=ROJO; c.style.boxShadow='0 0 0 3px rgba(200,16,46,.1)'; } gm.appendChild(c);
    });
    container.appendChild(gm); if(!s.th) return;
    container.appendChild(label('Ángulo'));
    var ga=grid(110);
    opts('ak',function(c){return c.g===s.g&&c.sk===s.sk&&c.th===s.th;},function(c){return c.aL;}).forEach(function(o){
      var c=card(o.l,null,function(){ s.ak=o.k; onChange(); });
      if(s.ak===o.k){ c.style.borderColor=ROJO; c.style.boxShadow='0 0 0 3px rgba(200,16,46,.1)'; } ga.appendChild(c);
    });
    container.appendChild(ga);
  }

  // ---------- METROS de manguera ----------
  function renderMetros(b){
    var s=M.sel;
    setHeader('Metros de manguera','Elige el tipo y la medida', function(){ if(s.fam){ s.fam=null; s.dash=null; render(); } else { M={view:'menu'}; render(); } });
    var p=el('div','config-panel active');
    if(!s.fam){
      p.appendChild(q('Tipo de manguera'));
      var fams={}; HOSES.forEach(function(h){ var t=h.code.split('-')[1]; fams[t]=(fams[t]||0)+1; });
      var g=grid(140);
      Object.keys(fams).sort().forEach(function(t){
        g.appendChild(card(t,fams[t]+' medidas',function(){ s.fam=t; render(); }));
      });
      p.appendChild(g); b.appendChild(p); return;
    }
    if(!s.dash){
      p.appendChild(q('Medida ('+s.fam+')'));
      var g=grid(110);
      HOSES.filter(function(h){return h.code.split('-')[1]===s.fam;}).sort(function(a,b){return parseInt(a.dash)-parseInt(b.dash);}).forEach(function(h){
        g.appendChild(card(h.dl+'"','PT '+h.wp+' psi',function(){ s.dash=h.dash; s.hose=h; render(); }));
      });
      p.appendChild(g); b.appendChild(p); return;
    }
    // metros + resultado
    p.style.maxWidth='520px'; p.style.margin='0 auto';
    p.appendChild(q('¿Cuántos metros?'));
    var w=el('div'); w.style.marginBottom='18px'; w.appendChild(label('Metros')); var mi=num('mcfg-metros','Ej. 10'); if(s.metros)mi.value=s.metros; w.appendChild(mi); p.appendChild(w);
    var out=el('div'); out.id='mcfg-metros-out'; p.appendChild(out);
    function calc(){ var mt=parseFloat(E('mcfg-metros').value); if(!mt||mt<=0){ out.innerHTML=''; return; } s.metros=mt; out.appendChild(resultPieza(s.hose,'manguera',mt)); }
    mi.addEventListener('input',function(){ out.innerHTML=''; calc(); });
    if(s.metros){ mi.value=s.metros; calc(); }
    b.appendChild(p);
  }

  // ---------- tarjeta de pieza (espiga o manguera) ----------
  function resultPieza(item,kind,metros){
    var w=el('div'); w.style.cssText='border:1px solid #e8e8ed;border-radius:16px;padding:18px 20px;margin-top:8px;';
    var precio = kind==='manguera' ? item.s*(metros||1) : item.s;
    var cant = kind==='manguera' ? (metros+' m') : '1 pza';
    w.innerHTML='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">'
      +'<div style="min-width:0;"><div style="font-weight:800;color:'+NAVY+';font-size:17px;">'+item.code+'</div>'
      +'<div style="font-size:13px;color:#86868b;margin-top:3px;">'+(item.name||'')+'</div>'
      +'<div style="font-size:12px;color:#86868b;margin-top:6px;">Cantidad: <b style="color:'+NAVY+'">'+cant+'</b></div></div>'
      +'<div style="text-align:right;"><div style="font-size:11px;color:#86868b;font-weight:600;text-transform:uppercase;">Precio</div><div style="font-size:23px;font-weight:800;color:'+NAVY+';line-height:1;">'+money(precio)+'</div></div></div>';
    var btn=primaryBtn('Agregar a mi cotización',function(){
      window.MCFG_PENDING=window.MCFG_PENDING||[];
      window.MCFG_PENDING.push({tipo:kind,code:item.code,name:item.name,qty:kind==='manguera'?metros:1,precio:precio});
      if(typeof window.showToast==='function') window.showToast('\u2713 '+item.code+' agregado a tu cotización');
      else alert(item.code+' agregado.');
    });
    w.appendChild(btn);
    return w;
  }

})();
