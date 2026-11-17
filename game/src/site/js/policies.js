// Set at build time (VITE_SITE_URL, e.g. https://astrokid.example); the placeholder stays until a domain exists.
export const SITE_URL_PLACEHOLDER = (import.meta.env.VITE_SITE_URL || '[Website URL]').trim();

function highlightHashTarget() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return;
  const target = document.getElementById(hash);
  if (!target || !target.classList.contains('doc')) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  target.classList.remove('doc--highlight');
  // Force reflow so repeat clicks retrigger highlight cleanly
  void target.offsetWidth;
  target.classList.add('doc--highlight');
  window.setTimeout(() => {
    target.classList.remove('doc--highlight');
  }, 1200);
}

export function initPoliciesPage() {
  document.querySelectorAll('.js-site-url').forEach((el) => {
    el.textContent = SITE_URL_PLACEHOLDER;
  });

  if (document.querySelector('.doc')) {
    highlightHashTarget();
    window.addEventListener('hashchange', highlightHashTarget);
  }
}
