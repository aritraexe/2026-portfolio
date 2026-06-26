export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  const redis = async (cmd) => {
    const r = await fetch(`${REDIS_URL}/${cmd.map(encodeURIComponent).join('/')}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    return r.json();
  };

  // Get visitor IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || '8.8.8.8';

  // Geo lookup
  let lat = null, lon = null, country = 'Unknown', city = 'Unknown';
  try {
    const geo = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,lat,lon`);
    const g = await geo.json();
    if (g.status === 'success') {
      lat = g.lat; lon = g.lon;
      country = g.country; city = g.city;
    }
  } catch (_) {}

  // Increment total visit counter
  const countRes = await redis(['INCR', 'portfolio:visits']);
  const count = countRes.result;

  // Store visitor pin (keep last 100 unique locations)
  if (lat && lon) {
    const pin = JSON.stringify({ lat, lon, country, city, ts: Date.now() });
    await redis(['LPUSH', 'portfolio:pins', pin]);
    await redis(['LTRIM', 'portfolio:pins', '0', '99']);
  }

  return res.status(200).json({ count, lat, lon, country, city });
}
