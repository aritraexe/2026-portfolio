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

  // Deduplicate by rounding coords to 1 decimal
  const seen = new Set();
  const unique = pins.filter(p => {
    const key = `${Math.round(p.lat * 10)},${Math.round(p.lon * 10)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  return res.status(200).json({ count, pins: unique });
}
