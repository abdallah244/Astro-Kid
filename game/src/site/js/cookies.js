const COOKIE_KEY = 'ak_cookie_consent';

const COOKIE_ICON_SVG =
  '<svg aria-hidden="true" class="cookie-banner__icon" width="60" height="60" viewBox="0 0 12 12" shape-rendering="crispEdges">' +
  '<path fill="#e0a458" d="M3 0h6v1H3zM2 1h8v1H2zM1 2h3v1H1zM5 2h6v1H5zM1 3h10v1H1zM0 4h6v1H0zM7 4h5v1H7zM0 5h2v1H0zM3 5h9v1H3zM0 6h9v1H0zM10 6h2v1h-2zM1 7h10v1H1zM1 8h4v1H1zM6 8h5v1H6zM2 9h8v1H2zM3 10h2v1H3zM6 10h3v1H6zM4 11h4v1H4z"/>' +
  '<path fill="#6b3f1d" d="M4 2h1v1H4zM6 4h1v1H6zM2 5h1v1H2zM9 6h1v1H9zM5 8h1v1H5zM5 10h1v1H5z"/>' +
  '</svg>';

/** Read saved cookie preference ('all' | 'essential' | null). */
export function getCookieConsent() {
  try {
    const val = localStorage.getItem(COOKIE_KEY);
    return val === 'all' || val === 'essential' ? val : null;
  } catch {
    return null;
  }
}

/** Store visitor cookie decision in localStorage (essential-only behavior until 'all'). */
export function setCookieConsent(value) {
  if (value !== 'all' && value !== 'essential') return;
  try {
    localStorage.setItem(COOKIE_KEY, value);
  } catch {
    // Ignore restricted private-mode errors
  }
}

/** Gate hook: any future analytics must call this before loading scripts. */
export function canLoadAnalytics() {
  return getCookieConsent() === 'all';
}

function buildCookieBanner() {
  const section = document.createElement('section');
  section.className = 'cookie-banner';
  section.setAttribute('role', 'region');
  section.setAttribute('aria-label', 'Cookie notice');
  section.setAttribute('data-cookie-banner', '');

  const box = document.createElement('div');
  box.className = 'panel panel--modal cookie-banner__inner';

  const headRow = document.createElement('div');
  headRow.className = 'cookie-banner__head';
  headRow.innerHTML = COOKIE_ICON_SVG;

  const mobileLabel = document.createElement('div');
  mobileLabel.className = 'cookie-banner__title cookie-banner__title--mobile';
  mobileLabel.textContent = 'COOKIES';
  headRow.appendChild(mobileLabel);

  const body = document.createElement('div');
  body.className = 'cookie-banner__body';

  const desktopLabel = document.createElement('div');
  desktopLabel.className = 'cookie-banner__title cookie-banner__title--desktop';
  desktopLabel.textContent = 'COOKIES';

  const text = document.createElement('p');
  text.className = 'cookie-banner__text';
  text.append(
    'We use essential cookies to make the site work and to make downloading easier. You can control or turn them off in your browser settings. More in our '
  );
  const policyLink = document.createElement('a');
  policyLink.href = './policies.html#privacy';
  policyLink.textContent = 'Privacy Policy';
  text.appendChild(policyLink);
  text.append('.');

  body.append(desktopLabel, text);

  const actions = document.createElement('div');
  actions.className = 'cookie-banner__actions';

  const acceptBtn = document.createElement('button');
  acceptBtn.type = 'button';
  acceptBtn.className = 'btn btn--nav btn--yellow';
  acceptBtn.setAttribute('data-cookie-choice', 'all');
  acceptBtn.textContent = 'ACCEPT';

  const essentialBtn = document.createElement('button');
  essentialBtn.type = 'button';
  essentialBtn.className = 'btn btn--nav btn--blue';
  essentialBtn.setAttribute('data-cookie-choice', 'essential');
  essentialBtn.textContent = 'ESSENTIAL ONLY';

  actions.append(acceptBtn, essentialBtn);
  box.append(headRow, body, actions);
  section.appendChild(box);
  return section;
}

export function initCookies() {
  if (getCookieConsent()) return;

  let banner = document.querySelector('[data-cookie-banner]');
  if (!banner) {
    banner = buildCookieBanner();
    document.body.appendChild(banner);
  }

  banner.hidden = false;
  banner.querySelectorAll('[data-cookie-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const choice = btn.getAttribute('data-cookie-choice');
      setCookieConsent(choice);
      banner.hidden = true;
    });
  });
}
