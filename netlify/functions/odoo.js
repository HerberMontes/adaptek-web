// Netlify Function — Proxy para Odoo API
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

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action || 'search_products';

    // Authenticate with Odoo
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

    const cookie = authResp.headers.get('set-cookie') || '';
    const uid = authData.result.uid;

    // Execute action
    let odooData;

    if (action === 'search_products') {
      const query = body.query || '';
      const resp = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'call', id: 2,
          params: {
            model: 'product.product',
            method: 'search_read',
            args: [[['name', 'ilike', query]]],
            kwargs: {
              fields: ['name', 'default_code', 'list_price', 'qty_available'],
              limit: 20
            }
          }
        })
      });
      odooData = await resp.json();

    } else if (action === 'get_stock') {
      const productId = body.product_id;
      const resp = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
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
      odooData = await resp.json();

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
