// Theme
(function () {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();

function toggleTheme() {
  const h = document.documentElement;
  const next = h.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  h.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  if (typeof renderAvatar === 'function') renderAvatar(next);
}

// Mark active nav link based on current page
document.addEventListener('DOMContentLoaded', () => {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (
      (page === 'index.html' || page === '') && (href === 'index.html' || href === '/') ||
      href === page
    ) {
      a.classList.add('active');
    }
  });
});
