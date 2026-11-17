/* Page loading states for the marketing site.
   - light overlay (pixel spinner + progress strip) for page-to-page navigation and slow requests;
     it only appears if the wait lasts longer than `delayMs`, so fast loads never flash it.
   - full overlay for /play.html: the same walking-astronaut screen the game page shows
     (public/boot-loader.css), so the hand-over to the game has no visual jump.
   Design: docs/design/Loading-Desktop.dc.html and Loading-Components.dc.html. */

const FULL_PATH = /\/play\.html$/;
const FAILSAFE_MS = 15000;

let overlay = null;
let showTimer = null;
let failsafeTimer = null;

function ensureBootCss() {
  if (document.querySelector('link[data-boot-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/boot-loader.css';
  link.setAttribute('data-boot-css', 'true');
  document.head.appendChild(link);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function buildLight(label) {
  const root = el('div', 'page-loader');
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');

  const bar = el('div', 'page-loader__bar');
  bar.setAttribute('aria-hidden', 'true');
  bar.appendChild(el('i'));

  const inner = el('div', 'page-loader__inner');
  const spinner = el('div', 'spinner');
  spinner.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 9; i += 1) spinner.appendChild(el('i'));

  const text = el('p', 'page-loader__label', label);
  const dots = el('span', 'dots');
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i += 1) dots.appendChild(el('i'));
  text.appendChild(dots);

  inner.append(spinner, text);
  root.append(bar, inner);
  return root;
}

function buildFull() {
  ensureBootCss();
  const root = el('div');
  root.id = 'boot-loader';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');

  const stars = el('div', 'bl-stars');
  stars.setAttribute('aria-hidden', 'true');
  const title = el('p', 'bl-title', 'ASTRO ');
  title.appendChild(el('span', '', 'KID'));
  const run = el('div', 'bl-run');
  run.setAttribute('aria-hidden', 'true');
  const bar = el('div', 'bl-bar');
  bar.append(el('div', 'bl-fill'), el('div', 'bl-cover'));
  run.append(el('div', 'bl-astro'), bar);

  root.append(stars, title, run, el('p', 'bl-label', 'LOADING...'), el('p', 'bl-tip', 'TIP: KEEP AN EYE ON YOUR OXYGEN.'));
  return root;
}

export function hidePageLoader() {
  window.clearTimeout(showTimer);
  window.clearTimeout(failsafeTimer);
  showTimer = null;
  failsafeTimer = null;
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

/** Show the loader after `delayMs` (0 = immediately). Returns a function that hides it. */
export function showPageLoader({ label = 'LOADING', delayMs = 350, full = false } = {}) {
  hidePageLoader();
  const show = () => {
    overlay = full ? buildFull() : buildLight(label);
    document.body.appendChild(overlay);
    if (!full) window.requestAnimationFrame(() => overlay && overlay.classList.add('is-visible'));
    failsafeTimer = window.setTimeout(hidePageLoader, FAILSAFE_MS);
  };
  if (delayMs <= 0) show();
  else showTimer = window.setTimeout(show, delayMs);
  return hidePageLoader;
}

/** Wrap a promise: the loader only appears if it takes longer than `delayMs`. */
export async function withPageLoader(label, promise, { delayMs = 400 } = {}) {
  const hide = showPageLoader({ label, delayMs });
  try {
    return await promise;
  } finally {
    hide();
  }
}

export function navigateWithLoader(url, { full = false } = {}) {
  showPageLoader({ full, delayMs: full ? 0 : 300 });
  window.location.assign(url);
}

function onLinkClick(event) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!link) return;
  if (link.target && link.target !== '_self') return;
  if (link.hasAttribute('download')) return;

  let url;
  try {
    url = new URL(link.href, window.location.href);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  // same page (hash jumps and in-page anchors): nothing to load
  if (url.pathname === window.location.pathname && url.search === window.location.search) return;

  const full = FULL_PATH.test(url.pathname);
  showPageLoader({ full, delayMs: full ? 0 : 350 });
}

export function initPageLoader() {
  document.addEventListener('click', onLinkClick);
  // coming back with the browser's back button (bfcache): never show a stale loader
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) hidePageLoader();
  });
}
