// Netlify Function — Proxy para Odoo API
const ODOO_URL  = 'https://hydratechgroup.odoo.com';
const ODOO_DB   = 'hydratechgroup';
const ODOO_USER = 'herber.montes@hydratechgroup.mx';
const ODOO_KEY  = 'c7928b95a94f5ba9e6c124ba06c610160c2352bc';

async function odooAuth() {
  const xml = `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>${ODOO_DB}</string></value></param>
    <param><value><string>${ODOO_USER}</string></value></param>
    <param><value><string>${ODOO_KEY}</string></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`;
  const resp = await fetch(`${ODOO_URL}/xmlrpc/2/common`, {
    method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: xml
  });
  const text = await resp.text();
  const match = text.match(/<value><int>(\d+)<\/int><\/value>/);
  return match ? parseInt(match[1]) : null;
}

async function odooExecute(uid, model, method, args, kwargs) {
  const argsXml = JSON.stringify(args);
  const kwargsXml = JSON.stringify(kwargs);
  const resp = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: 1,
      params: {
        model, method,
        args,
        kwargs: { ...kwargs, context: {} }
      }
    })
  });
  // Note: for XML-RPC object endpoint we need session cookie
  // Instead use JSON-RPC with API key as password via session auth
  return await resp.json();
}

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action;

    // Authenticate via XML-RPC
    const uid = await odooAuth();
    if (!uid) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Odoo auth failed' }) };
    }

    if (action === 'create_contact') {
      // Create partner in Odoo
      const { name, email, phone, company } = body;

      // Check if partner already exists
      const checkXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${ODOO_DB}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${ODOO_KEY}</string></value></param>
    <param><value><string>res.partner</string></value></param>
    <param><value><string>search</string></value></param>
    <param><value><array><data>
      <value><array><data>
        <value><array><data>
          <value><string>email</string></value>
          <value><string>=</string></value>
          <value><string>${email}</string></value>
        </data></array></value>
      </data></array></value>
    </data></array></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`;

      const checkResp = await fetch(`${ODOO_URL}/xmlrpc/2/object`, {
        method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: checkXml
      });
      const checkText = await checkResp.text();
      const existMatch = checkText.match(/<value><int>(\d+)<\/int><\/value>/);

      if (existMatch) {
        return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: 'Este email ya está registrado' }) };
      }

      // Create new partner
      const createXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${ODOO_DB}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${ODOO_KEY}</string></value></param>
    <param><value><string>res.partner</string></value></param>
    <param><value><string>create</string></value></param>
    <param><value><array><data>
      <value><struct>
        <member><name>name</name><value><string>${name}</string></value></member>
        <member><name>email</name><value><string>${email}</string></value></member>
        <member><name>phone</name><value><string>${phone}</string></value></member>
        <member><name>company_name</name><value><string>${company||''}</string></value></member>
        <member><name>customer_rank</name><value><int>1</int></value></member>
        <member><name>comment</name><value><string>Registro desde Adaptek Web</string></value></member>
      </struct></value>
    </data></array></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`;

      const createResp = await fetch(`${ODOO_URL}/xmlrpc/2/object`, {
        method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: createXml
      });
      const createText = await createResp.text();
      const idMatch = createText.match(/<value><int>(\d+)<\/int><\/value>/);
      const partnerId = idMatch ? parseInt(idMatch[1]) : null;

      if (partnerId) {
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, partner_id: partnerId, message: 'Contacto creado en Odoo' }) };
      } else {
        return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: 'No se pudo crear el contacto', detail: createText.substring(0,200) }) };
      }

    } else if (action === 'search_products') {
      const query = body.query || '';
      const searchXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${ODOO_DB}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${ODOO_KEY}</string></value></param>
    <param><value><string>product.product</string></value></param>
    <param><value><string>search_read</string></value></param>
    <param><value><array><data>
      <value><array><data>
        <value><array><data>
          <value><string>name</string></value>
          <value><string>ilike</string></value>
          <value><string>${query}</string></value>
        </data></array></value>
      </data></array></value>
    </data></array></value></param>
    <param><value><struct>
      <member><name>limit</name><value><int>20</int></value></member>
    </struct></value></param>
  </params>
</methodCall>`;
      const resp = await fetch(`${ODOO_URL}/xmlrpc/2/object`, {
        method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: searchXml
      });
      const text = await resp.text();
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, uid, raw: text.substring(0,1000) }) };

    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action: ' + action }) };
    }

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Function error', detail: err.message }) };
  }
};
