// Dynamically serves a blog post page by slug
export default async function handler(req, res) {
  const { slug } = req.query;
  if (!slug) return res.status(400).send('Missing slug');

  const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  const redis = async (...cmd) => {
    const r = await fetch(`${REDIS_URL}/${cmd.map(encodeURIComponent).join('/')}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    return r.json();
  };

  const result = await redis('LRANGE', 'blog:posts', '0', '49');
  const posts  = (result.result || []).map(p => { try { return JSON.parse(p); } catch { return null; } }).filter(Boolean);
  const post   = posts.find(p => p.slug === slug);

  if (!post) {
    return res.status(404).send(`<!DOCTYPE html><html><head><title>Not Found</title></head><body style="font-family:monospace;padding:4rem;background:#0b0b0b;color:#fff"><p>Post not found. <a href="/blog.html" style="color:#4caf7d">← Back</a></p></body></html>`);
  }

  // Convert simple markdown-style to HTML
  function mdToHtml(text) {
    return text
      .split('\n\n').map(block => {
        block = block.trim();
        if (!block) return '';
        // headings
        if (block.startsWith('## '))  return `<h2>${esc(block.slice(3))}</h2>`;
        if (block.startsWith('### ')) return `<h3>${esc(block.slice(4))}</h3>`;
        // horizontal rule
        if (block === '---') return `<hr style="border:none;border-top:1px solid var(--border);margin:2rem 0"/>`;
        // lists
        if (block.split('\n').every(l => l.startsWith('- '))) {
          const items = block.split('\n').map(l => `<li>${inlineFormat(esc(l.slice(2)))}</li>`).join('');
          return `<ul>${items}</ul>`;
        }
        return `<p>${inlineFormat(esc(block).replace(/\n/g,'<br/>'))}</p>`;
      }).join('\n');
  }

  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function inlineFormat(s) {
    return s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  }

  const date = new Date(post.date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  const words = post.body.split(/\s+/).length;
  const readTime = Math.max(1, Math.ceil(words / 200));
  const tagsHtml = (post.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
  const bodyHtml = mdToHtml(post.body);

  const html = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${post.title} — Xenon</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=IBM+Plex+Mono:wght@300;400&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/shared.css"/>
<style>
:root{--bg:#ffffff;--bg2:#ffffff;--text:#000000;--muted:#333333;--border:#e6e6e6;}
[data-theme="dark"]{--bg:#0b0b0b;--bg2:#0f0f0f;--text:#ffffff;--muted:#bfbfbf;--border:#222222;}
.post-page{max-width:680px;margin:0 auto;padding:7rem 2rem 6rem;}
.back-link{display:inline-flex;align-items:center;gap:.45rem;font-family:'IBM Plex Mono',monospace;font-size:.72rem;color:var(--muted);text-decoration:none;margin-bottom:3rem;transition:color .2s;}
.back-link:hover{color:var(--text);}
.post-cat{font-family:'IBM Plex Mono',monospace;font-size:.68rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;margin-bottom:1rem;}
.post-title{font-size:clamp(1.8rem,4vw,2.6rem);font-weight:600;letter-spacing:-.03em;line-height:1.15;margin-bottom:.8rem;color:var(--text);}
.post-subtitle{font-size:1rem;color:var(--muted);line-height:1.7;max-width:560px;margin-bottom:1.5rem;}
.post-meta{display:flex;gap:1.4rem;flex-wrap:wrap;font-family:'IBM Plex Mono',monospace;font-size:.68rem;color:var(--muted);padding-bottom:1.5rem;border-bottom:1px solid var(--border);}
.tag-row{display:flex;gap:.5rem;flex-wrap:wrap;margin:1.5rem 0;}
.tag{font-family:'IBM Plex Mono',monospace;font-size:.65rem;color:var(--muted);border:1px solid var(--border);padding:.2rem .6rem;border-radius:2px;}
.post-body{font-size:1rem;line-height:1.85;color:var(--muted);margin-top:2rem;}
.post-body p{margin-bottom:1.4rem;}
.post-body h2{font-size:1.15rem;font-weight:600;color:var(--text);letter-spacing:-.02em;margin:2.5rem 0 .8rem;}
.post-body h3{font-size:.95rem;font-weight:600;color:var(--text);margin:1.8rem 0 .5rem;}
.post-body ul{padding-left:1.2rem;margin-bottom:1.4rem;}
.post-body ul li{margin-bottom:.5rem;color:var(--muted);line-height:1.7;}
.post-body code{font-family:'IBM Plex Mono',monospace;font-size:.82rem;background:var(--bg2);border:1px solid var(--border);padding:.15rem .45rem;border-radius:3px;color:var(--text);}
.post-body strong{color:var(--text);font-weight:600;}
.post-footer{margin-top:4rem;padding-top:2rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;}
.post-footer-label{font-family:'IBM Plex Mono',monospace;font-size:.68rem;color:var(--muted);}
.back-to-writing{font-family:'IBM Plex Mono',monospace;font-size:.72rem;color:var(--muted);text-decoration:none;transition:color .2s;}
.back-to-writing:hover{color:var(--text);}
@media(max-width:580px){.post-page{padding:6rem 1.3rem 4rem;}.post-title{font-size:1.7rem;}}
</style>
<script src="/shared.js" defer><\/script>
</head>
<body>
<nav>
  <a class="nav-name" href="/index.html">Xenon</a>
  <div class="nav-right">
    <ul class="nav-links">
      <li><a href="/blog.html" class="active">Writing</a></li>
      <li><a href="/work.html">Work</a></li>
      <li><a href="/contact.html">Contact</a></li>
    </ul>
    <button class="theme-btn" onclick="toggleTheme()"></button>
  </div>
</nav>
<div class="post-page">
  <a class="back-link" href="/blog.html">← Back to Writing</a>
  <div class="post-header">
    <p class="post-cat">${post.category}</p>
    <h1 class="post-title">${post.title}</h1>
    ${post.subtitle ? `<p class="post-subtitle">${post.subtitle}</p>` : ''}
    <div class="post-meta">
      <span>${date}</span>
      <span>${readTime} min read</span>
      <span>${post.category}</span>
    </div>
  </div>
  ${tagsHtml ? `<div class="tag-row">${tagsHtml}</div>` : ''}
  <div class="post-body">${bodyHtml}</div>
  <div class="post-footer">
    <span class="post-footer-label">© 2026 Xenon</span>
    <a class="back-to-writing" href="/blog.html">← All posts</a>
  </div>
</div>
<footer>
  <span>© 2026 Xenon</span>
  <span>Human Being</span>
</footer>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}