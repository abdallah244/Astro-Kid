import {
  createProfile as apiCreateProfile,
  deleteAccount as apiDeleteAccount,
  getMeResult,
  IS_MOCK_AUTH,
  logout as apiLogout,
  POLICY_VERSION,
  startGoogleLogin,
} from './api.js';
import { startDownload, showToast } from './download.js';
import {
  clearConsentRecord,
  clearIntent,
  getConsentRecord,
  getIntent,
  getSignupSource,
  setIntent,
} from './intent.js';

let currentState = { user: null, profile: null, authError: null };
const listeners = new Set();

function notifyListeners() {
  for (const cb of listeners) {
    cb(currentState);
  }
}

export function onAuthChange(cb) {
  listeners.add(cb);
  cb(currentState);
  return () => listeners.delete(cb);
}

export function getAuthState() {
  return currentState;
}

export async function refreshAuthState() {
  const me = await getMeResult();
  if (me.ok) {
    currentState = { user: me.user, profile: me.profile, authError: null };
  } else if (me.status === 401) {
    currentState = { user: null, profile: null, authError: null };
  } else {
    currentState = {
      user: null,
      profile: null,
      authError: me.error || 'network_error',
    };
  }
  notifyListeners();
  return currentState;
}

export function performIntent(intent = getIntent()) {
  if (!intent) return false;
  clearIntent();
  if (intent === 'download') {
    void startDownload();
    return true;
  }
  return false;
}

export async function submitProfile(fullName) {
  const savedConsent = getConsentRecord() || {
    acceptedAt: new Date().toISOString(),
    policyVersion: POLICY_VERSION,
    text: 'I agree to the Terms of Use and the Privacy Policy.',
  };

  const res = await apiCreateProfile({
    fullName,
    consent: savedConsent,
    source: getSignupSource(),
  });

  if (!res.ok) {
    return res;
  }

  clearConsentRecord();
  await refreshAuthState();
  return res;
}

export function beginGoogleSignIn(intent) {
  startGoogleLogin(intent);
}

export function firstWordUpper(profile, user) {
  if (profile?.fullName) {
    const first = profile.fullName.trim().split(/\s+/)[0] || '';
    if (first) return first.toUpperCase().slice(0, 12);
  }
  const emailLocal = (user?.email || 'PLAYER').split('@')[0];
  return emailLocal.toUpperCase().slice(0, 12);
}

export async function signOut() {
  await apiLogout();
  clearIntent();
  await refreshAuthState();
}

export async function deleteAccount() {
  const res = await apiDeleteAccount();
  if (res.ok || res.status === 401) {
    clearIntent();
    clearConsentRecord();
    try {
      localStorage.removeItem('ak_signed_in_hint');
    } catch {
      // Ignore storage errors
    }
    document.documentElement.classList.remove('auth-pending');
    await refreshAuthState();
  }
  return res;
}

/** Handle download entry triggers based on current auth + profile state. */
export function handleEntryIntent(_intent, openers = {}) {
  if (currentState.user && currentState.profile) {
    setIntent('download');
    performIntent('download');
    return;
  }

  setIntent('download');

  if (currentState.user && !currentState.profile) {
    openers.openNameStep?.();
    return;
  }

  openers.openSignInStep?.();
}

export function renderMockAuthBadge() {
  if (!IS_MOCK_AUTH) return;
  if (document.querySelector('[data-mock-badge]')) return;
  const badge = document.createElement('div');
  badge.className = 'mock-badge';
  badge.setAttribute('data-mock-badge', 'true');
  badge.textContent = 'MOCK AUTH';
  document.body.appendChild(badge);
}

export async function initAuth({ onNeedNameStep } = {}) {
  renderMockAuthBadge();
  // Purge any legacy 'demo' intent stored before demo became public.
  getIntent();

  const url = new URL(window.location.href);
  const authResult = url.searchParams.get('auth');
  if (authResult) {
    url.searchParams.delete('auth');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  await refreshAuthState();

  if (authResult === 'error') {
    showToast('Sign-in was cancelled or could not be verified.', {
      kind: 'error',
      isError: true,
    });
    return currentState;
  }

  if (currentState.user && !currentState.profile) {
    if (onNeedNameStep) {
      onNeedNameStep(currentState);
    }
    return currentState;
  }

  if (authResult === 'done' && currentState.user && currentState.profile) {
    performIntent();
  }

  return currentState;
}
