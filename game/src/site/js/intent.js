const INTENT_KEY = 'ak_intent';
const CONSENT_KEY = 'ak_consent';

/** Persist the user's post-auth intent (download only; browser demo needs no sign-in). */
export function setIntent(intent = 'download') {
  if (intent !== 'download') return;
  try {
    localStorage.setItem(INTENT_KEY, 'download');
  } catch {
    // Ignore storage errors in restricted browsing modes
  }
}

/** Read pending download intent, deleting any stale legacy 'demo' value. */
export function getIntent() {
  try {
    const val = localStorage.getItem(INTENT_KEY);
    if (val === 'demo') {
      localStorage.removeItem(INTENT_KEY);
      return null;
    }
    return val === 'download' ? 'download' : null;
  } catch {
    return null;
  }
}

/** Clear pending intent once executed. */
export function clearIntent() {
  try {
    localStorage.removeItem(INTENT_KEY);
  } catch {
    // Ignore storage errors
  }
}

/** Persist proof of consent to Terms & Privacy prior to OAuth redirect. */
export function setConsentRecord(record) {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage errors
  }
}

/** Read saved consent record from step 1. */
export function getConsentRecord() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearConsentRecord() {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    // Ignore storage errors
  }
}

/** Capture acquisition channel (?src= / utm_source / referrer / direct). */
export function getSignupSource() {
  const params = new URLSearchParams(window.location.search);
  const src = params.get('src') || params.get('utm_source');
  if (src) return src.trim().slice(0, 40).toLowerCase();
  try {
    return document.referrer
      ? new URL(document.referrer).hostname.slice(0, 60)
      : 'direct';
  } catch {
    return 'direct';
  }
}
