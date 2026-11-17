/* Shared multi-page stylesheet pipeline: tokens -> base -> components -> sections */
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/scrollbar.css';
import '../styles/components.css';
import '../styles/sections/nav.css';
import '../styles/sections/hero.css';
import '../styles/sections/learn.css';
import '../styles/sections/about.css';
import '../styles/sections/cta.css';
import '../styles/sections/footer.css';
import '../styles/sections/modal.css';
import '../styles/sections/cookie.css';
import '../styles/sections/policies.css';
import '../styles/sections/about-hero.css';
import '../styles/sections/about-map.css';
import '../styles/sections/about-crew.css';
import '../styles/sections/about-world.css';
import '../styles/sections/about-outpost.css';
import '../styles/sections/about-toolbox.css';
import '../styles/sections/about-final.css';
import '../styles/sections/download-hero.css';
import '../styles/sections/download-install.css';
import '../styles/sections/download-faq.css';
import '../styles/sections/profile-page.css';
import '../styles/sections/profile-dialog.css';
import '../styles/sections/intro.css';
import '../styles/loading.css';
import '../styles/toast.css';
import '../styles/page-loader.css';
import '../styles/reveal.css';

import { initNav } from './nav.js';
import { initCookies } from './cookies.js';
import { handleEntryIntent, initAuth } from './auth.js';
import { openAuthModal } from './modal.js';
import { initPoliciesPage } from './policies.js';
import { initAboutPage } from './about.js';
import { initDownloadPage } from './download-page.js';
import { showToast } from './download.js';
import { renderProfilePage, startProfileLoading } from './profile.js';
import { initIntro } from './intro.js';
import { initReveal } from './reveal.js';
import {
  hidePageLoader,
  initPageLoader,
  navigateWithLoader,
  showPageLoader,
} from './page-loader.js';

const SIGNED_IN_HINT = 'ak_signed_in_hint';

function bindEntryTriggers(openers) {
  document.querySelectorAll('[data-auth-trigger]').forEach((btn) => {
    if (btn.dataset.triggerBound === 'true') return;
    btn.dataset.triggerBound = 'true';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      handleEntryIntent('download', openers);
    });
  });
}

async function guardAuthRoute(state) {
  const requiresAuth = document.body?.dataset.requiresAuth === 'true';
  if (!requiresAuth) return true;

  if (state.authError) {
    hidePageLoader();
    renderProfilePage(state);
    return false;
  }

  if (!state.user || !state.profile) {
    window.location.replace('./');
    return false;
  }

  hidePageLoader();
  renderProfilePage(state);
  return true;
}

function consumeFlashToast() {
  let flash = null;
  try {
    flash = sessionStorage.getItem('ak_flash');
    if (flash) sessionStorage.removeItem('ak_flash');
  } catch {
    return;
  }
  if (flash === 'account_deleted') {
    showToast(
      'Your account was deleted. Your data will leave our backups within 30 days.',
      { kind: 'success' }
    );
  }
}

/* remember whether the last visit was signed in, so the next page can reserve the account area
   (page-loader.css, html.auth-pending) instead of flashing the signed-out buttons */
function settleAuthHint(state) {
  try {
    if (state.user) localStorage.setItem(SIGNED_IN_HINT, '1');
    else if (!state.authError) localStorage.removeItem(SIGNED_IN_HINT);
  } catch {
    /* storage blocked */
  }
  document.documentElement.classList.remove('auth-pending');
}

async function boot() {
  initPageLoader(); // page-to-page transitions + slow-request overlay
  const requiresAuth = document.body?.dataset.requiresAuth === 'true';
  const isProfilePage = Boolean(document.querySelector('[data-profile-page]'));
  if (requiresAuth) {
    if (isProfilePage) {
      startProfileLoading();
    } else {
      showPageLoader({ label: 'CHECKING YOUR ACCOUNT', delayMs: 0 });
    }
  }
  window.setTimeout(() => document.documentElement.classList.remove('auth-pending'), 4000); // failsafe
  const openers = {
    openSignInStep: () => openAuthModal({ step: 'signin' }),
    openNameStep: () => openAuthModal({ step: 'name' }),
  };

  initIntro(); // first visit only; resolves immediately otherwise
  initAboutPage(); // renders data-driven tech tree & final scene observer on about.html
  initDownloadPage(openers); // renders requirements/FAQ, fetches release metadata & binds panel
  initReveal(); // scroll-reveal (home, about & download cards; no-op elsewhere / reduced motion)

  initNav({ openSignInModal: openers });
  initCookies();
  initPoliciesPage();
  bindEntryTriggers(openers);
  if (!requiresAuth) {
    consumeFlashToast();
  }

  const authState = await initAuth({
    onNeedNameStep: requiresAuth ? null : () => openAuthModal({ step: 'name' }),
  });

  settleAuthHint(authState);
  await guardAuthRoute(authState);

  // links from the error pages / legacy deep links: /?open=download or /?open=demo
  const open = new URLSearchParams(window.location.search).get('open');
  if (open === 'demo') {
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    navigateWithLoader('./play.html', { full: true });
    return;
  }
  if (open === 'download') {
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    handleEntryIntent('download', openers);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
