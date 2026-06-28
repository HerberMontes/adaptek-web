// === MOTOR CONFIGURADOR ADAPTEKK (codigos AT: DuoFit / TetraFit / HexaFit) ===
// Requiere que DATA (de data_at.js) este cargado antes. Expone window.ATConfigurador.
// Funciones de cascada (familias/estandares/medidas/angulos) para poblar los selects
// del diseno, y cotizar({largo,presion,A,B}) que arma el ensamble con su desglose AT.
(function(global){
  var DATA = global.DATA || (typeof module!=='undefined'? require('./data_at.js') : null);
  var HOSES = DATA.hoses, CONNS = DATA.conns;
  var FAM_LABEL = {H:'Hembra giratoria',M:'Macho',B:'Brida',C:'Caterpillar (CAT)',O:'Otro'};
  var SYS_PRESION = {DuoFit:'baja',TetraFit:'media',HexaFit:'alta'};
  var SYS_MALLAS  = {DuoFit:'2 mallas',TetraFit:'4 mallas',HexaFit:'espiral'};
  function dnum(d){return parseInt(d,10);}

  function familias(){
    var s={}; CONNS.forEach(function(c){s[c.g]=1;});
    return Object.keys(s).map(function(g){return {g:g,label:FAM_LABEL[g]};});
  }
  function estandares(g){
    var m={}; CONNS.forEach(function(c){if(c.g===g)m[c.sk]=c.sl;});
    return Object.keys(m).map(function(sk){return {sk:sk,sl:m[sk]};});
  }
  function medidas(g,sk){
    var m={}; CONNS.forEach(function(c){if(c.g===g&&c.sk===sk)m[c.th]=c.ml;});
    return Object.keys(m).map(function(th){return {th:th,ml:m[th]};}).sort(function(a,b){return dnum(a.th)-dnum(b.th);});
  }
  function angulos(g,sk,th){
    var m={}; CONNS.forEach(function(c){if(c.g===g&&c.sk===sk&&c.th===th)m[c.ak]=c.aL;});
    return Object.keys(m).map(function(ak){return {ak:ak,aL:m[ak]};});
  }
  // medidas de manguera disponibles para una presion (por si el cliente fija la manguera)
  function manguerasPara(presion){
    presion=+presion;
    var seen={}, out=[];
    HOSES.forEach(function(h){ if(h.wp>=presion && !seen[h.dash]){seen[h.dash]=1; out.push({dash:h.dash,dl:h.dl,wp:h.wp});} });
    return out.sort(function(a,b){return dnum(a.dash)-dnum(b.dash);});
  }

  // motor: elige la combinacion mas economica que cumpla la presion.
  // opts.hd (opcional): si el cliente fija la medida de manguera, se respeta.
  function cotizar(o){
    var presion=+o.presion, largo=+o.largo, A=o.A, B=o.B, fixHd=o.hd||null;
    if(!presion||isNaN(presion)) return {error:'Falta la presión (PSI).'};
    var candA=CONNS.filter(function(c){return c.g===A.g&&c.sk===A.sk&&c.th===A.th&&c.ak===A.ak;});
    var candB=CONNS.filter(function(c){return c.g===B.g&&c.sk===B.sk&&c.th===B.th&&c.ak===B.ak;});
    if(!candA.length) return {error:'No existe espiga para el lado A con esa combinación.'};
    if(!candB.length) return {error:'No existe espiga para el lado B con esa combinación.'};
    var best=null;
    for(var i=0;i<candA.length;i++) for(var j=0;j<candB.length;j++){
      var a=candA[i], b=candB[j];
      if(a.sys!==b.sys) continue;
      if(a.hd!==b.hd) continue;
      if(fixHd && a.hd!==fixHd) continue;
      var mang=HOSES.filter(function(h){return h.dash===a.hd&&h.sys.indexOf(a.sys)>=0&&h.wp>=presion;})
                    .sort(function(x,y){return x.c-y.c;})[0];
      if(!mang) continue;
      var ord=mang.s + a.s + b.s;
      // Preferencia: la espiga debe ser de la medida del conector (hd == th = espiga directa, no reductora).
      // Si ambos extremos son la misma medida, gana la manguera de esa medida. Si difieren, entre las
      // combinaciones con calibre comun se toma la mas economica.
      var match=(a.hd===a.th?1:0)+(b.hd===b.th?1:0);
      if(!best || match>best._match || (match===best._match && ord<best._ord)) best={a:a,b:b,mang:mang,_ord:ord,_match:match};
    }
    if(!best) return {error:'Ninguna combinación cumple '+presion+' PSI con esas conexiones.'};
    var a=best.a, b=best.b, mang=best.mang;
    var cutKnown = a.cut!=null && b.cut!=null;
    var cutmm = (a.cut||0)+(b.cut||0);
    var metros = largo? +(largo - cutmm/1000).toFixed(3) : null;
    var qtyM = metros!=null? metros : largo;
    var precio = mang.s*qtyM + a.s + b.s;
    var costo  = mang.c*qtyM + a.c + b.c;
    var desglose=[{code:mang.code,name:mang.name,qty:qtyM,unit:'m',price:mang.s,sys:mang.sys.join('/'),wp:mang.wp}];
    if(a.code===b.code) desglose.push({code:a.code,name:a.name,qty:2,unit:'pza',price:a.s});
    else { desglose.push({code:a.code,name:a.name,qty:1,unit:'pza',price:a.s}); desglose.push({code:b.code,name:b.name,qty:1,unit:'pza',price:b.s}); }
    return {
      sistema:a.sys, mallas:SYS_MALLAS[a.sys], presionClase:SYS_PRESION[a.sys],
      manguera:mang, espigaA:a, espigaB:b, metros:metros, cutmm:cutmm, cutKnown:cutKnown, largoTotal:largo,
      precio:+precio.toFixed(2), costo:+costo.toFixed(2),
      aviso: cutKnown? null : 'Largo de corte pendiente: una de las espigas no trae dato de corte.',
      desglose:desglose
    };
  }
  global.ATConfigurador = {familias:familias,estandares:estandares,medidas:medidas,angulos:angulos,manguerasPara:manguerasPara,cotizar:cotizar};
  if(typeof module!=='undefined') module.exports = global.ATConfigurador;
})(typeof window!=='undefined'? window : globalThis);
