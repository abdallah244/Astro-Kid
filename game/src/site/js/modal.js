import { POLICY_VERSION } from './api.js';
import {
  beginGoogleSignIn,
  getAuthState,
  performIntent,
  signOut,
  submitProfile,
} from './auth.js';
import { getIntent, setConsentRecord } from './intent.js';
import { validateFullName } from './validateName.js';
import { clearButtonLoading, setButtonLoading } from './loading.js';

const CONSENT_TEXT = 'I agree to the Terms of Use and the Privacy Policy.';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const CLOSE_X_SVG =
  '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 5 5" shape-rendering="crispEdges">' +
  '<path fill="#eef1ff" d="M0 0h1v1H0zM4 0h1v1H4zM1 1h1v1H1zM3 1h1v1H3zM2 2h1v1H2zM1 3h1v1H1zM3 3h1v1H3zM0 4h1v1H0zM4 4h1v1H4z"/>' +
  '</svg>';

const GOOGLE_G_SVG =
  '<svg class="google-glyph" aria-hidden="true" width="22" height="22" viewBox="0 0 18 18">' +
  '<path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>' +
  '<path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>' +
  '<path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>' +
  '<path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>' +
  '</svg>';

const CHECK_TICK_SVG =
  '<svg class="check__tick" width="14" height="14" viewBox="0 0 7 7" shape-rendering="crispEdges">' +
  '<path fill="#3fbf5f" d="M5 0h2v1H5zM4 1h2v1H4zM0 3h2v1H0zM3 2h2v1H3zM1 4h2v1H1zM2 3h2v2H2zM3 5h1v1H3z"/>' +
  '</svg>';

let dialogEl = null;
let currentMode = null; // 'signin' | 'name'
let isDismissible = true;
let activeOpener = null;

function getFocusable(dialog) {
  return [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (el) => !el.hasAttribute('hidden') && el.offsetParent !== null
  );
}

function ensureDialog() {
  if (dialogEl && dialogEl.isConnected) return dialogEl;

  dialogEl = document.createElement('dialog');
  dialogEl.className = 'ak-dialog';
  dialogEl.setAttribute('data-auth-dialog', '');

  dialogEl.addEventListener('cancel', (event) => {
    if (!isDismissible) {
      event.preventDefault();
    }
  });

  dialogEl.addEventListener('click', (event) => {
    if (!isDismissible) return;
    if (event.target === dialogEl) {
      closeAuthModal();
    }
  });

  dialogEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const items = getFocusable(dialogEl);
    if (items.length === 0) return;

    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  dialogEl.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    currentMode = null;
    if (activeOpener && typeof activeOpener.focus === 'function' && activeOpener.isConnected) {
      activeOpener.focus();
    }
    activeOpener = null;
  });

  document.body.appendChild(dialogEl);
  return dialogEl;
}

function createHeaderRow({ stepText, onCloseClick }) {
  const stepChip = document.createElement('div');
  stepChip.className = 'chip chip--step ak-dialog__step';
  stepChip.textContent = stepText;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--blue ak-dialog__close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = CLOSE_X_SVG;
  closeBtn.addEventListener('click', onCloseClick);

  return { stepChip, closeBtn };
}

function renderSignInStep(dialog) {
  currentMode = 'signin';
  isDismissible = true;
  dialog.setAttribute('aria-labelledby', 'modal-title');
  dialog.replaceChildren();

  const box = document.createElement('div');
  box.className = 'panel panel--modal ak-dialog__box';

  const { stepChip, closeBtn } = createHeaderRow({
    stepText: 'STEP 1 OF 2',
    onCloseClick: () => closeAuthModal(),
  });

  const head = document.createElement('div');
  head.className = 'ak-dialog__head';

  const novaImg = document.createElement('img');
  novaImg.className = 'pixelated ak-dialog__nova';
  novaImg.src = './assets/landing/nova.png';
  novaImg.alt = '';
  novaImg.width = 58;
  novaImg.height = 76;

  const title = document.createElement('h2');
  title.id = 'modal-title';
  title.className = 'px-title ak-dialog__title';
  title.append('SIGN IN TO');
  title.appendChild(document.createElement('br'));
  const accent = document.createElement('span');
  accent.className = 'px-title__accent';
  accent.textContent = 'DOWNLOAD';
  title.appendChild(accent);

  const lead = document.createElement('p');
  lead.className = 'ak-dialog__lead';
  lead.textContent =
    'Sign in with Google to get the full game for Windows. The demo needs no account.';

  head.append(novaImg, title, lead);

  const checkLabel = document.createElement('label');
  checkLabel.className = 'check ak-dialog__consent';
  checkLabel.htmlFor = 'ak-consent-check';

  const checkInput = document.createElement('input');
  checkInput.className = 'check__input';
  checkInput.id = 'ak-consent-check';
  checkInput.type = 'checkbox';

  const checkBox = document.createElement('span');
  checkBox.className = 'check__box';
  checkBox.setAttribute('aria-hidden', 'true');
  checkBox.innerHTML = CHECK_TICK_SVG;

  const checkText = document.createElement('span');
  checkText.className = 'check__label';
  checkText.append('I agree to the ');

  const termsLink = document.createElement('a');
  termsLink.href = './policies.html#terms';
  termsLink.target = '_blank';
  termsLink.rel = 'noopener noreferrer';
  termsLink.textContent = 'Terms of Use';

  const privacyLink = document.createElement('a');
  privacyLink.href = './policies.html#privacy';
  privacyLink.target = '_blank';
  privacyLink.rel = 'noopener noreferrer';
  privacyLink.textContent = 'Privacy Policy';

  checkText.append(termsLink, ' and the ', privacyLink, '.');
  checkLabel.append(checkInput, checkBox, checkText);

  const googleBtn = document.createElement('button');
  googleBtn.type = 'button';
  googleBtn.className = 'btn btn--white-google btn--block ak-dialog__submit';
  googleBtn.disabled = true;
  googleBtn.setAttribute('aria-disabled', 'true');
  googleBtn.innerHTML = `${GOOGLE_G_SVG} CONTINUE WITH GOOGLE`;

  checkInput.addEventListener('change', () => {
    const agreed = checkInput.checked;
    googleBtn.disabled = !agreed;
    googleBtn.setAttribute('aria-disabled', agreed ? 'false' : 'true');
  });

  googleBtn.addEventListener('click', () => {
    if (!checkInput.checked) return;
    setConsentRecord({
      acceptedAt: new Date().toISOString(),
      policyVersion: POLICY_VERSION,
      text: CONSENT_TEXT,
    });
    const intent = getIntent() || 'download';
    setButtonLoading(googleBtn, 'SIGNING IN');
    beginGoogleSignIn(intent);
  });

  const demoLink = document.createElement('a');
  demoLink.className = 'ak-dialog__demo-link';
  demoLink.href = './play.html';
  demoLink.textContent = 'OR PLAY THE FREE DEMO';

  box.append(stepChip, closeBtn, head, checkLabel, googleBtn, demoLink);
  dialog.appendChild(box);
}

function renderNameStep(dialog) {
  currentMode = 'name';
  // Required step: ESC and backdrop clicks cannot dismiss it. X signs user out.
  isDismissible = false;
  dialog.setAttribute('aria-labelledby', 'name-title');
  dialog.replaceChildren();

  const { user } = getAuthState();
  const userEmail = user?.email || 'player@example.com';

  const box = document.createElement('div');
  box.className = 'panel panel--modal ak-dialog__box ak-dialog__box--name';

  const { stepChip, closeBtn } = createHeaderRow({
    stepText: 'STEP 2 OF 2',
    onCloseClick: async () => {
      closeBtn.disabled = true;
      await signOut();
      closeAuthModal();
    },
  });

  const head = document.createElement('div');
  head.className = 'ak-dialog__head';

  const novaImg = document.createElement('img');
  novaImg.className = 'pixelated ak-dialog__nova ak-dialog__nova--sm';
  novaImg.src = './assets/landing/nova.png';
  novaImg.alt = '';
  novaImg.width = 50;
  novaImg.height = 65;

  const title = document.createElement('h2');
  title.id = 'name-title';
  title.className = 'px-title ak-dialog__title';
  title.append('ADD YOUR');
  title.appendChild(document.createElement('br'));
  const accent = document.createElement('span');
  accent.className = 'px-title__accent';
  accent.textContent = 'FULL NAME';
  title.appendChild(accent);

  const lead = document.createElement('p');
  lead.className = 'ak-dialog__lead';
  lead.textContent =
    'Enter your three names. It lets you sign in to the game quickly once you download it.';

  head.append(novaImg, title, lead);

  const googleRow = document.createElement('div');
  googleRow.className = 'panel--dark notch ak-dialog__google-user';

  const gBadge = document.createElement('div');
  gBadge.className = 'ak-dialog__google-badge';
  gBadge.setAttribute('aria-hidden', 'true');
  gBadge.innerHTML = GOOGLE_G_SVG;

  const gMeta = document.createElement('div');
  gMeta.className = 'ak-dialog__google-meta';

  const gTag = document.createElement('div');
  gTag.className = 'ak-dialog__google-tag';
  gTag.textContent = 'SIGNED IN WITH GOOGLE';

  const gEmail = document.createElement('div');
  gEmail.className = 'ak-dialog__google-email';
  gEmail.textContent = userEmail;

  gMeta.append(gTag, gEmail);
  googleRow.append(gBadge, gMeta);

  const form = document.createElement('form');
  form.noValidate = true;
  form.className = 'ak-dialog__form';

  const field = document.createElement('div');
  field.className = 'field';

  const fieldHead = document.createElement('div');
  fieldHead.className = 'field__head';

  const label = document.createElement('label');
  label.className = 'field__label';
  label.htmlFor = 'fullname';
  label.textContent = 'FULL NAME (3 NAMES)';

  const reqTag = document.createElement('span');
  reqTag.className = 'tag';
  reqTag.textContent = 'REQUIRED';

  fieldHead.append(label, reqTag);

  const input = document.createElement('input');
  input.className = 'field__input';
  input.id = 'fullname';
  input.type = 'text';
  input.maxLength = 120;
  input.autocomplete = 'name';
  input.placeholder = 'e.g. Ahmed Mohamed Ali';
  input.required = true;

  const meta = document.createElement('div');
  meta.className = 'field__meta';

  const pipsWrap = document.createElement('div');
  pipsWrap.className = 'field__pips';
  pipsWrap.setAttribute('aria-hidden', 'true');
  const pips = [0, 1, 2].map(() => {
    const pip = document.createElement('span');
    pip.className = 'pip';
    pipsWrap.appendChild(pip);
    return pip;
  });

  const hint = document.createElement('span');
  hint.className = 'field__status';
  hint.setAttribute('role', 'status');
  hint.textContent = '0 OF 3 NAMES';

  meta.append(pipsWrap, hint);

  const errMsg = document.createElement('p');
  errMsg.className = 'field__status field__status--error ak-dialog__error';
  errMsg.setAttribute('role', 'alert');
  errMsg.hidden = true;

  const continueBtn = document.createElement('button');
  continueBtn.type = 'submit';
  continueBtn.className = 'btn btn--yellow btn--block ak-dialog__submit';
  continueBtn.disabled = true;
  continueBtn.setAttribute('aria-disabled', 'true');
  continueBtn.textContent = 'CONTINUE';

  const updateValidation = () => {
    const { valid, pipCount } = validateFullName(input.value);
    pips.forEach((pip, idx) => {
      pip.classList.toggle('pip--ok', idx < pipCount);
    });
    hint.classList.toggle('field__status--ok', valid);
    hint.textContent = valid ? 'LOOKS GOOD' : `${pipCount} OF 3 NAMES`;
    continueBtn.disabled = !valid;
    continueBtn.setAttribute('aria-disabled', valid ? 'false' : 'true');
    if (errMsg.textContent) {
      errMsg.hidden = true;
      errMsg.textContent = '';
      input.removeAttribute('aria-invalid');
    }
  };

  input.addEventListener('input', updateValidation);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const check = validateFullName(input.value);
    if (!check.valid) return;

    setButtonLoading(continueBtn, 'SAVING');

    const res = await submitProfile(check.fullName);
    if (!res.ok) {
      clearButtonLoading(continueBtn);

      const msgMap = {
        invalid_full_name: 'Please enter three separate names (at least 2 letters each).',
        profile_exists: 'Your profile is already set up. Refreshing...',
        network_error: 'Could not reach the server. Please try again.',
      };
      errMsg.textContent = msgMap[res.error] || 'Could not save your name. Please try again.';
      errMsg.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }

    closeAuthModal();
    performIntent();
  });

  field.append(fieldHead, input, meta, errMsg);
  form.append(field, continueBtn);

  box.append(stepChip, closeBtn, head, googleRow, form);
  dialog.appendChild(box);
}

export function openAuthModal({ intent = 'download', step = 'signin', opener = document.activeElement } = {}) {
  const dialog = ensureDialog();
  if (!dialog.open) {
    activeOpener = opener;
    document.body.classList.add('modal-open');
  }

  if (step === 'name') {
    renderNameStep(dialog);
  } else {
    renderSignInStep(dialog, intent);
  }

  if (!dialog.open) {
    dialog.showModal();
  }

  const initialFocus =
    step === 'name'
      ? dialog.querySelector('#fullname')
      : dialog.querySelector('#ak-consent-check');
  if (initialFocus && typeof initialFocus.focus === 'function') {
    initialFocus.focus();
  }
}

export function closeAuthModal() {
  if (!dialogEl || !dialogEl.open) return;
  dialogEl.close();
}

export function getActiveModalMode() {
  return dialogEl?.open ? currentMode : null;
}
