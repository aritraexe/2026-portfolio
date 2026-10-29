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

  const [countRes, pinsRes, locationsRes] = await Promise.all([
    redis(['GET', 'portfolio:visits']),
    redis(['LRANGE', 'portfolio:pins', '0', '99']),
    redis(['HGETALL', 'portfolio:location-visits']),
  ]);

  const count = parseInt(countRes.result || '0', 10);
  const pins  = (pinsRes.result || []).map(p => {
    try { return JSON.parse(p); } catch { return null; }
  }).filter(Boolean);

  // Deduplicate by rounding coords to 1 decimal
  const seen = new Set();
  const unique = pins.filter(p => {
    const key = `${Math.round(p.lat * 10)},${Math.round(p.lon * 10)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  const locations = [];
  const locationEntries = locationsRes.result || [];
  for (let i = 0; i + 1 < locationEntries.length; i += 2) {
    try {
      const [city, country] = JSON.parse(locationEntries[i]);
      locations.push({
        city,
        country,
        count: parseInt(locationEntries[i + 1], 10) || 0,
      });
    } catch {}
  }
  locations.sort((a, b) => b.count - a.count);

  return res.status(200).json({ count, pins: unique, locations });
}
