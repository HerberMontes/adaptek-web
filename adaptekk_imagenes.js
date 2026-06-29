/* ============================================================
   ADAPTEKK — Imagen de conector por código AT
   Fuente única: el código AT -> /img/series/xxxx.png
   Sirve en pantalla (configurador / equivalencias) y en los PDF.
   Para reemplazar un dibujo: sube el PNG con el MISMO nombre a
   /img/series/. Todo lo toma automático, sin tocar código.
   ============================================================ */
(function(){
  var MAP = null, loading = null;
  var PLACEHOLDER = '/img/series/_placeholder.png';

  function cargar(){
    if (MAP) return Promise.resolve(MAP);
    if (!loading){
      loading = fetch('/at_imagenes.json')
        .then(function(r){ return r.json(); })
        .then(function(m){ MAP = m || {}; return MAP; })
        .catch(function(){ MAP = {}; return MAP; });
    }
    return loading;
  }
  // precarga el mapa al inicio
  cargar();

  // URL relativa de la imagen del conector (o placeholder si no hay)
  window.imgConectorURL = function(atCode){
    if (!MAP || !atCode) return PLACEHOLDER;
    return MAP[atCode] || PLACEHOLDER;
  };

  // Bloque HTML listo para la pantalla (configurador / equivalencias)
  window.imgConectorHTML = function(atCode, opts){
    opts = opts || {};
    var url = window.imgConectorURL(atCode);
    var max = opts.max || 200;
    return ''
      + '<div style="display:flex;justify-content:center;margin:4px 0 18px;">'
      +   '<div style="background:#fff;border:1px solid #e8e8ed;border-radius:14px;'
      +        'padding:14px;max-width:'+(max+28)+'px;width:100%;text-align:center;">'
      +     '<img src="'+url+'" alt="'+(opts.alt||atCode)+'" loading="lazy" '
      +          'onerror="this.onerror=null;this.src=\''+PLACEHOLDER+'\';" '
      +          'style="max-width:'+max+'px;width:100%;height:auto;display:block;margin:0 auto;"/>'
      +   '</div>'
      + '</div>';
  };

  /* ---- Para jsPDF: precarga las imágenes del carrito como dataURL ----
     Llena window.__atImgData[atCode] = "data:image/png;base64,..."
     para que el PDF pueda dibujar la miniatura de cada línea. */
  window.__atImgData = window.__atImgData || {};
  window.precargarPDFImgs = function(codes){
    return cargar().then(function(){
      var jobs = (codes||[]).map(function(code){
        if (!code || window.__atImgData[code]) return Promise.resolve();
        var ruta = MAP[code]; if (!ruta) return Promise.resolve();
        return fetch(ruta).then(function(r){ return r.blob(); }).then(function(b){
          return new Promise(function(res){
            var fr = new FileReader();
            fr.onload = function(){ window.__atImgData[code] = fr.result; res(); };
            fr.onerror = function(){ res(); };
            fr.readAsDataURL(b);
          });
        }).catch(function(){});
      });
      return Promise.all(jobs);
    });
  };
})();
