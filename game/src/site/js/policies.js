export const SITE_URL_PLACEHOLDER = '[Website URL]';

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
