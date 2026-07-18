export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const REDIS_URL    = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN  = process.env.UPSTASH_REDIS_REST_TOKEN;
  const ADMIN_PASS   = process.env.ADMIN_PASSWORD;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO  = process.env.GITHUB_REPO;

  const redis = async (...cmd) => {
    const r = await fetch(
      `${REDIS_URL}/${cmd.map(encodeURIComponent).join('/')}`,
      { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } }
    );
    return r.json();
  };

  async function getAllPosts() {
    const r = await redis('LRANGE', 'blog:posts', '0', '99');
    return (r.result || [])
      .map(p => { try { return JSON.parse(p); } catch { return null; } })
      .filter(Boolean);
  }

  async function syncToGitHub(posts) {
    if (!GITHUB_TOKEN || !GITHUB_REPO) return;
    const filePath = 'blog/posts.json';
    const apiBase  = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
    const headers  = {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent':   'xenon-portfolio',
    };
    let sha = null;
    try {
      const existing = await fetch(apiBase, { headers });
      if (existing.ok) { const d = await existing.json(); sha = d.sha; }
    } catch (_) {}
    const content = Buffer.from(JSON.stringify(posts, null, 2), 'utf8').toString('base64');
    await fetch(apiBase, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `backup: update posts.json [${new Date().toISOString()}]`,
        content,
        ...(sha ? { sha } : {}),
      }),
    });
  }

  // ── GET — public ────────────────────────────────────────────────
  if (req.method === 'GET') {
    const posts = await getAllPosts();
    return res.status(200).json({ posts });
  }

  // ── Auth check ──────────────────────────────────────────────────
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${ADMIN_PASS}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── POST — create ───────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body || {};

    // Ping — just verify auth, do nothing
    if (body.__ping || body.__test) {
      return res.status(200).json({ success: true });
    }

    const { title, subtitle, category, body: postBody, tags, bannerType, bannerMsg } = body;
    if (!title || !postBody) {
      return res.status(400).json({ error: 'Title and body required.' });
    }

    const slug = title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

    const post = {
      id:         Date.now().toString(),
      slug,
      title,
      subtitle:   subtitle   || '',
      category:   category   || 'General',
      tags:       tags       || [],
      body:       postBody,
      bannerType: bannerType || '',
      bannerMsg:  bannerMsg  || '',
      date:       new Date().toISOString(),
    };

    await redis('LPUSH', 'blog:posts', JSON.stringify(post));
    const allPosts = await getAllPosts();
    await syncToGitHub(allPosts);
    return res.status(200).json({ success: true, slug });
  }

  // ── PUT — edit ──────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const { id, title, subtitle, category, body: postBody, tags, bannerType, bannerMsg } = req.body || {};
    if (!id || !title || !postBody) {
      return res.status(400).json({ error: 'id, title and body required.' });
    }

    const posts = await getAllPosts();
    const idx   = posts.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Post not found.' });

    const slug = title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

    const updated = {
      ...posts[idx],
      slug,
      title,
      subtitle:   subtitle   || '',
      category:   category   || 'General',
      tags:       tags       || [],
      body:       postBody,
      bannerType: bannerType || '',
      bannerMsg:  bannerMsg  || '',
      updatedAt:  new Date().toISOString(),
    };

    const newList  = [...posts];
    newList[idx]   = updated;

    // Rewrite entire list — delete and re-push in order
    await redis('DEL', 'blog:posts');
    for (let i = newList.length - 1; i >= 0; i--) {
      await redis('RPUSH', 'blog:posts', JSON.stringify(newList[i]));
    }

    const allPosts = await getAllPosts();
    await syncToGitHub(allPosts);
    return res.status(200).json({ success: true, slug });
  }

  // ── DELETE ──────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Post id required.' });

    const posts  = await getAllPosts();
    const target = posts.find(p => p.id === id);
    if (!target) return res.status(404).json({ error: 'Post not found.' });

    await redis('LREM', 'blog:posts', '1', JSON.stringify(target));
    const remaining = await getAllPosts();
    await syncToGitHub(remaining);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}