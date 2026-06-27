export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  const ADMIN_PASS  = process.env.ADMIN_PASSWORD;

  const redis = async (...cmd) => {
    const r = await fetch(`${REDIS_URL}/${cmd.map(encodeURIComponent).join('/')}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    return r.json();
  };

  // ── GET — fetch all posts (public) ──────────────────────────────
  if (req.method === 'GET') {
    const res2 = await redis('LRANGE', 'blog:posts', '0', '49');
    const posts = (res2.result || []).map(p => {
      try { return JSON.parse(p); } catch { return null; }
    }).filter(Boolean);
    return res.status(200).json({ posts });
  }

  // Auth check for write operations
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${ADMIN_PASS}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── POST — create new post ───────────────────────────────────────
  if (req.method === 'POST') {
    const { title, subtitle, category, body, tags, bannerType, bannerMsg } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Title and body required.' });

    const slug = title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim().replace(/\s+/g, '-');

    const post = {
      id:         Date.now().toString(),
      slug,
      title,
      subtitle:   subtitle || '',
      category:   category || 'General',
      tags:       tags || [],
      body,
      bannerType: bannerType || '',
      bannerMsg:  bannerMsg  || '',
      date:       new Date().toISOString(),
    };

    await redis('LPUSH', 'blog:posts', JSON.stringify(post));
    return res.status(200).json({ success: true, slug });
  }

  // ── DELETE — remove a post by id ────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Post id required.' });
    const res2 = await redis('LRANGE', 'blog:posts', '0', '49');
    const posts = (res2.result || []).map(p => { try { return JSON.parse(p); } catch { return null; } }).filter(Boolean);
    const target = posts.find(p => p.id === id);
    if (!target) return res.status(404).json({ error: 'Post not found.' });
    await redis('LREM', 'blog:posts', '1', JSON.stringify(target));
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}