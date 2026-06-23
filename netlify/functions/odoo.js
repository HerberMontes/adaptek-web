const crypto = require('crypto');
const ODOO_URL   = process.env.ODOO_URL  || 'https://hydratechgroup.odoo.com';
const ODOO_DB    = process.env.ODOO_DB   || 'hydratechgroup';
const ODOO_USER  = process.env.ODOO_USER || 'herber.montes@hydratechgroup.mx';
const ODOO_KEY   = process.env.ODOO_API_KEY || process.env.ODOO_KEY;
const RESEND_KEY = process.env.RESEND_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'validaciones@adaptekk.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'validaciones@adaptekk.com';
const ZONE_EMAILS = {
  'Noroeste':  'validaciones@adaptekk.com',
  'Norte':     'validaciones@adaptekk.com',
  'Noreste':   'validaciones@adaptekk.com',
  'Bajio':     'validaciones@adaptekk.com',
  'Centro':    'validaciones@adaptekk.com',
  'Pacifico':  'validaciones@adaptekk.com',
  'Golfo':     'validaciones@adaptekk.com',
  'Peninsula': 'validaciones@adaptekk.com'
};

// Get zone from state
function getZoneFromState(estado) {
  if (!estado) return null;
  const e = estado.toLowerCase();
  if (['baja california','baja california sur','sonora','sinaloa','nayarit'].some(s => e.includes(s))) return 'Noroeste';
  if (['chihuahua','durango','coahuila'].some(s => e.includes(s))) return 'Norte';
  if (['nuevo leon','tamaulipas','san luis potosi','zacatecas'].some(s => e.includes(s))) return 'Noreste';
  if (['jalisco','aguascalientes','guanajuato','queretaro','michoacan'].some(s => e.includes(s))) return 'Bajio';
  if (['ciudad de mexico','estado de mexico','hidalgo','tlaxcala','puebla','morelos'].some(s => e.includes(s))) return 'Centro';
  if (['guerrero','oaxaca','chiapas'].some(s => e.includes(s))) return 'Pacifico';
  if (['veracruz','tabasco'].some(s => e.includes(s))) return 'Golfo';
  if (['yucatan','campeche','quintana roo'].some(s => e.includes(s))) return 'Peninsula';
  return null;
}
const SITE_URL   = 'https://cheery-fenglisu-0daf09.netlify.app';

async function odooAuth() {
  const xml = `<?xml version="1.0"?>
<methodCall><methodName>authenticate</methodName><params>
  <param><value><string>${ODOO_DB}</string></value></param>
  <param><value><string>${ODOO_USER}</string></value></param>
  <param><value><string>${ODOO_KEY}</string></value></param>
  <param><value><struct></struct></value></param>
</params></methodCall>`;
  const resp = await fetch(`${ODOO_URL}/xmlrpc/2/common`, {
    method: 'POST', headers: {'Content-Type':'text/xml'}, body: xml
  });
  const text = await resp.text();
  const m = text.match(/<value><int>(\d+)<\/int><\/value>/);
  return m ? parseInt(m[1]) : null;
}

function xmlStr(v) {
  return `<value><string>${String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</string></value>`;
}
function xmlInt(v) { return `<value><int>${parseInt(v)||0}</int></value>`; }
function xmlBool(v) { return `<value><boolean>${v?1:0}</boolean></value>`; }

function hasResults(xmlText) {
  const dataMatch = xmlText.match(/<data>([\s\S]*?)<\/data>/);
  if (!dataMatch) return false;
  const dataContent = dataMatch[1].trim();
  return dataContent.length > 0 && dataContent.includes('<int>');
}

// ── Contraseñas: hash scrypt con sal (NUNCA se guarda en texto plano) ──
function hashPassword(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pwd), salt, 64).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}
function verifyPassword(pwd, stored) {
  try {
    if (!stored || stored.indexOf('scrypt$') !== 0) return false;
    const parts = stored.split('$');
    const salt = parts[1], hash = parts[2];
    const calc = crypto.scryptSync(String(pwd), salt, 64).toString('hex');
    const a = Buffer.from(calc, 'hex'), b = Buffer.from(hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

async function odooSearchRead(uid, model, domain_xml, fields, limit) {
  const fieldsXml = fields.map(f => `<value><string>${f}</string></value>`).join('');
  const xml = `<?xml version="1.0"?>
<methodCall><methodName>execute_kw</methodName><params>
  <param><value><string>${ODOO_DB}</string></value></param>
  <param><value><int>${uid}</int></value></param>
  <param><value><string>${ODOO_KEY}</string></value></param>
  <param><value><string>${model}</string></value></param>
  <param><value><string>search_read</string></value></param>
  <param><value><array><data>
    <value><array><data>${domain_xml}</data></array></value>
  </data></array></value></param>
  <param><value><struct>
    <member><name>fields</name><value><array><data>${fieldsXml}</data></array></value></member>
    <member><name>limit</name><value><int>${limit||10}</int></value></member>
  </struct></value></param>
</params></methodCall>`;
  const resp = await fetch(`${ODOO_URL}/xmlrpc/2/object`, {
    method: 'POST', headers: {'Content-Type':'text/xml'}, body: xml
  });
  return await resp.text();
}

async function xmlrpc(uid, model, method, argsXml) {
  const xml = `<?xml version="1.0"?>
<methodCall><methodName>execute_kw</methodName><params>
  <param><value><string>${ODOO_DB}</string></value></param>
  <param><value><int>${uid}</int></value></param>
  <param><value><string>${ODOO_KEY}</string></value></param>
  <param><value><string>${model}</string></value></param>
  <param><value><string>${method}</string></value></param>
  <param><value><array><data>${argsXml}</data></array></value></param>
  <param><value><struct></struct></value></param>
</params></methodCall>`;
  const resp = await fetch(`${ODOO_URL}/xmlrpc/2/object`, {
    method: 'POST', headers: {'Content-Type':'text/xml'}, body: xml
  });
  return await resp.text();
}

// Igual que xmlrpc pero permite enviar kwargs (p.ej. context). kwargsInnerXml = members del struct.
async function xmlrpcKw(uid, model, method, argsXml, kwargsInnerXml) {
  const xml = `<?xml version="1.0"?>
<methodCall><methodName>execute_kw</methodName><params>
  <param><value><string>${ODOO_DB}</string></value></param>
  <param><value><int>${uid}</int></value></param>
  <param><value><string>${ODOO_KEY}</string></value></param>
  <param><value><string>${model}</string></value></param>
  <param><value><string>${method}</string></value></param>
  <param><value><array><data>${argsXml}</data></array></value></param>
  <param><value><struct>${kwargsInnerXml || ''}</struct></value></param>
</params></methodCall>`;
  const resp = await fetch(`${ODOO_URL}/xmlrpc/2/object`, {
    method: 'POST', headers: {'Content-Type':'text/xml'}, body: xml
  });
  return await resp.text();
}

// Crea la factura desde una orden de venta confirmada, la valida (publica) e intenta timbrar (CFDI MX).
// Devuelve { ok, invoiceId, posted, stamped, error }.
async function facturarOrden(uid, saleId) {
  try {
    // Contexto que el asistente de facturación necesita para saber sobre qué orden actuar.
    const ctx = `<member><name>context</name><value><struct>`
      + `<member><name>active_model</name><value><string>sale.order</string></value></member>`
      + `<member><name>active_ids</name><value><array><data><value><int>${saleId}</int></value></data></array></value></member>`
      + `<member><name>active_id</name><value><int>${saleId}</int></value></member>`
      + `</struct></value></member>`;
    // 1) Crear el asistente "Crear factura" con método 'delivered' (factura lo entregado/pedido)
    const wizArgs = `<value><struct><member><name>advance_payment_method</name><value><string>delivered</string></value></member></struct></value>`;
    const wizText = await xmlrpcKw(uid, 'sale.advance.payment.inv', 'create', wizArgs, ctx);
    const wm = wizText.match(/<value><int>(\d+)<\/int><\/value>/);
    const wizId = wm ? parseInt(wm[1]) : null;
    if (!wizId) return { ok:false, error:'No se pudo crear el asistente de factura: ' + (xmlFault(wizText) || wizText.slice(0,180)) };
    // 2) Ejecutar la creación de la(s) factura(s)
    const ciText = await xmlrpcKw(uid, 'sale.advance.payment.inv', 'create_invoices',
      `<value><array><data><value><int>${wizId}</int></value></data></array></value>`, ctx);
    const ciFault = xmlFault(ciText);
    if (ciFault) return { ok:false, error:'create_invoices: ' + ciFault };
    // 3) Leer la factura recién creada en la orden
    const odom = `<value><array><data>${xmlStr('id')}<value><string>=</string></value>${xmlInt(saleId)}</data></array></value>`;
    const ot = await odooSearchRead(uid, 'sale.order', odom, ['invoice_ids'], 1);
    const ost = (ot.match(/<struct>[\s\S]*?<\/struct>/) || [''])[0];
    const invm = ost.match(/<name>\s*invoice_ids\s*<\/name>\s*<value>\s*<array>\s*<data>([\s\S]*?)<\/data>/);
    const invIds = invm ? (invm[1].match(/<int>(\d+)<\/int>/g) || []).map(x => parseInt(x.replace(/\D/g,''))) : [];
    if (!invIds.length) return { ok:false, error:'No se generó factura en la orden' };
    const invoiceId = invIds[invIds.length - 1];
    // 4) Preparar campos CFDI, validar y timbrar (helper reusable)
    const pr = await publicarYTimbrar(uid, invoiceId);
    return { ok:true, invoiceId, posted:pr.posted, stamped:pr.stamped, post_error:pr.post_error, stamp_error:pr.stamp_error };
  } catch(e) {
    return { ok:false, error: String(e && e.message || e) };
  }
}

// Prepara los campos CFDI requeridos, valida (publica) y timbra una factura existente.
// Sirve tanto para una factura recién creada como para un borrador que quedó pendiente.
async function publicarYTimbrar(uid, invoiceId) {
  let posted = false, stamped = false, post_error = '', stamp_error = '';
  // Estado actual de la factura
  let state = 'draft';
  try {
    const mt = await odooSearchRead(uid, 'account.move',
      `<value><array><data>${xmlStr('id')}<value><string>=</string></value>${xmlInt(invoiceId)}</data></array></value>`, ['state'], 1);
    state = xmlExtractField((mt.match(/<struct>[\s\S]*?<\/struct>/) || [''])[0], 'state') || 'draft';
  } catch(_){}

  if (state === 'posted') {
    posted = true;
  } else {
    // Fecha de factura = hoy
    try {
      const today = new Date().toISOString().slice(0,10);
      await xmlrpc(uid, 'account.move', 'write',
        `<value><array><data><value><int>${invoiceId}</int></value></data></array></value><value><struct><member><name>invoice_date</name><value><string>${today}</string></value></member></struct></value>`);
    } catch(_){}
    // Forma de pago CFDI: método '03' (Transferencia electrónica de fondos)
    try {
      const pmText = await xmlrpc(uid, 'l10n_mx_edi.payment.method', 'search',
        `<value><array><data><value><array><data>${xmlStr('code')}<value><string>=</string></value>${xmlStr('03')}</data></array></value></data></array></value>`);
      const pmm = pmText.match(/<int>(\d+)<\/int>/);
      if (pmm) {
        await xmlrpc(uid, 'account.move', 'write',
          `<value><array><data><value><int>${invoiceId}</int></value></data></array></value><value><struct><member><name>l10n_mx_edi_payment_method_id</name><value><int>${pmm[1]}</int></value></member></struct></value>`);
      }
    } catch(_){}
    // Validar (publicar): borrador -> publicada
    try {
      const postText = await xmlrpc(uid, 'account.move', 'action_post',
        `<value><array><data><value><int>${invoiceId}</int></value></data></array></value>`);
      const pf = xmlFault(postText);
      if (pf) post_error = pf; else posted = true;
    } catch(e){ post_error = String(e && e.message || e); }
  }

  // Timbrar el CFDI (best-effort; depende del PAC configurado en Odoo)
  if (posted) {
    function _faultTail(text){
      const m = text && text.match(/<name>faultString<\/name>\s*<value>\s*<string>([\s\S]*?)<\/string>/);
      if (!m) return (text||'').slice(0,300);
      const full = m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
      return full.length > 320 ? '…' + full.slice(-320) : full; // la COLA trae el error real
    }
    const tryMethods = ['l10n_mx_edi_cfdi_try_send', 'action_process_edi_web_services'];
    for (const mth of tryMethods) {
      try {
        const tText = await xmlrpc(uid, 'account.move', mth,
          `<value><array><data><value><int>${invoiceId}</int></value></data></array></value>`);
        if (tText.indexOf('<fault>') === -1) { stamped = true; stamp_error = ''; break; }
        else { stamp_error = mth + ': ' + _faultTail(tText); }
      } catch(e){ stamp_error = mth + ': ' + String(e && e.message || e); }
    }
  }
  return { posted, stamped, post_error, stamp_error };
}

// Envía la factura (XML + PDF) por correo al cliente del pedido.
async function enviarFacturaCorreo(uid, saleId, invoiceId, folio) {
  try {
    if (!RESEND_KEY) return;
    // Email del cliente (desde el partner de la orden)
    const ot = await odooSearchRead(uid, 'sale.order',
      `<value><array><data>${xmlStr('id')}<value><string>=</string></value>${xmlInt(saleId)}</data></array></value>`,
      ['partner_id'], 1);
    const ost = (ot.match(/<struct>[\s\S]*?<\/struct>/) || [''])[0];
    const pm = ost.match(/<name>\s*partner_id\s*<\/name>\s*<value>\s*<array>\s*<data>\s*<value>\s*<int>\s*(\d+)/);
    const partnerId = pm ? parseInt(pm[1]) : 0;
    if (!partnerId) return;
    const pt = await odooSearchRead(uid, 'res.partner',
      `<value><array><data>${xmlStr('id')}<value><string>=</string></value>${xmlInt(partnerId)}</data></array></value>`,
      ['email','name'], 1);
    const pst = (pt.match(/<struct>[\s\S]*?<\/struct>/) || [''])[0];
    const email = xmlExtractField(pst, 'email');
    const nombre = xmlExtractField(pst, 'name') || 'Cliente';
    if (!email || email === 'false') return;
    // Adjuntos de la factura (XML CFDI + PDF)
    const attDomain = `<value><array><data>${xmlStr('res_model')}<value><string>=</string></value>${xmlStr('account.move')}${xmlStr('res_id')}<value><string>=</string></value>${xmlInt(invoiceId)}</data></array></value>`;
    const at = await odooSearchRead(uid, 'ir.attachment', attDomain, ['name','mimetype','datas'], 20);
    const astructs = at.match(/<struct>[\s\S]*?<\/struct>/g) || [];
    const attachments = astructs
      .map(s => ({ filename: xmlExtractField(s,'name'), content: xmlExtractField(s,'datas'), mt: xmlExtractField(s,'mimetype') }))
      .filter(a => a.content && (/(xml|pdf)/i.test(a.mt) || /\.(xml|pdf)$/i.test(a.filename)))
      .map(a => ({ filename: a.filename, content: a.content }));
    if (!attachments.length) return; // si aún no hay XML/PDF (timbrado pendiente), no mandamos
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:#001F5B;padding:20px;text-align:center;"><span style="color:#fff;font-size:22px;font-weight:bold;">ADAP<span style="color:#C8102E;">TEK</span>K</span></div>
      <div style="padding:24px;"><h2 style="color:#001F5B;margin:0 0 8px;">Tu factura está lista</h2>
      <p style="font-size:14px;color:#555;line-height:1.6;">Hola ${nombre}, adjuntamos la factura (CFDI) de tu pedido <b>${folio}</b>: el <b>PDF</b> y el <b>XML</b> con validez fiscal.</p>
      <p style="font-size:12px;color:#888;margin-top:18px;">Gracias por tu compra en Adaptekk.</p></div></div>`;
    await sendEmailAtt(email, `Tu factura — ${folio} | Adaptekk`, html, attachments);
  } catch(_){}
}

// Detecta un <fault> de Odoo y devuelve el mensaje (o null si todo OK)
function xmlFault(text){
  if (text && text.indexOf('<fault>') !== -1) {
    const m = text.match(/<name>faultString<\/name>\s*<value>\s*<string>([\s\S]*?)<\/string>/);
    return m ? m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').slice(0,400) : 'Odoo fault';
  }
  return null;
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Extrae un campo de un <struct> XML-RPC (mismo parser usado en buscar_por_configurador) ──
function xmlExtractField(xml, field) {
  const tag = '<name>' + field + '</name>';
  const pos = xml.indexOf(tag);
  if (pos < 0) return '';
  const afterTag = xml.substring(pos + tag.length);
  const valStart = afterTag.indexOf('<value>');
  if (valStart < 0) return '';
  const inner = afterTag.substring(valStart + 7);
  const typeEnd = inner.indexOf('>');
  const firstChar = inner.charAt(0);
  let content = (firstChar === '<') ? inner.substring(typeEnd + 1) : inner;
  const end = content.indexOf('<');
  return end >= 0 ? content.substring(0, end).trim() : content.trim();
}

// ── SKYDROPX (PRO): obtiene un bearer token vía OAuth client_credentials ──
// Requiere variables de entorno: SKYDROPX_CLIENT_ID, SKYDROPX_CLIENT_SECRET.
// SKYDROPX_BASE opcional (default producción; usa https://sb-pro.skydropx.com para sandbox).
async function skydropxToken(baseOverride) {
  const base = (baseOverride || process.env.SKYDROPX_BASE || 'https://pro.skydropx.com').replace(/\/+$/,'');
  const id = (process.env.SKYDROPX_CLIENT_ID || '').trim();
  const secret = (process.env.SKYDROPX_CLIENT_SECRET || '').trim();
  if (!id || !secret) return { error: 'Faltan credenciales SKYDROPX_CLIENT_ID / SKYDROPX_CLIENT_SECRET en variables de entorno', base };
  try {
    const form = new URLSearchParams({ grant_type:'client_credentials', client_id:id, client_secret:secret });
    const ctrl = new AbortController();
    const to = setTimeout(()=>ctrl.abort(), 12000);
    let resp;
    try {
      resp = await fetch(base + '/api/v1/oauth/token', {
        method: 'POST',
        headers: {'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
        body: form.toString(),
        signal: ctrl.signal
      });
    } finally { clearTimeout(to); }
    const data = await resp.json().catch(()=>({}));
    if (data && data.access_token) return { token: data.access_token, base };
    return { error: (data && (data.error_description || data.error)) || ('No se obtuvo token (HTTP '+resp.status+')'), base, http: resp.status };
  } catch(e){
    if (e && e.name === 'AbortError') return { error: 'Timeout: Skydropx no respondió el token en 12s', base };
    return { error: String(e && e.message || e), base };
  }
}

// ── fetch con timeout (AbortController). Evita que una petición colgada bloquee la función ──
async function fetchTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const to = setTimeout(()=>ctrl.abort(), ms || 8000);
  try {
    return await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal }));
  } finally { clearTimeout(to); }
}

// ── SKYDROPX: revalida una tarifa puntual (quotation_id + rate_id) y devuelve su precio AUTORITATIVO ──
// Se usa al cobrar: NUNCA se confía en el precio que manda el navegador; se vuelve a leer de Skydropx.
async function skydropxRatePrice(quotationId, rateId) {
  if (!quotationId || !rateId) return { ok:false, error:'Falta quotation_id o rate_id del env\u00edo' };
  const t = await skydropxToken();
  if (t.error) return { ok:false, error:'Token Skydropx: ' + t.error };
  try {
    const r = await fetchTimeout(t.base + '/api/v1/quotations/' + quotationId, { headers:{'Authorization':'Bearer '+t.token,'Content-Type':'application/json'} }, 6000);
    const raw = await r.json();
    const d = (raw && raw.data) ? raw.data : raw;
    const attrs = (d && d.attributes) ? d.attributes : d;
    const rates = (attrs && attrs.rates) || (d && d.rates) || [];
    const found = rates.find(x => String(x.id || (x.attributes && x.attributes.id)) === String(rateId));
    if (!found) return { ok:false, error:'La tarifa de env\u00edo ya no est\u00e1 disponible (la cotizaci\u00f3n expir\u00f3). Vuelve a calcular el env\u00edo.' };
    const a = found.attributes || found;
    const price = parseFloat(a.total || a.amount || a.amount_local || 0);
    if (!(price > 0)) return { ok:false, error:'La tarifa de env\u00edo revalidada es inv\u00e1lida.' };
    return { ok:true, price: Math.round(price*100)/100,
      carrier: (a.provider_name || a.carrier_name || a.provider || a.carrier || ''),
      service: (a.service_level_name || a.service_level || a.service || '') };
  } catch(e){
    const msg = (e && e.name === 'AbortError') ? 'Timeout revalidando el env\u00edo con Skydropx' : String(e && e.message || e);
    return { ok:false, error: msg };
  }
}

// ── Resuelve el precio de envío a cobrar para un checkout. Sin envío -> 0. Con envío -> revalida en Skydropx. ──
async function resolveShipPrice(co) {
  const envio = (co && co.envio) || null;
  if (!envio) return { ok:true, ship:0 };
  const rv = await skydropxRatePrice(envio.quotation_id || envio.quotationId, envio.id || envio.rate_id);
  if (!rv.ok) return { ok:false, error: rv.error };
  return { ok:true, ship: rv.price, carrier: rv.carrier, service: rv.service };
}

// ── Busca un producto en Odoo por código AT (default_code) y devuelve precio/stock REALES ──
// Nunca confiamos en el precio que manda el navegador: se recalcula aquí contra Odoo.
async function lookupProductByCode(uid, code) {
  if (!code) return null;
  const domainXml = `<value><array><data>
    ${xmlStr('default_code')}<value><string>=</string></value>${xmlStr(code)}
  </data></array></value>`;
  const xml = await odooSearchRead(uid, 'product.product', domainXml,
    ['id','name','default_code','list_price','qty_available'], 1);
  const parts = xml.split('<struct>');
  if (parts.length < 2) return null;
  const struct = parts[1].split('</struct>')[0];
  const id = parseInt(xmlExtractField(struct, 'id'));
  if (!(id > 0)) return null;
  const qty = parseFloat(xmlExtractField(struct, 'qty_available')) || 0;
  const price = parseFloat(xmlExtractField(struct, 'list_price')) || 0;
  return {
    id,
    name: xmlExtractField(struct, 'name'),
    at_code: xmlExtractField(struct, 'default_code') || code,
    price,
    qty_available: qty,
    status: qty > 0 ? 'stock' : 'fabricado'
  };
}

// ── Suma el peso (kg) de una lista de items {code, qty} leyendo product.product.weight de Odoo ──
// Devuelve { weight, found, missing }. Si un código no se encuentra, se contabiliza en 'missing'.
async function sumWeightFromOdoo(uid, items) {
  const list = (Array.isArray(items) ? items : []).filter(it => it && it.code);
  if (!list.length) return { weight: 0, found: 0, missing: [] };
  const codes = [...new Set(list.map(it => String(it.code).trim()).filter(Boolean))];
  if (!codes.length) return { weight: 0, found: 0, missing: [] };
  const codesXml = codes.map(c => xmlStr(c)).join('');
  const domainXml = `<value><array><data>
    ${xmlStr('default_code')}<value><string>in</string></value><value><array><data>${codesXml}</data></array></value>
  </data></array></value>`;
  const xml = await odooSearchRead(uid, 'product.product', domainXml, ['default_code','weight'], codes.length);
  const wByCode = {};
  xml.split('<struct>').slice(1).forEach(part => {
    const s = part.split('</struct>')[0];
    const code = (xmlExtractField(s, 'default_code') || '').trim();
    const w = parseFloat(xmlExtractField(s, 'weight')) || 0;
    if (code) wByCode[code] = w;
  });
  let total = 0; const missing = [];
  list.forEach(it => {
    const code = String(it.code).trim();
    const qty = Math.max(parseInt(it.qty) || 1, 1);
    const w = wByCode[code];
    if (w == null) missing.push(code);
    total += (w || 0) * qty;
  });
  return { weight: Math.round(total * 1000) / 1000, found: Object.keys(wByCode).length, missing };
}

// ── Busca un partner por email; si no existe, lo crea ligero (guest checkout) ──
async function findOrCreatePartner(uid, contacto) {
  const email = (contacto.email || '').trim();
  const nombre = (contacto.nombre || contacto.name || 'Cliente Adaptekk').trim();
  if (email) {
    const dom = `<value><array><data><value><array><data>
      ${xmlStr('email')}<value><string>=</string></value>${xmlStr(email)}
    </data></array></value></data></array></value>`;
    const found = await xmlrpc(uid, 'res.partner', 'search', dom);
    const m = found.match(/<value><int>(\d+)<\/int><\/value>/);
    if (m) return parseInt(m[1]);
  }
  // Crear partner básico
  let members = `<member><name>name</name>${xmlStr(nombre)}</member>`;
  if (email) members += `<member><name>email</name>${xmlStr(email)}</member>`;
  if (contacto.tel) members += `<member><name>phone</name>${xmlStr(contacto.tel)}</member>`;
  members += `<member><name>customer_rank</name>${xmlInt(1)}</member>`;
  members += `<member><name>country_id</name>${xmlInt(156)}</member>`;
  const createText = await xmlrpc(uid, 'res.partner', 'create', `<value><struct>${members}</struct></value>`);
  const im = createText.match(/<value><int>(\d+)<\/int><\/value>/);
  return im ? parseInt(im[1]) : null;
}

// ── Crea una sale.order en Odoo con líneas a precio REAL + envío. Devuelve {ok, saleId, total, folio} ──
// ── Da de alta una pieza de FABRICACIÓN ESPECIAL en Odoo (si su código aún no existe) ──
// Devuelve {id, price, qty_available, status, nuevo}. Una vez creada, la próxima vez que
// alguien configure ese mismo código ya aparecerá como producto existente ("fabricado").
async function findOrCreateProduct(uid, code, name) {
  if (!code) return null;
  // 1) ¿Ya existe? Reusar.
  const existing = await lookupProductByCode(uid, code);
  if (existing && existing.id) return { ...existing, nuevo: false };
  // 2) No existe → crear product.product con su código AT como referencia interna.
  //    Precio 0 (cotización) y se marca como fabricado bajo pedido (sin stock).
  const struct = `<value><struct>
    <member><name>name</name>${xmlStr(name || code)}</member>
    <member><name>default_code</name>${xmlStr(code)}</member>
    <member><name>list_price</name><value><double>0.00</double></value></member>
    <member><name>type</name>${xmlStr('product')}</member>
    <member><name>sale_ok</name><value><boolean>1</boolean></value></member>
  </struct></value>`;
  const createText = await xmlrpc(uid, 'product.product', 'create', struct).catch(() => '');
  const m = createText.match(/<value><int>(\d+)<\/int><\/value>/);
  const id = m ? parseInt(m[1]) : null;
  if (!id) return null;
  return { id, name: name || code, at_code: code, price: 0, qty_available: 0, status: 'fabricado', nuevo: true };
}

async function crearOrdenOdoo(uid, orden, estado, shipOverride) {
  try {
    const items = Array.isArray(orden.items) ? orden.items : [];
    const co = orden.checkout || {};
    const folio = String(orden.folio || ('PED-' + Date.now().toString(36).toUpperCase()));

    // IDEMPOTENCIA: si ya existe una orden con este folio (client_order_ref), reutilizarla
    // en vez de crear otra. Así un segundo intento de pago no genera una cotización duplicada.
    try {
      const existDomain = `<value><array><data>
        <value><array><data>${xmlStr('client_order_ref')}<value><string>=</string></value>${xmlStr(folio)}</data></array></value>
      </data></array></value>`;
      const existText = await odooSearchRead(uid, 'sale.order', existDomain, ['id','state'], 1);
      const existMatch = existText.match(/<name>\s*id\s*<\/name>\s*<value>\s*<int>\s*(\d+)\s*<\/int>/);
      if (existMatch) {
        const existId = parseInt(existMatch[1]);
        if (estado === 'confirm') {
          try {
            await xmlrpc(uid, 'sale.order', 'action_confirm',
              `<value><array><data><value><int>${existId}</int></value></data></array></value>`);
            return { ok:true, saleId:existId, folio, reused:true, confirmed:true };
          } catch(ce) {
            return { ok:true, saleId:existId, folio, reused:true, confirmed:false, confirmError:ce.message };
          }
        }
        return { ok:true, saleId:existId, folio, reused:true, confirmed:false };
      }
    } catch(_){ /* si la búsqueda falla, seguimos creando normal */ }

    const partnerId = await findOrCreatePartner(uid, co.contacto || {});
    if (!partnerId) return { ok:false, error:'No se pudo crear/recuperar el cliente' };

    // Datos fiscales para timbrado en Odoo: guarda RFC (campo estándar vat) y CP.
    // NO se toca 'comment' (ahí vive el estado de gerencia). Régimen/uso CFDI se
    // escriben aparte una vez confirmados los nombres de campo (debug_fiscal_fields).
    try {
      const fac = co.factura || {};
      const rfc = String(fac.rfc || '').trim().toUpperCase();
      if (rfc) {
        let fm = `<member><name>vat</name>${xmlStr(rfc)}</member>`;
        if (fac.cp) fm += `<member><name>zip</name>${xmlStr(String(fac.cp))}</member>`;
        await xmlrpc(uid, 'res.partner', 'write',
          `<value><array><data><value><int>${partnerId}</int></value></data></array></value><value><struct>${fm}</struct></value>`);
      }
    } catch(_){ /* no bloquear la orden si falla el fiscal */ }

    // Construir líneas con precio real de Odoo
    const lineXmls = [];
    let total = 0;
    for (const it of items) {
      const code = it.at_code || it.code;
      const qty = Math.max(1, parseInt(it.qty) || 1);
      // Busca el producto; si es fabricación especial (no existe) lo DA DE ALTA
      // automáticamente para que quede registrado y la próxima vez ya exista.
      const prod = await findOrCreateProduct(uid, code, it.name || code);
      if (!prod || !prod.id) continue;
      // Precio: el real de Odoo si lo tiene; si es pieza nueva (price 0) usa el del cliente
      const unit = (prod.price && prod.price > 0) ? prod.price : (parseFloat(it.price) || 0);
      total += unit * qty;
      // order_line en formato Odoo: (0,0,{...})
      const lineStruct = `<value><struct>
        <member><name>product_id</name>${xmlInt(prod.id)}</member>
        <member><name>product_uom_qty</name>${xmlInt(qty)}</member>
        <member><name>price_unit</name><value><double>${unit.toFixed(2)}</double></value></member>
      </struct></value>`;
      lineXmls.push(`<value><array><data>${xmlInt(0)}${xmlInt(0)}${lineStruct}</data></array></value>`);
    }

    // Línea de envío: precio REVALIDADO contra Skydropx (nunca el que manda el cliente).
    // Si la acción de pago ya lo revalidó, llega en shipOverride y no se vuelve a consultar.
    const envio = co.envio || null;
    let shipPrice = (typeof shipOverride === 'number' && shipOverride >= 0) ? shipOverride : null;
    if (shipPrice == null && envio) {
      const rv = await resolveShipPrice(co);
      if (!rv.ok) return { ok:false, error: rv.error, ship_revalidation_failed:true };
      shipPrice = rv.ship;
    }
    if (envio && shipPrice && shipPrice > 0) {
      total += shipPrice;
      const shipStruct = `<value><struct>
        <member><name>name</name>${xmlStr('Env\u00edo ' + (envio.name || envio.carrier || envio.id))}</member>
        <member><name>product_uom_qty</name>${xmlInt(1)}</member>
        <member><name>price_unit</name><value><double>${shipPrice.toFixed(2)}</double></value></member>
      </struct></value>`;
      lineXmls.push(`<value><array><data>${xmlInt(0)}${xmlInt(0)}${shipStruct}</data></array></value>`);
    }

    if (!lineXmls.length) return { ok:false, error:'Ning\u00fan producto v\u00e1lido en Odoo' };

    const orderStruct = `<value><struct>
      <member><name>partner_id</name>${xmlInt(partnerId)}</member>
      <member><name>client_order_ref</name>${xmlStr(folio)}</member>
      ${(co.facturar === true) ? `<member><name>note</name>${xmlStr('[AUTOFACTURA] Pedido marcado para facturacion automatica.')}</member>` : ''}
      <member><name>order_line</name><value><array><data>${lineXmls.join('')}</data></array></value></member>
    </struct></value>`;
    const createText = await xmlrpc(uid, 'sale.order', 'create', orderStruct);
    const m = createText.match(/<value><int>(\d+)<\/int><\/value>/);
    const saleId = m ? parseInt(m[1]) : null;
    if (!saleId) return { ok:false, error:'Odoo no devolvi\u00f3 id de orden' };

    if (estado === 'confirm') {
      try {
        await xmlrpc(uid, 'sale.order', 'action_confirm',
          `<value><array><data><value><int>${saleId}</int></value></data></array></value>`);
        return { ok:true, saleId, folio, total: Math.round(total*100)/100, confirmed:true };
      } catch(confErr) {
        // La orden se creó pero no se pudo confirmar automáticamente (queda como cotización)
        return { ok:true, saleId, folio, total: Math.round(total*100)/100, confirmed:false, confirmError: confErr.message };
      }
    }
    return { ok:true, saleId, folio, total: Math.round(total*100)/100, confirmed:false };
  } catch(e) {
    return { ok:false, error: e.message };
  }
}

async function sendEmail(to, subject, html) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `Adaptekk <${FROM_EMAIL}>`, to: [to], subject, html })
  });
  const result = await resp.json();
  if (result && result.id) { try { await bumpMetric('email'); } catch(e) {} }
  return result;
}

// Igual que sendEmail pero con archivos adjuntos: [{ filename, content(base64) }]
async function sendEmailAtt(to, subject, html, attachments) {
  const body = { from: `Adaptekk <${FROM_EMAIL}>`, to: [to], subject, html };
  if (attachments && attachments.length) body.attachments = attachments;
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await resp.json();
  if (result && result.id) { try { await bumpMetric('email'); } catch(e) {} }
  return result;
}

// ── Métricas (contadores propios en un partner oculto ADAPTEKK_METRICS) ──
async function getMetricsPartner(uid) {
  const searchText = await xmlrpc(uid, 'res.partner', 'search',
    `<value><array><data><value><array><data>${xmlStr('name')}<value><string>=</string></value>${xmlStr('ADAPTEKK_METRICS')}</data></array></value></data></array></value>`
  );
  const idMatch = searchText.match(/<value><int>(\d+)<\/int><\/value>/);
  let data = {}, id = idMatch ? parseInt(idMatch[1]) : null;
  if (id) {
    const readText = await xmlrpc(uid, 'res.partner', 'read',
      `<value><array><data><value><int>${id}</int></value></data></array></value>`
    );
    const m = readText.match(/<name>comment<\/name>\s*<value>(?:<string>)?([^<]*)/);
    if (m) { try { data = JSON.parse(m[1]); } catch(e) { data = {}; } }
  }
  return { id, data };
}
async function saveMetricsPartner(uid, id, data) {
  const json = JSON.stringify(data);
  if (id) {
    await xmlrpc(uid, 'res.partner', 'write',
      `<value><array><data><value><int>${id}</int></value></data></array></value><value><struct><member><name>comment</name>${xmlStr(json)}</member></struct></value>`
    );
  } else {
    await xmlrpc(uid, 'res.partner', 'create',
      `<value><struct><member><name>name</name>${xmlStr('ADAPTEKK_METRICS')}</member><member><name>comment</name>${xmlStr(json)}</member><member><name>active</name><value><boolean>0</boolean></value></member></struct></value>`
    );
  }
}
function mxDay() { return new Date().toLocaleDateString('en-CA', {timeZone:'America/Mexico_City'}); }
// Precios de Claude Haiku 4.5 (USD por millon de tokens). Ajustables si cambia el plan.
const IA_PRICE_IN_PER_MTOK = 1.0;
const IA_PRICE_OUT_PER_MTOK = 5.0;
async function bumpMetric(kind, payload) {
  const uid = await odooAuth(); if (!uid) return;
  const { id, data } = await getMetricsPartner(uid);
  const month = mxDay().slice(0,7);
  if (kind === 'email') {
    const day = mxDay();
    if (data.emailDay !== day) { data.emailDay = day; data.emailDayCount = 0; }
    if (data.emailMonth !== month) { data.emailMonth = month; data.emailMonthCount = 0; }
    data.emailDayCount = (data.emailDayCount||0) + 1;
    data.emailMonthCount = (data.emailMonthCount||0) + 1;
  } else if (kind === 'noresult') {
    if (data.noResultMonth !== month) { data.noResultMonth = month; data.noResultCount = 0; }
    data.noResultCount = (data.noResultCount||0) + 1;
  } else if (kind === 'ia') {
    const inT = Math.max(0, parseInt((payload&&payload.inTok)||0) || 0);
    const outT = Math.max(0, parseInt((payload&&payload.outTok)||0) || 0);
    if (data.iaMonth !== month) { data.iaMonth = month; data.iaInTok = 0; data.iaOutTok = 0; data.iaCalls = 0; }
    data.iaInTok = (data.iaInTok||0) + inT;
    data.iaOutTok = (data.iaOutTok||0) + outT;
    data.iaCalls = (data.iaCalls||0) + 1;
    data.iaInTokTotal = (data.iaInTokTotal||0) + inT;   // acumulado de por vida
    data.iaOutTokTotal = (data.iaOutTokTotal||0) + outT;
  } else if (kind === 'copomex') {
    if (data.copomexMonth !== month) { data.copomexMonth = month; data.copomexCount = 0; }
    data.copomexCount = (data.copomexCount||0) + 1;
    data.copomexTotal = (data.copomexTotal||0) + 1;
  } else if (kind === 'skydropx') {
    if (data.skydropxMonth !== month) { data.skydropxMonth = month; data.skydropxCount = 0; }
    data.skydropxCount = (data.skydropxCount||0) + 1;
    data.skydropxTotal = (data.skydropxTotal||0) + 1;
  }
  await saveMetricsPartner(uid, id, data);
}

// Envía el correo de confirmación al cliente y un aviso al equipo de Adaptekk.
async function enviarCorreosPedido(orden, folio, total, metodo, estado, destinatarios) {
  // destinatarios: 'ambos' (default) | 'solo_equipo' | 'solo_cliente'
  destinatarios = destinatarios || 'ambos';
  if (!RESEND_KEY) return; // sin Resend configurado, no hace nada
  const co = orden.checkout || {};
  const contacto = co.contacto || {};
  const clienteEmail = contacto.email || '';
  const clienteNombre = contacto.nombre || 'Cliente';
  const items = Array.isArray(orden.items) ? orden.items : [];
  const fmt = (n) => '$' + Number(n||0).toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2});

  // Filas de productos
  let filas = '';
  for (const it of items) {
    const code = it.at_code || it.code || '';
    const qty = it.qty || 1;
    filas += `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;">${code}</td>`
           + `<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;text-align:center;">${qty}</td></tr>`;
  }
  const envioTxt = co.envio ? (co.envio.name || co.envio.id) : 'Por definir';
  const aprobado = estado === 'aprobado';

  // ── Correo al CLIENTE ──
  if (clienteEmail && destinatarios !== 'solo_equipo') {
    const htmlCliente = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#001F5B;padding:20px;text-align:center;">
          <span style="color:#fff;font-size:24px;font-weight:bold;letter-spacing:1px;">ADAP<span style="color:#C8102E;">TEK</span>K</span>
        </div>
        <div style="padding:24px;background:#fff;">
          <h2 style="color:#001F5B;margin:0 0 6px;">${aprobado ? '¡Gracias por tu compra!' : 'Pedido registrado'}</h2>
          <p style="color:#555;font-size:14px;line-height:1.5;">Hola ${clienteNombre}, ${aprobado
            ? 'tu pago fue aprobado y tu pedido está confirmado.'
            : 'recibimos tu pedido y está reservado. Te confirmamos en cuanto se acredite tu pago.'}</p>
          <div style="background:#f7f9fc;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="margin:4px 0;font-size:14px;"><b>Pedido:</b> ${folio}</p>
            <p style="margin:4px 0;font-size:14px;"><b>Total:</b> ${fmt(total)} MXN</p>
            <p style="margin:4px 0;font-size:14px;"><b>Método:</b> ${metodo === 'spei' ? 'Transferencia SPEI' : 'Tarjeta'}</p>
            <p style="margin:4px 0;font-size:14px;"><b>Envío:</b> ${envioTxt}</p>
          </div>
          <table style="width:100%;border-collapse:collapse;margin:12px 0;">
            <tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #001F5B;font-size:12px;color:#888;">PRODUCTO</th>
                <th style="text-align:center;padding:6px 8px;border-bottom:2px solid #001F5B;font-size:12px;color:#888;">CANT.</th></tr>
            ${filas}
          </table>
          <p style="color:#888;font-size:12px;margin-top:20px;">Si tienes dudas, responde a este correo o escríbenos por WhatsApp. ¡Gracias por confiar en Adaptekk!</p>
        </div>
      </div>`;
    try { await sendEmail(clienteEmail, `${aprobado ? 'Compra confirmada' : 'Pedido registrado'} — ${folio} | Adaptekk`, htmlCliente); } catch(_){}
  }

  // ── Aviso al EQUIPO (ADMIN_EMAIL) ──
  if (ADMIN_EMAIL && destinatarios !== 'solo_cliente') {
    const htmlAdmin = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:#001F5B;">${aprobado ? '🟢 Nuevo pedido PAGADO' : '🟡 Nuevo pedido (pago pendiente)'}</h2>
        <p style="font-size:14px;"><b>Folio:</b> ${folio}</p>
        <p style="font-size:14px;"><b>Total:</b> ${fmt(total)} MXN · <b>Método:</b> ${metodo === 'spei' ? 'SPEI' : 'Tarjeta'} · <b>Estado:</b> ${estado}</p>
        <p style="font-size:14px;"><b>Cliente:</b> ${clienteNombre} (${clienteEmail || 'sin correo'})</p>
        <p style="font-size:14px;"><b>Tel:</b> ${contacto.telefono || 'N/D'} · <b>Envío:</b> ${envioTxt}</p>
        <table style="width:100%;border-collapse:collapse;margin:12px 0;">
          <tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #001F5B;font-size:12px;">PRODUCTO</th>
              <th style="text-align:center;padding:6px 8px;border-bottom:2px solid #001F5B;font-size:12px;">CANT.</th></tr>
          ${filas}
        </table>
        <p style="font-size:12px;color:#888;">La orden ya está en Odoo. Revisa para preparar el envío.</p>
      </div>`;
    try { await sendEmail(ADMIN_EMAIL, `${aprobado ? '[PAGADO]' : '[PENDIENTE]'} Pedido ${folio} — ${fmt(total)}`, htmlAdmin); } catch(_){}
  }
}

const otpStore = {};

// ══════════════════════════════════════════════════════════════════
// MOTOR DE ARMADO reutilizable: lo usan la acción armar_conector Y la IA (chat_ia).
// Trabaja SIEMPRE con los códigos AT reales del catálogo de Odoo.
// ══════════════════════════════════════════════════════════════════
const _AT_STANDARDS = ['BSPP','BSPT','ORFS','NPSM','OFS','BST','MET','UNF','ORB','JIC','NPT','DIN','JIS','KOM','CAT','SAE','BSP','BT','LL','L'].sort((x,y)=>y.length-x.length);
function _splitStdGen(tok){
  if(!tok) return null;
  for (const s of _AT_STANDARDS){ if (tok.indexOf(s)===0){ return {std:s, gen: tok.slice(s.length)}; } }
  for (const g of ['HG','MG','H','M']){ if (tok.slice(-g.length)===g) return {std:tok.slice(0,-g.length), gen:g}; }
  return {std:tok, gen:''};
}
function _isNumAT(s){ return /^[0-9]{1,3}$/.test(s); }
function _parseAT(code){
  let c=code, ss=false;
  if (/-SS(\b|$)/.test(c)){ ss=true; c=c.replace(/-SS(\b|$)/,''); }
  const p=c.split('-'); if (p.length<5) return null;
  const tipo=p[1]; let idx=2; const aTok=p[idx++];
  if (!p[idx] || _isNumAT(p[idx])) return null;
  const bTok=p[idx++];
  const medA=(p[idx]&&_isNumAT(p[idx]))?p[idx++]:null;
  const medB=(p[idx]&&_isNumAT(p[idx]))?p[idx++]:null;
  if(!medA||!medB) return null;
  const a=_splitStdGen(aTok), b=_splitStdGen(bTok); if(!a||!b) return null;
  return { code, tipo, ss, endA:{std:a.std,gen:a.gen,size:medA}, endB:{std:b.std,gen:b.gen,size:medB} };
}

let _catalogCache = { ts:0, pieces:null };
async function getCatalogPieces(uid){
  const now = Date.now();
  if (_catalogCache.pieces && (now - _catalogCache.ts) < 300000) return _catalogCache.pieces; // caché 5 min
  const dom = `<value><array><data>${xmlStr('default_code')}<value><string>=like</string></value>${xmlStr('AT-%')}</data></array></value>`;
  const text = await odooSearchRead(uid, 'product.product', dom, ['default_code'], 8000);
  const codes=[...text.matchAll(/<name>default_code<\/name>\s*<value>\s*<string>([^<]*)<\/string>/g)].map(m=>m[1]);
  const pieces=[]; for (const c of codes){ const pc=_parseAT(c); if(pc) pieces.push(pc); }
  _catalogCache = { ts:now, pieces };
  return pieces;
}

async function armarConectorCore(body, uid){
  const up = v => String(v||'').toUpperCase().trim();
  const A = { std:up(body.a&&body.a.std), gen:up(body.a&&body.a.gen), size:String((body.a&&body.a.size)||'').trim() };
  const B = { std:up(body.b&&body.b.std), gen:up(body.b&&body.b.gen), size:String((body.b&&body.b.size)||'').trim() };
  const wantSS = up(body.material||'CS')==='SS';
  const maxP = Math.min(Math.max(parseInt(body.max_piezas)||4,2),4);
  if (!A.std||!A.gen||!A.size||!B.std||!B.gen||!B.size)
    return {error:'Faltan datos: a y b necesitan {std, gen, size}'};

  const pieces = await getCatalogPieces(uid);

  const isMale=g=>g==='M'||g==='MG', isFemale=g=>g==='H'||g==='HG';
  const sameEnd=(e,s)=>e.std===s.std&&e.gen===s.gen&&e.size===s.size;
  const mates=(a,b)=>(isMale(a)&&isFemale(b))||(isFemale(a)&&isMale(b));
  const matMatch=p=>wantSS?p.ss:!p.ss;
  const byKey={};
  function addEnd(p,end,other){ const k=end.std+'|'+end.size; (byKey[k]=byKey[k]||[]).push({end,other,code:p.code,tipo:p.tipo,ss:p.ss}); }
  for (const p of pieces){ addEnd(p,p.endA,p.endB); addEnd(p,p.endB,p.endA); }

  const endsWithA=(byKey[A.std+'|'+A.size]||[]).filter(x=>sameEnd(x.end,A)&&matMatch(x)).length;
  const endsWithB=(byKey[B.std+'|'+B.size]||[]).filter(x=>sameEnd(x.end,B)&&matMatch(x)).length;

  // Regla 1: directo (una pieza)
  let directo=null;
  for (const p of pieces){ if (matMatch(p) && ((sameEnd(p.endA,A)&&sameEnd(p.endB,B))||(sameEnd(p.endA,B)&&sameEnd(p.endB,A)))){ directo=p.code; break; } }

  // Regla 2: cadenas (BFS, las más cortas primero)
  const chains=[];
  if (!directo){
    const start=(byKey[A.std+'|'+A.size]||[]).filter(x=>sameEnd(x.end,A)&&matMatch(x));
    const queue=start.map(x=>({frontier:x.other, path:[x.code], used:new Set([x.code])}));
    let budget=15000;
    while(queue.length && chains.length<8 && budget-->0){
      const st=queue.shift();
      if (sameEnd(st.frontier,B)){ chains.push(st.path.slice()); continue; }
      if (st.path.length>=maxP) continue;
      const candAll=byKey[st.frontier.std+'|'+st.frontier.size]||[];
      let n=0;
      for (const x of candAll){
        if (n>=120) break;
        if (!matMatch(x)) continue;
        if (!mates(st.frontier.gen, x.end.gen)) continue;
        if (st.used.has(x.code)) continue;
        n++;
        if (queue.length>30000) break;
        const nused=new Set(st.used); nused.add(x.code);
        queue.push({frontier:x.other, path:st.path.concat(x.code), used:nused});
      }
    }
  }
  const seen=new Set(), uniqChains=[];
  for (const ch of chains){ const k=ch.join('>'); if(!seen.has(k)){seen.add(k); uniqChains.push(ch);} }

  // precios/stock de las piezas involucradas
  const fieldsRead = ['default_code','name','list_price','qty_available'];
  const allCodes=[...new Set([directo].concat(...uniqChains).filter(Boolean))];
  const info={};
  if (allCodes.length){
    const codesXml=allCodes.map(c=>xmlStr(c)).join('');
    const d2=`<value><array><data>${xmlStr('default_code')}<value><string>in</string></value><value><array><data>${codesXml}</data></array></value></data></array></value>`;
    const t2=await odooSearchRead(uid,'product.product',d2,fieldsRead,allCodes.length);
    t2.split('<struct>').slice(1).forEach(s=>{ const st=s.split('</struct>')[0]; const cd=xmlExtractField(st,'default_code'); if(cd) info[cd]={name:xmlExtractField(st,'name'),price:parseFloat(xmlExtractField(st,'list_price'))||0,qty:parseFloat(xmlExtractField(st,'qty_available'))||0}; });
  }
  const enrich=arr=>arr.map(c=>Object.assign({code:c}, info[c]||{}));

  const scored = uniqChains.map(ch=>{
    const items = enrich(ch);
    const en_stock = items.length>0 && items.every(p=>(p.qty||0)>0);
    const precio_total = items.reduce((s,p)=>s+(p.price||0),0);
    return { piezas: ch.length, en_stock, precio_total, items };
  });
  scored.sort((a,b)=>{
    if (a.en_stock!==b.en_stock) return a.en_stock ? -1 : 1;
    if (a.precio_total!==b.precio_total) return a.precio_total-b.precio_total;
    return a.piezas-b.piezas;
  });
  const mejores = scored.slice(0,2); // máximo 2 opciones; fabricar es la 3a

  const solo_fabricar = (!directo && mejores.length===0);
  return {
    ok:true, a:A, b:B, material:wantSS?'SS':'CS',
    piezas_en_catalogo: pieces.length,
    directo: directo? Object.assign({code:directo}, info[directo]||{}) : null,
    cadenas: mejores,
    cadenas_encontradas: uniqChains.length,
    fabricar_siempre_disponible: true,
    solo_fabricar,
    _diag: { extremo_A_existe_en_catalogo: endsWithA, extremo_B_existe_en_catalogo: endsWithB }
  };
}

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return {statusCode:200, headers, body:''};
  if (event.httpMethod !== 'POST') return {statusCode:405, headers, body: JSON.stringify({error:'Method not allowed'})};

  try {
    const body = JSON.parse(event.body || '{}');
    const { action } = body;

    // ── SEND VERIFICATION CODE ──
    if (action === 'send_verification') {
      const { email, name, phone } = body;
      if (!email) return {statusCode:400, headers, body: JSON.stringify({error:'Email requerido'})};

      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      const checkText = await xmlrpc(uid, 'res.partner', 'search',
        `<value><array><data>
          <value><array><data>${xmlStr('email')}<value><string>=</string></value>${xmlStr(email)}</data></array></value>
        </data></array></value>`
      );
      if (hasResults(checkText)) {
        return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Este correo ya está registrado. Inicia sesión, o si olvidaste tu contraseña usa "Crear / olvidé mi contraseña".'})};
      }

      // Teléfono repetido: no se permiten dos cuentas con el mismo teléfono
      if (phone) {
        const checkPhone = await xmlrpc(uid, 'res.partner', 'search',
          `<value><array><data>
            <value><array><data>${xmlStr('phone')}<value><string>=ilike</string></value>${xmlStr(phone)}</data></array></value>
          </data></array></value>`
        );
        if (hasResults(checkPhone)) {
          return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Este teléfono ya está registrado con otra cuenta. Inicia sesión, o usa "Crear / olvidé mi contraseña".'})};
        }
      }

      const otp = generateOTP();
      otpStore[email] = { otp, expires: Date.now() + 15 * 60 * 1000 };

      const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
          <div style="background:#001F5B;padding:24px;text-align:center;">
            <span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#fff;">ADAP</span><span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#C8102E;">TEK</span><span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#fff;">K</span>
          </div>
          <div style="padding:32px;background:#fff;border:1px solid #eee;">
            <h2 style="color:#001F5B;margin-top:0;">Verifica tu correo electrónico</h2>
            <p style="color:#555;">Hola <strong>${name||'cliente'}</strong>, usa este código para confirmar tu registro:</p>
            <div style="background:#f4f8ff;border:2px solid #001F5B;border-radius:10px;padding:24px;text-align:center;margin:24px 0;">
              <span style="font-size:42px;font-weight:900;letter-spacing:12px;color:#001F5B;">${otp}</span>
            </div>
            <p style="color:#888;font-size:13px;">Este código expira en <strong>15 minutos</strong>.</p>
          </div>
          <div style="background:#f5f5f5;padding:16px;text-align:center;font-size:11px;color:#aaa;">© 2026 Adaptekk S.A. de C.V. — Conecta sin límites</div>
        </div>`;

      const result = await sendEmail(email, 'Tu código de verificación Adaptekk', emailHtml);
      if (result.id) {
        return {statusCode:200, headers, body: JSON.stringify({success:true, message:'Código enviado a ' + email})};
      }
      return {statusCode:200, headers, body: JSON.stringify({success:false, error:'No se pudo enviar el correo', detail: result})};
    }

    // ── VERIFY OTP ──
    if (action === 'verify_otp') {
      const { email, otp } = body;
      const stored = otpStore[email];
      if (!stored) return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Código expirado. Solicita uno nuevo.'})};
      if (Date.now() > stored.expires) {
        delete otpStore[email];
        return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Código expirado. Solicita uno nuevo.'})};
      }
      if (stored.otp !== otp) {
        return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Código incorrecto.'})};
      }
      delete otpStore[email];
      return {statusCode:200, headers, body: JSON.stringify({success:true})};
    }

    // ── SEND LOGIN OTP (el correo DEBE existir) ──
    if (action === 'send_login_otp') {
      const { email } = body;
      if (!email) return {statusCode:400, headers, body: JSON.stringify({error:'Email requerido'})};
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      const checkText = await xmlrpc(uid, 'res.partner', 'search',
        `<value><array><data>
          <value><array><data>${xmlStr('email')}<value><string>=ilike</string></value>${xmlStr(email)}</data></array></value>
        </data></array></value>`
      );
      if (!hasResults(checkText)) {
        return {statusCode:200, headers, body: JSON.stringify({success:false, notFound:true, error:'No encontramos una cuenta con ese correo.'})};
      }

      const otp = generateOTP();
      otpStore[email] = { otp, expires: Date.now() + 15 * 60 * 1000 };

      const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
          <div style="background:#001F5B;padding:24px;text-align:center;">
            <span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#fff;">ADAP</span><span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#C8102E;">TEK</span><span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#fff;">K</span>
          </div>
          <div style="padding:32px;background:#fff;border:1px solid #eee;">
            <h2 style="color:#001F5B;margin-top:0;">Tu código para iniciar sesión</h2>
            <p style="color:#555;">Usa este código para entrar a tu cuenta Adaptekk:</p>
            <div style="background:#f4f8ff;border:2px solid #001F5B;border-radius:10px;padding:24px;text-align:center;margin:24px 0;">
              <span style="font-size:42px;font-weight:900;letter-spacing:12px;color:#001F5B;">${otp}</span>
            </div>
            <p style="color:#888;font-size:13px;">Este código expira en <strong>15 minutos</strong>. Si no intentaste iniciar sesión, ignora este correo.</p>
          </div>
          <div style="background:#f5f5f5;padding:16px;text-align:center;font-size:11px;color:#aaa;">© 2026 Adaptekk S.A. de C.V. — Conecta sin límites</div>
        </div>`;

      const result = await sendEmail(email, 'Tu código de acceso Adaptekk', emailHtml);
      if (result.id) {
        return {statusCode:200, headers, body: JSON.stringify({success:true, message:'Código enviado a ' + email})};
      }
      return {statusCode:200, headers, body: JSON.stringify({success:false, error:'No se pudo enviar el correo', detail: result})};
    }

    // ── VERIFY LOGIN OTP (valida código + devuelve datos del cliente y su estado) ──
    if (action === 'verify_login_otp') {
      const { email, otp } = body;
      const stored = otpStore[email];
      if (!stored) return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Código expirado. Solicita uno nuevo.'})};
      if (Date.now() > stored.expires) { delete otpStore[email]; return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Código expirado. Solicita uno nuevo.'})}; }
      if (stored.otp !== otp) return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Código incorrecto.'})};
      delete otpStore[email];

      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      const text = await xmlrpc(uid, 'res.partner', 'search_read',
        `<value><array><data>
          <value><array><data>${xmlStr('email')}<value><string>=ilike</string></value>${xmlStr(email)}</data></array></value>
        </data></array></value>`
      );
      const get = (field) => { const m = text.match(new RegExp('<name>' + field + '</name>\\s*<value>(?:<(?:string|int|boolean)>)?([^<]*)', 'i')); return m ? m[1].trim() : ''; };
      const id = parseInt(get('id')) || 0;
      const comment = get('comment') || '';
      const verified = /VERIFICADO/i.test(comment);
      const client = { id, name: get('name'), email: get('email') || email, company_name: get('company_name'), verified };
      return {statusCode:200, headers, body: JSON.stringify({success:true, client})};
    }

    // ── LOGIN CON CONTRASEÑA (correo + contraseña) ──
    if (action === 'login_password') {
      const { email, password } = body;
      if (!email || !password) return {statusCode:400, headers, body: JSON.stringify({error:'Correo y contraseña requeridos'})};
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      const text = await xmlrpc(uid, 'res.partner', 'search_read',
        `<value><array><data>
          <value><array><data>${xmlStr('email')}<value><string>=ilike</string></value>${xmlStr(email)}</data></array></value>
        </data></array></value>`
      );
      const structM = text.match(/<struct>[\s\S]*?<\/struct>/);
      if (!structM) return {statusCode:200, headers, body: JSON.stringify({success:false, notFound:true, error:'No encontramos una cuenta con ese correo.'})};
      const struct = structM[0];
      const id = parseInt(xmlExtractField(struct, 'id')) || 0;
      if (!id) return {statusCode:200, headers, body: JSON.stringify({success:false, notFound:true, error:'No encontramos una cuenta con ese correo.'})};
      const stored = xmlExtractField(struct, 'ref');
      if (!stored || stored.indexOf('scrypt$') !== 0) {
        return {statusCode:200, headers, body: JSON.stringify({success:false, needPassword:true, error:'Esta cuenta todavía no tiene contraseña. Usa "Crear contraseña".'})};
      }
      if (!verifyPassword(password, stored)) {
        return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Correo o contraseña incorrectos.'})};
      }
      const comment = xmlExtractField(struct, 'comment') || '';
      const verified = /VERIFICADO/i.test(comment);
      const client = { id, name: xmlExtractField(struct, 'name'), email: xmlExtractField(struct, 'email') || email, company_name: xmlExtractField(struct, 'company_name'), verified };
      return {statusCode:200, headers, body: JSON.stringify({success:true, client})};
    }

    // ── CREAR / RESTABLECER CONTRASEÑA (requiere código OTP enviado con send_login_otp) ──
    if (action === 'reset_password') {
      const { email, otp, password } = body;
      if (!email || !otp || !password) return {statusCode:400, headers, body: JSON.stringify({error:'Datos incompletos'})};
      if (String(password).length < 6) return {statusCode:200, headers, body: JSON.stringify({success:false, error:'La contraseña debe tener al menos 6 caracteres.'})};
      const st = otpStore[email];
      if (!st || Date.now() > st.expires) { if (st) delete otpStore[email]; return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Código expirado. Solicita uno nuevo.'})}; }
      if (st.otp !== otp) return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Código incorrecto.'})};
      delete otpStore[email];
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      const sText = await xmlrpc(uid, 'res.partner', 'search',
        `<value><array><data>
          <value><array><data>${xmlStr('email')}<value><string>=ilike</string></value>${xmlStr(email)}</data></array></value>
        </data></array></value>`
      );
      const idM = sText.match(/<int>(\d+)<\/int>/);
      const pid = idM ? parseInt(idM[1]) : 0;
      if (!pid) return {statusCode:200, headers, body: JSON.stringify({success:false, error:'No encontramos una cuenta con ese correo.'})};
      const hash = hashPassword(password);
      const idsXml = `<value><array><data><value><int>${pid}</int></value></data></array></value>`;
      const valXml = `<value><struct><member><name>ref</name>${xmlStr(hash)}</member></struct></value>`;
      await xmlrpc(uid, 'res.partner', 'write', idsXml + valXml);
      return {statusCode:200, headers, body: JSON.stringify({success:true})};
    }

    // ── CREATE CONTACT IN ODOO ──
    if (action === 'create_contact') {
      const { name, email, phone, company, password, rfc, razon_social, cp_fiscal, regimen_fiscal, email_fiscal, calle, colonia, ciudad, estado, constancia_b64, constancia_name } = body;

      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      // Check duplicate email
      const checkEmail = await xmlrpc(uid, 'res.partner', 'search',
        `<value><array><data>
          <value><array><data>${xmlStr('email')}<value><string>=</string></value>${xmlStr(email)}</data></array></value>
        </data></array></value>`
      );
      if (hasResults(checkEmail)) {
        return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Este correo ya está registrado'})};
      }

      // Teléfono duplicado (red de seguridad)
      if (phone) {
        const checkPhone2 = await xmlrpc(uid, 'res.partner', 'search',
          `<value><array><data>
            <value><array><data>${xmlStr('phone')}<value><string>=ilike</string></value>${xmlStr(phone)}</data></array></value>
          </data></array></value>`
        );
        if (hasResults(checkPhone2)) {
          return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Este teléfono ya está registrado con otra cuenta'})};
        }
      }

      // Check duplicate RFC
      if (rfc) {
        const checkRFC = await xmlrpc(uid, 'res.partner', 'search',
          `<value><array><data>
            <value><array><data>${xmlStr('vat')}<value><string>=</string></value>${xmlStr(rfc)}</data></array></value>
          </data></array></value>`
        );
        if (hasResults(checkRFC)) {
          return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Este RFC ya está registrado en Adaptekk'})};
        }
      }

      // Build ALL fields in one struct - no string concatenation issues
      // Build partner data — only include non-empty values
      const partnerData = {};
      partnerData.name           = razon_social || name;
      partnerData.email          = email;
      partnerData.customer_rank  = 1;
      partnerData.country_id     = 156; // Mexico
      partnerData.comment        = `Registro Adaptekk Web | Contacto: ${name} | Estado: Pendiente aprobación`;

      if (phone)           partnerData.phone = phone;
      if (company)         partnerData.company_name = company;
      // Contraseña: se guarda cifrada (hash) en el campo 'ref' (referencia interna)
      if (password)        partnerData.ref = hashPassword(password);

      // Fiscal data — only if RFC provided
      if (rfc) {
        partnerData.vat                        = rfc;
        partnerData.l10n_mx_edi_fiscal_regime  = regimen_fiscal || '';
      }
      // Fiscal address
      if (cp_fiscal)  partnerData.zip    = cp_fiscal;
      if (calle)      partnerData.street = calle + (colonia ? ', ' + colonia : '');
      if (ciudad)     partnerData.city   = ciudad;
      // state_id requires numeric ID in Odoo — store state in comment instead
      if (estado) {
        partnerData.comment = (partnerData.comment || '') + '\nEstado: ' + estado;
      }

      // Build XML struct from object
      let membersXml = '';
      for (const [key, val] of Object.entries(partnerData)) {
        if (val === '' || val === null || val === undefined) continue;
        if (typeof val === 'number') {
          membersXml += `<member><name>${key}</name>${xmlInt(val)}</member>`;
        } else {
          membersXml += `<member><name>${key}</name>${xmlStr(String(val))}</member>`;
        }
      }

      const createArgsXml = `<value><struct>${membersXml}</struct></value>`;

      const createText = await xmlrpc(uid, 'res.partner', 'create', createArgsXml);

      const idMatch = createText.match(/<value><int>(\d+)<\/int><\/value>/);
      const partnerId = idMatch ? parseInt(idMatch[1]) : null;

      if (partnerId) {
        // ── EMAIL AL EJECUTIVO (validaciones@adaptekk.com) ──
        const regimenLabels = {
          '601':'601 - General de Ley Personas Morales',
          '603':'603 - Personas Morales sin Fines Lucrativos',
          '605':'605 - Sueldos y Salarios',
          '606':'606 - Arrendamiento',
          '612':'612 - Personas Físicas con Actividades Empresariales',
          '616':'616 - Sin obligaciones fiscales',
          '621':'621 - Incorporación Fiscal',
          '626':'626 - RESICO',
        };
        const regimenLabel = regimenLabels[regimen_fiscal] || regimen_fiscal || '—';

        const adminHtml = `
          <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;">
            <div style="background:#001F5B;padding:20px 24px;display:flex;align-items:center;justify-content:space-between;">
              <div>
                <span style="font-family:Arial Black;font-size:22px;font-weight:900;color:#fff;">ADAP</span><span style="font-family:Arial Black;font-size:22px;font-weight:900;color:#C8102E;">TEK</span><span style="font-family:Arial Black;font-size:22px;font-weight:900;color:#fff;">K</span>
              </div>
              <div style="background:#C8102E;color:#fff;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;">🆕 NUEVO REGISTRO</div>
            </div>

            <div style="padding:24px;background:#fff;border:1px solid #eee;">
              <h2 style="color:#001F5B;margin-top:0;margin-bottom:20px;">Nuevo cliente pendiente de aprobación</h2>

              <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                <thead>
                  <tr style="background:#f4f8ff;">
                    <th colspan="2" style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#001F5B;">DATOS DE CONTACTO</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style="padding:9px 14px;border-bottom:1px solid #f0f0f0;color:#888;width:160px;font-size:13px;">Nombre:</td><td style="padding:9px 14px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:13px;">${name}</td></tr>
                  <tr><td style="padding:9px 14px;border-bottom:1px solid #f0f0f0;color:#888;font-size:13px;">Email:</td><td style="padding:9px 14px;border-bottom:1px solid #f0f0f0;font-size:13px;"><a href="mailto:${email}" style="color:#001F5B;">${email}</a></td></tr>
                  <tr><td style="padding:9px 14px;border-bottom:1px solid #f0f0f0;color:#888;font-size:13px;">Teléfono:</td><td style="padding:9px 14px;border-bottom:1px solid #f0f0f0;font-size:13px;"><a href="tel:${phone}" style="color:#001F5B;">${phone||'—'}</a></td></tr>
                  <tr><td style="padding:9px 14px;color:#888;font-size:13px;">Empresa:</td><td style="padding:9px 14px;font-size:13px;">${company||'—'}</td></tr>
                </tbody>
              </table>

              ${rfc ? `
              <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                <thead>
                  <tr style="background:#fff8f0;">
                    <th colspan="2" style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C8102E;">DATOS FISCALES (CFDI)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style="padding:9px 14px;border-bottom:1px solid #f0f0f0;color:#888;width:160px;font-size:13px;">RFC:</td><td style="padding:9px 14px;border-bottom:1px solid #f0f0f0;font-weight:700;font-size:14px;letter-spacing:1px;color:#001F5B;">${rfc}</td></tr>
                  <tr><td style="padding:9px 14px;border-bottom:1px solid #f0f0f0;color:#888;font-size:13px;">Razón Social:</td><td style="padding:9px 14px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:13px;">${razon_social||'—'}</td></tr>
                  <tr><td style="padding:9px 14px;border-bottom:1px solid #f0f0f0;color:#888;font-size:13px;">CP Fiscal:</td><td style="padding:9px 14px;border-bottom:1px solid #f0f0f0;font-size:13px;">${cp_fiscal||'—'}</td></tr>
                  <tr><td style="padding:9px 14px;color:#888;font-size:13px;">Régimen:</td><td style="padding:9px 14px;font-size:13px;">${regimenLabel}</td></tr>
                </tbody>
              </table>` : '<p style="color:#aaa;font-size:13px;padding:12px;background:#fafafa;border-radius:6px;">El cliente no proporcionó datos fiscales.</p>'}

              <div style="background:#f4f8ff;border-left:4px solid #001F5B;padding:14px;border-radius:4px;margin-bottom:20px;">
                <p style="margin:0;font-size:13px;color:#001F5B;font-weight:600;">Odoo Partner ID: #${partnerId}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#888;">Registro recibido el ${new Date().toLocaleString('es-MX', {timeZone:'America/Mexico_City'})}</p>
              </div>

              <div style="display:flex;gap:10px;">
                <a href="https://hydratechgroup.odoo.com/web#id=${partnerId}&model=res.partner&view_type=form" 
                   style="flex:1;display:block;background:#001F5B;color:#fff;text-align:center;padding:12px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">
                  Ver en Odoo →
                </a>
                <a href="https://wa.me/${phone}?text=Hola%20${encodeURIComponent(name)}%2C%20soy%20ejecutivo%20de%20Adaptekk.%20Vi%20tu%20registro%20y%20quiero%20darte%20la%20bienvenida." 
                   style="flex:1;display:block;background:#25D366;color:#fff;text-align:center;padding:12px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">
                  WhatsApp →
                </a>
              </div>
            </div>
            <div style="background:#f5f5f5;padding:14px;text-align:center;font-size:11px;color:#aaa;">© 2026 Adaptekk S.A. de C.V. — Conecta sin límites</div>
          </div>`;

        // Send admin email with or without constancia attachment
        const emailPayload = {
          from: `Adaptekk <${FROM_EMAIL}>`,
          to: [ADMIN_EMAIL],
          subject: `🆕 Nuevo registro Adaptekk — ${name} ${rfc ? '| RFC: '+rfc : ''}`,
          html: adminHtml
        };

        if (constancia_b64 && constancia_name) {
          // Attach constancia to email
          emailPayload.attachments = [{
            filename: constancia_name,
            content: constancia_b64
          }];
        }

        // Send to gerencia (always)
        const adminResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(emailPayload)
        });
        await adminResp.json();

        // Also notify the corresponding zone executive
        const clientEstado = (calle + ' ' + ciudad + ' ' + (regimen_fiscal||'')).toLowerCase();
        // Get state from comment
        const zona = getZoneFromState(ciudad || '');
        if (zona && ZONE_EMAILS[zona] && ZONE_EMAILS[zona] !== ADMIN_EMAIL) {
          const zonePayload = { ...emailPayload, to: [ZONE_EMAILS[zona]], subject: `[${zona}] ` + emailPayload.subject };
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(zonePayload)
          });
        }

        // Add zone to Odoo comment
        const zonaInfo = zona ? `\nZona: ${zona}` : '';
        if (zona && partnerId) {
          const zoneUpdateXml = `<?xml version="1.0"?>
<methodCall><methodName>execute_kw</methodName><params>
  <param><value><string>${ODOO_DB}</string></value></param>
  <param><value><int>${uid}</int></value></param>
  <param><value><string>${ODOO_KEY}</string></value></param>
  <param><value><string>res.partner</string></value></param>
  <param><value><string>write</string></value></param>
  <param><value><array><data>
    <value><array><data><value><int>${partnerId}</int></value></data></array></value>
    <value><struct>
      <member><name>comment</name><value><string>Registro Adaptekk Web | Contacto: ${name} | Estado: Pendiente aprobacion | Zona: ${zona}</string></value></member>
    </struct></value>
  </data></array></value></param>
  <param><value><struct></struct></value></param>
</params></methodCall>`;
          await fetch(`${ODOO_URL}/xmlrpc/2/object`, {method:'POST',headers:{'Content-Type':'text/xml'},body:zoneUpdateXml});
        }

        // If no constancia — send WhatsApp reminder link via email to admin
        if (!constancia_b64 && rfc) {
          const waMsg = encodeURIComponent(
            `Hola ${name}, soy ejecutivo de Adaptekk. Recibimos tu registro pero necesitamos tu Constancia de Situación Fiscal del SAT para activar tu cuenta con facturación. ` +
            `Puedes descargarla gratis en sat.gob.mx. ¿Puedes enviárnosla por este medio?`
          );
          const reminderHtml = `
            <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;">
              <div style="background:#FFF3CD;border:1px solid #FFA000;border-radius:8px;padding:16px;margin-bottom:16px;">
                <h3 style="color:#E65100;margin-top:0;">⚠️ Constancia no adjuntada</h3>
                <p style="color:#555;margin-bottom:0;">${name} (${email}) se registró con RFC <strong>${rfc}</strong> pero NO adjuntó su Constancia de Situación Fiscal.</p>
              </div>
              <p style="color:#555;">Puedes solicitársela por WhatsApp:</p>
              <a href="https://wa.me/${phone}?text=${waMsg}" 
                 style="display:block;background:#25D366;color:#fff;text-align:center;padding:14px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;margin-bottom:12px;">
                📱 Enviar WhatsApp — Solicitar Constancia
              </a>
              <a href="mailto:${email}?subject=Constancia de Situación Fiscal — Adaptekk&body=Hola ${name}, necesitamos tu Constancia de Situación Fiscal para activar tu cuenta."
                 style="display:block;background:#001F5B;color:#fff;text-align:center;padding:14px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;">
                ✉️ Enviar Email — Solicitar Constancia
              </a>
            </div>`;
          
          await sendEmail(ADMIN_EMAIL, `⚠️ Sin constancia — ${name} | RFC: ${rfc}`, reminderHtml);
        }

        // ── EMAIL DE BIENVENIDA AL CLIENTE ──
        const welcomeHtml = `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
            <div style="background:#001F5B;padding:24px;text-align:center;">
              <span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#fff;">ADAP</span><span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#C8102E;">TEK</span><span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#fff;">K</span>
            </div>
            <div style="padding:32px;background:#fff;border:1px solid #eee;">
              <h2 style="color:#001F5B;">¡Bienvenido a Adaptekk, ${name}!</h2>
              <p style="color:#555;">Tu registro fue recibido exitosamente. Un ejecutivo revisará tu cuenta y te contactará en menos de <strong>24 horas hábiles</strong>.</p>
              <div style="background:#f4f8ff;border-left:4px solid #001F5B;padding:16px;border-radius:4px;margin:20px 0;">
                <p style="margin:0;color:#001F5B;font-weight:600;">Mientras tanto puedes:</p>
                <ul style="color:#555;margin:8px 0 0;padding-left:20px;">
                  <li>Explorar nuestro catálogo de conectores</li>
                  <li>Usar el configurador de conectores hidráulicos</li>
                  <li>Contactarnos por WhatsApp para cualquier duda</li>
                </ul>
              </div>
              <a href="${SITE_URL}" style="display:block;background:#C8102E;color:#fff;text-align:center;padding:14px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:20px;">Ir a Adaptekk →</a>
            </div>
            <div style="background:#f5f5f5;padding:16px;text-align:center;font-size:11px;color:#aaa;">© 2026 Adaptekk S.A. de C.V. — Conecta sin límites</div>
          </div>`;

        await sendEmail(email, '¡Bienvenido a Adaptekk! Tu registro está en revisión', welcomeHtml);

        return {statusCode:200, headers, body: JSON.stringify({
          success:true, 
          partner_id: partnerId,
          fields_sent: Object.keys(partnerData)
        })};
      }

      return {statusCode:200, headers, body: JSON.stringify({
        success:false, 
        error:'No se pudo crear el contacto en Odoo',
        debug: createText.substring(0, 300)
      })};
    }

    // ── BUSCAR CODIGO POSTAL ──
    if (action === 'buscar_cp') {
      const cp = body.cp || '';
      if (cp.length !== 5) {
        return {statusCode:400, headers, body: JSON.stringify({error:'CP inválido'})};
      }
      try {
        let colonias = new Set();
        let municipio = '';
        let estado = '';
        const diag = { copomex_token_real:false, copomex_token_len:0, api1_copomex:0, api2_zippo:0, api3_icalia:0, api1_error:null, api1_http:null };

        // API 1: COPOMEX (type=simplified -> response.asentamiento es un arreglo de colonias)
        try {
          const copoTok = (process.env.COPOMEX_TOKEN || 'prueba').trim();
          diag.copomex_token_real = (copoTok && copoTok !== 'prueba');
          diag.copomex_token_len = copoTok.length;
          const r1 = await fetch('https://api.copomex.com/query/info_cp/' + cp + '?type=simplified&token=' + encodeURIComponent(copoTok));
          diag.api1_http = r1.status;
          if (r1.ok) {
            const text1 = await r1.text();
            if (!text1.includes('<!DOCTYPE')) {
              const d1 = JSON.parse(text1);
              if (d1 && d1.error) diag.api1_error = d1.error_message || ('code ' + d1.code_error);
              const resp1 = (d1 && d1.response) ? d1.response : {};
              const asents = resp1.asentamiento;
              const before = colonias.size;
              if (Array.isArray(asents)) asents.forEach(a => { if(a) colonias.add(a); });
              else if (asents) colonias.add(asents);
              if (!municipio) municipio = resp1.municipio || '';
              if (!estado) estado = resp1.estado || '';
              diag.api1_copomex = colonias.size - before;
            } else { diag.api1_error = 'respuesta HTML (token/endpoint)'; }
          }
        } catch(e1) { diag.api1_error = String(e1 && e1.message || e1); }

        // API 2: zippopotam — complementa con más colonias
        try {
          const before = colonias.size;
          const r2 = await fetch('https://api.zippopotam.us/mx/' + cp);
          if (r2.ok) {
            const d2 = await r2.json();
            if (d2.places) {
              d2.places.forEach(p => { if(p['place name']) colonias.add(p['place name']); });
              if (!estado && d2.places[0]) estado = d2.places[0].state || '';
            }
          }
          diag.api2_zippo = colonias.size - before;
        } catch(e2) { }

        // API 3: sepomex.icalialabs.com — otra fuente complementaria
        try {
          const before = colonias.size;
          const r3 = await fetch('https://sepomex.icalialabs.com/api/v1/zip_codes?zip_code=' + cp + '&per_page=200');
          if (r3.ok) {
            const text3 = await r3.text();
            if (!text3.includes('<!DOCTYPE')) {
              const d3 = JSON.parse(text3);
              (d3.zip_codes || []).forEach(z => { if(z.d_asenta) colonias.add(z.d_asenta); });
              if (!municipio && d3.zip_codes && d3.zip_codes[0]) municipio = d3.zip_codes[0].d_mnpio || '';
              if (!estado && d3.zip_codes && d3.zip_codes[0]) estado = d3.zip_codes[0].d_estado || '';
            }
          }
          diag.api3_icalia = colonias.size - before;
        } catch(e3) { }

        const coloniasArr = [...colonias].sort();
        diag.total = coloniasArr.length;
        diag.tiene_las_hadas = coloniasArr.some(c => /las\s*hadas/i.test(String(c)));

        const resp = {
          success: coloniasArr.length > 0,
          colonias: coloniasArr,
          municipio: municipio,
          ciudad: municipio,
          estado: estado
        };
        if (!coloniasArr.length) resp.error = 'CP no encontrado';
        if (body.debug) resp._diag = diag;
        return {statusCode:200, headers, body: JSON.stringify(resp)};

      } catch(err) {
        return {statusCode:200, headers, body: JSON.stringify({success:false, error: err.message})};
      }
    }

    // ── GET PENDING CLIENTS ──
    if (action === 'get_pending_clients') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      // Captura todo registro web: customer_rank>0 O el marcador de comentario (por si el rank no se grabó)
      const searchXml = `<value><array><data>
        <value><string>|</string></value>
        <value><array><data>${xmlStr('customer_rank')}<value><string>&gt;</string></value>${xmlInt(0)}</data></array></value>
        <value><array><data>${xmlStr('comment')}<value><string>ilike</string></value>${xmlStr('Registro Adaptekk Web')}</data></array></value>
      </data></array></value>`;

      const text = await xmlrpc(uid, 'res.partner', 'search_read', searchXml
      );

      // Parse XML response into JSON array
      const clients = [];
      const memberRegex = /<struct>([\s\S]*?)<\/struct>/g;
      let match;
      while ((match = memberRegex.exec(text)) !== null) {
        const struct = match[1];
        const getVal = (field) => xmlExtractField(struct, field);
        const id = parseInt(getVal('id'));
        if (id && id > 0) {
          clients.push({
            id,
            name: getVal('name'),
            email: getVal('email'),
            phone: getVal('phone'),
            company_name: getVal('company_name'),
            vat: getVal('vat'),
            zip: getVal('zip'),
            street: getVal('street'),
            city: getVal('city'),
            l10n_mx_edi_fiscal_regime: getVal('l10n_mx_edi_fiscal_regime'),
            comment: getVal('comment')
          });
        }
      }

      return {statusCode:200, headers, body: JSON.stringify({success:true, clients, total: clients.length})};
    }

    // ── UPDATE CLIENT STATUS ──
    if (action === 'update_client_status') {
      const { partner_id, status, notas, client_name, client_email, client_phone } = body;
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      const statusMap = {
        aprobar: 'VERIFICADO',
        rechazar: 'RECHAZADO',
        info: 'INFO_SOLICITADA'
      };
      const statusLabel = statusMap[status] || status;
      const fecha = new Date().toLocaleString('es-MX', {timeZone:'America/Mexico_City'});

      // Update comment in Odoo
      const newComment = `${statusLabel} por ejecutivo el ${fecha}${notas ? '\nNota: ' + notas : ''}\n---\nRegistro Adaptekk Web`;
      const updateXml = `<value><struct>
        <member><name>comment</name>${xmlStr(newComment)}</member>
      </struct></value>`;

      const idsXml = `<value><array><data><value><int>${partner_id}</int></value></data></array></value>`;
      await xmlrpc(uid, 'res.partner', 'write', idsXml + updateXml);

      // Send email to client
      if (status === 'aprobar') {
        const approveHtml = `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
            <div style="background:#001F5B;padding:24px;text-align:center;">
              <span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#fff;">ADAP</span><span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#C8102E;">TEK</span><span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#fff;">K</span>
            </div>
            <div style="padding:32px;background:#fff;border:1px solid #eee;">
              <div style="background:#D1FAE5;border-radius:8px;padding:16px;text-align:center;margin-bottom:20px;">
                <div style="font-size:40px;margin-bottom:8px;">&#9989;</div>
                <div style="font-size:18px;font-weight:800;color:#065F46;">Tu cuenta ha sido verificada</div>
              </div>
              <p style="color:#555;">Hola <strong>${client_name}</strong>,</p>
              <p style="color:#555;">Tu cuenta en Adaptekk ha sido verificada exitosamente. Ya puedes acceder a:</p>
              <ul style="color:#555;line-height:2;">
                <li>Precios reales de todos los productos</li>
                <li>Stock disponible en tiempo real</li>
                <li>Solicitar cotizaciones formales</li>
                <li>Historial de pedidos</li>
              </ul>
              <a href="${SITE_URL}" style="display:block;background:#001F5B;color:#fff;text-align:center;padding:14px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:20px;font-size:15px;">Acceder a Adaptekk →</a>
            </div>
            <div style="background:#f5f5f5;padding:14px;text-align:center;font-size:11px;color:#aaa;">© 2026 Adaptekk S.A. de C.V. — Conecta sin límites</div>
          </div>`;
        await sendEmail(client_email, '✅ Tu cuenta Adaptekk fue verificada — ya puedes ver precios', approveHtml);

      } else if (status === 'rechazar') {
        const rejectHtml = `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
            <div style="background:#001F5B;padding:24px;text-align:center;">
              <span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#fff;">ADAP</span><span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#C8102E;">TEK</span><span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#fff;">K</span>
            </div>
            <div style="padding:32px;background:#fff;border:1px solid #eee;">
              <h2 style="color:#001F5B;">Actualización sobre tu registro</h2>
              <p style="color:#555;">Hola <strong>${client_name}</strong>, necesitamos que actualices algunos datos de tu cuenta.</p>
              ${notas ? `<div style="background:#FFF8E1;border-left:4px solid #FFA000;padding:14px;border-radius:4px;margin:16px 0;"><strong>Motivo:</strong> ${notas}</div>` : ''}
              <p style="color:#555;">Por favor contáctanos para resolver esto:</p>
              <a href="https://wa.me/${client_phone}" style="display:block;background:#25D366;color:#fff;text-align:center;padding:12px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:16px;">WhatsApp con Ejecutivo</a>
              <a href="mailto:validaciones@adaptekk.com" style="display:block;background:#001F5B;color:#fff;text-align:center;padding:12px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:8px;">Enviar Email</a>
            </div>
            <div style="background:#f5f5f5;padding:14px;text-align:center;font-size:11px;color:#aaa;">© 2026 Adaptekk S.A. de C.V.</div>
          </div>`;
        await sendEmail(client_email, 'Información requerida para tu cuenta Adaptekk', rejectHtml);

      } else if (status === 'info') {
        const infoHtml = `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
            <div style="background:#001F5B;padding:24px;text-align:center;">
              <span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#fff;">ADAP</span><span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#C8102E;">TEK</span><span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#fff;">K</span>
            </div>
            <div style="padding:32px;background:#fff;border:1px solid #eee;">
              <h2 style="color:#001F5B;">Necesitamos informacion adicional</h2>
              <p style="color:#555;">Hola <strong>${client_name}</strong>, para completar tu registro necesitamos:</p>
              <div style="background:#f4f8ff;border-left:4px solid #001F5B;padding:14px;border-radius:4px;margin:16px 0;">${notas}</div>
              <p style="color:#555;">Puedes respondernos por cualquiera de estos medios:</p>
              <a href="https://wa.me/${client_phone}?text=Hola, me registre en Adaptekk y necesitan informacion adicional." style="display:block;background:#25D366;color:#fff;text-align:center;padding:12px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:16px;">Responder por WhatsApp</a>
              <a href="mailto:validaciones@adaptekk.com" style="display:block;background:#001F5B;color:#fff;text-align:center;padding:12px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:8px;">Responder por Email</a>
            </div>
            <div style="background:#f5f5f5;padding:14px;text-align:center;font-size:11px;color:#aaa;">© 2026 Adaptekk S.A. de C.V.</div>
          </div>`;
        await sendEmail(client_email, 'Informacion requerida — Adaptekk', infoHtml);
      }

      return {statusCode:200, headers, body: JSON.stringify({success:true, status: statusLabel})};
    }

    // ── SAVE USER PASSWORD ──
    // ── REENVIAR ACCESO AL CLIENTE (correo con enlace para iniciar sesión) ──
    if (action === 'resend_client_access') {
      const { email, name } = body;
      if (!email) return {statusCode:400, headers, body: JSON.stringify({error:'Email requerido'})};
      const accessHtml = `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
          <div style="background:#001F5B;padding:24px;text-align:center;">
            <span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#fff;">ADAP</span><span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#C8102E;">TEK</span><span style="font-family:Arial Black;font-size:28px;font-weight:900;color:#fff;">K</span>
          </div>
          <div style="padding:32px;background:#fff;border:1px solid #eee;">
            <h2 style="color:#001F5B;margin-top:0;">Acceso a tu cuenta Adaptekk</h2>
            <p style="color:#555;">Hola <strong>${name||'cliente'}</strong>, aquí tienes el acceso a tu cuenta. Entra con este correo y te enviaremos un código de un solo uso para iniciar sesión.</p>
            <a href="${SITE_URL}" style="display:block;background:#001F5B;color:#fff;text-align:center;padding:14px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:20px;font-size:15px;">Iniciar sesión en Adaptekk →</a>
            <p style="color:#888;font-size:12px;margin-top:18px;">Si no solicitaste esto, puedes ignorar este correo.</p>
          </div>
          <div style="background:#f5f5f5;padding:16px;text-align:center;font-size:11px;color:#aaa;">© 2026 Adaptekk S.A. de C.V. — Conecta sin límites</div>
        </div>`;
      const result = await sendEmail(email, 'Tu acceso a Adaptekk', accessHtml);
      if (result.id) return {statusCode:200, headers, body: JSON.stringify({success:true})};
      return {statusCode:200, headers, body: JSON.stringify({success:false, error:'No se pudo enviar el correo'})};
    }

    // ── MÉTRICAS DEL TABLERO (productos + contadores) ──
    if (action === 'get_dashboard_metrics') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      let email = {day:0, month:0}, noResult = 0;
      let ia = {calls:0, inTok:0, outTok:0, costUsd:0, creditsUsd:0, restanteUsd:null};
      let copomex = {count:0, total:0, limit:0};
      let skydropx = {count:0, total:0, limit:0};
      try {
        const { data } = await getMetricsPartner(uid);
        const today = mxDay(), month = today.slice(0,7);
        email.day = (data.emailDay === today) ? (data.emailDayCount||0) : 0;
        email.month = (data.emailMonth === month) ? (data.emailMonthCount||0) : 0;
        noResult = (data.noResultMonth === month) ? (data.noResultCount||0) : 0;
        // IA: gasto acumulado de por vida (tokens x precio) vs creditos comprados
        const inTot = data.iaInTokTotal||0, outTot = data.iaOutTokTotal||0;
        const costTotal = inTot/1e6*IA_PRICE_IN_PER_MTOK + outTot/1e6*IA_PRICE_OUT_PER_MTOK;
        ia.calls = (data.iaMonth === month) ? (data.iaCalls||0) : 0;
        ia.inTok = inTot; ia.outTok = outTot;
        ia.costUsd = costTotal;
        ia.creditsUsd = data.iaCreditsUsd||0;
        ia.restanteUsd = ia.creditsUsd ? Math.max(0, ia.creditsUsd - costTotal) : null;
        // COPOMEX (consultas de codigo postal)
        copomex.count = (data.copomexMonth === month) ? (data.copomexCount||0) : 0;
        copomex.total = data.copomexTotal||0;
        copomex.limit = data.copomexLimit||0;
        // Skydropx (cotizaciones de envio)
        skydropx.count = (data.skydropxMonth === month) ? (data.skydropxCount||0) : 0;
        skydropx.total = data.skydropxTotal||0;
        skydropx.limit = data.skydropxLimit||0;
      } catch(e) {}

      async function prodCount(condXml) {
        const args = `<value><array><data>${condXml}</data></array></value>`;
        const t = await xmlrpc(uid, 'product.template', 'search_count', args);
        const m = t.match(/<value><int>(\d+)<\/int><\/value>/);
        return m ? parseInt(m[1]) : 0;
      }
      function cond(op, dateStr) {
        return `<value><array><data><value><string>create_date</string></value><value><string>${op}</string></value><value><string>${dateStr}</string></value></data></array></value>`;
      }
      const total = await prodCount('');
      const series = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        const dn = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
        const start = d.toISOString().slice(0,10) + ' 00:00:00';
        const end   = dn.toISOString().slice(0,10) + ' 00:00:00';
        const c = await prodCount(cond('&gt;=', start) + cond('&lt;', end));
        series.push({ month: d.toISOString().slice(0,7), count: c });
      }
      const thisMonth = series.length ? series[series.length-1].count : 0;

      return {statusCode:200, headers, body: JSON.stringify({success:true, products:{total, thisMonth, series}, email, noResult, ia, copomex, skydropx})};
    }

    // ── REGISTRO LIGERO DE USO (fire-and-forget desde el frontend; nunca bloquea al cliente) ──
    if (action === 'track_usage') {
      try {
        const kind = body.kind;
        if (kind === 'ia') await bumpMetric('ia', { inTok: body.inTok, outTok: body.outTok });
        else if (kind === 'copomex') await bumpMetric('copomex');
        else if (kind === 'skydropx') await bumpMetric('skydropx');
      } catch(e) {}
      return {statusCode:200, headers, body: JSON.stringify({ok:true})};
    }

    // ── CONFIG DE SERVICIOS (creditos IA comprados + limites de plan) ──
    if (action === 'set_service_config') {
      try {
        const uid = await odooAuth();
        if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
        const { id, data } = await getMetricsPartner(uid);
        if (body.iaCreditsUsd  !== undefined) data.iaCreditsUsd  = Math.max(0, Number(body.iaCreditsUsd)||0);
        if (body.copomexLimit  !== undefined) data.copomexLimit  = Math.max(0, parseInt(body.copomexLimit)||0);
        if (body.skydropxLimit !== undefined) data.skydropxLimit = Math.max(0, parseInt(body.skydropxLimit)||0);
        await saveMetricsPartner(uid, id, data);
        return {statusCode:200, headers, body: JSON.stringify({ok:true})};
      } catch(e) { return {statusCode:200, headers, body: JSON.stringify({ok:false, error:String((e&&e.message)||e)})}; }
    }

    // ── DIAGNÓSTICO: qué ve la API en res.partner ──
    if (action === 'debug_partners') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      async function cnt(domXml) {
        const t = await xmlrpc(uid, 'res.partner', 'search_count', `<value><array><data>${domXml}</data></array></value>`);
        const m = t.match(/<value><int>(\d+)<\/int><\/value>/); return m ? parseInt(m[1]) : 0;
      }
      const totalPartners = await cnt('');
      const customers = await cnt(`<value><array><data><value><string>customer_rank</string></value><value><string>&gt;</string></value><value><int>0</int></value></data></array></value>`);
      const webRegs = await cnt(`<value><array><data><value><string>comment</string></value><value><string>ilike</string></value>${xmlStr('Registro Adaptekk Web')}</data></array></value>`);
      const text = await xmlrpc(uid, 'res.partner', 'search_read',
        `<value><array><data></data></array></value>`
      );
      const recent = [];
      const structs = text.match(/<struct>[\s\S]*?<\/struct>/g) || [];
      for (const st of structs) {
        const g = (f) => { const m = st.match(new RegExp('<name>'+f+'</name>\\s*<value>(?:<(?:string|int|boolean)>)?([^<]*)','i')); return m ? m[1].trim() : ''; };
        const id = parseInt(g('id')) || 0; if (!id) continue;
        let company = '';
        const cm = st.match(/<name>company_id<\/name>\s*<value><array>[\s\S]*?<value><string>([^<]*)<\/string>/i);
        if (cm) company = cm[1];
        const comment = g('comment') || '';
        const estado = /VERIFICADO/i.test(comment) ? 'VERIFICADO' : /RECHAZADO/i.test(comment) ? 'RECHAZADO' : 'PENDIENTE';
        recent.push({ id, name: g('name'), email: g('email'), customer_rank: g('customer_rank'), company, estado });
      }
      recent.sort(function(a,b){return b.id-a.id;});
      return {statusCode:200, headers, body: JSON.stringify({success:true, totalPartners, customers, webRegs, recent: recent.slice(0,6)})};
    }

    // ── EXEC LOGIN (gerencia: usuario = correo, contraseña en Netlify GERENCIA_PASS) ──
    if (action === 'exec_login') {
      const { user, pass } = body;
      const GERENCIA_USER = (process.env.GERENCIA_USER || 'herber.montes@hydratechgroup.mx').trim().toLowerCase();
      const GERENCIA_PASS = process.env.GERENCIA_PASS || '';
      if ((user||'').trim().toLowerCase() === GERENCIA_USER && GERENCIA_PASS && pass === GERENCIA_PASS) {
        return {statusCode:200, headers, body: JSON.stringify({success:true})};
      }
      return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Usuario o contraseña incorrectos'})};
    }

    if (action === 'save_user_pass') {
      const { user_key, new_pass, gerencia_pass } = body;
      // Verify gerencia password
      if (!process.env.GERENCIA_PASS || gerencia_pass !== process.env.GERENCIA_PASS) {
        return {statusCode:401, headers, body: JSON.stringify({error:'No autorizado'})};
      }
      if (!user_key || !new_pass || new_pass.length < 6) {
        return {statusCode:400, headers, body: JSON.stringify({error:'Datos invalidos'})};
      }
      // Store in Odoo as a special partner note (as a config partner)
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      // Search for config partner
      const searchText = await xmlrpc(uid, 'res.partner', 'search',
        `<value><array><data>
          <value><array><data>${xmlStr('name')}<value><string>=</string></value>${xmlStr('ADAPTEKK_CONFIG')}</data></array></value>
        </data></array></value>`
      );
      const idMatch = searchText.match(/<value><int>(\d+)<\/int><\/value>/);

      // Load current config
      let passes = {};
      if (idMatch) {
        const readText = await xmlrpc(uid, 'res.partner', 'read',
          `<value><array><data><value><int>${idMatch[1]}</int></value></data></array></value>`
        );
        const commentMatch = readText.match(/<name>comment<\/name>\s*<value>(?:<string>)?([^<]*)/);
        if (commentMatch) {
          try { passes = JSON.parse(commentMatch[1]); } catch(e) { passes = {}; }
        }
      }

      passes[user_key] = new_pass;
      const passesJson = JSON.stringify(passes);

      if (idMatch) {
        // Update existing config partner
        await xmlrpc(uid, 'res.partner', 'write',
          `<value><array><data><value><int>${idMatch[1]}</int></value></data></array></value>
           <value><struct><member><name>comment</name>${xmlStr(passesJson)}</member></struct></value>`
        );
      } else {
        // Create config partner
        await xmlrpc(uid, 'res.partner', 'create',
          `<value><struct>
            <member><name>name</name>${xmlStr('ADAPTEKK_CONFIG')}</member>
            <member><name>comment</name>${xmlStr(passesJson)}</member>
            <member><name>active</name><value><boolean>0</boolean></value></member>
          </struct></value>`
        );
      }

      return {statusCode:200, headers, body: JSON.stringify({success:true, user_key, message:'Contrasena actualizada'})};
    }

    // ── GET USER PASSWORDS ──
    if (action === 'get_user_passes') {
      const { gerencia_pass } = body;
      if (!process.env.GERENCIA_PASS || gerencia_pass !== process.env.GERENCIA_PASS) {
        return {statusCode:401, headers, body: JSON.stringify({error:'No autorizado'})};
      }
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      const searchText = await xmlrpc(uid, 'res.partner', 'search',
        `<value><array><data>
          <value><array><data>${xmlStr('name')}<value><string>=</string></value>${xmlStr('ADAPTEKK_CONFIG')}</data></array></value>
        </data></array></value>`
      );
      const idMatch = searchText.match(/<value><int>(\d+)<\/int><\/value>/);
      if (!idMatch) return {statusCode:200, headers, body: JSON.stringify({success:true, passes:{}})};

      const readText = await xmlrpc(uid, 'res.partner', 'read',
        `<value><array><data><value><int>${idMatch[1]}</int></value></data></array></value>`
      );
      const commentMatch = readText.match(/<name>comment<\/name>\s*<value>(?:<string>)?([^<]*)/);
      let passes = {};
      if (commentMatch) {
        try { passes = JSON.parse(commentMatch[1]); } catch(e) { passes = {}; }
      }
      return {statusCode:200, headers, body: JSON.stringify({success:true, passes})};
    }

    // ── BUSCAR PRODUCTO POR CONFIGURADOR ──
    if (action === 'buscar_por_configurador') {
      const { tipo, std_a, gen_a, med_a, std_b, gen_b, med_b, material } = body;
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      const tipoMap = {'NR':'NR','C90':'C90','C45':'C45','TEE':'TEE','TAP':'TAP'};
      const tipoCode = tipoMap[tipo] || 'NR';
      const matSuffix = (material === 'SS') ? '-SS' : '';

      // ── Formato REAL del catálogo Adaptekk: género PEGADO al estándar ──
      // Ej: AT-NR-JICM-NPTH-08-04   (M/H/HG pegado a cada estándar, siempre escrito)
      // Se busca por PREFIJO (=like 'PREFIJO%') para tolerar el nº Brennan final
      // (…-08-04-2603) y el sufijo de material -SS. Luego se filtra por material.
      const medCode = (x) => {
        if (x === null || x === undefined || x === '') return '';
        const n = parseInt(x, 10);
        return isNaN(n) ? String(x) : (n < 10 ? '0' : '') + n;
      };
      const stdGen = (std, gen) => (std || '') + (gen || '');   // JIC + M = JICM
      const buildPrefix = (eA, eB) => {
        const ma = medCode(eA.med);
        const sgA = stdGen(eA.std, eA.gen);
        if (!eB || !eB.std) {                       // tapón (1 extremo)
          return 'AT-' + tipoCode + '-' + sgA + '-' + ma;
        }
        const mb = medCode(eB.med);
        const sgB = stdGen(eB.std, eB.gen);
        return 'AT-' + tipoCode + '-' + sgA + '-' + sgB + '-' + ma + '-' + mb;
      };

      const eA = { std: std_a, gen: gen_a, med: med_a };
      const eB = std_b ? { std: std_b, gen: gen_b, med: med_b } : null;

      // ORDEN-INDEPENDIENTE: probamos (A,B) y (B,A) — el producto es el mismo.
      const prefixes = [];
      if (eB) {
        prefixes.push(buildPrefix(eA, eB));
        prefixes.push(buildPrefix(eB, eA));
      } else {
        prefixes.push(buildPrefix(eA, null));
      }
      const atCode = prefixes[0];   // código base para mostrar / nombrar fabricación nueva

      // Búsqueda por PREFIJO con =like 'PREFIJO%'
      async function searchByPrefix(prefix) {
        const domainXml = `<value><array><data>
          ${xmlStr('default_code')}<value><string>=like</string></value>${xmlStr(prefix + '%')}
        </data></array></value>`;
        return await odooSearchRead(uid, 'product.product', domainXml,
          ['id','name','default_code','list_price','qty_available','description_sale'], 10);
      }

      let searchText = '';
      for (const pfx of prefixes) {
        searchText = await searchByPrefix(pfx);
        if (searchText.includes('<name>id</name>')) { break; }
      }
      const dummyText = searchText; // alias for parser below

      // Parse XML results using simple string extraction (no regex flags needed)
      const products = [];
      function extractField(xml, field) {
        const tag = '<name>' + field + '</name>';
        const pos = xml.indexOf(tag);
        if (pos < 0) return '';
        const afterTag = xml.substring(pos + tag.length);
        const valStart = afterTag.indexOf('<value>');
        if (valStart < 0) return '';
        const inner = afterTag.substring(valStart + 7); // after <value>
        // Skip type tag if present: <string>, <int>, <double>, <boolean>
        const typeEnd = inner.indexOf('>');
        const firstChar = inner.charAt(0);
        let content;
        if (firstChar === '<') {
          content = inner.substring(typeEnd + 1);
        } else {
          content = inner;
        }
        const end = content.indexOf('<');
        return end >= 0 ? content.substring(0, end).trim() : content.trim();
      }

      // Split by <struct> to get individual records
      const parts = searchText.split('<struct>');
      for (let i = 1; i < parts.length; i++) {
        const struct = parts[i].split('</struct>')[0];
        const id = parseInt(extractField(struct, 'id'));
        if (id > 0) {
          const qty = parseFloat(extractField(struct, 'qty_available')) || 0;
          const price = parseFloat(extractField(struct, 'list_price')) || 0;
          products.push({
            id,
            name: extractField(struct, 'name'),
            at_code: extractField(struct, 'default_code'),
            price,
            qty_available: qty,
            description: extractField(struct, 'description_sale'),
            status: qty > 0 ? 'stock' : 'fabricado'
          });
        }
      }

      // ── Filtro de material: CS = sin -SS, SS = con -SS ──
      {
        const wantSS = (material === 'SS');
        const keep = products.filter(p => wantSS ? /-SS$/.test(p.at_code||'') : !/-SS$/.test(p.at_code||''));
        products.length = 0;
        for (const p of keep) products.push(p);
      }
      if (products.length === 0 && searchText.length > 100) {
      }

      // If no exact match, check if AT code exists in catalog (qty=0 = fabricado)
      if (products.length === 0) {
        // Search by partial code
        const partialXml = `<value><array><data>
          <value><array><data>
            ${xmlStr('default_code')}<value><string>like</string></value>
            ${xmlStr('AT-' + tipoCode + '-' + std_a)}
          </data></array></value>
        </data></array></value>`;

        const partialText = await xmlrpc(uid, 'product.product', 'search_read',
          partialXml
        );

        const partialMatch = partialText.match(/<value><int>(\d+)<\/int><\/value>/);
        if (partialMatch) {
          return {statusCode:200, headers, body: JSON.stringify({
            success: true,
            found: false,
            status: 'fabricacion_nueva',
            at_code: atCode,
            message: 'Este conector se puede fabricar bajo pedido'
          })};
        }

        return {statusCode:200, headers, body: JSON.stringify({
          success: true,
          found: false,
          status: 'fabricacion_nueva',
          at_code: atCode,
          message: 'Este conector se puede fabricar bajo pedido'
        })};
      }

      return {statusCode:200, headers, body: JSON.stringify({
        success: true,
        found: true,
        products,
        at_code: (products[0] && products[0].at_code) ? products[0].at_code : atCode
      })};
    }

    // ── BULK STOCK UPDATE ──
    if (action === 'bulk_stock_update') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      const { products } = body; // [{code, qty}]
      if (!products || !products.length) {
        return {statusCode:400, headers, body: JSON.stringify({error:'No products provided'})};
      }

      let updated = 0, errors = 0, notFound = 0;
      const batchSize = 10;

      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        
        for (const item of batch) {
          try {
            // Find product.product id by default_code
            const domXml = `<value><array><data>
              <value><array><data>
                ${xmlStr('default_code')}<value><string>=</string></value>${xmlStr(item.code)}
              </data></array></value>
            </data></array></value>`;
            
            const searchResp = await odooSearchRead(uid, 'product.product', domXml, ['id','name','default_code'], 1);
            
            if (!searchResp.includes('<name>id</name>')) { notFound++; continue; }
            
            // Extract product id
            const parts = searchResp.split('<struct>');
            let productId = null;
            if (parts.length > 1) {
              const struct = parts[1].split('</struct>')[0];
              const idVal = extractField(struct, 'id');
              productId = parseInt(idVal);
            }
            
            if (!productId) { notFound++; continue; }

            // Find or create stock.quant for this product in WH/Stock
            // First find location id for WH/Stock
            const locDom = `<value><array><data>
              <value><array><data>
                ${xmlStr('complete_name')}<value><string>=</string></value>${xmlStr('WH/Stock')}
              </data></array></value>
            </data></array></value>`;
            const locResp = await odooSearchRead(uid, 'stock.location', locDom, ['id'], 1);
            const locParts = locResp.split('<struct>');
            let locationId = 8; // default WH/Stock id
            if (locParts.length > 1) {
              const locVal = extractField(locParts[1].split('</struct>')[0], 'id');
              if (locVal) locationId = parseInt(locVal);
            }

            // Use inventory adjustment: write qty directly to stock.quant
            // First search for existing quant
            const quantDom = `<value><array><data>
              <value><string>|</string></value>
              <value><array><data>
                ${xmlStr('product_id')}<value><string>=</string></value><value><int>${productId}</int></value>
              </data></array></value>
              <value><array><data>
                ${xmlStr('location_id')}<value><string>=</string></value><value><int>${locationId}</int></value>
              </data></array></value>
            </data></array></value>`;

            // Create inventory adjustment via action_apply_inventory
            const createXml = `<?xml version="1.0"?>
<methodCall><methodName>execute_kw</methodName><params>
  <param><value><string>${ODOO_DB}</string></value></param>
  <param><value><int>${uid}</int></value></param>
  <param><value><string>${ODOO_KEY}</string></value></param>
  <param><value><string>stock.quant</string></value></param>
  <param><value><string>create</string></value></param>
  <param><value><array><data>
    <value><struct>
      <member><name>product_id</name><value><int>${productId}</int></value></member>
      <member><name>location_id</name><value><int>${locationId}</int></value></member>
      <member><name>inventory_quantity</name><value><double>${item.qty}</double></value></member>
    </struct></value>
  </data></array></value></param>
  <param><value><struct></struct></value></param>
</params></methodCall>`;

            const createResp = await fetch(`${ODOO_URL}/xmlrpc/2/object`, {
              method: 'POST', headers: {'Content-Type':'text/xml'}, body: createXml
            });
            const createText = await createResp.text();
            
            if (createText.includes('<int>') || createText.includes('faultCode') === false) {
              // Apply the inventory
              const quantIdMatch = createText.match(/<value><int>(\d+)<\/int><\/value>/);
              if (quantIdMatch) {
                const quantId = parseInt(quantIdMatch[1]);
                const applyXml = `<?xml version="1.0"?>
<methodCall><methodName>execute_kw</methodName><params>
  <param><value><string>${ODOO_DB}</string></value></param>
  <param><value><int>${uid}</int></value></param>
  <param><value><string>${ODOO_KEY}</string></value></param>
  <param><value><string>stock.quant</string></value></param>
  <param><value><string>action_apply_inventory</string></value></param>
  <param><value><array><data>
    <value><array><data><value><int>${quantId}</int></value></data></array></value>
  </data></array></value></param>
  <param><value><struct></struct></value></param>
</params></methodCall>`;
                await fetch(`${ODOO_URL}/xmlrpc/2/object`, {
                  method: 'POST', headers: {'Content-Type':'text/xml'}, body: applyXml
                });
                updated++;
              }
            } else {
              errors++;
            }
          } catch(e) {
            errors++;
          }
        }
      }

      return {statusCode:200, headers, body: JSON.stringify({
        success: true, updated, notFound, errors, total: products.length
      })};
    }

    // ── SEMBRAR PRODUCTOS DE PRUEBA: stock aleatorio (+ precio opcional) ──
    if (action === 'seed_test_stock') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      const count = Math.min(parseInt(body.count) || 5, 50);
      const price = (body.price !== undefined && body.price !== null) ? Number(body.price) : null;
      // 1) ubicación de stock: usar lot_stock_id del almacén (robusto, sin depender del nombre)
      let locationId = 8;
      try {
        const whResp = await odooSearchRead(uid, 'stock.warehouse', '', ['id','lot_stock_id'], 1);
        const m = whResp.match(/<name>lot_stock_id<\/name>\s*<value>\s*<array>\s*<data>\s*<value>\s*<int>(\d+)<\/int>/);
        if (m) locationId = parseInt(m[1]);
      } catch(_){}
      // 1b) respaldo: primera ubicación interna
      if (locationId === 8) {
        try {
          const locResp = await odooSearchRead(uid, 'stock.location',
            `<value><array><data>${xmlStr('usage')}<value><string>=</string></value>${xmlStr('internal')}</data></array></value>`, ['id','complete_name'], 1);
          const lm = locResp.match(/<int>(\d+)<\/int>/);
          if (lm) locationId = parseInt(lm[1]);
        } catch(_){}
      }
      // 2) productos: usar codes dados (todos) o tomar N vendibles
      let prods = [];
      if (Array.isArray(body.codes) && body.codes.length) {
        for (const code of body.codes.slice(0, 50)) {
          const p = await lookupProductByCode(uid, code);
          if (p && p.id) prods.push({ id:p.id, name:p.name, code:p.at_code });
          else prods.push({ id:null, name:'(no encontrado)', code, notFound:true });
        }
      } else {
        const text = await odooSearchRead(uid, 'product.product',
          `<value><array><data>${xmlStr('sale_ok')}<value><string>=</string></value><value><boolean>1</boolean></value></data></array></value>`,
          ['id','name','default_code'], count);
        const structs = text.match(/<struct>[\s\S]*?<\/struct>/g) || [];
        for (const st of structs) {
          const id = parseInt(xmlExtractField(st,'id'));
          if (id>0) prods.push({ id, name: xmlExtractField(st,'name'), code: xmlExtractField(st,'default_code') });
        }
      }
      // 3) stock aleatorio (10..200) + precio opcional
      const result = [];
      for (const p of prods) {
        if (!p.id) { result.push({ code:p.code, name:p.name, qty:0, notFound:true }); continue; }
        const qty = Math.floor(Math.random()*191) + 10;
        let priceSet = null;
        try {
          // precio
          if (price !== null && !isNaN(price)) {
            await xmlrpc(uid, 'product.product', 'write',
              `<value><array><data><value><int>${p.id}</int></value></data></array></value><value><struct><member><name>list_price</name><value><double>${price}</double></value></member></struct></value>`);
            priceSet = price;
          }
          // stock
          const createText = await xmlrpc(uid, 'stock.quant', 'create',
            `<value><struct><member><name>product_id</name><value><int>${p.id}</int></value></member><member><name>location_id</name><value><int>${locationId}</int></value></member><member><name>inventory_quantity</name><value><double>${qty}</double></value></member></struct></value>`);
          const qm = createText.match(/<value><int>(\d+)<\/int><\/value>/);
          if (qm) {
            await xmlrpc(uid, 'stock.quant', 'action_apply_inventory',
              `<value><array><data><value><int>${parseInt(qm[1])}</int></value></data></array></value>`);
          }
          result.push({ code:p.code, name:p.name, qty, price:priceSet });
        } catch(e){ result.push({ code:p.code, name:p.name, qty:0, error:true }); }
      }
      return {statusCode:200, headers, body: JSON.stringify({ ok:true, location_id:locationId, price_set:price, products:result })};
    }

    // ── PING / VERSIÓN (para verificar qué versión está desplegada) ──
    if (action === 'ping' || action === 'version') {
      return {statusCode:200, headers, body: JSON.stringify({ ok:true, version:'2026-06-23-metrics-v19', features:['facturar_pedido','folio_only_search','publicar_y_timbrar','set_sat_code_all','diag_catalogo','armar_conector','catalogo_disponible','catalogo_listar','chat_ia'] })};
    }

    // ── DIAGNÓSTICO DE CATÁLOGO: analiza los códigos AT en Odoo para diseñar el armado por piezas ──
    // Parsea cada código AT en sus dos extremos (estándar, género, medida) y reporta qué hay:
    // tipos, estándares, medidas, géneros, cuántas reducciones (medida distinta por extremo) y
    // cuántos adaptadores entre estándares (estándar distinto por extremo). Sin esto no se puede
    // diseñar el motor de "armar con varias piezas".
    if (action === 'diag_catalogo') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      const limit = Math.min(Math.max(parseInt(body.limit) || 6000, 100), 12000);
      // Estándares conocidos (ordenados largo->corto para que BSPP gane sobre BSP, etc.)
      const STANDARDS = ['BSPP','BSPT','ORFS','NPSM','UNF','MET','ORB','JIC','NPT','DIN','JIS','KOM','CAT','SAE','BSP'];
      const ordStd = STANDARDS.slice().sort((a,b)=>b.length-a.length);
      function splitStdGen(tok){
        if (!tok) return { std:'', gen:'' };
        for (const s of ordStd){ if (tok.indexOf(s)===0){ return { std:s, gen: tok.slice(s.length) }; } }
        for (const g of ['HG','MG','H','M']){ if (tok.slice(-g.length)===g){ return { std: tok.slice(0,-g.length), gen:g }; } }
        return { std: tok, gen:'' };
      }
      const isNum = s => /^[0-9]{1,3}$/.test(s);
      // Cargar códigos AT (solo default_code: liviano)
      const dom = `<value><array><data>${xmlStr('default_code')}<value><string>=like</string></value>${xmlStr('AT-%')}</data></array></value>`;
      const text = await odooSearchRead(uid, 'product.product', dom, ['default_code'], limit);
      const codes = [...text.matchAll(/<name>default_code<\/name>\s*<value>\s*<string>([^<]*)<\/string>/g)].map(m=>m[1]);

      const tipos={}, estandares={}, medidas={}, generos={}, stdNoConocido={};
      let dosExtremos=0, tapon=0, reducciones=0, adaptadores=0, materialSS=0, parseados=0;
      const ejReduc=[], ejAdapt=[];
      for (const code of codes){
        const p = code.split('-');                 // AT, TIPO, STDGENA, [STDGENB|MEDA], ...
        if (p.length < 4) continue;
        const tipo = p[1]; tipos[tipo]=(tipos[tipo]||0)+1;
        if (/(^|-)SS($|-)/.test(code)) materialSS++;
        let idx=2;
        const aTok = p[idx++];
        let bTok=null, medA=null, medB=null, two=false;
        if (p[idx] && !isNum(p[idx])){ bTok=p[idx++]; two=true; }
        if (p[idx] && isNum(p[idx])){ medA=p[idx++]; }
        if (two && p[idx] && isNum(p[idx])){ medB=p[idx++]; }
        const A = splitStdGen(aTok);
        const B = two ? splitStdGen(bTok) : { std:'', gen:'' };
        [A,B].forEach((e,i)=>{
          if (i===1 && !two) return;
          if (e.std){ estandares[e.std]=(estandares[e.std]||0)+1; if (ordStd.indexOf(e.std)<0) stdNoConocido[e.std]=(stdNoConocido[e.std]||0)+1; }
          if (e.gen){ generos[e.gen]=(generos[e.gen]||0)+1; }
        });
        if (medA){ medidas[medA]=(medidas[medA]||0)+1; }
        if (medB){ medidas[medB]=(medidas[medB]||0)+1; }
        parseados++;
        if (two){ dosExtremos++; } else { tapon++; }
        if (two && medA && medB && medA!==medB){ reducciones++; if (ejReduc.length<10) ejReduc.push(code); }
        if (two && A.std && B.std && A.std!==B.std){ adaptadores++; if (ejAdapt.length<10) ejAdapt.push(code); }
      }
      const ord = (o)=>Object.fromEntries(Object.entries(o).sort((a,b)=>b[1]-a[1]));
      return {statusCode:200, headers, body: JSON.stringify({
        ok:true,
        total_codigos_AT: codes.length,
        parseados,
        tipos: ord(tipos),
        estandares: ord(estandares),
        medidas: Object.keys(medidas).sort((a,b)=>parseInt(a)-parseInt(b)),
        generos: ord(generos),
        dos_extremos: dosExtremos,
        tapones_un_extremo: tapon,
        reducciones_medida_distinta: reducciones,
        adaptadores_entre_estandares: adaptadores,
        material_SS: materialSS,
        estandares_no_reconocidos: stdNoConocido,
        ejemplos_reducciones: ejReduc,
        ejemplos_adaptadores: ejAdapt
      })};
    }

    // ── MOTOR DE ARMADO: dado extremo A y extremo B, busca el directo, o cadenas de 2-4 piezas
    //    reales del catálogo (uniendo macho↔hembra del mismo estándar+medida), o fabricación.
    // body: { a:{std,gen,size}, b:{std,gen,size}, material?:'CS'|'SS', max_piezas?:2..4 }
    if (action === 'armar_conector') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      const result = await armarConectorCore(body, uid);
      return {statusCode: result.error?400:200, headers, body: JSON.stringify(result)};
    }

    // ── DISPONIBILIDAD POR ESTÁNDAR: lista qué medidas y géneros existen REALMENTE en el catálogo,
    //    para afinar los códigos del configurador y validar contra datos reales.
    // body: { std?:'BSPP' }  (sin std => todos los estándares)
    if (action === 'catalogo_disponible') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      const filterStd = String(body.std||'').toUpperCase().trim();
      const STANDARDS = ['BSPP','BSPT','ORFS','NPSM','OFS','BST','MET','UNF','ORB','JIC','NPT','DIN','JIS','KOM','CAT','SAE','BSP','BT','LL','L'].sort((x,y)=>y.length-x.length);
      function splitStdGen(tok){
        if(!tok) return null;
        for (const s of STANDARDS){ if (tok.indexOf(s)===0){ return {std:s, gen: tok.slice(s.length)}; } }
        for (const g of ['HG','MG','H','M']){ if (tok.slice(-g.length)===g) return {std:tok.slice(0,-g.length), gen:g}; }
        return {std:tok, gen:''};
      }
      const isNum = s=>/^[0-9]{1,3}$/.test(s);
      function parseEnds(code){
        let c=code; if (/-SS(\b|$)/.test(c)){ c=c.replace(/-SS(\b|$)/,''); }
        const p=c.split('-'); if (p.length<4) return [];
        let idx=2; const aTok=p[idx++]; const ends=[];
        const a=splitStdGen(aTok);
        if (p[idx] && !isNum(p[idx])){ // dos extremos
          const bTok=p[idx++];
          const medA=(p[idx]&&isNum(p[idx]))?p[idx++]:null;
          const medB=(p[idx]&&isNum(p[idx]))?p[idx++]:null;
          const b=splitStdGen(bTok);
          if (a&&medA) ends.push({std:a.std,gen:a.gen,size:medA,code});
          if (b&&medB) ends.push({std:b.std,gen:b.gen,size:medB,code});
        } else { // tapón (un extremo)
          const medA=(p[idx]&&isNum(p[idx]))?p[idx++]:null;
          if (a&&medA) ends.push({std:a.std,gen:a.gen,size:medA,code});
        }
        return ends;
      }
      const dom = `<value><array><data>${xmlStr('default_code')}<value><string>=like</string></value>${xmlStr('AT-%')}</data></array></value>`;
      const text = await odooSearchRead(uid, 'product.product', dom, ['default_code'], 8000);
      const codes=[...text.matchAll(/<name>default_code<\/name>\s*<value>\s*<string>([^<]*)<\/string>/g)].map(m=>m[1]);
      const map={};
      for (const c of codes){
        for (const e of parseEnds(c)){
          if(!e.std) continue;
          const m=map[e.std]=map[e.std]||{sizes:{},gens:{},count:0,samples:[]};
          m.sizes[e.size]=(m.sizes[e.size]||0)+1;
          if(e.gen) m.gens[e.gen]=(m.gens[e.gen]||0)+1;
          m.count++;
          if (m.samples.length<6 && m.samples.indexOf(e.code)<0) m.samples.push(e.code);
        }
      }
      const out={};
      Object.keys(map).sort().forEach(s=>{
        if (filterStd && s!==filterStd) return;
        const m=map[s];
        out[s]={ medidas: Object.keys(m.sizes).sort((a,b)=>parseInt(a)-parseInt(b)), generos: Object.keys(m.gens).sort(), apariciones:m.count, ejemplos:m.samples };
      });
      return {statusCode:200, headers, body: JSON.stringify({ ok:true, total_estandares:Object.keys(map).length, estandares: out })};
    }

    // ── CATÁLOGO EN LÍNEA (búsqueda facetada): filtra por tipo / estándar / género / medida y
    //    devuelve los productos que coinciden + las facetas disponibles (que se van acotando).
    //    Modelo tipo Brennan: izquierda = filtros (tipo → estándar → medida), derecha = productos.
    // body: { tipo?, std?, gen?, size?, material?:'CS'|'SS', page?, page_size? }
    if (action === 'catalogo_listar') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      const up = v => String(v||'').toUpperCase().trim();
      const fTipo=up(body.tipo), fStd=up(body.std), fGen=up(body.gen), fSize=String(body.size||'').trim(), fMat=up(body.material);
      const page=Math.max(parseInt(body.page)||1,1);
      const pageSize=Math.min(Math.max(parseInt(body.page_size)||24,1),60);

      const STANDARDS=['BSPP','BSPT','ORFS','NPSM','OFS','BST','MET','UNF','ORB','JIC','NPT','DIN','JIS','KOM','CAT','SAE','BSP','BT','LL','L'].sort((x,y)=>y.length-x.length);
      function splitStdGen(tok){
        if(!tok) return null;
        for (const s of STANDARDS){ if (tok.indexOf(s)===0){ return {std:s, gen: tok.slice(s.length)}; } }
        for (const g of ['HG','MG','H','M']){ if (tok.slice(-g.length)===g) return {std:tok.slice(0,-g.length), gen:g}; }
        return {std:tok, gen:''};
      }
      const isNum=s=>/^[0-9]{1,3}$/.test(s);
      function parseCode(code){
        let c=code, ss=false;
        if (/-SS(\b|$)/.test(c)){ ss=true; c=c.replace(/-SS(\b|$)/,''); }
        const p=c.split('-'); if (p.length<4) return null;
        const tipo=p[1]; let idx=2; const aTok=p[idx++];
        let bTok=null, medA=null, medB=null, two=false;
        if (p[idx] && !isNum(p[idx])){ bTok=p[idx++]; two=true; }
        if (p[idx] && isNum(p[idx])){ medA=p[idx++]; }
        if (two && p[idx] && isNum(p[idx])){ medB=p[idx++]; }
        const a=splitStdGen(aTok); const b=two?splitStdGen(bTok):null;
        if(!a||!medA) return null;
        return { code, tipo, ss, endA:{std:a.std,gen:a.gen,size:medA}, endB: (two&&b&&medB)?{std:b.std,gen:b.gen,size:medB}:null };
      }

      const dom=`<value><array><data>${xmlStr('default_code')}<value><string>=like</string></value>${xmlStr('AT-%')}</data></array></value>`;
      const text=await odooSearchRead(uid,'product.product',dom,['default_code'],8000);
      const codes=[...text.matchAll(/<name>default_code<\/name>\s*<value>\s*<string>([^<]*)<\/string>/g)].map(m=>m[1]);
      const pieces=[]; for(const c of codes){ const pc=parseCode(c); if(pc) pieces.push(pc); }

      const ends=p=>[p.endA,p.endB].filter(Boolean);
      function endMatch(e){ return e.std===fStd && (!fGen||e.gen===fGen) && (!fSize||e.size===fSize); }
      function prodMatch(p){
        if (fTipo && p.tipo!==fTipo) return false;
        if (fMat==='SS' && !p.ss) return false;
        if (fMat==='CS' && p.ss) return false;
        if (fStd){ if (!ends(p).some(endMatch)) return false; }
        else if (fGen||fSize){ if (!ends(p).some(e=>(!fGen||e.gen===fGen)&&(!fSize||e.size===fSize))) return false; }
        return true;
      }
      const matched=pieces.filter(prodMatch);

      // facetas sobre el set filtrado (se acotan conforme filtras)
      const fT={}, fE={}, fM={}, fG={};
      for(const p of matched){
        fT[p.tipo]=(fT[p.tipo]||0)+1;
        ends(p).forEach(e=>{ if(e.std)fE[e.std]=(fE[e.std]||0)+1; if(e.size)fM[e.size]=(fM[e.size]||0)+1; if(e.gen)fG[e.gen]=(fG[e.gen]||0)+1; });
      }
      const byN=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).map(([v,n])=>({v,n}));
      const byMed=o=>Object.entries(o).sort((a,b)=>parseInt(a[0])-parseInt(b[0])).map(([v,n])=>({v,n}));

      const total=matched.length;
      const start=(page-1)*pageSize;
      const pageItems=matched.slice(start,start+pageSize);
      const info={};
      if(pageItems.length){
        const codesXml=pageItems.map(p=>xmlStr(p.code)).join('');
        const d2=`<value><array><data>${xmlStr('default_code')}<value><string>in</string></value><value><array><data>${codesXml}</data></array></value></data></array></value>`;
        const t2=await odooSearchRead(uid,'product.product',d2,['default_code','name','list_price','qty_available'],pageItems.length);
        t2.split('<struct>').slice(1).forEach(s=>{ const st=s.split('</struct>')[0]; const cd=xmlExtractField(st,'default_code'); if(cd) info[cd]={name:xmlExtractField(st,'name'),price:parseFloat(xmlExtractField(st,'list_price'))||0,qty:parseFloat(xmlExtractField(st,'qty_available'))||0}; });
      }
      const productos=pageItems.map(p=>Object.assign({code:p.code,tipo:p.tipo,ss:p.ss,endA:p.endA,endB:p.endB}, info[p.code]||{}));

      return {statusCode:200, headers, body: JSON.stringify({
        ok:true, total, page, page_size:pageSize,
        filtros:{tipo:fTipo,std:fStd,gen:fGen,size:fSize,material:fMat},
        facetas:{ tipos:byN(fT), estandares:byN(fE), generos:byN(fG), medidas:byMed(fM) },
        productos
      })};
    }

    // ── PROXY DE IA: el chat del home llama AQUÍ (no a Anthropic directo), para que la API key
    //    viva segura en variable de entorno (ANTHROPIC_API_KEY) y NO se exponga en el navegador.
    // body: { messages:[...], max_tokens? }
    if (action === 'chat_ia') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return {statusCode:200, headers, body: JSON.stringify({ error:{ message:'La búsqueda con IA no está configurada: falta la variable de entorno ANTHROPIC_API_KEY en Netlify.' } })};
      const messages = Array.isArray(body.messages) ? body.messages.slice() : null;
      if (!messages || !messages.length) return {statusCode:200, headers, body: JSON.stringify({ error:{ message:'No se recibieron mensajes para la IA.' } })};
      const maxTokens = Math.min(Math.max(parseInt(body.max_tokens)||900, 50), 2000);
      const MODEL = 'claude-haiku-4-5-20251001';
      const SYSTEM = [
        'Eres el asistente experto en conectores y adaptadores hidraulicos de Adaptekk (Mexico).',
        'Identificas la pieza exacta que el cliente necesita USANDO EXCLUSIVAMENTE los codigos reales del catalogo de Odoo. NUNCA inventes codigos.',
        'Tu objetivo es RESOLVER rapido: lleva al cliente a la solucion (pieza directa, cadena o fabricacion) en los menos pasos posibles. Si te falta informacion, haz UNA sola pregunta corta y concreta a la vez, nunca una lista de preguntas. En cuanto tengas ambos extremos, llama a la herramienta y presenta la solucion. Profesional, directo y breve.',
        'Cuando el cliente describa un conector con dos extremos (ej. macho 2 pulg BSPP de un lado y macho 1/2 pulg JIC del otro) DEBES llamar a la herramienta armar_conector para obtener la solucion real. No des un codigo sin haber llamado la herramienta.',
        'Convenciones para armar_conector:',
        '- std (estandar), codigo del catalogo: BSPP o BSP => BSP, ORFS => OFS, JIC => JIC, NPT => NPT, ORB => ORB, metrico => MET, DIN => DIN, BSPT => BST, NPSM => NPSM, SAE => SAE, JIS => JIS, Komatsu => KOM, Caterpillar => CAT.',
        '- gen (genero): macho => M, hembra => H, giratorio macho => MG, giratorio hembra => HG.',
        '- size (medida): SIEMPRE en dieciseisavos como texto (pulgadas x 16). 1/4 => 04, 3/8 => 06, 1/2 => 08, 5/8 => 10, 3/4 => 12, 1 => 16, 1-1/4 => 20, 1-1/2 => 24, 2 => 32, 2-1/2 => 40.',
        '- material: acero al carbon => CS (default), inoxidable => SS.',
        'La herramienta devuelve: directo (existe en UNA pieza, con su codigo), cadenas (combinaciones reales de 2+ piezas que conectan ambos extremos, cada una con sus codigos) y solo_fabricar (no hay combinacion, se fabrica especial). Las cadenas vienen ordenadas: primero en stock, luego mas barata, luego menos piezas.',
        'Al responder al cliente:',
        '- Espanol claro y natural, en prosa limpia. PROHIBIDO: emojis, iconos, encabezados markdown (## o ###), lineas de guiones (---), asteriscos de negrita o vinetas con asterisco. Escribe como una persona experta explicando con claridad.',
        '- Si hay directo (existe en una sola pieza): presentalo primero como la mejor opcion, con su codigo exacto.',
        '- Si hay cadenas: presenta las opciones de cadena disponibles (hasta 2), cada una con sus codigos en orden. Y SIEMPRE, ademas de las cadenas, menciona que tambien se puede fabricar como UNA SOLA pieza especial a la medida, por si el cliente prefiere un solo conector en vez de varias piezas.',
        '- Si solo se fabrica (no hay piezas en catalogo que conecten ambos extremos): dilo con claridad y ofrece la fabricacion especial y cotizacion.',
        '- En todos los casos deja claras las alternativas: lo que existe en catalogo (directo o cadena) y la opcion de fabricar a la medida en una sola pieza.',
        '- Disponibilidad: NUNCA digas "sobre pedido", "sin stock", "sin existencia" ni "agotado". Si una pieza no tiene stock, no lo plantees como problema; la via es contactar a un ejecutivo (se mostrara un boton). Solo menciona el stock cuando SI haya disponibilidad.',
        '- Si falta un dato (ej. la medida de un extremo), pidelo amablemente.',
        '- Mantén el hilo: recibiras el historial de la conversacion. Si ya hiciste una pregunta y el cliente responde, combina su respuesta con lo que ya te habia dicho para avanzar; no reinicies desde cero ni repitas preguntas ya contestadas. Cuando ya tengas ambos extremos completos, llama a la herramienta.',
        '- Tu TEXTO debe ser una introduccion BREVE (2 o 3 frases) que explique el panorama: si se arma en una sola pieza, en cadena de cuantas piezas, o si se fabrica. NO enumeres los codigos uno por uno en el texto, porque las opciones con su codigo, precio y disponibilidad se mostraran en tarjetas ordenadas debajo de tu mensaje.',
        '- Se conciso.'
      ].join('\n');
      const tools = [{
        name:'armar_conector',
        description:'Busca en el catalogo real de Adaptekk como conectar dos extremos A y B. Devuelve si existe directo en una pieza, cadenas reales de varias piezas, o si se fabrica especial. Usalo siempre que el cliente describa un conector de dos extremos.',
        input_schema:{ type:'object', properties:{
          a:{type:'object', properties:{ std:{type:'string'}, gen:{type:'string'}, size:{type:'string'} }, required:['std','gen','size']},
          b:{type:'object', properties:{ std:{type:'string'}, gen:{type:'string'}, size:{type:'string'} }, required:['std','gen','size']},
          material:{type:'string'}
        }, required:['a','b'] }
      }];
      let uidIA = null, lastArmar = null, totalIn = 0, totalOut = 0;
      try {
        for (let iter=0; iter<3; iter++){
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method:'POST',
            headers:{ 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
            body: JSON.stringify({ model:MODEL, max_tokens:maxTokens, system:SYSTEM, tools, messages })
          });
          const data = await r.json();
          if (data.usage) { totalIn += (data.usage.input_tokens||0); totalOut += (data.usage.output_tokens||0); }
          if (data.error) return {statusCode:200, headers, body: JSON.stringify({ error:data.error })};
          const toolUses = (data.content||[]).filter(b=>b.type==='tool_use');
          if (data.stop_reason!=='tool_use' || !toolUses.length){
            if (lastArmar) data._armar = lastArmar;
            data._usage = { inTok: totalIn, outTok: totalOut };
            return {statusCode:200, headers, body: JSON.stringify(data)};
          }
          messages.push({ role:'assistant', content:data.content });
          const results=[];
          for (const tu of toolUses){
            let out;
            if (tu.name==='armar_conector'){
              if (!uidIA) uidIA = await odooAuth();
              out = uidIA ? await armarConectorCore(tu.input||{}, uidIA) : {error:'No se pudo conectar al catalogo'};
              if (out && out.ok) lastArmar = out;
            } else { out = {error:'herramienta desconocida'}; }
            results.push({ type:'tool_result', tool_use_id:tu.id, content: JSON.stringify(out).slice(0,6000) });
          }
          messages.push({ role:'user', content:results });
        }
        const rf = await fetch('https://api.anthropic.com/v1/messages', {
          method:'POST', headers:{ 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
          body: JSON.stringify({ model:MODEL, max_tokens:maxTokens, system:SYSTEM, messages })
        });
        const df = await rf.json();
        if (df.usage) { totalIn += (df.usage.input_tokens||0); totalOut += (df.usage.output_tokens||0); }
        if (lastArmar) df._armar = lastArmar;
        df._usage = { inTok: totalIn, outTok: totalOut };
        return {statusCode:200, headers, body: JSON.stringify(df)};
      } catch(e){
        return {statusCode:200, headers, body: JSON.stringify({ error:{ message:'Error en la IA: '+String((e&&e.message)||e) } })};
      }
    }

    // ── SET MASIVO de la Clave Producto/Servicio del SAT (UNSPSC) en TODOS los productos ──
    // Idempotente y resumible: solo toca productos que aún NO tienen esa clave.
    // body: { code?:'40141734', dry_run?:bool, batch_size?:int }
    if (action === 'set_sat_code_all') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      const code = String(body.code || '40141734').trim();
      const dryRun = !!body.dry_run;
      const batchSize = Math.min(Math.max(parseInt(body.batch_size) || 500, 50), 1000);

      // 1) Localizar el registro product.unspsc.code con ese código
      const codeSearch = await xmlrpc(uid, 'product.unspsc.code', 'search',
        `<value><array><data><value><array><data>${xmlStr('code')}${xmlStr('=')}${xmlStr(code)}</data></array></value></data></array></value>`);
      const cf = xmlFault(codeSearch);
      if (cf) return {statusCode:200, headers, body: JSON.stringify({ok:false, step:'find_code', error:cf})};
      const codeIdM = codeSearch.match(/<int>(\d+)<\/int>/);
      const unspscId = codeIdM ? parseInt(codeIdM[1]) : 0;
      if (!unspscId) {
        return {statusCode:200, headers, body: JSON.stringify({ok:false, step:'find_code',
          error:'No existe la clave ' + code + ' en el catálogo SAT (product.unspsc.code) de tu Odoo. Verifica el código o que el catálogo SAT esté cargado.'})};
      }
      // nombre de la clave (confirmación)
      const nameRead = await odooSearchRead(uid, 'product.unspsc.code',
        `<value><array><data>${xmlStr('id')}${xmlStr('=')}${xmlInt(unspscId)}</data></array></value>`, ['code','name'], 1);
      const unspscName = (xmlExtractField(nameRead, 'name') || '').toString();

      // 2) Productos que AÚN no tienen esa clave (incluye los que no tienen ninguna)
      const prodSearch = await xmlrpc(uid, 'product.template', 'search',
        `<value><array><data><value><array><data>${xmlStr('unspsc_code_id')}${xmlStr('!=')}${xmlInt(unspscId)}</data></array></value></data></array></value>`);
      const pf = xmlFault(prodSearch);
      if (pf) return {statusCode:200, headers, body: JSON.stringify({ok:false, step:'find_products', error:pf})};
      const ids = (prodSearch.match(/<int>(\d+)<\/int>/g) || []).map(s => parseInt(s.replace(/[^0-9]/g,'')));

      if (dryRun) {
        return {statusCode:200, headers, body: JSON.stringify({ok:true, dry_run:true, code, unspsc_id:unspscId, unspsc_name:unspscName, pending:ids.length})};
      }

      // 3) Escribir por lotes (resumible: si corta por timeout, re-ejecuta y continúa)
      let updated = 0, lastError = '';
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize);
        const idsXml = `<value><array><data>${chunk.map(id => `<value><int>${id}</int></value>`).join('')}</data></array></value>`;
        const valXml = `<value><struct><member><name>unspsc_code_id</name>${xmlInt(unspscId)}</member></struct></value>`;
        const wr = await xmlrpc(uid, 'product.template', 'write', idsXml + valXml);
        const wf = xmlFault(wr);
        if (wf) { lastError = wf; break; }
        updated += chunk.length;
      }
      const remaining = ids.length - updated;
      // Dejar la clave como valor por defecto para PRODUCTOS NUEVOS (best-effort)
      let defaultSet = false, defaultError = '';
      if (!lastError) {
        try {
          const dres = await xmlrpc(uid, 'ir.default', 'set',
            `${xmlStr('product.template')}${xmlStr('unspsc_code_id')}${xmlInt(unspscId)}`);
          const dfa = xmlFault(dres);
          if (dfa) defaultError = dfa; else defaultSet = true;
        } catch(e){ defaultError = String(e && e.message || e); }
      }
      return {statusCode:200, headers, body: JSON.stringify({
        ok: !lastError, code, unspsc_id:unspscId, unspsc_name:unspscName,
        total_pending: ids.length, updated, remaining,
        default_for_new: defaultSet,
        note: remaining > 0
          ? 'Quedaron pendientes (probable timeout). Vuelve a correr la MISMA acción para continuar.'
          : 'Listo: todos los productos quedaron con la clave SAT' + (defaultSet ? ' y se fijó como valor por defecto para productos nuevos.' : '.'),
        error: lastError || undefined,
        default_error: defaultError || undefined
      })};
    }

    // ── SET MASIVO de PESO ESTIMADO (kg) en productos AT (acero al carbón) ──
    // Resumible: solo toca productos con weight=0 (re-ejecuta hasta remaining:0).
    // body: { dry_run?:bool, force?:bool, limit?:int }
    if (action === 'set_weights_bulk') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      const dryRun = !!body.dry_run;
      const force = !!body.force;
      const limit = Math.min(Math.max(parseInt(body.limit) || 2000, 100), 4000);
      const MAXW = 25;            // máx. grupos de peso por llamada (evita timeout)
      const t0 = Date.now();

      // Modelo de peso (acero al carbón). Base de un RECTO por dash (g) y multiplicador por tipo.
      const DASH_G = {2:20,3:28,4:40,5:55,6:70,8:110,10:160,12:230,14:300,16:400,20:620,24:880,32:1500};
      const DASH_KEYS = Object.keys(DASH_G).map(Number).sort((a,b)=>a-b);
      function dashG(n){ if (DASH_G[n]!=null) return DASH_G[n]; let best=DASH_KEYS[0]; for (const k of DASH_KEYS){ if (Math.abs(k-n)<Math.abs(best-n)) best=k; } return DASH_G[best]; }
      const TYPE_MULT = {NR:1.0,NRR:1.0,C45:1.5,C90:1.7,BH:1.6,BH45:2.0,BH90:2.2,TEE:2.2,TEEB:2.2,TEER:2.2,BHTEE:2.6,CRX:2.8,TAP:0.6};
      function weightKg(code){
        const seg = String(code||'').split('-');
        const tipo = (seg[1]||'NR').toUpperCase();
        const mult = TYPE_MULT[tipo]!=null ? TYPE_MULT[tipo] : 1.3;
        const a = parseInt(seg[seg.length-2]); const b = parseInt(seg[seg.length-1]);
        const cands = [a,b].filter(x=>!isNaN(x));
        const dash = cands.length ? Math.max.apply(null,cands) : 8;
        return Math.round(dashG(dash) * mult) / 1000; // kg
      }

      // Dominio: productos con código AT (y weight=0 salvo force)
      let domainInner = `<value><array><data>${xmlStr('default_code')}<value><string>=like</string></value>${xmlStr('AT-%')}</data></array></value>`;
      if (!force) domainInner += `<value><array><data>${xmlStr('weight')}${xmlStr('=')}${xmlInt(0)}</data></array></value>`;
      const domainArg = `<value><array><data>${domainInner}</data></array></value>`;

      // search_read id+default_code
      const srXml = `<?xml version="1.0"?>
<methodCall><methodName>execute_kw</methodName><params>
  <param><value><string>${ODOO_DB}</string></value></param>
  <param><value><int>${uid}</int></value></param>
  <param><value><string>${ODOO_KEY}</string></value></param>
  <param><value><string>product.product</string></value></param>
  <param><value><string>search_read</string></value></param>
  <param><value><array><data>${domainArg}</data></array></value></param>
  <param><value><struct>
    <member><name>fields</name><value><array><data><value><string>id</string></value><value><string>default_code</string></value></data></array></value></member>
    <member><name>limit</name><value><int>${limit}</int></value></member>
    <member><name>order</name><value><string>id</string></value></member>
  </struct></value></param>
</params></methodCall>`;
      const srResp = await fetch(`${ODOO_URL}/xmlrpc/2/object`, {method:'POST',headers:{'Content-Type':'text/xml'},body:srXml});
      const srText = await srResp.text();
      const srf = xmlFault(srText);
      if (srf) return {statusCode:200, headers, body: JSON.stringify({ok:false, step:'search', error:srf})};

      // parsear pares id + default_code
      const pairs = [];
      const structs = srText.split('<struct>').slice(1);
      for (const s of structs){
        const idm = s.match(/<name>id<\/name>\s*<value>\s*<int>(\d+)<\/int>/);
        const cm = s.match(/<name>default_code<\/name>\s*<value>\s*<string>([^<]*)<\/string>/);
        if (idm) pairs.push({ id: parseInt(idm[1]), code: cm ? cm[1] : '' });
      }

      // agrupar por peso
      const byW = {}; const sample = [];
      for (const p of pairs){
        const w = weightKg(p.code);
        (byW[w] = byW[w] || []).push(p.id);
        if (sample.length < 8) sample.push({ code:p.code, kg:w });
      }
      const weightVals = Object.keys(byW);

      if (dryRun){
        return {statusCode:200, headers, body: JSON.stringify({
          ok:true, dry_run:true, found:pairs.length, distinct_weights:weightVals.length, sample
        })};
      }

      // escribir hasta MAXW grupos por llamada
      function faultInfo(wr){
        const m = wr.match(/<name>faultString<\/name>\s*<value>\s*<string>([\s\S]*?)<\/string>/);
        const full = (m ? m[1] : wr).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
        const lines = full.trim().split('\n').filter(x=>x.trim());
        const exc = lines.length ? lines[lines.length-1].trim() : '';
        return exc + '  |||  ' + (full.length>300 ? '…'+full.slice(-300) : full);
      }
      let updated = 0, groupsWritten = 0, lastError = '';
      const CHUNK = 200;
      outer:
      for (const w of weightVals){
        if (groupsWritten >= MAXW || (Date.now()-t0) > 7500) break;
        const ids = byW[w];
        const valXml = `<value><struct><member><name>weight</name><value><double>${parseFloat(w)}</double></value></member></struct></value>`;
        for (let i = 0; i < ids.length; i += CHUNK){
          const chunk = ids.slice(i, i + CHUNK);
          const idsXml = `<value><array><data>${chunk.map(id=>`<value><int>${id}</int></value>`).join('')}</data></array></value>`;
          const wr = await xmlrpc(uid, 'product.product', 'write', idsXml + valXml);
          if (wr.indexOf('<fault>') !== -1){ lastError = faultInfo(wr); break outer; }
          updated += chunk.length;
        }
        groupsWritten++;
      }

      // ¿cuántos quedan con weight=0?
      let remaining = null;
      try {
        const remDomain = `<value><array><data>${xmlStr('default_code')}<value><string>=like</string></value>${xmlStr('AT-%')}</data></array></value><value><array><data>${xmlStr('weight')}${xmlStr('=')}${xmlInt(0)}</data></array></value>`;
        const rc = await xmlrpc(uid, 'product.product', 'search_count', `<value><array><data>${remDomain}</data></array></value>`);
        const rm = rc.match(/<int>(\d+)<\/int>/);
        remaining = rm ? parseInt(rm[1]) : null;
      } catch(_){}

      return {statusCode:200, headers, body: JSON.stringify({
        ok: !lastError, updated, groups_written:groupsWritten, remaining,
        done: remaining === 0,
        note: remaining === 0 ? 'Listo: pesos estimados cargados en todos los productos AT.'
              : 'Aún faltan ' + (remaining==null?'?':remaining) + '. Vuelve a correr la MISMA acción para continuar.',
        error: lastError || undefined
      })};
    }

    // ── SKYDROPX (PRO): prueba de conexión + diagnóstico ──
    // Reporta longitudes/espacios de las credenciales SIN exponer su valor,
    // y si la base configurada falla, prueba la base opuesta (sandbox/producción)
    // para detectar ambiente cruzado.
    if (action === 'skydropx_test') {
      const rawId = process.env.SKYDROPX_CLIENT_ID || '';
      const rawSecret = process.env.SKYDROPX_CLIENT_SECRET || '';
      const cfgBase = (process.env.SKYDROPX_BASE || 'https://pro.skydropx.com').replace(/\/+$/,'');
      const diag = {
        base_configurada: cfgBase,
        client_id_presente: !!rawId.trim(),
        client_id_len: rawId.trim().length,
        client_id_tenia_espacios: rawId !== rawId.trim(),
        client_secret_presente: !!rawSecret.trim(),
        client_secret_len: rawSecret.trim().length,
        client_secret_tenia_espacios: rawSecret !== rawSecret.trim()
      };
      const t = await skydropxToken();
      if (!t.error && t.token) {
        try {
          const r = await fetch(t.base + '/api/v1/finance/credits', { headers:{'Authorization':'Bearer '+t.token,'Content-Type':'application/json'} });
          const d = await r.json();
          return {statusCode:200, headers, body: JSON.stringify({ ok:true, token_ok:true, base:t.base, diag, credits:(d&&d.data)||d })};
        } catch(e){ return {statusCode:200, headers, body: JSON.stringify({ ok:true, token_ok:true, base:t.base, diag, credits_error:String(e&&e.message||e) })}; }
      }
      // Falló contra la base configurada: probar la base opuesta para detectar ambiente cruzado
      const otraBase = cfgBase.indexOf('sb-pro') >= 0 ? 'https://pro.skydropx.com' : 'https://sb-pro.skydropx.com';
      const t2 = await skydropxToken(otraBase);
      const prueba_base_opuesta = t2.token
        ? { base: otraBase, funciona: true }
        : { base: otraBase, funciona: false, error: t2.error };
      return {statusCode:200, headers, body: JSON.stringify({ ok:false, error:t.error, base:t.base, http:t.http||null, diag, prueba_base_opuesta })};
    }

    // ── SKYDROPX (PRO): prueba de revalidación de una tarifa (quotation_id + rate_id) ──
    // body: { quotation_id, rate_id }  -> devuelve el precio autoritativo o el motivo del fallo.
    if (action === 'revalidar_envio_test') {
      const rv = await skydropxRatePrice(body.quotation_id, body.rate_id);
      return {statusCode:200, headers, body: JSON.stringify(rv)};
    }

    // ── SKYDROPX (PRO): cotizar envío ──
    // body: { zip_to, estado/area_level1, ciudad/area_level2, colonia/area_level3, weight(kg), length, width, height }
    if (action === 'cotizar_envio') {
      const t = await skydropxToken();
      if (t.error) return {statusCode:200, headers, body: JSON.stringify({ ok:false, error:t.error })};
      const origin = {
        country_code:'MX',
        postal_code: process.env.SKYDROPX_ORIGIN_CP || '',
        area_level1: process.env.SKYDROPX_ORIGIN_STATE || '',
        area_level2: process.env.SKYDROPX_ORIGIN_CITY || '',
        area_level3: process.env.SKYDROPX_ORIGIN_COLONIA || ''
      };
      if (!origin.postal_code) return {statusCode:200, headers, body: JSON.stringify({ ok:false, error:'Falta SKYDROPX_ORIGIN_CP (CP de origen) en variables de entorno' })};
      const dest = {
        country_code:'MX',
        postal_code: String(body.zip_to||'').trim(),
        area_level1: body.area_level1 || body.estado || '',
        area_level2: body.area_level2 || body.ciudad || '',
        area_level3: body.area_level3 || body.colonia || ''
      };
      if (!dest.postal_code) return {statusCode:200, headers, body: JSON.stringify({ ok:false, error:'Falta CP de destino (zip_to)' })};
      // Peso del paquete: si llegan items del carrito, sumar pesos reales de Odoo;
      // si no, usar body.weight; con un mínimo de seguridad.
      let weightKg = Math.max(parseFloat(body.weight) || 0, 0);
      let weightSource = weightKg > 0 ? 'body' : 'default';
      let weightMeta = null;
      if (Array.isArray(body.items) && body.items.length) {
        try {
          const uidW = await odooAuth();
          if (uidW) {
            const w = await sumWeightFromOdoo(uidW, body.items);
            weightMeta = w;
            if (w.weight > 0) { weightKg = w.weight; weightSource = 'odoo'; }
          }
        } catch(e){ /* si falla Odoo, caemos a body.weight/default sin romper la cotización */ }
      }
      if (!(weightKg > 0)) { weightKg = 1; weightSource = 'default'; }
      const parcel = {
        weight: Math.max(weightKg, 0.1),
        length: parseInt(body.length)||30,
        width:  parseInt(body.width)||20,
        height: parseInt(body.height)||15
      };
      // 1) crear cotización (timeout 6s)
      let quoteId=null, rawCreate=null;
      try {
        const qResp = await fetchTimeout(t.base + '/api/v1/quotations', {
          method:'POST', headers:{'Authorization':'Bearer '+t.token,'Content-Type':'application/json'},
          body: JSON.stringify({ quotation: { address_from:origin, address_to:dest, parcels:[parcel] } })
        }, 6000);
        rawCreate = await qResp.json();
        quoteId = rawCreate && ((rawCreate.data && rawCreate.data.id) || rawCreate.id);
      } catch(e){
        const msg = (e && e.name === 'AbortError') ? 'Timeout creando la cotización (6s)' : String(e&&e.message||e);
        return {statusCode:200, headers, body: JSON.stringify({ ok:false, step:'create', error:msg })};
      }
      if (!quoteId) return {statusCode:200, headers, body: JSON.stringify({ ok:false, step:'create', error:'No se creó la cotización', raw:rawCreate })};
      // 2) consultar hasta is_completed. Ventana ~5s + timeout 3s por consulta,
      //    para que token+create+polling quede bajo el límite ~10s de Netlify.
      const t0=Date.now(); let rates=[]; let completed=false;
      while (Date.now()-t0 < 5000) {
        await new Promise(r=>setTimeout(r,1200));
        try {
          const gResp = await fetchTimeout(t.base + '/api/v1/quotations/'+quoteId, { headers:{'Authorization':'Bearer '+t.token,'Content-Type':'application/json'} }, 3000);
          const raw = await gResp.json();
          const d = (raw && raw.data) ? raw.data : raw;
          const attrs = (d && d.attributes) ? d.attributes : d;
          completed = !!(attrs && attrs.is_completed);
          const rs = (attrs && attrs.rates) || (d && d.rates) || [];
          if (rs && rs.length) rates = rs;
          if (completed) break;
        } catch(e){}
      }
      // normalizar tarifas
      const norm = (rates||[]).map(r=>{
        const a = r.attributes || r;
        return {
          id: r.id || a.id,
          carrier: a.provider_name || a.carrier_name || a.provider || a.carrier || '',
          service: a.service_level_name || a.service_level || a.service || '',
          total: parseFloat(a.total || a.amount || a.amount_local || 0),
          days: a.days || a.estimated_delivery || a.estimated_delivery_days || null,
          success: a.success !== false
        };
      }).filter(r=>r.success && r.total>0).sort((a,b)=>a.total-b.total);
      return {statusCode:200, headers, body: JSON.stringify({ ok:true, quotation_id:quoteId, is_completed:completed, count:norm.length, elapsed_ms:(Date.now()-t0), weight_kg:parcel.weight, weight_source:weightSource, weight_meta:weightMeta, rates:norm })};
    }

    // ── LOOKUP POR CÓDIGO (para 'Pedir por código AT') ──
    if (action === 'lookup_code') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      const p = await lookupProductByCode(uid, (body.code || '').trim());
      if (!p) return {statusCode:200, headers, body: JSON.stringify({found:false})};
      return {statusCode:200, headers, body: JSON.stringify({found:true, product:p})};
    }

    // ── GUARDAR DATOS FISCALES en el partner (alimenta timbrado) ──
    if (action === 'save_fiscal_data') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      let pid = parseInt(body.partner_id) || 0;
      let pname = '';
      if (!pid && body.email) {
        const r = await odooSearchRead(uid, 'res.partner',
          `<value><array><data>${xmlStr('email')}<value><string>=ilike</string></value>${xmlStr(body.email)}</data></array></value>`, ['id','name'], 1);
        const m = r.match(/<int>(\d+)<\/int>/); if (m) pid = parseInt(m[1]);
        const st = (r.split('<struct>')[1]||'').split('</struct>')[0]; pname = xmlExtractField(st,'name');
      }
      if (!pid) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'partner_no_encontrado'})};
      // Escribe un solo campo y captura el error de Odoo si lo hay
      async function writeField(field, valueXml){
        const w = await xmlrpc(uid, 'res.partner', 'write',
          `<value><array><data><value><int>${pid}</int></value></data></array></value><value><struct><member><name>${field}</name>${valueXml}</member></struct></value>`);
        return xmlFault(w);
      }
      const saved = [], errors = {};
      async function tryField(key, field, valueXml){
        try { const f = await writeField(field, valueXml); if (f) errors[key] = f; else saved.push(key); }
        catch(e){ errors[key] = String(e).slice(0,200); }
      }
      if (body.rfc)     await tryField('rfc',     'vat',  xmlStr(String(body.rfc).toUpperCase()));
      if (body.cp)      await tryField('cp',      'zip',  xmlStr(body.cp));
      if (body.razon)   await tryField('razon',   'name', xmlStr(body.razon));
      if (body.calle || body.num) await tryField('calle', 'street', xmlStr(((body.calle||'') + ' ' + (body.num||'')).trim()));
      if (body.colonia) await tryField('colonia', 'street2', xmlStr(body.colonia));
      if (body.ciudad)  await tryField('ciudad',  'city',  xmlStr(body.ciudad));
      if (body.regimen) await tryField('regimen', 'l10n_mx_edi_fiscal_regime', xmlStr(body.regimen));
      if (body.uso)     await tryField('uso',     'l10n_mx_edi_usage', xmlStr(body.uso));
      return {statusCode:200, headers, body: JSON.stringify({ok: saved.length>0, partner_id:pid, partner_name:pname, saved, errors})};
    }

    // ── SUBIR CONSTANCIA DE SITUACIÓN FISCAL (PDF) como adjunto del partner ──
    if (action === 'upload_constancia') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      let pid = parseInt(body.partner_id) || 0;
      if (!pid && body.email) {
        const r = await odooSearchRead(uid, 'res.partner',
          `<value><array><data>${xmlStr('email')}<value><string>=ilike</string></value>${xmlStr(body.email)}</data></array></value>`, ['id'], 1);
        const m = r.match(/<int>(\d+)<\/int>/); if (m) pid = parseInt(m[1]);
      }
      if (!pid) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'partner_no_encontrado'})};
      const b64 = (body.data || '').replace(/^data:[^,]*,/, '');
      if (!b64) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'archivo_vacio'})};
      const fname = body.filename || 'Constancia.pdf';
      const createText = await xmlrpc(uid, 'ir.attachment', 'create',
        `<value><struct>` +
        `<member><name>name</name>${xmlStr(fname)}</member>` +
        `<member><name>type</name>${xmlStr('binary')}</member>` +
        `<member><name>datas</name><value><string>${b64}</string></value></member>` +
        `<member><name>res_model</name>${xmlStr('res.partner')}</member>` +
        `<member><name>res_id</name><value><int>${pid}</int></value></member>` +
        `<member><name>mimetype</name>${xmlStr('application/pdf')}</member>` +
        `</struct></value>`);
      const fault = xmlFault(createText);
      if (fault) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:fault})};
      const m = createText.match(/<value><int>(\d+)<\/int><\/value>/);
      return {statusCode:200, headers, body: JSON.stringify({ok:true, partner_id:pid, attachment_id: m ? parseInt(m[1]) : null})};
    }

    // ── LEER DATOS FISCALES del partner (para prellenar checkout) ──
    if (action === 'get_fiscal_data') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      const clean = function(v){ return (v==='0' || v==='false' || v==null) ? '' : v; };
      const domId = function(id){ return `<value><array><data>${xmlStr('id')}<value><string>=</string></value><value><int>${id}</int></value></data></array></value>`; };
      // Lee RFC/CP/razón de un contacto
      async function readCore(id){
        try {
          const r = await odooSearchRead(uid, 'res.partner', domId(id), ['vat','zip','name'], 1);
          const st = (r.split('<struct>')[1]||'').split('</struct>')[0];
          return { vat:clean(xmlExtractField(st,'vat')), zip:clean(xmlExtractField(st,'zip')), name:xmlExtractField(st,'name') };
        } catch(_){ return { vat:'', zip:'', name:'' }; }
      }
      // Resuelve contacto por correo
      async function pidByEmail(email){
        try {
          const r = await odooSearchRead(uid, 'res.partner',
            `<value><array><data>${xmlStr('email')}<value><string>=ilike</string></value>${xmlStr(email)}</data></array></value>`, ['id','vat'], 5);
          // Preferir el que tenga RFC
          const ids = [...r.matchAll(/<int>(\d+)<\/int>/g)].map(m=>parseInt(m[1]));
          return ids;
        } catch(_){ return []; }
      }

      let pid = parseInt(body.partner_id) || 0;
      let emailIds = body.email ? await pidByEmail(body.email) : [];
      if (!pid && emailIds.length) pid = emailIds[0];
      if (!pid) return {statusCode:200, headers, body: JSON.stringify({found:false})};

      // Leer RFC del partner_id; si no trae RFC, probar los contactos del correo y quedarse con el que tenga RFC
      let core = await readCore(pid);
      if (!core.vat && body.email) {
        for (const cand of emailIds) {
          if (cand === pid) continue;
          const c2 = await readCore(cand);
          if (c2.vat) { pid = cand; core = c2; break; }
        }
      }

      const out = { found:true, partner_id:pid, vat:core.vat, zip:core.zip, name:core.name };
      const idDom = domId(pid);
      try {
        const r = await odooSearchRead(uid, 'res.partner', idDom, ['street','street2','city','phone','mobile','company_name'], 1);
        const st = (r.split('<struct>')[1]||'').split('</struct>')[0];
        out.street = clean(xmlExtractField(st,'street')); out.street2 = clean(xmlExtractField(st,'street2')); out.city = clean(xmlExtractField(st,'city'));
        out.phone = clean(xmlExtractField(st,'phone')) || clean(xmlExtractField(st,'mobile')); out.company_name = clean(xmlExtractField(st,'company_name'));
      } catch(_){}
      try {
        const r2 = await odooSearchRead(uid, 'res.partner', idDom, ['l10n_mx_edi_fiscal_regime','l10n_mx_edi_usage'], 1);
        const st2 = (r2.split('<struct>')[1]||'').split('</struct>')[0];
        out.regime = clean(xmlExtractField(st2,'l10n_mx_edi_fiscal_regime')); out.usage = clean(xmlExtractField(st2,'l10n_mx_edi_usage'));
      } catch(_){}
      try {
        const att = await odooSearchRead(uid, 'ir.attachment',
          `<value><array><data>${xmlStr('res_model')}<value><string>=</string></value>${xmlStr('res.partner')}</data></array></value>` +
          `<value><array><data>${xmlStr('res_id')}<value><string>=</string></value><value><int>${pid}</int></value></data></array></value>` +
          `<value><array><data>${xmlStr('mimetype')}<value><string>=</string></value>${xmlStr('application/pdf')}</data></array></value>`,
          ['id'], 1);
        out.has_constancia = /<int>\d+<\/int>/.test(att);
      } catch(_){ out.has_constancia = false; }
      return {statusCode:200, headers, body: JSON.stringify(out)};
    }

    // ── ACTUALIZAR DATOS DE LA CUENTA (nombre, empresa, teléfono) ──
    if (action === 'update_account') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      let pid = parseInt(body.partner_id) || 0;
      if (!pid && body.email) {
        const r = await odooSearchRead(uid, 'res.partner',
          `<value><array><data>${xmlStr('email')}<value><string>=ilike</string></value>${xmlStr(body.email)}</data></array></value>`, ['id'], 1);
        const m = r.match(/<int>(\d+)<\/int>/); if (m) pid = parseInt(m[1]);
      }
      if (!pid) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'partner_no_encontrado'})};
      async function writeFieldA(field, valueXml){
        const w = await xmlrpc(uid, 'res.partner', 'write',
          `<value><array><data><value><int>${pid}</int></value></data></array></value><value><struct><member><name>${field}</name>${valueXml}</member></struct></value>`);
        return xmlFault(w);
      }
      const saved = [], errors = {};
      async function tryA(key, field, valueXml){
        try { const f = await writeFieldA(field, valueXml); if (f) errors[key] = f; else saved.push(key); }
        catch(e){ errors[key] = String(e).slice(0,200); }
      }
      if (body.name != null && String(body.name).trim())    await tryA('name',    'name',         xmlStr(String(body.name).trim()));
      if (body.company != null)                              await tryA('company', 'company_name', xmlStr(String(body.company).trim()));
      if (body.phone != null)                                await tryA('phone',   'phone',        xmlStr(String(body.phone).trim()));
      return {statusCode:200, headers, body: JSON.stringify({ ok: Object.keys(errors).length===0, partner_id:pid, saved, errors })};
    }

    // ── SEARCH PRODUCTS ──
    if (action === 'search_products') {
      const uid = await odooAuth();
      const query = body.query || '';
      const text = await xmlrpc(uid, 'product.product', 'search_read',
        `<value><array><data>
          <value><array><data>${xmlStr('name')}<value><string>ilike</string></value>${xmlStr(query)}</data></array></value>
        </data></array></value>`
      );
      return {statusCode:200, headers, body: JSON.stringify({success:true, raw: text.substring(0,1000)})};
    }

    // ── CREAR ORDEN EN ODOO (Fase 4) ──
    // Crea/recupera el partner y genera una sale.order con sus líneas (precios reales de Odoo).
    if (action === 'crear_orden_odoo') {
      const orden = body.orden || {};
      const items = Array.isArray(orden.items) ? orden.items : [];
      const co = orden.checkout || {};
      const contacto = co.contacto || {};
      if (!items.length) return {statusCode:400, headers, body: JSON.stringify({error:'Orden sin productos'})};

      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      const result = await crearOrdenOdoo(uid, orden, 'draft');
      if (!result.ok) {
        return {statusCode:502, headers, body: JSON.stringify({success:false, error:result.error})};
      }
      return {statusCode:200, headers, body: JSON.stringify({
        success:true, sale_id:result.saleId, folio:result.folio, total:result.total
      })};
    }

    // ── CREAR PREFERENCIA MERCADO PAGO (tarjeta) ──
    // Recalcula el total en el servidor contra Odoo y crea una preference de pago.
    if (action === 'crear_preferencia_mp') {
      const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
      const site = process.env.SITE_URL || SITE_URL;
      const orden = body.orden || {};
      const items = Array.isArray(orden.items) ? orden.items : [];

      if (!MP_TOKEN) {
        // Mercado Pago aún no configurado en Netlify → el front cae a su fallback.
        return {statusCode:200, headers, body: JSON.stringify({
          success:false, error:'Mercado Pago no configurado (falta MP_ACCESS_TOKEN)'
        })};
      }
      if (!items.length) {
        return {statusCode:400, headers, body: JSON.stringify({error:'Orden sin productos'})};
      }

      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      // Envío: revalidar contra Skydropx ANTES de crear la orden / preferencia (no se confía en el cliente)
      let shipCost = 0;
      if (orden.checkout && orden.checkout.envio) {
        const rvShip = await resolveShipPrice(orden.checkout);
        if (!rvShip.ok) return {statusCode:200, headers, body: JSON.stringify({ success:false, error:rvShip.error, ship_revalidation_failed:true })};
        shipCost = rvShip.ship;
      }

      // Crear la orden en Odoo como borrador para que el webhook la confirme tras el pago
      const ordenCreada = await crearOrdenOdoo(uid, orden, 'draft', shipCost);

      // Recalcular cada línea con el precio REAL de Odoo (no confiar en el cliente)
      const mpItems = [];
      let serverSubtotal = 0;
      for (const it of items) {
        const code = it.at_code || it.code;
        const qty = Math.max(1, parseInt(it.qty) || 1);
        const prod = await lookupProductByCode(uid, code);
        if (!prod || !(prod.price > 0)) {
          // Producto sin precio en Odoo → no se puede cobrar en línea
          return {statusCode:409, headers, body: JSON.stringify({
            success:false, error:'Producto sin precio en sistema: ' + code + '. Contacta a un ejecutivo.'
          })};
        }
        serverSubtotal += prod.price * qty;
        mpItems.push({
          id: prod.at_code,
          title: prod.at_code + (prod.name ? ' - ' + prod.name : ''),
          quantity: qty,
          currency_id: 'MXN',
          unit_price: Math.round(prod.price * 100) / 100
        });
      }

      // Costo de envío: ya revalidado arriba contra Skydropx (shipCost)
      const envio = orden.checkout && orden.checkout.envio ? orden.checkout.envio : null;
      if (envio && shipCost > 0) {
        mpItems.push({
          id: 'ENVIO',
          title: 'Env\u00edo ' + (envio.name || envio.carrier || ''),
          quantity: 1,
          currency_id: 'MXN',
          unit_price: shipCost
        });
      }

      const folio = String(orden.folio || ('PED-' + Date.now().toString().slice(-6)));
      const preference = {
        items: mpItems,
        external_reference: folio,
        back_urls: {
          success: site + '/?pago=ok&folio='  + encodeURIComponent(folio),
          failure: site + '/?pago=err&folio=' + encodeURIComponent(folio),
          pending: site + '/?pago=pend&folio='+ encodeURIComponent(folio)
        },
        auto_return: 'approved',
        notification_url: site + '/.netlify/functions/mp-webhook',
        statement_descriptor: 'ADAPTEKK',
        metadata: { folio: folio, server_subtotal: serverSubtotal }
      };

      try {
        const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + MP_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify(preference)
        });
        const mpData = await mpResp.json();
        if (mpData && mpData.init_point) {
          return {statusCode:200, headers, body: JSON.stringify({
            success:true,
            init_point: mpData.init_point,
            preference_id: mpData.id,
            folio: folio,
            server_total: Math.round((serverSubtotal + shipCost) * 100) / 100
          })};
        }
        return {statusCode:502, headers, body: JSON.stringify({
          success:false, error:'Mercado Pago no devolvi\u00f3 init_point', detail: (mpData && mpData.message) || ''
        })};
      } catch(e) {
        return {statusCode:502, headers, body: JSON.stringify({success:false, error:'Error al contactar Mercado Pago', detail:e.message})};
      }
    }

    // ── PROCESAR PAGO TRANSPARENTE (Checkout Bricks) ──
    // Recibe el token de tarjeta generado por el Brick + datos del pago, recalcula el
    // monto REAL desde Odoo (no confía en el cliente) y crea el pago en Mercado Pago.
    if (action === 'process_payment') {
      const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
      if (!MP_TOKEN) {
        return {statusCode:200, headers, body: JSON.stringify({ success:false, error:'Mercado Pago no configurado (falta MP_ACCESS_TOKEN)' })};
      }
      const orden = body.orden || {};
      const pago  = body.pago  || {};   // { token, payment_method_id, issuer_id, installments, payer }
      const items = Array.isArray(orden.items) ? orden.items : [];
      if (!items.length) {
        return {statusCode:400, headers, body: JSON.stringify({error:'Orden sin productos'})};
      }
      if (!pago.token) {
        return {statusCode:400, headers, body: JSON.stringify({error:'Falta el token de pago'})};
      }

      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      // (La orden se crea UNA sola vez más abajo, después de conocer el resultado del pago,
      //  para no dejar borradores huérfanos.)

      // Recalcular el monto REAL desde Odoo (seguridad: nunca confiar en el monto del cliente)
      let serverSubtotal = 0;
      for (const it of items) {
        const code = it.at_code || it.code;
        const qty = Math.max(1, parseInt(it.qty) || 1);
        const prod = await lookupProductByCode(uid, code);
        if (!prod || !(prod.price > 0)) {
          return {statusCode:409, headers, body: JSON.stringify({ success:false, error:'Producto sin precio en sistema: ' + code + '. Contacta a un ejecutivo.' })};
        }
        serverSubtotal += prod.price * qty;
      }
      const envio = orden.checkout && orden.checkout.envio ? orden.checkout.envio : null;
      // Envío: revalidar contra Skydropx ANTES de cobrar (no se confía en el monto del cliente)
      let shipCost = 0;
      if (envio) {
        const rvShip = await resolveShipPrice(orden.checkout);
        if (!rvShip.ok) return {statusCode:200, headers, body: JSON.stringify({ success:false, error:rvShip.error, ship_revalidation_failed:true })};
        shipCost = rvShip.ship;
      }
      const serverTotal = Math.round((serverSubtotal + shipCost) * 100) / 100;

      const folio = String(orden.folio || ('PED-' + Date.now().toString().slice(-6)));

      // Crear el pago en Mercado Pago con el token y el monto calculado por el servidor
      const paymentBody = {
        transaction_amount: serverTotal,
        token: pago.token,
        description: 'Adaptekk pedido ' + folio,
        installments: parseInt(pago.installments) || 1,
        payment_method_id: pago.payment_method_id,
        external_reference: folio,
        notification_url: (process.env.SITE_URL || SITE_URL) + '/.netlify/functions/mp-webhook',
        statement_descriptor: 'ADAPTEKK',
        metadata: { folio: folio, server_subtotal: serverSubtotal },
        payer: {
          email: (pago.payer && pago.payer.email) || 'comprador@adaptekk.com'
        }
      };
      // issuer_id solo si viene (para efectivo/SPEI no aplica)
      if (pago.issuer_id) paymentBody.issuer_id = pago.issuer_id;
      // identificación del pagador solo si viene completa
      if (pago.payer && pago.payer.identification && pago.payer.identification.number) {
        paymentBody.payer.identification = pago.payer.identification;
      }

      try {
        const mpResp = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + MP_TOKEN,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': folio + '-' + Date.now()
          },
          body: JSON.stringify(paymentBody)
        });
        const pay = await mpResp.json();
        const status = pay.status; // approved | in_process | rejected | ...

        // Si MP devolvió un error (sin status), exponerlo para diagnóstico
        if (!status) {
          return {statusCode:200, headers, body: JSON.stringify({
            success: false,
            status: 'rejected',
            status_detail: 'mp_error',
            error: (pay.message || pay.error || 'Mercado Pago rechazó la solicitud') +
                   (pay.cause && pay.cause[0] ? ' ('+(pay.cause[0].description||pay.cause[0].code)+')' : ''),
            folio: folio
          })};
        }

        // Crear la orden en Odoo UNA sola vez, con el estado correcto según el pago:
        //  - aprobado            → confirmada ('confirm')
        //  - en proceso/pendiente → borrador ('draft'), el webhook la confirmará al acreditar
        let ordenInfo = null;
        if (status === 'approved') {
          try { ordenInfo = await crearOrdenOdoo(uid, orden, 'confirm', shipCost); } catch(e){ ordenInfo = {ok:false, error:e.message}; }
          // Enviar correos de confirmación (al cliente y al equipo). No bloquea la respuesta si fallan.
          try { await enviarCorreosPedido(orden, folio, serverTotal, 'tarjeta', 'aprobado'); } catch(_){}
        } else if (status === 'in_process' || status === 'pending') {
          try { ordenInfo = await crearOrdenOdoo(uid, orden, 'draft', shipCost); } catch(e){ ordenInfo = {ok:false, error:e.message}; }
        }

        return {statusCode:200, headers, body: JSON.stringify({
          success: status === 'approved',
          status: status,
          status_detail: pay.status_detail || '',
          payment_id: pay.id || null,
          folio: folio,
          server_total: serverTotal,
          orden_odoo: ordenInfo   // diagnóstico: { ok, saleId, confirmed, confirmError }
        })};
      } catch(e) {
        return {statusCode:502, headers, body: JSON.stringify({success:false, error:'Error al procesar el pago', detail:e.message})};
      }
    }

    // ── CONSULTAR ESTADO DE UNA ORDEN (¿ya se confirmó el pago?) ──
    // El frontend la consulta periódicamente para saber cuándo SPEI/OXXO se acreditó.
    if (action === 'consultar_estado_orden') {
      const folio = String(body.folio || '').trim();
      if (!folio) return {statusCode:400, headers, body: JSON.stringify({error:'Folio requerido'})};

      const uid = await odooAuth();
      if (!uid) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'odoo auth'})};

      // Buscar la orden por client_order_ref (folio) y leer su estado
      const domainXml = `<value><array><data>
        ${xmlStr('client_order_ref')}<value><string>=</string></value>${xmlStr(folio)}
      </data></array></value>`;
      const found = await odooSearchRead(uid, 'sale.order', domainXml, ['id','name','state','amount_total'], 1);
      const idMatch = found.match(/<name>\s*id\s*<\/name>\s*<value>\s*<int>\s*(\d+)\s*<\/int>/);
      const stateMatch = found.match(/<name>\s*state\s*<\/name>\s*<value>\s*<string>\s*([a-z_]+)\s*<\/string>/);
      const nameMatch = found.match(/<name>\s*name\s*<\/name>\s*<value>\s*<string>\s*([^<]+)\s*<\/string>/);

      if (!idMatch) {
        return {statusCode:200, headers, body: JSON.stringify({ ok:true, existe:false, confirmada:false })};
      }
      const estado = stateMatch ? stateMatch[1] : 'draft';
      // En Odoo: 'draft'/'sent' = cotización (pendiente); 'sale'/'done' = confirmada
      const confirmada = (estado === 'sale' || estado === 'done');
      return {statusCode:200, headers, body: JSON.stringify({
        ok:true,
        existe:true,
        confirmada: confirmada,
        estado: estado,
        odoo_id: parseInt(idMatch[1]),
        odoo_name: nameMatch ? nameMatch[1].trim() : ''
      })};
    }

    // ── LISTAR PEDIDOS DE UN CLIENTE (para "Mis pedidos" del portal) ──
    if (action === 'get_client_orders') {
      const email = (body.email || '').trim();
      const pidIn = parseInt(body.partner_id) || 0;
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      let pid = pidIn;
      if (!pid && email) {
        const pf = await xmlrpc(uid, 'res.partner', 'search',
          `<value><array><data><value><array><data>${xmlStr('email')}<value><string>=ilike</string></value>${xmlStr(email)}</data></array></value></data></array></value>`);
        const pm = pf.match(/<int>(\d+)<\/int>/);
        pid = pm ? parseInt(pm[1]) : 0;
      }
      if (!pid) return {statusCode:200, headers, body: JSON.stringify({ok:true, orders:[]})};
      const domain = `<value><array><data>${xmlStr('partner_id')}<value><string>=</string></value>${xmlInt(pid)}</data></array></value>`;
      const text = await odooSearchRead(uid, 'sale.order', domain, ['name','client_order_ref','date_order','state','amount_total','invoice_status','invoice_ids','order_line'], 50);
      const structs = text.match(/<struct>[\s\S]*?<\/struct>/g) || [];
      const orders = [];
      for (const st of structs) {
        let items = 0;
        const olm = st.match(/<name>\s*order_line\s*<\/name>\s*<value>\s*<array>\s*<data>([\s\S]*?)<\/data>/);
        if (olm) items = (olm[1].match(/<int>/g) || []).length;
        const invStatus = xmlExtractField(st, 'invoice_status');
        const invm = st.match(/<name>\s*invoice_ids\s*<\/name>\s*<value>\s*<array>\s*<data>([\s\S]*?)<\/data>/);
        const invCount = invm ? (invm[1].match(/<int>/g) || []).length : 0;
        orders.push({
          name: xmlExtractField(st, 'name'),
          folio: xmlExtractField(st, 'client_order_ref'),
          date: xmlExtractField(st, 'date_order'),
          state: xmlExtractField(st, 'state'),
          total: parseFloat(xmlExtractField(st, 'amount_total')) || 0,
          items: items,
          facturado: (invStatus === 'invoiced') || (invCount > 0)
        });
      }
      orders.sort((a,b)=> (b.date||'').localeCompare(a.date||''));
      return {statusCode:200, headers, body: JSON.stringify({ok:true, orders})};
    }

    // ── DETALLE de un pedido/cotización (líneas + totales + estado de factura) ──
    if (action === 'get_order_detail') {
      const folio = (body.folio || '').trim();
      const email = (body.email || '').trim();
      let pid = parseInt(body.partner_id) || 0;
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      if (!folio) return {statusCode:400, headers, body: JSON.stringify({ok:false, error:'Folio requerido'})};
      if (!pid && email) {
        const pf = await xmlrpc(uid, 'res.partner', 'search',
          `<value><array><data><value><array><data>${xmlStr('email')}<value><string>=ilike</string></value>${xmlStr(email)}</data></array></value></data></array></value>`);
        const pm = pf.match(/<int>(\d+)<\/int>/);
        pid = pm ? parseInt(pm[1]) : 0;
      }
      // Buscar la orden por folio (y por partner, como control de acceso)
      let domain = `<value><array><data>${xmlStr('client_order_ref')}<value><string>=</string></value>${xmlStr(folio)}`;
      if (pid) domain += `${xmlStr('partner_id')}<value><string>=</string></value>${xmlInt(pid)}`;
      domain += `</data></array></value>`;
      const text = await odooSearchRead(uid, 'sale.order', domain,
        ['id','name','client_order_ref','date_order','state','amount_untaxed','amount_tax','amount_total','invoice_status','invoice_ids'], 1);
      const st = (text.match(/<struct>[\s\S]*?<\/struct>/) || [])[0];
      if (!st) return {statusCode:200, headers, body: JSON.stringify({ok:true, found:false})};
      const orderId = parseInt(xmlExtractField(st, 'id')) || 0;
      // Líneas del pedido
      const lineDomain = `<value><array><data>${xmlStr('order_id')}<value><string>=</string></value>${xmlInt(orderId)}</data></array></value>`;
      const lt = await odooSearchRead(uid, 'sale.order.line', lineDomain, ['name','product_uom_qty','price_unit','price_subtotal'], 100);
      const lstructs = lt.match(/<struct>[\s\S]*?<\/struct>/g) || [];
      const lines = lstructs.map(s => ({
        name: xmlExtractField(s, 'name'),
        qty: parseFloat(xmlExtractField(s, 'product_uom_qty')) || 0,
        price: parseFloat(xmlExtractField(s, 'price_unit')) || 0,
        subtotal: parseFloat(xmlExtractField(s, 'price_subtotal')) || 0
      }));
      const invStatus = xmlExtractField(st, 'invoice_status');
      const invm = st.match(/<name>\s*invoice_ids\s*<\/name>\s*<value>\s*<array>\s*<data>([\s\S]*?)<\/data>/);
      const invIds = invm ? (invm[1].match(/<int>(\d+)<\/int>/g) || []).map(x => parseInt(x.replace(/\D/g,''))) : [];
      const facturado = (invStatus === 'invoiced') || (invIds.length > 0);
      return {statusCode:200, headers, body: JSON.stringify({ ok:true, found:true, order:{
        folio: folio,
        name: xmlExtractField(st, 'name'),
        date: xmlExtractField(st, 'date_order'),
        state: xmlExtractField(st, 'state'),
        subtotal: parseFloat(xmlExtractField(st, 'amount_untaxed')) || 0,
        tax: parseFloat(xmlExtractField(st, 'amount_tax')) || 0,
        total: parseFloat(xmlExtractField(st, 'amount_total')) || 0,
        lines: lines,
        facturado: facturado
      }})};
    }

    // ── DESCARGAR FACTURA (XML/PDF) de un pedido facturado ──
    if (action === 'descargar_factura') {
      const folio = (body.folio || '').trim();
      let pid = parseInt(body.partner_id) || 0;
      const email = (body.email || '').trim();
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      if (!folio) return {statusCode:400, headers, body: JSON.stringify({ok:false, error:'Folio requerido'})};
      if (!pid && email) {
        const pf = await xmlrpc(uid, 'res.partner', 'search',
          `<value><array><data><value><array><data>${xmlStr('email')}<value><string>=ilike</string></value>${xmlStr(email)}</data></array></value></data></array></value>`);
        const pm = pf.match(/<int>(\d+)<\/int>/);
        pid = pm ? parseInt(pm[1]) : 0;
      }
      let domain = `<value><array><data>${xmlStr('client_order_ref')}<value><string>=</string></value>${xmlStr(folio)}`;
      if (pid) domain += `${xmlStr('partner_id')}<value><string>=</string></value>${xmlInt(pid)}`;
      domain += `</data></array></value>`;
      const text = await odooSearchRead(uid, 'sale.order', domain, ['id','invoice_ids'], 1);
      const st = (text.match(/<struct>[\s\S]*?<\/struct>/) || [])[0];
      if (!st) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'Pedido no encontrado'})};
      const invm = st.match(/<name>\s*invoice_ids\s*<\/name>\s*<value>\s*<array>\s*<data>([\s\S]*?)<\/data>/);
      const invIds = invm ? (invm[1].match(/<int>(\d+)<\/int>/g) || []).map(x => parseInt(x.replace(/\D/g,''))) : [];
      if (!invIds.length) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'Este pedido aún no tiene factura'})};
      // Buscar los adjuntos (XML CFDI y/o PDF) de la(s) factura(s)
      const invIdsXml = invIds.map(id => xmlInt(id)).join('');
      const attDomain = `<value><array><data>
        ${xmlStr('res_model')}<value><string>=</string></value>${xmlStr('account.move')}
        ${xmlStr('res_id')}<value><string>in</string></value><value><array><data>${invIdsXml}</data></array></value>
      </data></array></value>`;
      const at = await odooSearchRead(uid, 'ir.attachment', attDomain, ['name','mimetype','datas'], 20);
      const astructs = at.match(/<struct>[\s\S]*?<\/struct>/g) || [];
      const files = astructs.map(s => ({
        name: xmlExtractField(s, 'name'),
        mimetype: xmlExtractField(s, 'mimetype'),
        datas: xmlExtractField(s, 'datas')
      })).filter(f => f.datas && (/(xml|pdf)/i.test(f.mimetype) || /\.(xml|pdf)$/i.test(f.name)));
      if (!files.length) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'La factura no tiene archivos disponibles todavía'})};
      return {statusCode:200, headers, body: JSON.stringify({ok:true, files})};
    }

    // ── ELIMINAR (cancelar) una cotización del cliente ──
    if (action === 'eliminar_cotizacion') {
      const folio = (body.folio || '').trim();
      let pid = parseInt(body.partner_id) || 0;
      const email = (body.email || '').trim();
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      if (!folio) return {statusCode:400, headers, body: JSON.stringify({ok:false, error:'Folio requerido'})};
      if (!pid && email) {
        const pf = await xmlrpc(uid, 'res.partner', 'search',
          `<value><array><data><value><array><data>${xmlStr('email')}<value><string>=ilike</string></value>${xmlStr(email)}</data></array></value></data></array></value>`);
        const pm = pf.match(/<int>(\d+)<\/int>/);
        pid = pm ? parseInt(pm[1]) : 0;
      }
      let domain = `<value><array><data>${xmlStr('client_order_ref')}<value><string>=</string></value>${xmlStr(folio)}`;
      if (pid) domain += `${xmlStr('partner_id')}<value><string>=</string></value>${xmlInt(pid)}`;
      domain += `</data></array></value>`;
      const text = await odooSearchRead(uid, 'sale.order', domain, ['id','state'], 1);
      const st = (text.match(/<struct>[\s\S]*?<\/struct>/) || [])[0];
      if (!st) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'Cotización no encontrada'})};
      const id = parseInt(xmlExtractField(st, 'id')) || 0;
      const state = xmlExtractField(st, 'state');
      // Seguridad: solo se pueden eliminar cotizaciones (no pedidos confirmados)
      if (state !== 'draft' && state !== 'sent') {
        return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'Solo se pueden eliminar cotizaciones, no pedidos confirmados'})};
      }
      try {
        await xmlrpc(uid, 'sale.order', 'action_cancel',
          `<value><array><data><value><int>${id}</int></value></data></array></value>`);
      } catch(e) {
        return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'No se pudo eliminar: ' + (e.message||'')})};
      }
      return {statusCode:200, headers, body: JSON.stringify({ok:true})};
    }

    // ── FACTURAR un pedido confirmado (crear + validar + timbrar la factura en Odoo) ──
    //  - El webhook la llama (sin force) tras confirmar el pago: solo factura si la orden
    //    trae la marca [AUTOFACTURA] (el cliente eligió facturar).
    //  - Con force:true + partner_id (del dueño) se puede facturar a mano para pruebas.
    if (action === 'facturar_pedido') {
      const folio = (body.folio || '').trim();
      const force = body.force === true;
      let pid = parseInt(body.partner_id) || 0;
      const email = (body.email || '').trim();
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      if (!folio) return {statusCode:400, headers, body: JSON.stringify({ok:false, error:'Folio requerido'})};
      if (!pid && email) {
        const pf = await xmlrpc(uid, 'res.partner', 'search',
          `<value><array><data><value><array><data>${xmlStr('email')}<value><string>=ilike</string></value>${xmlStr(email)}</data></array></value></data></array></value>`);
        const pm = pf.match(/<int>(\d+)<\/int>/);
        pid = pm ? parseInt(pm[1]) : 0;
      }
      // force exige dueño (partner) para evitar abuso desde el navegador
      if (force && !pid) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'Se requiere identificar al cliente'})};
      // Buscamos por FOLIO (el folio es la clave del pedido). No filtramos por ficha de
      // cliente porque a veces el pedido queda ligado a un registro distinto al del login.
      let domain = `<value><array><data>${xmlStr('client_order_ref')}<value><string>=</string></value>${xmlStr(folio)}</data></array></value>`;
      const text = await odooSearchRead(uid, 'sale.order', domain, ['id','state','note','invoice_ids'], 10);
      const structs = text.match(/<struct>[\s\S]*?<\/struct>/g) || [];
      if (!structs.length) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'Pedido no encontrado'})};
      // Puede haber duplicados con el mismo folio: elegir el que ya tiene factura,
      // si no, el confirmado (sale/done), si no, el primero.
      function _parseOrden(s){
        const im = s.match(/<name>\s*invoice_ids\s*<\/name>\s*<value>\s*<array>\s*<data>([\s\S]*?)<\/data>/);
        return {
          id: parseInt(xmlExtractField(s, 'id')) || 0,
          state: xmlExtractField(s, 'state'),
          note: xmlExtractField(s, 'note') || '',
          invIds: im ? (im[1].match(/<int>(\d+)<\/int>/g) || []) : []
        };
      }
      const parsed = structs.map(_parseOrden);
      const chosen = parsed.find(o => o.invIds.length)
                  || parsed.find(o => o.state === 'sale' || o.state === 'done')
                  || parsed[0];
      const id = chosen.id;
      const state = chosen.state;
      const note = chosen.note;
      const invIds = chosen.invIds;
      // Si ya hay factura, intentar publicarla/timbrarla (por si quedó en borrador).
      if (invIds.length) {
        const existingId = parseInt(invIds[invIds.length-1].replace(/\D/g,'')) || 0;
        const pr = await publicarYTimbrar(uid, existingId);
        // Si quedó publicada (y con archivos), enviarla por correo.
        if (pr.posted) { try { await enviarFacturaCorreo(uid, id, existingId, folio); } catch(_){} }
        return {statusCode:200, headers, body: JSON.stringify({ ok:true, already_invoiced:true, invoiceId:existingId, posted:pr.posted, stamped:pr.stamped, post_error:pr.post_error, stamp_error:pr.stamp_error })};
      }
      if (state !== 'sale' && state !== 'done') {
        return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'El pedido aún no está confirmado (pago pendiente)'})};
      }
      const wantsInvoice = force || /AUTOFACTURA/i.test(note);
      if (!wantsInvoice) return {statusCode:200, headers, body: JSON.stringify({ok:true, skipped:true, reason:'El cliente no solicitó factura'})};
      const res = await facturarOrden(uid, id);
      // Si se generó la factura, enviarla por correo (XML + PDF) al cliente.
      if (res && res.ok && res.invoiceId) {
        try { await enviarFacturaCorreo(uid, id, res.invoiceId, folio); } catch(_){}
      }
      return {statusCode:200, headers, body: JSON.stringify(res)};
    }

    // ── PRECIOS DE PRUEBA: poner TODOS los productos a un precio (default $1) ──
    //  ⚠ Sobrescribe el list_price real. Solo para pruebas de pago.
    if (action === 'bulk_set_price') {
      const price = (body.price != null) ? parseFloat(body.price) : 1.0;
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      const idsText = await xmlrpc(uid, 'product.template', 'search',
        `<value><array><data><value><array><data>${xmlStr('sale_ok')}<value><string>=</string></value><value><boolean>1</boolean></value></data></array></value></data></array></value>`);
      const ids = (idsText.match(/<int>(\d+)<\/int>/g) || []).map(s => parseInt(s.replace(/\D/g,'')));
      if (!ids.length) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'No se encontraron productos', updated:0})};
      let updated = 0;
      for (let i = 0; i < ids.length; i += 200) {
        const batch = ids.slice(i, i + 200);
        const idsXml = batch.map(id => `<value><int>${id}</int></value>`).join('');
        const valXml = `<value><struct><member><name>list_price</name><value><double>${price.toFixed(2)}</double></value></member></struct></value>`;
        try {
          await xmlrpc(uid, 'product.template', 'write',
            `<value><array><data>${idsXml}</data></array></value>${valXml}`);
          updated += batch.length;
        } catch(e){ /* sigue */ }
      }
      return {statusCode:200, headers, body: JSON.stringify({ok:true, updated, price})};
    }

    // ── DIAGNÓSTICO: campos fiscales (CFDI/MX) disponibles en tu Odoo ──
    if (action === 'debug_fiscal_fields') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};
      const model = body.model || 'res.partner';
      const domain = `<value><array><data>${xmlStr('model')}<value><string>=</string></value>${xmlStr(model)}</data></array></value>`;
      const text = await odooSearchRead(uid, 'ir.model.fields', domain, ['name','field_description','ttype'], 400);
      const structs = text.match(/<struct>[\s\S]*?<\/struct>/g) || [];
      const fields = [];
      for (const st of structs) {
        const nm = xmlExtractField(st, 'name');
        if (/l10n_mx|vat|fiscal|cfdi|regime|usage/i.test(nm)) {
          fields.push({ name: nm, label: xmlExtractField(st, 'field_description'), type: xmlExtractField(st, 'ttype') });
        }
      }
      return {statusCode:200, headers, body: JSON.stringify({ok:true, model, fields})};
    }

    // ═══════════════════════════════════════════════════════════════
    //  PLATAFORMA DE ALMACÉN  (uso interno — surtido de pedidos)
    //  Trabaja sobre las ENTREGAS de Odoo (modelo stock.picking).
    //  El "dueño" de un pedido se guarda en el campo de texto `origin`
    //  con el prefijo [ALM:nombre] para no requerir usuarios de Odoo.
    // ═══════════════════════════════════════════════════════════════

    // Helper local: extrae el nombre del almacenista guardado en una nota
    function _almParseOwner(note){
      if(!note) return null;
      const m = String(note).match(/\[ALM:([^\]]+)\]/);
      return m ? m[1].trim() : null;
    }

    // ── LISTAR pedidos por surtir (entregas pendientes) ──
    if (action === 'almacen_listar_pedidos') {
      const uid = await odooAuth();
      if (!uid) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'odoo auth'})};

      // Dominio CORRECTO (mismo formato que las consultas que funcionan):
      // cada condición es UNA tupla <array> con [campo, operador, valor].
      // Filtramos: entregas salientes (picking_type_code='outgoing') que NO estén hechas ni canceladas.
      const domainXml = `<value><array><data>${xmlStr('picking_type_code')}<value><string>=</string></value>${xmlStr('outgoing')}</data></array></value>
        <value><array><data>${xmlStr('state')}<value><string>not in</string></value><value><array><data><value><string>done</string></value><value><string>cancel</string></value></data></array></value></data></array></value>`;

      let text = await odooSearchRead(uid, 'stock.picking', domainXml,
        ['id','name','origin','state','scheduled_date','partner_id','note'], 500);

      let structCount = (text.split('<struct>').length - 1);
      const hayFault = text.indexOf('<fault>') >= 0;

      if (hayFault) {
        let faultMsg = '';
        const fsMatch = text.match(/<name>faultString<\/name>\s*<value>\s*<string>([\s\S]*?)<\/string>/);
        if (fsMatch) faultMsg = fsMatch[1];
        const lines = faultMsg.split('\n').filter(l => l.trim());
        const errLine = lines.length ? lines[lines.length - 1] : '';
        console.error('[almacen] listar_pedidos fault:', errLine);
        return {statusCode:200, headers, body: JSON.stringify({
          ok:false, error:'odoo_fault', pedidos:[],
          _diag:{ fault:true, error_line: errLine }
        })};
      }

      // Parsear múltiples registros (split por <struct>)
      function extractField(struct, field){
        const tag = '<name>' + field + '</name>';
        const pos = struct.indexOf(tag);
        if (pos < 0) return '';
        const afterTag = struct.substring(pos + tag.length);
        const valStart = afterTag.indexOf('<value>');
        if (valStart < 0) return '';
        const inner = afterTag.substring(valStart + 7);
        const typeEnd = inner.indexOf('>');
        const firstChar = inner.charAt(0);
        let content = (firstChar === '<') ? inner.substring(typeEnd + 1) : inner;
        const end = content.indexOf('<');
        return end >= 0 ? content.substring(0, end).trim() : content.trim();
      }
      function extractMany2oneName(struct, field){
        const tag = '<name>' + field + '</name>';
        const pos = struct.indexOf(tag);
        if (pos < 0) return '';
        const after = struct.substring(pos);
        const strMatch = after.match(/<string>([^<]*)<\/string>/);
        return strMatch ? strMatch[1].trim() : '';
      }

      const pedidos = [];
      const parts = text.split('<struct>');
      for (let i = 1; i < parts.length; i++) {
        const struct = parts[i].split('</struct>')[0];
        const id = parseInt(extractField(struct, 'id'));
        if (id > 0) {
          const note = extractField(struct, 'note');
          pedidos.push({
            id,
            wh: extractField(struct, 'name'),
            origin: extractField(struct, 'origin'),
            estado_odoo: extractField(struct, 'state'),
            fecha: extractField(struct, 'scheduled_date'),
            cliente: extractMany2oneName(struct, 'partner_id'),
            owner: _almParseOwner(note)
          });
        }
      }
      return {statusCode:200, headers, body: JSON.stringify({ ok:true, pedidos })};
    }

    // ── DETALLE de un pedido (líneas a surtir con producto, cantidad, ubicación) ──
    if (action === 'almacen_detalle_pedido') {
      const pickingId = parseInt(body.picking_id);
      if (!pickingId) return {statusCode:400, headers, body: JSON.stringify({error:'picking_id requerido'})};
      const uid = await odooAuth();
      if (!uid) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'odoo auth'})};

      // Leer las líneas de movimiento (stock.move) de esta entrega
      const domainXml = `<value><array><data>${xmlStr('picking_id')}<value><string>=</string></value><value><int>${pickingId}</int></value></data></array></value>`;
      const text = await odooSearchRead(uid, 'stock.move', domainXml,
        ['id','product_id','product_uom_qty','location_id'], 50);

      function extractMany2oneName(struct, field){
        const tag = '<name>' + field + '</name>';
        const pos = struct.indexOf(tag);
        if (pos < 0) return '';
        const after = struct.substring(pos);
        const strMatch = after.match(/<string>([^<]*)<\/string>/);
        return strMatch ? strMatch[1].trim() : '';
      }
      function extractNum(struct, field){
        const tag = '<name>' + field + '</name>';
        const pos = struct.indexOf(tag);
        if (pos < 0) return 0;
        const after = struct.substring(pos);
        const m = after.match(/<double>([^<]*)<\/double>/) || after.match(/<int>([^<]*)<\/int>/);
        return m ? parseFloat(m[1]) : 0;
      }

      const lineas = [];
      const parts = text.split('<struct>');
      for (let i = 1; i < parts.length; i++) {
        const struct = parts[i].split('</struct>')[0];
        const prod = extractMany2oneName(struct, 'product_id');
        if (prod) {
          lineas.push({
            producto: prod,                              // "[AT-NR-...] Nombre"
            cantidad: extractNum(struct, 'product_uom_qty'),
            ubicacion: extractMany2oneName(struct, 'location_id')
          });
        }
      }
      return {statusCode:200, headers, body: JSON.stringify({ ok:true, lineas })};
    }

    // ── TOMAR un pedido (asignar almacenista) — con candado anti-duplicado ──
    if (action === 'almacen_tomar_pedido') {
      const pickingId = parseInt(body.picking_id);
      const almacenista = String(body.almacenista || '').trim();
      if (!pickingId || !almacenista) return {statusCode:400, headers, body: JSON.stringify({error:'picking_id y almacenista requeridos'})};
      const uid = await odooAuth();
      if (!uid) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'odoo auth'})};

      // 1) Leer la nota actual para ver si YA lo tomó alguien (candado)
      const readDomain = `<value><array><data>${xmlStr('id')}<value><string>=</string></value><value><int>${pickingId}</int></value></data></array></value>`;
      const readText = await odooSearchRead(uid, 'stock.picking', readDomain, ['id','note'], 1);
      const noteMatch = readText.match(/<name>\s*note\s*<\/name>\s*<value>\s*<string>([^<]*)<\/string>/);
      const currentNote = noteMatch ? noteMatch[1] : '';
      const currentOwner = _almParseOwner(currentNote);

      if (currentOwner && currentOwner !== almacenista) {
        // Ya lo tiene otro almacenista → rechazar (evita duplicados)
        return {statusCode:200, headers, body: JSON.stringify({ ok:false, ya_tomado:true, owner: currentOwner })};
      }

      // 2) Escribir el dueño en la nota (sin borrar lo demás que hubiera)
      const cleanNote = currentNote.replace(/\[ALM:[^\]]+\]/g, '').trim();
      const newNote = ('[ALM:' + almacenista + '] ' + cleanNote).trim();
      const writeArgs = `<value><array><data><value><int>${pickingId}</int></value></data></array></value>
        <value><struct><member><name>note</name>${xmlStr(newNote)}</member></struct></value>`;
      await xmlrpc(uid, 'stock.picking', 'write', writeArgs);

      return {statusCode:200, headers, body: JSON.stringify({ ok:true, owner: almacenista })};
    }

    // ── LIBERAR un pedido (quitar almacenista) ──
    if (action === 'almacen_liberar_pedido') {
      const pickingId = parseInt(body.picking_id);
      if (!pickingId) return {statusCode:400, headers, body: JSON.stringify({error:'picking_id requerido'})};
      const uid = await odooAuth();
      if (!uid) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'odoo auth'})};

      const readDomain = `<value><array><data>${xmlStr('id')}<value><string>=</string></value><value><int>${pickingId}</int></value></data></array></value>`;
      const readText = await odooSearchRead(uid, 'stock.picking', readDomain, ['id','note'], 1);
      const noteMatch = readText.match(/<name>\s*note\s*<\/name>\s*<value>\s*<string>([^<]*)<\/string>/);
      const currentNote = noteMatch ? noteMatch[1] : '';
      const cleanNote = currentNote.replace(/\[ALM:[^\]]+\]/g, '').trim();
      const writeArgs = `<value><array><data><value><int>${pickingId}</int></value></data></array></value>
        <value><struct><member><name>note</name>${xmlStr(cleanNote)}</member></struct></value>`;
      await xmlrpc(uid, 'stock.picking', 'write', writeArgs);
      return {statusCode:200, headers, body: JSON.stringify({ ok:true })};
    }

    // ── VALIDAR un pedido (confirmar surtido → descuenta stock en Odoo) ──
    if (action === 'almacen_validar_pedido') {
      const pickingId = parseInt(body.picking_id);
      const almacenista = String(body.almacenista || '').trim();
      if (!pickingId) return {statusCode:400, headers, body: JSON.stringify({error:'picking_id requerido'})};
      const uid = await odooAuth();
      if (!uid) return {statusCode:200, headers, body: JSON.stringify({ok:false, error:'odoo auth'})};

      // button_validate descuenta el stock y marca la entrega como 'done'.
      // Nota: si Odoo pide confirmar cantidades (backorder), puede devolver un wizard;
      // en ese caso se maneja en una segunda iteración según lo que devuelva.
      const validateArgs = `<value><array><data><value><int>${pickingId}</int></value></data></array></value>`;
      const valText = await xmlrpc(uid, 'stock.picking', 'button_validate', validateArgs).catch(e => 'ERR:' + e.message);

      const fault = valText.indexOf('<fault>') >= 0 || valText.indexOf('ERR:') === 0;
      return {statusCode:200, headers, body: JSON.stringify({
        ok: !fault,
        validado: !fault,
        almacenista: almacenista || null,
        detalle: fault ? valText.substring(0, 300) : 'ok'
      })};
    }

    // ── CREAR PAGO POR TRANSFERENCIA SPEI ──
    // Genera un pago "clabe" en Mercado Pago. Devuelve la CLABE/URL con instrucciones para
    // que el cliente transfiera. La orden queda en borrador y el webhook la confirma al acreditarse.
    if (action === 'crear_pago_spei') {
      const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
      const orden = body.orden || {};
      const payer = body.payer || {};   // { email, first_name, last_name }
      const items = Array.isArray(orden.items) ? orden.items : [];
      if (!items.length) {
        return {statusCode:400, headers, body: JSON.stringify({error:'Orden sin productos'})};
      }
      if (!payer.email) {
        return {statusCode:400, headers, body: JSON.stringify({error:'Falta el correo del comprador'})};
      }

      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      // Recalcular el monto REAL desde Odoo (seguridad)
      let serverSubtotal = 0;
      for (const it of items) {
        const code = it.at_code || it.code;
        const qty = Math.max(1, parseInt(it.qty) || 1);
        const prod = await lookupProductByCode(uid, code);
        if (!prod || !(prod.price > 0)) {
          return {statusCode:409, headers, body: JSON.stringify({ success:false, error:'Producto sin precio en sistema: ' + code + '. Contacta a un ejecutivo.' })};
        }
        serverSubtotal += prod.price * qty;
      }
      const envio = orden.checkout && orden.checkout.envio ? orden.checkout.envio : null;
      // Envío: revalidar contra Skydropx (no se confía en el monto del cliente).
      // El cobro real lo toma del amount_total de Odoo más abajo; serverTotal es el respaldo.
      let shipCost = 0;
      if (envio) {
        const rvShip = await resolveShipPrice(orden.checkout);
        if (!rvShip.ok) return {statusCode:200, headers, body: JSON.stringify({ success:false, error:rvShip.error, ship_revalidation_failed:true })};
        shipCost = rvShip.ship;
      }
      const serverTotal = Math.round((serverSubtotal + shipCost) * 100) / 100;

      const folio = String(orden.folio || ('PED-' + Date.now().toString(36).toUpperCase()));

      // Crear la orden en Odoo como borrador (el webhook la confirma cuando llegue la transferencia)
      try { await crearOrdenOdoo(uid, orden, 'draft', shipCost); } catch(_){}

      // Leer el TOTAL REAL de la orden en Odoo (amount_total ya trae el IVA según la config de
      // impuestos). El SPEI cobra EXACTAMENTE ese total, para que el pago coincida con la factura.
      let montoCobro = serverTotal;
      try {
        const odom = `<value><array><data>${xmlStr('client_order_ref')}<value><string>=</string></value>${xmlStr(folio)}</data></array></value>`;
        const ot = await odooSearchRead(uid, 'sale.order', odom, ['amount_total'], 1);
        const ost = (ot.match(/<struct>[\s\S]*?<\/struct>/) || [''])[0];
        const at = parseFloat(xmlExtractField(ost, 'amount_total'));
        if (at > 0) montoCobro = Math.round(at * 100) / 100;
      } catch(_){}

      // Aviso SOLO al equipo (pedido entrante pendiente de pago). Al cliente NO se le manda
      // correo todavía: lo recibirá cuando el pago se acredite (vía webhook).
      try { await enviarCorreosPedido(orden, folio, montoCobro, 'spei', 'pendiente', 'solo_equipo'); } catch(_){}

      // Crear el pago SPEI (clabe) en Mercado Pago
      const paymentBody = {
        transaction_amount: montoCobro,
        description: 'Adaptekk pedido ' + folio,
        payment_method_id: 'clabe',
        external_reference: folio,
        notification_url: (process.env.SITE_URL || SITE_URL) + '/.netlify/functions/mp-webhook',
        payer: {
          email: payer.email,
          entity_type: 'individual',
          first_name: payer.first_name || 'Cliente',
          last_name: payer.last_name || 'Adaptekk'
        }
      };

      // Generar CLABE dinámica en Mercado Pago. Si el monto es muy bajo u otro motivo,
      // igual reservamos el pedido (el cliente verá la opción de transferencia / contacto).
      let ticketUrl='', clabe='', banco='', referencia='', beneficiario='', expira='', paymentId=null, payStatus='pending';
      if (MP_TOKEN) {
        try {
          const mpResp = await fetch('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + MP_TOKEN,
              'Content-Type': 'application/json',
              'X-Idempotency-Key': folio + '-spei-' + Date.now()
            },
            body: JSON.stringify(paymentBody)
          });
          const pay = await mpResp.json();
          if (pay && pay.status) {
            payStatus = pay.status; paymentId = pay.id || null;
            try {
              const td = pay.transaction_details || {};
              const poi = pay.point_of_interaction || {};
              const tdata = poi.transaction_data || {};
              ticketUrl = td.external_resource_url || tdata.ticket_url || '';
              clabe = tdata.bank_transfer_id || tdata.financial_institution || tdata.clabe ||
                      (tdata.bank_info && (tdata.bank_info.clabe || tdata.bank_info.account_id)) ||
                      td.payment_method_reference_id || '';
              referencia = tdata.bank_transfer_id || pay.external_reference || '';
              beneficiario = (tdata.bank_info && tdata.bank_info.collector && tdata.bank_info.collector.account_holder_name) || '';
              banco = (tdata.bank_info && (tdata.bank_info.collector && tdata.bank_info.collector.long_name)) || '';
              expira = pay.date_of_expiration || '';
            } catch(_){}
          }
        } catch(_){}
      }

      // Respaldo: si no hay CLABE dinámica, usar la cuenta fija de la empresa (variables de entorno)
      if (!clabe && process.env.SPEI_CLABE) {
        clabe = process.env.SPEI_CLABE;
        if (!banco)        banco = process.env.SPEI_BANCO || '';
        if (!beneficiario) beneficiario = process.env.SPEI_BENEFICIARIO || '';
      }

      // Siempre exitoso: el pedido quedó reservado. La CLABE viene de MP o de la cuenta fija (env);
      // si no, el frontend muestra la cuenta fija de window.EMPRESA.banco.
      return {statusCode:200, headers, body: JSON.stringify({
        success: true,
        status: payStatus,
        payment_id: paymentId,
        folio: folio,
        monto: montoCobro,
        ticket_url: ticketUrl,
        clabe: clabe,
        banco: banco,
        referencia: referencia,
        beneficiario: beneficiario,
        expira: expira
      })};
    }

    // ── REGISTRAR PAGO POR TRANSFERENCIA (SPEI) ──
    // Recibe JSON con folio + comprobante en base64 y crea/marca la orden en Odoo "pago por validar".
    if (action === 'registrar_pago_transferencia') {
      const folio = String(body.folio || '').trim();
      if (!folio) return {statusCode:400, headers, body: JSON.stringify({error:'Folio requerido'})};

      // Revalidar comprobante server-side (el cliente ya validó, pero no confiamos)
      const comp = body.comprobante || null; // { name, type, size, data(base64) }
      if (comp) {
        const okTypes = ['image/jpeg','image/png','application/pdf'];
        if (comp.type && okTypes.indexOf(comp.type) === -1) {
          return {statusCode:415, headers, body: JSON.stringify({error:'Formato de comprobante no v\u00e1lido'})};
        }
        if (comp.size && comp.size > 5 * 1024 * 1024) {
          return {statusCode:413, headers, body: JSON.stringify({error:'Comprobante excede 5MB'})};
        }
      }

      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      // Crear la orden en Odoo (borrador → queda como "pago por validar" hasta confirmar el depósito)
      let saleId = null;
      if (body.orden && Array.isArray(body.orden.items) && body.orden.items.length) {
        const oc = await crearOrdenOdoo(uid, body.orden, 'draft');
        if (oc.ok) saleId = oc.saleId;
      }

      // Adjuntar comprobante en Odoo (ir.attachment) si viene en base64
      let attachmentId = null;
      try {
        if (comp && comp.data) {
          const createAttXml = `<value><struct>
            <member><name>name</name>${xmlStr('Comprobante ' + folio + ' - ' + (comp.name || 'transferencia'))}</member>
            <member><name>type</name>${xmlStr('binary')}</member>
            <member><name>datas</name>${xmlStr(comp.data)}</member>
            <member><name>res_model</name>${xmlStr('sale.order')}</member>
          </struct></value>`;
          const attText = await xmlrpc(uid, 'ir.attachment', 'create', createAttXml);
          const m = attText.match(/<value><int>(\d+)<\/int><\/value>/);
          attachmentId = m ? parseInt(m[1]) : null;
        }
      } catch(e) { /* adjuntar es best-effort, no bloquea el registro */ }

      // Notificar a gerencia para validar el pago manualmente (Fase 4 automatiza la orden en Odoo)
      try {
        await sendEmail(ADMIN_EMAIL,
          'Comprobante de transferencia recibido — ' + folio,
          `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
            <div style="background:#001F5B;padding:18px;text-align:center;">
              <span style="font-family:Arial Black;font-size:22px;color:#fff;">ADAP</span><span style="font-family:Arial Black;font-size:22px;color:#C8102E;">TEK</span><span style="font-family:Arial Black;font-size:22px;color:#fff;">K</span>
            </div>
            <div style="padding:24px;border:1px solid #eee;">
              <h3 style="color:#001F5B;margin-top:0;">Nuevo comprobante por validar</h3>
              <p>Folio: <b>${folio}</b></p>
              <p>Archivo: ${comp ? (comp.name || 'comprobante') : 'no adjunto'}</p>
              <p>Adjunto en Odoo (ir.attachment): ${attachmentId || 'no guardado'}</p>
              <p style="color:#888;font-size:13px;">Validar el dep\u00f3sito y liberar el pedido.</p>
            </div>
          </div>`
        );
      } catch(e) { /* email best-effort */ }

      return {statusCode:200, headers, body: JSON.stringify({
        success:true,
        folio: folio,
        sale_id: saleId,
        estado: 'pago-por-validar',
        attachment_id: attachmentId,
        mensaje: 'Comprobante recibido. Un ejecutivo validar\u00e1 el pago.'
      })};
    }

    return {statusCode:400, headers, body: JSON.stringify({error:'Unknown action: ' + action})};

  } catch(err) {
    return {statusCode:500, headers, body: JSON.stringify({error:'Function error', detail: err.message})};
  }
};
