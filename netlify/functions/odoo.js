const ODOO_URL  = 'https://hydratechgroup.odoo.com';
const ODOO_DB   = 'hydratechgroup';
const ODOO_USER = 'herber.montes@hydratechgroup.mx';
const ODOO_KEY  = 'c7928b95a94f5ba9e6c124ba06c610160c2352bc';

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

function xmlVal(v) {
  if (v === null || v === undefined || v === '') return '<value><boolean>0</boolean></value>';
  if (typeof v === 'number') return `<value><int>${v}</int></value>`;
  return `<value><string>${String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</string></value>`;
}

async function xmlrpc(uid, model, method, args) {
  const xml = `<?xml version="1.0"?>
<methodCall><methodName>execute_kw</methodName><params>
  <param>${xmlVal(ODOO_DB)}</param>
  <param>${xmlVal(uid)}</param>
  <param>${xmlVal(ODOO_KEY)}</param>
  <param>${xmlVal(model)}</param>
  <param>${xmlVal(method)}</param>
  <param><value><array><data>${args}</data></array></value></param>
  <param><value><struct></struct></value></param>
</params></methodCall>`;
  const resp = await fetch(`${ODOO_URL}/xmlrpc/2/object`, {
    method: 'POST', headers: {'Content-Type':'text/xml'}, body: xml
  });
  return await resp.text();
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
    const uid = await odooAuth();
    if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

    if (body.action === 'create_contact') {
      const { name, email, phone, company, rfc, razon_social, cp_fiscal, regimen_fiscal, email_fiscal } = body;

      // Check if email already exists
      const checkXml = `<value><array><data><value><array><data>
        <value><array><data>
          <value><string>email</string></value>
          <value><string>=</string></value>
          <value><string>${email}</string></value>
        </data></array></value>
      </data></array></value></data></array></value>`;
      const checkText = await xmlrpc(uid, 'res.partner', 'search', checkXml);
      if (checkText.match(/<value><int>(\d+)<\/int><\/value>/)) {
        return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Este email ya está registrado'})};
      }

      // Build partner fields
      let fields = `<value><struct>
        <member><name>name</name>${xmlVal(razon_social || name)}</member>
        <member><name>email</name>${xmlVal(email)}</member>
        <member><name>phone</name>${xmlVal(phone)}</member>
        <member><name>customer_rank</name><value><int>1</int></value></member>
        <member><name>comment</name>${xmlVal('Registro desde Adaptek Web | Nombre contacto: ' + name)}</member>`;

      if (company) fields += `<member><name>company_name</name>${xmlVal(company)}</member>`;

      // Fiscal data
      if (rfc) {
        fields += `<member><name>vat</name>${xmlVal(rfc)}</member>`;
        fields += `<member><name>zip</name>${xmlVal(cp_fiscal)}</member>`;
        // l10n_mx_edi fields for Finkok/CFDI
        fields += `<member><name>l10n_mx_edi_fiscal_regime</name>${xmlVal(regimen_fiscal)}</member>`;
        if (email_fiscal && email_fiscal !== email) {
          fields += `<member><name>l10n_mx_edi_pac_status</name>${xmlVal('none')}</member>`;
        }
      }

      fields += `</struct></value>`;

      const createText = await xmlrpc(uid, 'res.partner', 'create', fields);
      const idMatch = createText.match(/<value><int>(\d+)<\/int><\/value>/);
      const partnerId = idMatch ? parseInt(idMatch[1]) : null;

      if (partnerId) {
        return {statusCode:200, headers, body: JSON.stringify({success:true, partner_id: partnerId})};
      }
      return {statusCode:200, headers, body: JSON.stringify({success:false, error:'No se pudo crear el contacto', detail: createText.substring(0,300)})};

    } else if (body.action === 'search_products') {
      const query = body.query || '';
      const searchXml = `<value><array><data><value><array><data>
        <value><array><data>
          <value><string>name</string></value>
          <value><string>ilike</string></value>
          <value><string>${query}</string></value>
        </data></array></value>
      </data></array></value></data></array></value>`;
      const text = await xmlrpc(uid, 'product.product', 'search_read', searchXml);
      return {statusCode:200, headers, body: JSON.stringify({success:true, uid, raw: text.substring(0,1000)})};

    } else {
      return {statusCode:400, headers, body: JSON.stringify({error:'Unknown action: ' + body.action})};
    }

  } catch(err) {
    return {statusCode:500, headers, body: JSON.stringify({error:'Function error', detail: err.message})};
  }
};
