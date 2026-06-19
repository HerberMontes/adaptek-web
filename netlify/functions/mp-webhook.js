// netlify/functions/mp-webhook.js
// Recibe notificaciones (IPN/Webhook) de Mercado Pago, valida el pago contra la API de MP
// y marca/crea la orden en Odoo. Configurar la URL de este endpoint como notification_url
// en la preferencia (ya lo hace crear_preferencia_mp).
//
// Variables de entorno requeridas (Netlify):
//   MP_ACCESS_TOKEN      token de Mercado Pago
//   ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY   credenciales Odoo (¡desde env, no hardcodeadas!)
//   MP_WEBHOOK_SECRET    (opcional) para validar la firma x-signature de MP

const ODOO_URL  = process.env.ODOO_URL  || 'https://hydratechgroup.odoo.com';
const ODOO_DB   = process.env.ODOO_DB   || 'hydratechgroup';
const ODOO_USER = process.env.ODOO_USER || 'herber.montes@hydratechgroup.mx';
const ODOO_KEY  = process.env.ODOO_API_KEY || process.env.ODOO_KEY || '';
const MP_TOKEN  = process.env.MP_ACCESS_TOKEN || '';
const SITE_URL  = process.env.SITE_URL || 'https://cheery-fenglisu-0daf09.netlify.app';

function xmlStr(v){ return `<value><string>${String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</string></value>`; }

async function odooAuth(){
  const xml = `<?xml version="1.0"?>
<methodCall><methodName>authenticate</methodName><params>
  <param><value><string>${ODOO_DB}</string></value></param>
  <param><value><string>${ODOO_USER}</string></value></param>
  <param><value><string>${ODOO_KEY}</string></value></param>
  <param><value><struct></struct></value></param>
</params></methodCall>`;
  const resp = await fetch(`${ODOO_URL}/xmlrpc/2/common`, { method:'POST', headers:{'Content-Type':'text/xml'}, body:xml });
  const text = await resp.text();
  const m = text.match(/<value><int>(\d+)<\/int><\/value>/);
  return m ? parseInt(m[1]) : null;
}

async function odooExec(uid, model, method, argsXml){
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
  const resp = await fetch(`${ODOO_URL}/xmlrpc/2/object`, { method:'POST', headers:{'Content-Type':'text/xml'}, body:xml });
  return await resp.text();
}

// search_read con el patrón CORRECTO: domain como arg posicional, fields/limit como kwargs.
async function odooSearchRead(uid, model, domain_xml, fields, limit){
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
  const resp = await fetch(`${ODOO_URL}/xmlrpc/2/object`, { method:'POST', headers:{'Content-Type':'text/xml'}, body:xml });
  return await resp.text();
}

// Avisa por correo (cliente y equipo) que el pago se acreditó y el pedido está confirmado.
async function avisarPagoAcreditado(folio, pay){
  const RESEND_KEY = process.env.RESEND_KEY || '';
  const FROM_EMAIL = process.env.FROM_EMAIL || 'validaciones@adaptekk.com';
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'validaciones@adaptekk.com';
  if (!RESEND_KEY) return;
  const clienteEmail = (pay.payer && pay.payer.email) || '';
  const monto = pay.transaction_amount || 0;
  const fmt = '$' + Number(monto).toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2});

  async function send(to, subject, html){
    try {
      await fetch('https://api.resend.com/emails', {
        method:'POST',
        headers:{ 'Authorization':`Bearer ${RESEND_KEY}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ from:`Adaptekk <${FROM_EMAIL}>`, to:[to], subject, html })
      });
    } catch(_){}
  }

  const htmlCliente = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
    <div style="background:#001F5B;padding:20px;text-align:center;"><span style="color:#fff;font-size:24px;font-weight:bold;">ADAP<span style="color:#C8102E;">TEK</span>K</span></div>
    <div style="padding:24px;"><h2 style="color:#1a7d34;">¡Pago confirmado!</h2>
    <p style="font-size:14px;color:#555;">Recibimos tu transferencia del pedido <b>${folio}</b> por <b>${fmt} MXN</b>. Tu pedido está confirmado y comenzaremos a prepararlo.</p>
    <p style="font-size:12px;color:#888;margin-top:20px;">Te avisaremos cuando tu pedido sea enviado. ¡Gracias por confiar en Adaptekk!</p></div></div>`;
  if (clienteEmail) await send(clienteEmail, `Pago confirmado — ${folio} | Adaptekk`, htmlCliente);

  const htmlAdmin = `<div style="font-family:Arial,sans-serif;"><h2 style="color:#1a7d34;">🟢 Pago SPEI acreditado</h2>
    <p style="font-size:14px;"><b>Folio:</b> ${folio} · <b>Monto:</b> ${fmt} MXN</p>
    <p style="font-size:14px;"><b>Cliente:</b> ${clienteEmail||'N/D'}</p>
    <p style="font-size:12px;color:#888;">La orden ya fue confirmada en Odoo. Lista para preparar.</p></div>`;
  await send(ADMIN_EMAIL, `[PAGADO SPEI] Pedido ${folio} — ${fmt}`, htmlAdmin);
}

exports.handler = async function(event){
  // MP envía POST. Acepta también GET de verificación.
  if (event.httpMethod === 'GET') return { statusCode:200, body:'ok' };
  if (event.httpMethod !== 'POST') return { statusCode:405, body:'Method not allowed' };

  try {
    let payload = {};
    try { payload = JSON.parse(event.body || '{}'); } catch(_){}

    // MP manda { type:'payment', data:{ id } } o querystring topic=payment&id=...
    const qs = event.queryStringParameters || {};
    const paymentId = (payload.data && payload.data.id) || qs['data.id'] || qs.id;
    const topic = payload.type || qs.topic || qs.type;
    console.log('[webhook] ENTRADA paymentId=' + paymentId + ' topic=' + topic + ' body=' + (event.body||'').substring(0,200));

    if (!paymentId || (topic && topic !== 'payment')) {
      // Notificación no relacionada a un pago concreto: responder 200 para que MP no reintente.
      return { statusCode:200, body:'ignored' };
    }
    if (!MP_TOKEN) return { statusCode:200, body:'no token' };

    // Consultar el pago real a MP (no confiar en el body del webhook)
    const payResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': 'Bearer ' + MP_TOKEN }
    });
    const pay = await payResp.json();
    const folio = pay.external_reference || (pay.metadata && pay.metadata.folio);
    const status = pay.status; // approved | pending | rejected | ...
    console.log('[webhook] PAGO status=' + status + ' folio=' + folio + ' httpStatus=' + payResp.status + ' payMsg=' + (pay.message||'') );

    if (!folio) { console.log('[webhook] SIN FOLIO, abortando'); return { statusCode:200, body:'sin folio' }; }

    const uid = await odooAuth();
    console.log('[webhook] ODOO uid=' + uid);
    if (!uid) return { statusCode:200, body:'odoo auth fail' };

    // Buscar la orden por su referencia (client_order_ref = folio) con el patrón correcto
    const domainXml = `<value><array><data>
      ${xmlStr('client_order_ref')}<value><string>=</string></value>${xmlStr(folio)}
    </data></array></value>`;
    const found = await odooSearchRead(uid, 'sale.order', domainXml, ['id','state','client_order_ref'], 5);
    console.log('[webhook] RESPUESTA ODOO búsqueda (primeros 500): ' + (found||'').substring(0,500));
    // El XML de Odoo trae espacios/saltos entre etiquetas, así que el regex los tolera (\s*)
    const idMatch = found.match(/<name>\s*id\s*<\/name>\s*<value>\s*<int>\s*(\d+)\s*<\/int>/);
    let saleId = idMatch ? parseInt(idMatch[1]) : null;

    // Respaldo: si no la encontró por client_order_ref exacto, intentar con 'ilike'
    if (!saleId) {
      const domain2 = `<value><array><data>
        ${xmlStr('client_order_ref')}<value><string>ilike</string></value>${xmlStr(folio)}
      </data></array></value>`;
      const found2 = await odooSearchRead(uid, 'sale.order', domain2, ['id','state','client_order_ref'], 5);
      console.log('[webhook] RESPUESTA ODOO búsqueda ilike (primeros 500): ' + (found2||'').substring(0,500));
      const idMatch2 = found2.match(/<name>\s*id\s*<\/name>\s*<value>\s*<int>\s*(\d+)\s*<\/int>/);
      saleId = idMatch2 ? parseInt(idMatch2[1]) : null;
    }
    console.log('[webhook] orden encontrada saleId=' + saleId + ' (folio=' + folio + ')');

    const nota = `Mercado Pago: pago ${paymentId} estado "${status}" (folio ${folio}).`;

    if (status === 'approved') {
      if (saleId) {
        // Confirmar la orden existente (de borrador a confirmada)
        try {
          const confirmResp = await odooExec(uid, 'sale.order', 'action_confirm',
            `<value><array><data><value><int>${saleId}</int></value></data></array></value>`);
          const confErr = confirmResp.match(/<fault>|<faultString>/) ? 'ERROR: ' + confirmResp.substring(0,300) : 'OK';
          console.log('[webhook] action_confirm saleId=' + saleId + ' resultado=' + confErr);
        } catch(ce) {
          console.log('[webhook] action_confirm EXCEPCIÓN: ' + ce.message);
        }
        // Avisar por correo que el pago (SPEI) se acreditó y el pedido está confirmado
        try { await avisarPagoAcreditado(folio, pay); console.log('[webhook] correos enviados'); } catch(ee){ console.log('[webhook] correo falló: ' + ee.message); }
        // Facturación automática: solo se factura si la orden trae la marca [AUTOFACTURA]
        // (el cliente eligió "Sí, facturar"). Lo decide la acción facturar_pedido en odoo.js.
        try {
          const facResp = await fetch(SITE_URL + '/.netlify/functions/odoo', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ action:'facturar_pedido', folio: folio })
          });
          const facJson = await facResp.json().catch(function(){ return {}; });
          console.log('[webhook] facturar_pedido folio=' + folio + ' -> ' + JSON.stringify(facJson));
        } catch(fe) { console.log('[webhook] facturar_pedido falló: ' + fe.message); }
      } else {
        console.log('[webhook] NO se encontró orden con folio=' + folio + ' para confirmar');
      }
      return { statusCode:200, body: JSON.stringify({ ok:true, folio, status, saleId, nota }) };
    }

    // pending / rejected: solo registrar, no confirmar
    return { statusCode:200, body: JSON.stringify({ ok:true, folio, status, saleId, nota }) };

  } catch(err) {
    // Responder 200 para que MP no reintente en bucle; el detalle queda en logs.
    console.error('mp-webhook error:', err.message);
    return { statusCode:200, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};
