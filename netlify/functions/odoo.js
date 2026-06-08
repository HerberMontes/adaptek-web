// Netlify Function — Proxy para Odoo API usando XML-RPC con API Key
const ODOO_URL  = 'https://hydratechgroup.odoo.com';
const ODOO_DB   = 'hydratechgroup';
const ODOO_USER = 'herber.montes@hydratechgroup.mx';
const ODOO_KEY  = 'c7928b95a94f5ba9e6c124ba06c610160c2352bc';

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
    const action = body.action || 'search_products';

    // Step 1: Get UID via XML-RPC common (API key auth)
    const authXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>${ODOO_DB}</string></value></param>
    <param><value><string>${ODOO_USER}</string></value></param>
    <param><value><string>${ODOO_KEY}</string></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`;

    const authResp = await fetch(`${ODOO_URL}/xmlrpc/2/common`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: authXml
    });
    const authText = await authResp.text();

    // Parse UID from XML response
    const uidMatch = authText.match(/<value><int>(\d+)<\/int><\/value>/);
    if (!uidMatch) {
      return {
        statusCode: 401, headers,
        body: JSON.stringify({ error: 'Odoo auth failed', detail: authText.substring(0, 200) })
      };
    }
    const uid = parseInt(uidMatch[1]);

    // Step 2: Execute model method via XML-RPC object
    const query = body.query || '';
    const execXml = `<?xml version="1.0"?>
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
      <member><name>fields</name><value><array><data>
        <value><string>name</string></value>
        <value><string>default_code</string></value>
        <value><string>list_price</string></value>
        <value><string>qty_available</string></value>
      </data></array></value></member>
      <member><name>limit</name><value><int>20</int></value></member>
    </struct></value></param>
  </params>
</methodCall>`;

    const execResp = await fetch(`${ODOO_URL}/xmlrpc/2/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: execXml
    });
    const execText = await execResp.text();

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, uid, raw: execText.substring(0, 500) })
    };

  } catch (err) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Function error', detail: err.message })
    };
  }
};
