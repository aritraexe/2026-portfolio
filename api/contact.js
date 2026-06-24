export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  // Get sender IP (Vercel passes real IP via x-forwarded-for)
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'Unknown';

  const userAgent = req.headers['user-agent'] || 'Unknown';
  const timestamp = new Date().toUTCString();

  // Lookup IP details via ip-api (free, no key needed)
  let ipInfo = {};
  try {
    const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp,org,query`);
    ipInfo = await geoRes.json();
  } catch (_) {
    ipInfo = { status: 'fail' };
  }

  const location = ipInfo.status === 'success'
    ? `${ipInfo.city}, ${ipInfo.regionName}, ${ipInfo.country}`
    : 'Could not resolve';
  const isp = ipInfo.isp || 'Unknown';
  const org = ipInfo.org || 'Unknown';

  const htmlBody = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#0d0d0c;color:#e8e6e1;border-radius:8px;overflow:hidden;">

      <div style="padding:28px 32px;border-bottom:1px solid #252422;">
        <p style="margin:0;font-size:11px;font-family:monospace;color:#7a7870;letter-spacing:0.08em;text-transform:uppercase;">New contact form submission</p>
        <h2 style="margin:8px 0 0;font-size:20px;font-weight:600;color:#e8e6e1;">Message from ${name}</h2>
      </div>

      <div style="padding:28px 32px;border-bottom:1px solid #252422;">
        <p style="margin:0 0 6px;font-size:11px;font-family:monospace;color:#7a7870;letter-spacing:0.08em;text-transform:uppercase;">Message</p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#c8c6c1;">${message.replace(/\n/g, '<br/>')}</p>
      </div>

      <div style="padding:28px 32px;border-bottom:1px solid #252422;">
        <p style="margin:0 0 14px;font-size:11px;font-family:monospace;color:#7a7870;letter-spacing:0.08em;text-transform:uppercase;">Sender Details</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:6px 0;color:#7a7870;width:90px;font-family:monospace;font-size:11px;">NAME</td><td style="padding:6px 0;color:#e8e6e1;">${name}</td></tr>
          <tr><td style="padding:6px 0;color:#7a7870;font-family:monospace;font-size:11px;">EMAIL</td><td style="padding:6px 0;"><a href="mailto:${email}" style="color:#e8e6e1;">${email}</a></td></tr>
        </table>
      </div>

      <div style="padding:28px 32px;border-bottom:1px solid #252422;background:#0a0a09;">
        <p style="margin:0 0 14px;font-size:11px;font-family:monospace;color:#7a7870;letter-spacing:0.08em;text-transform:uppercase;">🔍 IP Intelligence</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:6px 0;color:#7a7870;width:110px;font-family:monospace;font-size:11px;">IP ADDRESS</td><td style="padding:6px 0;color:#e8e6e1;font-family:monospace;">${ip}</td></tr>
          <tr><td style="padding:6px 0;color:#7a7870;font-family:monospace;font-size:11px;">LOCATION</td><td style="padding:6px 0;color:#e8e6e1;">${location}</td></tr>
          <tr><td style="padding:6px 0;color:#7a7870;font-family:monospace;font-size:11px;">ISP</td><td style="padding:6px 0;color:#e8e6e1;">${isp}</td></tr>
          <tr><td style="padding:6px 0;color:#7a7870;font-family:monospace;font-size:11px;">ORG</td><td style="padding:6px 0;color:#e8e6e1;">${org}</td></tr>
          <tr><td style="padding:6px 0;color:#7a7870;font-family:monospace;font-size:11px;">BROWSER</td><td style="padding:6px 0;color:#e8e6e1;font-size:11px;">${userAgent}</td></tr>
          <tr><td style="padding:6px 0;color:#7a7870;font-family:monospace;font-size:11px;">SENT AT</td><td style="padding:6px 0;color:#e8e6e1;">${timestamp}</td></tr>
        </table>
      </div>

      <div style="padding:20px 32px;">
        <p style="margin:0;font-size:11px;color:#555350;font-family:monospace;">Sent via your portfolio contact form · Reply directly to ${email}</p>
      </div>

    </div>
  `;

  try {
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Portfolio Contact <onboarding@resend.dev>',
        to: ['aritrasome404@gmail.com'],
        reply_to: email,
        subject: `New message from ${name}`,
        html: htmlBody,
      }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.json();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Failed to send email.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
}
