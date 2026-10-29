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

  const requestUrl = new URL(req.url || 'http://localhost', 'http://localhost');
  const visitorId = requestUrl.searchParams.get('visitorId') || req.headers['x-visitor-id'] || req.query?.visitorId || null;

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

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let shouldCount = true;

  if (visitorId) {
    const lastSeenRes = await redis(['GET', `portfolio:visitor:${visitorId}`]);
    const lastSeen = parseInt(lastSeenRes.result || '0', 10);
    if (lastSeen && now - lastSeen < dayMs) {
      shouldCount = false;
    }
  }

  const countRes = await redis(['GET', 'portfolio:visits']);
  let count = parseInt(countRes.result || '0', 10);

  if (shouldCount) {
    const incrementRes = await redis(['INCR', 'portfolio:visits']);
    count = parseInt(incrementRes.result || '0', 10);
    if (visitorId) {
      await redis(['SET', `portfolio:visitor:${visitorId}`, String(now)]);
    }
  }

  // Store visitor pin (keep last 100 unique locations) only when counting a new daily visit
  if (shouldCount && lat && lon) {
    const pin = JSON.stringify({ lat, lon, country, city, ts: now });
    await redis(['LPUSH', 'portfolio:pins', pin]);
    await redis(['LTRIM', 'portfolio:pins', '0', '99']);
  }

  return res.status(200).json({ count, lat, lon, country, city, counted: shouldCount });
}
