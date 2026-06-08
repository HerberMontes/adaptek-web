// Netlify Function — Proxy para Odoo API
// Esta función recibe peticiones del navegador y las reenvía a Odoo
// evitando el bloqueo CORS de Odoo Online (SaaS)

const ODOO_URL   = 'https://hydratechgroup.odoo.com';
const ODOO_DB    = 'hydratechgroup';
const ODOO_USER  = 'herber.montes@hydratechgroup.mx';
const ODOO_KEY   = '6bc9ab43df2c0320e90ef03fa660e1d5829e2532';

exports.handler = async function(event, context) {
  // Allow CORS from any origin (our own Netlify site)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action || 'search_products';

    // ── AUTHENTICATE with Odoo ──
    const authResp = await fetch(`${ODOO_URL}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'call', id: 1,
        params: { db: ODOO_DB, login: ODOO_USER, password: ODOO_KEY }
      })
    });
    const authData = await authResp.json();
    
    if (!authData.result || !authData.result.uid) {
      return {
        statusCode: 401, headers,
        body: JSON.stringify({ error: 'Odoo authentication failed', detail: authData.error })
      };
    }

    const session_id = authResp.headers.get('set-cookie') || '';
    const uid = authData.result.uid;

    // ── EXECUTE requested action ──
    let odooResp, odooData;

    if (action === 'search_products') {
      // Search products by AT code or description
      const query = body.query || '';
      odooResp = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': session_id },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'call', id: 2,
          params: {
            model: 'product.product',
            method: 'search_read',
            args: [[['name', 'ilike', query]]],
            kwargs: {
              fields: ['name', 'default_code', 'list_price', 'qty_available', 'description_sale'],
              limit: 20
            }
          }
        })
      });
      odooData = await odooResp.json();

    } else if (action === 'get_stock') {
      // Get stock for specific product
      const productId = body.product_id;
      odooResp = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': session_id },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'call', id: 3,
          params: {
            model: 'product.product',
            method: 'search_read',
            args: [[[' id', '=', productId]]],
            kwargs: { fields: ['name', 'qty_available', 'list_price'], limit: 1 }
          }
        })
      });
      odooData = await odooResp.json();

    } else if (action === 'create_sale_order') {
      // Create a sale order from quote
      const { customer_name, customer_email, customer_phone, items, notes } = body;
      
      // First find or create partner
      const partnerResp = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': session_id },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'call', id: 4,
          params: {
            model: 'res.partner',
            method: 'search_read',
            args: [[['email', '=', customer_email]]],
            kwargs: { fields: ['id', 'name'], limit: 1 }
          }
        })
      });
      odooData = await (await partnerResp).json();

    } else {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ error: 'Unknown action: ' + action })
      };
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, data: odooData.result, uid })
    };

  } catch (err) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Function error', detail: err.message })
    };
  }
};
