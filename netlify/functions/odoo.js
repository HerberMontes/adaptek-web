const ODOO_URL   = 'https://hydratechgroup.odoo.com';
const ODOO_DB    = 'hydratechgroup';
const ODOO_USER  = 'herber.montes@hydratechgroup.mx';
const ODOO_KEY   = 'c7928b95a94f5ba9e6c124ba06c610160c2352bc';
const RESEND_KEY = 're_5K17NUmB_8ufhqW5tYTR72dN7gy3ZQJhS';
const FROM_EMAIL = 'validaciones@adaptekk.com';
const ADMIN_EMAIL = 'validaciones@adaptekk.com'; // Gerencia — recibe todo
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

      const searchXml = `<value><array><data><value><array><data>
        <value><array><data>${xmlStr('customer_rank')}<value><string>&gt;</string></value>${xmlInt(0)}</data></array></value>
      </data></array></value></data></array></value>`;

      const text = await xmlrpc(uid, 'res.partner', 'search_read', searchXml +
        `<value><struct>
          <member><name>fields</name><value><array><data>
            <value><string>id</string></value>
            <value><string>name</string></value>
            <value><string>email</string></value>
            <value><string>phone</string></value>
            <value><string>company_name</string></value>
            <value><string>vat</string></value>
            <value><string>zip</string></value>
            <value><string>street</string></value>
            <value><string>city</string></value>
            <value><string>l10n_mx_edi_fiscal_regime</string></value>
            <value><string>comment</string></value>
          </data></array></value></member>
          <member><name>limit</name><value><int>100</int></value></member>
          <member><name>order</name><value><string>id desc</string></value></member>
        </struct></value>`
      );

      // Parse XML response into JSON array
      const clients = [];
      const memberRegex = /<struct>([\s\S]*?)<\/struct>/g;
      let match;
      while ((match = memberRegex.exec(text)) !== null) {
        const struct = match[1];
        const getVal = (field) => {
          const m = struct.match(new RegExp('<name>' + field + '<\/name>\s*<value>(?:<(?:string|int|boolean)>)?([^<]*)', 'i'));
          return m ? m[1].trim() : '';
        };
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
    if (action === 'save_user_pass') {
      const { user_key, new_pass, gerencia_pass } = body;
      // Verify gerencia password
      if (gerencia_pass !== 'adaptekk2026') {
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
        `<value><array><data><value><array><data>
          <value><array><data>${xmlStr('name')}<value><string>=</string></value>${xmlStr('ADAPTEKK_CONFIG')}</data></array></value>
        </data></array></value></data></array></value>`
      );
      const idMatch = searchText.match(/<value><int>(\d+)<\/int><\/value>/);

      // Load current config
      let passes = {};
      if (idMatch) {
        const readText = await xmlrpc(uid, 'res.partner', 'read',
          `<value><array><data><value><int>${idMatch[1]}</int></value></data></array></value>
           <value><struct><member><name>fields</name><value><array><data>
             <value><string>comment</string></value>
           </data></array></value></member></struct></value>`
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
      if (gerencia_pass !== 'adaptekk2026') {
        return {statusCode:401, headers, body: JSON.stringify({error:'No autorizado'})};
      }
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      const searchText = await xmlrpc(uid, 'res.partner', 'search',
        `<value><array><data><value><array><data>
          <value><array><data>${xmlStr('name')}<value><string>=</string></value>${xmlStr('ADAPTEKK_CONFIG')}</data></array></value>
        </data></array></value></data></array></value>`
      );
      const idMatch = searchText.match(/<value><int>(\d+)<\/int><\/value>/);
      if (!idMatch) return {statusCode:200, headers, body: JSON.stringify({success:true, passes:{}})};

      const readText = await xmlrpc(uid, 'res.partner', 'read',
        `<value><array><data><value><int>${idMatch[1]}</int></value></data></array></value>
         <value><struct><member><name>fields</name><value><array><data>
           <value><string>comment</string></value>
         </data></array></value></member></struct></value>`
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
      const { tipo, std_a, gen_a, med_a, std_b, gen_b, med_b } = body;
      const uid = await odooAuth();
      if (!uid) return {statusCode:401, headers, body: JSON.stringify({error:'Odoo auth failed'})};

      const tipoMap = {'NR':'NR','C90':'C90','C45':'C45','TEE':'TEE','TAP':'TAP'};
      const tipoCode = tipoMap[tipo] || 'NR';
      const genA = gen_a === 'M' ? 'M' : 'H';
      const genB = gen_b === 'M' ? 'M' : 'H';

      // Build all possible AT codes for this combination
      // For straight connectors (NR): order doesn't matter - generate all 4 combinations
      // For others: both orders still possible
      const extA = `${std_a}-${genA}${med_a}`;
      const extB = std_b ? `${std_b}-${genB}${med_b}` : '';

      const candidates = new Set();
      // Primary order
      candidates.add(`AT-${tipoCode}-${extA}${extB ? '-'+extB : ''}`);
      // Reversed order
      if (extB && extA !== extB) {
        candidates.add(`AT-${tipoCode}-${extB}-${extA}`);
      }
      // Also try with different gender combinations (sometimes H/M swapped in catalog)
      const genAalt = genA === 'M' ? 'H' : 'M';
      const genBalt = genB === 'M' ? 'H' : 'M';
      candidates.add(`AT-${tipoCode}-${std_a}-${genAalt}${med_a}${extB ? '-'+extB : ''}`);
      if (extB) {
        candidates.add(`AT-${tipoCode}-${extA}-${std_b}-${genBalt}${med_b}`);
        candidates.add(`AT-${tipoCode}-${std_b}-${genBalt}${med_b}-${extA}`);
        candidates.add(`AT-${tipoCode}-${std_b}-${genBalt}${med_b}-${std_a}-${genAalt}${med_a}`);
      }

      const atCode = `AT-${tipoCode}-${extA}${extB ? '-'+extB : ''}`;
      const candArray = Array.from(candidates);
      console.log('Searching AT codes:', candArray);

      // Search sequentially for each candidate until found
      async function searchByCode(code) {
        const domainXml = `<value><array><data>
          ${xmlStr('default_code')}<value><string>=</string></value>${xmlStr(code)}
        </data></array></value>`;
        return await odooSearchRead(uid, 'product.product', domainXml,
          ['id','name','default_code','list_price','qty_available','description_sale'], 5);
      }

      // Try each candidate code until we find a match
      let searchText = '';
      for (const code of candArray) {
        console.log('Trying:', code);
        searchText = await searchByCode(code);
        // Check if we got results
        const testMatch = searchText.includes('<name>id</name>');
        if (testMatch) {
          console.log('Found with code:', code);
          break;
        }
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
      if (products.length === 0 && searchText.length > 100) {
        console.log('Raw XML sample:', searchText.substring(0, 800));
      }

      // If no exact match, check if AT code exists in catalog (qty=0 = fabricado)
      if (products.length === 0) {
        // Search by partial code
        const partialXml = `<value><array><data><value><array><data>
          <value><array><data>
            ${xmlStr('default_code')}<value><string>like</string></value>
            ${xmlStr('AT-' + tipoCode + '-' + std_a)}
          </data></array></value>
        </data></array></value></data></array></value>`;

        const partialText = await xmlrpc(uid, 'product.product', 'search_read',
          partialXml + `<value><struct>
            <member><name>fields</name><value><array><data>
              <value><string>id</string></value>
              <value><string>name</string></value>
              <value><string>default_code</string></value>
              <value><string>qty_available</string></value>
            </data></array></value></member>
            <member><name>limit</name><value><int>5</int></value></member>
          </struct></value>`
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
        at_code: atCode
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
