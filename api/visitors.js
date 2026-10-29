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

  const [countRes, pinsRes] = await Promise.all([
    redis(['GET', 'portfolio:visits']),
    redis(['LRANGE', 'portfolio:pins', '0', '99']),
  ]);

  const count = parseInt(countRes.result || '0', 10);
  const pins  = (pinsRes.result || []).map(p => {
    try { return JSON.parse(p); } catch { return null; }
  }).filter(Boolean);

  // Deduplicate by rounded coordinates and retain the visit total for each marker.
  const locationKey = p => `${Math.round(p.lat * 10)},${Math.round(p.lon * 10)}`;
  const visitCounts = new Map();
  pins.forEach(p => {
    const key = locationKey(p);
    visitCounts.set(key, (visitCounts.get(key) || 0) + 1);
  });

  const seen = new Set();
  const unique = pins.filter(p => {
    const key = locationKey(p);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  const locations = unique.map(p => ({ ...p, visits: visitCounts.get(locationKey(p)) }));

  return res.status(200).json({ count, pins: locations });
}
