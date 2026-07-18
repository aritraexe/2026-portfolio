export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const REDIS_URL    = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN  = process.env.UPSTASH_REDIS_REST_TOKEN;
  const ADMIN_PASS   = process.env.ADMIN_PASSWORD;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO  = process.env.GITHUB_REPO; // e.g. xenoncommits/2026-portfolio

  const redis = async (...cmd) => {
    const r = await fetch(
      `${REDIS_URL}/${cmd.map(encodeURIComponent).join('/')}`,
      { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } }
    );
    return r.json();
  };

  // ── Helper: fetch all posts from Redis ──────────────────────────
  async function getAllPosts() {
    const r = await redis('LRANGE', 'blog:posts', '0', '99');
    return (r.result || [])
      .map(p => { try { return JSON.parse(p); } catch { return null; } })
      .filter(Boolean);
  }

  // ── Helper: commit posts.json to GitHub ─────────────────────────
  async function syncToGitHub(posts) {
    if (!GITHUB_TOKEN || !GITHUB_REPO) return;

    const filePath = 'blog/posts.json';
    const apiBase  = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
    const headers  = {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent':   'xenon-portfolio',
    };

    // Get current file SHA (needed to update existing file)
    let sha = null;
    try {
      const existing = await fetch(apiBase, { headers });
      if (existing.ok) {
        const data = await existing.json();
        sha = data.sha;
      }
    } catch (_) {}

    const content = Buffer.from(
      JSON.stringify(posts, null, 2), 'utf8'
    ).toString('base64');

    const body = {
      message: `backup: update posts.json [${new Date().toISOString()}]`,
      content,
      ...(sha ? { sha } : {}),
    };

    await fetch(apiBase, {
      method:  'PUT',
      headers,
      body:    JSON.stringify(body),
    });
  }

  // ── GET — fetch all posts (public) ──────────────────────────────
  if (req.method === 'GET') {
    const posts = await getAllPosts();
    return res.status(200).json({ posts });
  }

  // ── Auth check for write operations ─────────────────────────────
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${ADMIN_PASS}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── POST — create new post ───────────────────────────────────────
  if (req.method === 'POST') {
    const { title, subtitle, category, body, tags, bannerType, bannerMsg } = req.body;

    // Test auth call from admin login
    if (req.body.__test) {
      return res.status(200).json({ success: true });
    }

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body required.' });
    }

    const slug = title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');

    const post = {
      id:         Date.now().toString(),
      slug,
      title,
      subtitle:   subtitle   || '',
      category:   category   || 'General',
      tags:       tags       || [],
      body,
      bannerType: bannerType || '',
      bannerMsg:  bannerMsg  || '',
      date:       new Date().toISOString(),
    };

    await redis('LPUSH', 'blog:posts', JSON.stringify(post));

    // Sync updated list to GitHub
    const allPosts = await getAllPosts();
    await syncToGitHub(allPosts);

    return res.status(200).json({ success: true, slug });
  }

  // ── DELETE — remove a post by id ────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Post id required.' });

    const posts  = await getAllPosts();
    const target = posts.find(p => p.id === id);
    if (!target) return res.status(404).json({ error: 'Post not found.' });

    await redis('LREM', 'blog:posts', '1', JSON.stringify(target));

    // Sync updated list to GitHub
    const remaining = await getAllPosts();
    await syncToGitHub(remaining);

    return res.status(200).json({ success: true });
  }

  // ── PUT — edit existing post ────────────────────────────────────
  if (req.method === 'PUT') {
    const { id, title, subtitle, category, body, tags, bannerType, bannerMsg } = req.body;
    if (!id || !title || !body) {
      return res.status(400).json({ error: 'id, title and body required.' });
    }

    const posts  = await getAllPosts();
    const idx    = posts.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Post not found.' });

    const original = posts[idx];
    const slug = title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');

    const updated = {
      ...original,
      slug,
      title,
      subtitle:   subtitle   || '',
      category:   category   || 'General',
      tags:       tags       || [],
      body,
      bannerType: bannerType || '',
      bannerMsg:  bannerMsg  || '',
      updatedAt:  new Date().toISOString(),
    };

    // Remove old entry and reinsert updated one at same position
    // Redis: delete old, push all back in correct order
    await redis('DEL', 'blog:posts');
    const newList = [...posts];
    newList[idx] = updated;
    // RPUSH to maintain order (newest first after reversal)
    for (let i = newList.length - 1; i >= 0; i--) {
      await redis('RPUSH', 'blog:posts', JSON.stringify(newList[i]));
    }

    // Sync to GitHub
    const allPosts = await getAllPosts();
    await syncToGitHub(allPosts);

    return res.status(200).json({ success: true, slug });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}