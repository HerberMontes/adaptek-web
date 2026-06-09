const ODOO_URL   = 'https://hydratechgroup.odoo.com';
const ODOO_DB    = 'hydratechgroup';
const ODOO_USER  = 'herber.montes@hydratechgroup.mx';
const ODOO_KEY   = 'c7928b95a94f5ba9e6c124ba06c610160c2352bc';
const RESEND_KEY = 're_5K17NUmB_8ufhqW5tYTR72dN7gy3ZQJhS';
const FROM_EMAIL = 'validaciones@adaptekk.com';
const ADMIN_EMAIL = 'validaciones@adaptekk.com';
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

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendEmail(to, subject, html) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `Adaptekk <${FROM_EMAIL}>`, to: [to], subject, html })
  });
  return await resp.json();
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
      const { email, name } = body;
      if (!email) return {statusCode:400, headers, body: JSON.stringify({error:'Email requerido'})};

      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      const checkText = await xmlrpc(uid, 'res.partner', 'search',
        `<value><array><data><value><array><data>
          <value><array><data>${xmlStr('email')}<value><string>=</string></value>${xmlStr(email)}</data></array></value>
        </data></array></value></data></array></value>`
      );
      if (hasResults(checkText)) {
        return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Este correo ya está registrado. ¿Quieres iniciar sesión?'})};
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

    // ── CREATE CONTACT IN ODOO ──
    if (action === 'create_contact') {
      const { name, email, phone, company, rfc, razon_social, cp_fiscal, regimen_fiscal, email_fiscal, calle, colonia, ciudad, estado, constancia_b64, constancia_name } = body;

      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      // Check duplicate email
      const checkEmail = await xmlrpc(uid, 'res.partner', 'search',
        `<value><array><data><value><array><data>
          <value><array><data>${xmlStr('email')}<value><string>=</string></value>${xmlStr(email)}</data></array></value>
        </data></array></value></data></array></value>`
      );
      if (hasResults(checkEmail)) {
        return {statusCode:200, headers, body: JSON.stringify({success:false, error:'Este correo ya está registrado'})};
      }

      // Check duplicate RFC
      if (rfc) {
        const checkRFC = await xmlrpc(uid, 'res.partner', 'search',
          `<value><array><data><value><array><data>
            <value><array><data>${xmlStr('vat')}<value><string>=</string></value>${xmlStr(rfc)}</data></array></value>
          </data></array></value></data></array></value>`
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

      // Fiscal data — only if RFC provided
      if (rfc) {
        partnerData.vat                        = rfc;
        partnerData.l10n_mx_edi_fiscal_regime  = regimen_fiscal || '';
      }
      // Fiscal address
      if (cp_fiscal)  partnerData.zip    = cp_fiscal;
      if (calle)      partnerData.street = calle + (colonia ? ', ' + colonia : '');
      if (ciudad)     partnerData.city   = ciudad;
      if (estado)     partnerData.state_name = estado;

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

        const adminResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(emailPayload)
        });
        await adminResp.json();

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

        return {statusCode:200, headers, body: JSON.stringify({success:true, partner_id: partnerId})};
      }

      return {statusCode:200, headers, body: JSON.stringify({
        success:false, 
        error:'No se pudo crear el contacto en Odoo',
        debug: createText.substring(0, 300)
      })};
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
