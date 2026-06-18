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

async function crearOrdenOdoo(uid, orden, estado) {
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

    // Línea de envío
    const SHIP = { express:0, estandar:0, economico:0 }; // envío sin costo por ahora (pendiente integrar paquetería real)
    const envio = co.envio || null;
    if (envio && SHIP[envio.id]) {
      total += SHIP[envio.id];
      const shipStruct = `<value><struct>
        <member><name>name</name>${xmlStr('Env\u00edo ' + (envio.name || envio.id))}</member>
        <member><name>product_uom_qty</name>${xmlInt(1)}</member>
        <member><name>price_unit</name><value><double>${SHIP[envio.id].toFixed(2)}</double></value></member>
      </struct></value>`;
      lineXmls.push(`<value><array><data>${xmlInt(0)}${xmlInt(0)}${shipStruct}</data></array></value>`);
    }

    if (!lineXmls.length) return { ok:false, error:'Ning\u00fan producto v\u00e1lido en Odoo' };

    const orderStruct = `<value><struct>
      <member><name>partner_id</name>${xmlInt(partnerId)}</member>
      <member><name>client_order_ref</name>${xmlStr(folio)}</member>
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
async function bumpMetric(kind) {
  const uid = await odooAuth(); if (!uid) return;
  const { id, data } = await getMetricsPartner(uid);
  if (kind === 'email') {
    const day = mxDay(), month = day.slice(0,7);
    if (data.emailDay !== day) { data.emailDay = day; data.emailDayCount = 0; }
    if (data.emailMonth !== month) { data.emailMonth = month; data.emailMonthCount = 0; }
    data.emailDayCount = (data.emailDayCount||0) + 1;
    data.emailMonthCount = (data.emailMonthCount||0) + 1;
  } else if (kind === 'noresult') {
    const month = mxDay().slice(0,7);
    if (data.noResultMonth !== month) { data.noResultMonth = month; data.noResultCount = 0; }
    data.noResultCount = (data.noResultCount||0) + 1;
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
      
      // DEBUG: log what we're sending
      console.log('=== PARTNER DATA BEING SENT ===');
      console.log(JSON.stringify(partnerData, null, 2));
      console.log('=== XML ARGS ===');
      console.log(createArgsXml.substring(0, 500));

      const createText = await xmlrpc(uid, 'res.partner', 'create', createArgsXml);
      
      console.log('=== ODOO RESPONSE ===');
      console.log(createText.substring(0, 500));
      
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
        console.log('Buscando CP:', cp);
        
        // Combinar resultados de múltiples APIs para mayor cobertura
        let colonias = new Set();
        let municipio = '';
        let estado = '';

        // API 1: COPOMEX — catálogo oficial SEPOMEX actualizado
        try {
          const r1 = await fetch('https://api.copomex.com/query/info_cp/' + cp + '?token=prueba');
          if (r1.ok) {
            const text1 = await r1.text();
            if (!text1.includes('<!DOCTYPE')) {
              const d1 = JSON.parse(text1);
              const items = Array.isArray(d1.response) ? d1.response : [d1.response];
              items.forEach(i => { if(i.asentamiento) colonias.add(i.asentamiento); });
              if (!municipio && items[0]) municipio = items[0].municipio || '';
              if (!estado && items[0]) estado = items[0].estado || '';
              console.log('copomex:', colonias.size, 'colonias');
            }
          }
        } catch(e1) { console.log('copomex err:', e1.message); }

        // API 2: zippopotam — complementa con más colonias
        try {
          const r2 = await fetch('https://api.zippopotam.us/mx/' + cp);
          if (r2.ok) {
            const d2 = await r2.json();
            if (d2.places) {
              d2.places.forEach(p => { if(p['place name']) colonias.add(p['place name']); });
              if (!estado && d2.places[0]) estado = d2.places[0].state || '';
              console.log('zippopotam:', colonias.size, 'total colonias');
            }
          }
        } catch(e2) { console.log('zippopotam err:', e2.message); }

        // API 3: sepomex.icalialabs.com — otra fuente complementaria
        try {
          const r3 = await fetch('https://sepomex.icalialabs.com/api/v1/zip_codes?zip_code=' + cp + '&per_page=200');
          if (r3.ok) {
            const text3 = await r3.text();
            if (!text3.includes('<!DOCTYPE')) {
              const d3 = JSON.parse(text3);
              (d3.zip_codes || []).forEach(z => { if(z.d_asenta) colonias.add(z.d_asenta); });
              if (!municipio && d3.zip_codes && d3.zip_codes[0]) municipio = d3.zip_codes[0].d_mnpio || '';
              if (!estado && d3.zip_codes && d3.zip_codes[0]) estado = d3.zip_codes[0].d_estado || '';
              console.log('sepomex:', colonias.size, 'total colonias');
            }
          }
        } catch(e3) { console.log('sepomex err:', e3.message); }

        const coloniasArr = [...colonias].sort();
        console.log('Total colonias combinadas:', coloniasArr.length, '| municipio:', municipio, '| estado:', estado);

        if (coloniasArr.length > 0) {
          return {statusCode:200, headers, body: JSON.stringify({
            success: true,
            colonias: coloniasArr,
            municipio: municipio,
            ciudad: municipio,
            estado: estado
          })};
        }

        return {statusCode:200, headers, body: JSON.stringify({success:false, error:'CP no encontrado'})};

      } catch(err) {
        console.log('buscar_cp exception:', err.message);
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
      try {
        const { data } = await getMetricsPartner(uid);
        const today = mxDay(), month = today.slice(0,7);
        email.day = (data.emailDay === today) ? (data.emailDayCount||0) : 0;
        email.month = (data.emailMonth === month) ? (data.emailMonthCount||0) : 0;
        noResult = (data.noResultMonth === month) ? (data.noResultCount||0) : 0;
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

      return {statusCode:200, headers, body: JSON.stringify({success:true, products:{total, thisMonth, series}, email, noResult})};
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
      console.log('AT prefijos a buscar:', prefixes);

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
        if (searchText.includes('<name>id</name>')) { console.log('Match con prefijo:', pfx); break; }
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

      console.log('Products found:', products.length);
      // ── Filtro de material: CS = sin -SS, SS = con -SS ──
      {
        const wantSS = (material === 'SS');
        const keep = products.filter(p => wantSS ? /-SS$/.test(p.at_code||'') : !/-SS$/.test(p.at_code||''));
        products.length = 0;
        for (const p of keep) products.push(p);
        console.log('Tras filtro material(' + material + '):', products.length);
      }
      if (products.length === 0 && searchText.length > 100) {
        console.log('Raw XML sample:', searchText.substring(0, 800));
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
        
        // Progress log every 50 products
        if (i % 50 === 0) console.log(`Progress: ${i}/${products.length} | updated:${updated} notFound:${notFound} errors:${errors}`);
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
      let pid = parseInt(body.partner_id) || 0;
      if (!pid && body.email) {
        const r = await odooSearchRead(uid, 'res.partner',
          `<value><array><data>${xmlStr('email')}<value><string>=ilike</string></value>${xmlStr(body.email)}</data></array></value>`, ['id'], 1);
        const m = r.match(/<int>(\d+)<\/int>/); if (m) pid = parseInt(m[1]);
      }
      if (!pid) return {statusCode:200, headers, body: JSON.stringify({found:false})};
      const clean = function(v){ return (v==='0' || v==='false' || v==null) ? '' : v; };
      const out = { found:true, partner_id:pid };
      const idDom = `<value><array><data>${xmlStr('id')}<value><string>=</string></value><value><int>${pid}</int></value></data></array></value>`;
      try {
        const r = await odooSearchRead(uid, 'res.partner', idDom, ['vat','zip','name'], 1);
        const st = (r.split('<struct>')[1]||'').split('</struct>')[0];
        out.vat = clean(xmlExtractField(st,'vat')); out.zip = clean(xmlExtractField(st,'zip')); out.name = xmlExtractField(st,'name');
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

      // Crear la orden en Odoo como borrador para que el webhook la confirme tras el pago
      const ordenCreada = await crearOrdenOdoo(uid, orden, 'draft');

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

      // Costo de envío validado contra catálogo fijo (no confiar en el monto del cliente)
      const SHIP = { express:0, estandar:0, economico:0 }; // envío sin costo por ahora (pendiente integrar paquetería real)
      const envio = orden.checkout && orden.checkout.envio ? orden.checkout.envio : null;
      const shipId = envio && SHIP[envio.id] ? envio.id : null;
      if (shipId) {
        mpItems.push({
          id: 'ENVIO-' + shipId,
          title: 'Env\u00edo ' + (envio.name || shipId),
          quantity: 1,
          currency_id: 'MXN',
          unit_price: SHIP[shipId]
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
            server_total: Math.round((serverSubtotal + (shipId ? SHIP[shipId] : 0)) * 100) / 100
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
      const SHIP = { express:0, estandar:0, economico:0 }; // envío sin costo por ahora (pendiente integrar paquetería real)
      const envio = orden.checkout && orden.checkout.envio ? orden.checkout.envio : null;
      const shipId = envio && SHIP[envio.id] ? envio.id : null;
      const serverTotal = Math.round((serverSubtotal + (shipId ? SHIP[shipId] : 0)) * 100) / 100;

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
          try { ordenInfo = await crearOrdenOdoo(uid, orden, 'confirm'); } catch(e){ ordenInfo = {ok:false, error:e.message}; }
          // Enviar correos de confirmación (al cliente y al equipo). No bloquea la respuesta si fallan.
          try { await enviarCorreosPedido(orden, folio, serverTotal, 'tarjeta', 'aprobado'); } catch(_){}
        } else if (status === 'in_process' || status === 'pending') {
          try { ordenInfo = await crearOrdenOdoo(uid, orden, 'draft'); } catch(e){ ordenInfo = {ok:false, error:e.message}; }
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
      const text = await odooSearchRead(uid, 'sale.order', domain, ['name','client_order_ref','date_order','state','amount_total','order_line'], 50);
      const structs = text.match(/<struct>[\s\S]*?<\/struct>/g) || [];
      const orders = [];
      for (const st of structs) {
        let items = 0;
        const olm = st.match(/<name>\s*order_line\s*<\/name>\s*<value>\s*<array>\s*<data>([\s\S]*?)<\/data>/);
        if (olm) items = (olm[1].match(/<int>/g) || []).length;
        orders.push({
          name: xmlExtractField(st, 'name'),
          folio: xmlExtractField(st, 'client_order_ref'),
          date: xmlExtractField(st, 'date_order'),
          state: xmlExtractField(st, 'state'),
          total: parseFloat(xmlExtractField(st, 'amount_total')) || 0,
          items: items
        });
      }
      orders.sort((a,b)=> (b.date||'').localeCompare(a.date||''));
      return {statusCode:200, headers, body: JSON.stringify({ok:true, orders})};
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
      if (!MP_TOKEN) {
        return {statusCode:200, headers, body: JSON.stringify({ success:false, error:'Mercado Pago no configurado (falta MP_ACCESS_TOKEN)' })};
      }
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
      const SHIP = { express:0, estandar:0, economico:0 }; // envío sin costo por ahora (pendiente integrar paquetería real)
      const envio = orden.checkout && orden.checkout.envio ? orden.checkout.envio : null;
      const shipId = envio && SHIP[envio.id] ? envio.id : null;
      const serverTotal = Math.round((serverSubtotal + (shipId ? SHIP[shipId] : 0)) * 100) / 100;

      const folio = String(orden.folio || ('PED-' + Date.now().toString(36).toUpperCase()));

      // Crear la orden en Odoo como borrador (el webhook la confirma cuando llegue la transferencia)
      try { await crearOrdenOdoo(uid, orden, 'draft'); } catch(_){}
      // Aviso SOLO al equipo (pedido entrante pendiente de pago). Al cliente NO se le manda
      // correo todavía: lo recibirá cuando el pago se acredite (vía webhook).
      try { await enviarCorreosPedido(orden, folio, serverTotal, 'spei', 'pendiente', 'solo_equipo'); } catch(_){}

      // Crear el pago SPEI (clabe) en Mercado Pago
      const paymentBody = {
        transaction_amount: serverTotal,
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

        if (!pay.status) {
          return {statusCode:200, headers, body: JSON.stringify({
            success:false,
            error: (pay.message || 'Mercado Pago rechazó la solicitud SPEI') +
                   (pay.cause && pay.cause[0] ? ' ('+(pay.cause[0].description||pay.cause[0].code)+')' : ''),
            folio: folio
          })};
        }

        // Extraer la URL del comprobante y, si vienen, los datos de la CLABE para mostrarlos en la página
        let ticketUrl = '';
        let clabe = '';
        let banco = '';
        let referencia = '';
        let beneficiario = '';
        let expira = '';
        try {
          const td = pay.transaction_details || {};
          const poi = pay.point_of_interaction || {};
          const tdata = poi.transaction_data || {};
          ticketUrl = td.external_resource_url || tdata.ticket_url || '';
          // La CLABE puede venir en distintos lugares según la cuenta/versión de la API
          clabe = tdata.bank_transfer_id || tdata.financial_institution || tdata.clabe ||
                  (tdata.bank_info && (tdata.bank_info.clabe || tdata.bank_info.account_id)) ||
                  td.payment_method_reference_id || '';
          referencia = tdata.bank_transfer_id || pay.external_reference || '';
          beneficiario = (tdata.bank_info && tdata.bank_info.collector && tdata.bank_info.collector.account_holder_name) || '';
          banco = (tdata.bank_info && (tdata.bank_info.collector && tdata.bank_info.collector.long_name)) || '';
          expira = pay.date_of_expiration || '';
        } catch(_){}

        return {statusCode:200, headers, body: JSON.stringify({
          success: true,
          status: pay.status,         // normalmente "pending"
          payment_id: pay.id || null,
          folio: folio,
          monto: serverTotal,
          ticket_url: ticketUrl,      // URL con la CLABE e instrucciones (respaldo)
          clabe: clabe,               // CLABE para transferir (si la API la expone)
          banco: banco,
          referencia: referencia,
          beneficiario: beneficiario,
          expira: expira
        })};
      } catch(e) {
        return {statusCode:502, headers, body: JSON.stringify({success:false, error:'Error al generar el pago SPEI', detail:e.message})};
      }
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
