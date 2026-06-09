const ODOO_URL   = 'https://hydratechgroup.odoo.com';
const ODOO_DB    = 'hydratechgroup';
const ODOO_USER  = 'herber.montes@hydratechgroup.mx';
const ODOO_KEY   = 'c7928b95a94f5ba9e6c124ba06c610160c2352bc';
const RESEND_KEY = 're_5K17NUmB_8ufhqW5tYTR72dN7gy3ZQJhS';
const FROM_EMAIL = 'validaciones@adaptekk.com';
const SITE_URL   = 'https://cheery-fenglisu-0daf09.netlify.app';

// ── Odoo XML-RPC auth ──
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

// ── Odoo XML-RPC execute ──
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

function xmlStr(v) { return `<value><string>${String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</string></value>`; }
function xmlInt(v) { return `<value><int>${parseInt(v)||0}</int></value>`; }

// ── Generate 6-digit OTP ──
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Send email via Resend ──
async function sendEmail(to, subject, html) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `Adaptekk <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html
    })
  });
  return await resp.json();
}

// ── OTP store (in-memory, resets on cold start) ──
// For production use Redis/Netlify Blobs
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
      const { email, name } = body;
      if (!email) return {statusCode:400, headers, body: JSON.stringify({error:'Email requerido'})};

      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      // Check if email already registered in Odoo
      const checkText = await xmlrpc(uid, 'res.partner', 'search',
        `<value><array><data><value><array><data>
          <value><array><data>
            ${xmlStr('email')}<value><string>=</string></value>${xmlStr(email)}
          </data></array></value>
        </data></array></value></data></array></value>`
      );
      const existMatch = checkText.match(/<value><int>(\d+)<\/int><\/value>/);
      if (existMatch) {
        return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Este correo ya está registrado. ¿Quieres iniciar sesión?'})};
      }

      // Generate OTP
      const otp = generateOTP();
      const expires = Date.now() + 15 * 60 * 1000; // 15 min
      otpStore[email] = { otp, expires };

      // Send verification email
      const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
          <div style="background:#001F5B;padding:24px;text-align:center;">
            <span style="font-family:Arial Black,Arial;font-size:28px;font-weight:900;color:#fff;">ADAP</span><span style="font-family:Arial Black,Arial;font-size:28px;font-weight:900;color:#C8102E;">TEK</span><span style="font-family:Arial Black,Arial;font-size:28px;font-weight:900;color:#fff;">K</span>
          </div>
          <div style="padding:32px;background:#fff;border:1px solid #eee;">
            <h2 style="color:#001F5B;margin-top:0;">Verifica tu correo electrónico</h2>
            <p style="color:#555;">Hola <strong>${name||'cliente'}</strong>, usa este código para confirmar tu registro:</p>
            <div style="background:#f4f8ff;border:2px solid #001F5B;border-radius:10px;padding:24px;text-align:center;margin:24px 0;">
              <span style="font-size:42px;font-weight:900;letter-spacing:12px;color:#001F5B;">${otp}</span>
            </div>
            <p style="color:#888;font-size:13px;">Este código expira en <strong>15 minutos</strong>. Si no solicitaste este registro, ignora este correo.</p>
          </div>
          <div style="background:#f5f5f5;padding:16px;text-align:center;font-size:11px;color:#aaa;">
            © 2026 Adaptekk S.A. de C.V. — Conecta sin límites
          </div>
        </div>`;

      const emailResult = await sendEmail(email, 'Tu código de verificación Adaptekk', emailHtml);

      if (emailResult.id) {
        return {statusCode:200, headers, body: JSON.stringify({success:true, message:'Código enviado a ' + email})};
      } else {
        return {statusCode:200, headers, body: JSON.stringify({success:false, error:'No se pudo enviar el correo', detail: emailResult})};
      }
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
        return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Código incorrecto. Verifica e intenta de nuevo.'})};
      }
      delete otpStore[email];
      return {statusCode:200, headers, body: JSON.stringify({success:true, message:'Email verificado correctamente'})};
    }

    // ── CREATE CONTACT IN ODOO ──
    if (action === 'create_contact') {
      const { name, email, phone, company, rfc, razon_social, cp_fiscal, regimen_fiscal, email_fiscal } = body;

      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      // Check duplicate email
      const checkEmail = await xmlrpc(uid, 'res.partner', 'search',
        `<value><array><data><value><array><data>
          <value><array><data>${xmlStr('email')}<value><string>=</string></value>${xmlStr(email)}</data></array></value>
        </data></array></value></data></array></value>`
      );
      if (checkEmail.match(/<value><int>(\d+)<\/int><\/value>/)) {
        return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Este correo ya está registrado'})};
      }

      // Check duplicate RFC
      if (rfc) {
        const checkRFC = await xmlrpc(uid, 'res.partner', 'search',
          `<value><array><data><value><array><data>
            <value><array><data>${xmlStr('vat')}<value><string>=</string></value>${xmlStr(rfc)}</data></array></value>
          </data></array></value></data></array></value>`
        );
        if (checkRFC.match(/<value><int>(\d+)<\/int><\/value>/)) {
          return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Este RFC ya está registrado en Adaptekk'})};
        }
      }

      // Build partner fields
      let fields = `<value><struct>
        <member><name>name</name>${xmlStr(razon_social || name)}</member>
        <member><name>email</name>${xmlStr(email)}</member>
        <member><name>phone</name>${xmlStr(phone)}</member>
        <member><name>customer_rank</name>${xmlInt(1)}</member>
        <member><name>active</name><value><boolean>1</boolean></value></member>
        <member><name>comment</name>${xmlStr('Registro Adaptekk Web | Contacto: ' + name + ' | Estado: Pendiente aprobación')}</member>`;

      if (company) fields += `<member><name>company_name</name>${xmlStr(company)}</member>`;
      if (rfc) {
        fields += `<member><name>vat</name>${xmlStr(rfc)}</member>`;
        fields += `<member><name>zip</name>${xmlStr(cp_fiscal)}</member>`;
        fields += `<member><name>l10n_mx_edi_fiscal_regime</name>${xmlStr(regimen_fiscal)}</member>`;
      }
      fields += `</struct></value>`;

      const createText = await xmlrpc(uid, 'res.partner', 'create', fields);
      const idMatch = createText.match(/<value><int>(\d+)<\/int><\/value>/);
      const partnerId = idMatch ? parseInt(idMatch[1]) : null;

      if (partnerId) {
        // Send welcome email
        const welcomeHtml = `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
            <div style="background:#001F5B;padding:24px;text-align:center;">
              <span style="font-family:Arial Black,Arial;font-size:28px;font-weight:900;color:#fff;">ADAP</span><span style="font-family:Arial Black,Arial;font-size:28px;font-weight:900;color:#C8102E;">TEK</span><span style="font-family:Arial Black,Arial;font-size:28px;font-weight:900;color:#fff;">K</span>
            </div>
            <div style="padding:32px;background:#fff;border:1px solid #eee;">
              <h2 style="color:#001F5B;">¡Bienvenido a Adaptekk, ${name}!</h2>
              <p style="color:#555;">Tu registro fue recibido exitosamente. Un ejecutivo revisará tu cuenta y te notificará en menos de <strong>24 horas hábiles</strong>.</p>
              <div style="background:#f4f8ff;border-left:4px solid #001F5B;padding:16px;margin:20px 0;border-radius:4px;">
                <p style="margin:0;color:#001F5B;font-weight:600;">Mientras tanto puedes:</p>
                <ul style="color:#555;margin:8px 0 0;">
                  <li>Explorar nuestro catálogo de conectores</li>
                  <li>Usar el configurador de conectores hidráulicos</li>
                  <li>Contactarnos por WhatsApp para cualquier duda</li>
                </ul>
              </div>
              <a href="${SITE_URL}" style="display:block;background:#C8102E;color:#fff;text-align:center;padding:14px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:20px;">Ir a Adaptekk →</a>
            </div>
            <div style="background:#f5f5f5;padding:16px;text-align:center;font-size:11px;color:#aaa;">
              © 2026 Adaptekk S.A. de C.V. — Conecta sin límites
            </div>
          </div>`;

        await sendEmail(email, '¡Bienvenido a Adaptekk! Tu registro está en revisión', welcomeHtml);

        // Notify admin
        const adminHtml = `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;">
            <h2 style="color:#001F5B;">🆕 Nuevo registro en Adaptekk</h2>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888;width:140px;">Nombre:</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">${name}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888;">Email:</td><td style="padding:8px;border-bottom:1px solid #eee;">${email}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888;">Teléfono:</td><td style="padding:8px;border-bottom:1px solid #eee;">${phone||'—'}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888;">Empresa:</td><td style="padding:8px;border-bottom:1px solid #eee;">${company||'—'}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888;">RFC:</td><td style="padding:8px;border-bottom:1px solid #eee;">${rfc||'—'}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888;">Razón Social:</td><td style="padding:8px;border-bottom:1px solid #eee;">${razon_social||'—'}</td></tr>
              <tr><td style="padding:8px;color:#888;">Odoo ID:</td><td style="padding:8px;font-weight:600;color:#001F5B;">#${partnerId}</td></tr>
            </table>
            <a href="https://hydratechgroup.odoo.com/web#id=${partnerId}&model=res.partner" style="display:block;background:#001F5B;color:#fff;text-align:center;padding:12px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:20px;">Ver en Odoo →</a>
          </div>`;

        await sendEmail('herber.montes@hydratechgroup.mx', '🆕 Nuevo registro Adaptekk — ' + name, adminHtml);

        return {statusCode:200, headers, body: JSON.stringify({success:true, partner_id: partnerId})};
      }

      return {statusCode:200, headers, body: JSON.stringify({success:false, error:'No se pudo crear el contacto'})};
    }

    // ── SEARCH PRODUCTS ──
    if (action === 'search_products') {
      const uid = await odooAuth();
      const query = body.query || '';
      const text = await xmlrpc(uid, 'product.product', 'search_read',
        `<value><array><data><value><array><data>
          <value><array><data>${xmlStr('name')}<value><string>ilike</string></value>${xmlStr(query)}</data></array></value>
        </data></array></value></data></array></value>`
      );
      return {statusCode:200, headers, body: JSON.stringify({success:true, raw: text.substring(0,1000)})};
    }

    return {statusCode:400, headers, body: JSON.stringify({error:'Unknown action: ' + action})};

  } catch(err) {
    return {statusCode:500, headers, body: JSON.stringify({error:'Function error', detail: err.message})};
  }
};
