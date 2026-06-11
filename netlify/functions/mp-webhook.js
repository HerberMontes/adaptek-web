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
const ODOO_USER = process.env.ODOO_USER || '';
const ODOO_KEY  = process.env.ODOO_API_KEY || '';
const MP_TOKEN  = process.env.MP_ACCESS_TOKEN || '';

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

    if (!folio) return { statusCode:200, body:'sin folio' };

    const uid = await odooAuth();
    if (!uid) return { statusCode:200, body:'odoo auth fail' };

    // Buscar la orden por su referencia (client_order_ref = folio)
    const domainXml = `<value><array><data><value><array><data>
      ${xmlStr('client_order_ref')}<value><string>=</string></value>${xmlStr(folio)}
    </data></array></value></data></array></value>`;
    const searchXml = `${domainXml}<value><array><data>
      <value><string>id</string></value><value><string>state</string></value>
    </data></array></value>`;
    const found = await odooExec(uid, 'sale.order', 'search_read', searchXml);
    const idMatch = found.match(/<name>id<\/name><value><int>(\d+)<\/int><\/value>/);
    const saleId = idMatch ? parseInt(idMatch[1]) : null;

    const nota = `Mercado Pago: pago ${paymentId} estado "${status}" (folio ${folio}).`;

    if (status === 'approved') {
      if (saleId) {
        // Confirmar la orden existente
        await odooExec(uid, 'sale.order', 'action_confirm',
          `<value><array><data><value><int>${saleId}</int></value></data></array></value>`);
        await odooExec(uid, 'sale.order', 'message_post_wrap_or_note', '').catch(()=>{});
      }
      // (Fase 4) si no existe la orden, crearla aquí desde los datos del pago.
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
