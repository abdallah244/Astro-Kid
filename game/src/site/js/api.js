import { validateFullName } from './validateName.js';

export const IS_MOCK_AUTH = import.meta.env.VITE_MOCK_AUTH === 'true';
export const POLICY_VERSION = (import.meta.env.VITE_POLICY_VERSION || '2026-11-17').trim();

const MOCK_USER_KEY = 'ak_mock_user_v1';
const MOCK_PROFILE_KEY = 'ak_mock_profile_v1';
const MOCK_INSTALLER_KEY = 'ak_mock_has_installer';

function readJsonStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore private mode / quota errors
  }
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (res.status === 204) {
    return { ok: true, status: 204, data: null };
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { ok: res.ok, status: res.status, data };
}

export async function getMeResult() {
  if (IS_MOCK_AUTH) {
    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('mock_me_error') === '1'
    ) {
      return { ok: false, status: 500, error: 'server_error' };
    }
    const user = readJsonStorage(MOCK_USER_KEY);
    if (!user) return { ok: false, status: 401, error: 'unauthenticated' };
    const profile = readJsonStorage(MOCK_PROFILE_KEY);
    return { ok: true, status: 200, user, profile };
  }

  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (res.status === 401) {
      return { ok: false, status: 401, error: 'unauthenticated' };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: 'server_error' };
    }
    const data = await res.json();
    return { ok: true, status: 200, user: data.user, profile: data.profile };
  } catch {
    return { ok: false, status: 0, error: 'network_error' };
  }
}

export async function getMe() {
  const res = await getMeResult();
  return res.ok ? { user: res.user, profile: res.profile } : null;
}

export function startGoogleLogin() {
  const safeIntent = 'download';

  if (IS_MOCK_AUTH) {
    const existing = readJsonStorage(MOCK_USER_KEY);
    if (!existing) {
      writeJsonStorage(MOCK_USER_KEY, {
        email: 'demo.user@example.com',
        avatarUrl: './assets/ui/avatar_face.png',
      });
    }
    const url = new URL(window.location.href);
    url.searchParams.set('auth', 'done');
    window.location.assign(url.toString());
    return;
  }

  window.location.assign(`/api/auth/google/start?intent=${encodeURIComponent(safeIntent)}`);
}

export async function createProfile({ fullName, consent, source }) {
  if (IS_MOCK_AUTH) {
    const user = readJsonStorage(MOCK_USER_KEY);
    if (!user) {
      return { ok: false, status: 401, error: 'unauthenticated' };
    }
    if (readJsonStorage(MOCK_PROFILE_KEY)) {
      return { ok: false, status: 409, error: 'profile_exists' };
    }
    const check = validateFullName(fullName);
    if (!check.valid) {
      return { ok: false, status: 400, error: 'invalid_full_name' };
    }
    if (!consent?.text || !consent?.acceptedAt) {
      return { ok: false, status: 400, error: 'invalid_consent' };
    }

    const profile = {
      fullName: check.fullName,
      createdAt: new Date().toISOString(),
    };
    writeJsonStorage(MOCK_PROFILE_KEY, profile);
    return { ok: true, status: 201, data: { profile } };
  }

  try {
    const res = await fetchJson('/api/profile', {
      method: 'POST',
      body: JSON.stringify({ fullName, consent, source }),
    });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: res.data?.error || 'profile_create_failed',
      };
    }
    return { ok: true, status: res.status, data: res.data };
  } catch {
    return { ok: false, status: 0, error: 'network_error' };
  }
}

export async function logout() {
  if (IS_MOCK_AUTH) {
    removeStorage(MOCK_USER_KEY);
    removeStorage(MOCK_PROFILE_KEY);
    return { ok: true };
  }

  try {
    const res = await fetchJson('/api/auth/logout', {
      method: 'POST',
      body: '{}',
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export async function deleteAccount() {
  if (IS_MOCK_AUTH) {
    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('mock_delete_error') === '1'
    ) {
      return { ok: false, status: 500, error: 'delete_failed' };
    }
    removeStorage(MOCK_USER_KEY);
    removeStorage(MOCK_PROFILE_KEY);
    return { ok: true, status: 204, error: null };
  }

  try {
    const res = await fetchJson('/api/account', {
      method: 'DELETE',
      body: '{}',
    });
    if (res.ok || res.status === 401) {
      return { ok: true, status: res.status, error: null };
    }
    return { ok: false, status: res.status, error: res.data?.error || 'delete_failed' };
  } catch {
    return { ok: false, status: 0, error: 'network_error' };
  }
}

const SAMPLE_MOCK_RELEASE = {
  published: true,
  version: '1.0.0',
  releasedAt: '2026-11-16',
  sizeBytes: 188743680,
  sha256: '4a7f2b91c8e3d0f561a9c4b2e7f0813d92ab540fe6317b89c2d01a4f7b8e110c',
  filename: 'AstroKid-Setup.exe',
  platform: 'Windows 10 / 11 (64-bit)',
};

function getMockReleaseOverride() {
  if (!IS_MOCK_AUTH || typeof window === 'undefined') return null;
  const param = new URLSearchParams(window.location.search).get('mock_release');
  if (param === 'published' || param === 'unpublished' || param === 'error') {
    return param;
  }
  return null;
}

export async function getReleaseInfo() {
  if (IS_MOCK_AUTH) {
    const mode = getMockReleaseOverride();
    if (mode === 'error') {
      return { ok: false, status: 0, error: 'network_error' };
    }
    if (mode === 'unpublished') {
      return { ok: true, status: 200, data: { published: false } };
    }
    if (mode === 'published' || readJsonStorage(MOCK_INSTALLER_KEY) === true) {
      return { ok: true, status: 200, data: { ...SAMPLE_MOCK_RELEASE } };
    }
    return { ok: true, status: 200, data: { published: false } };
  }

  try {
    const res = await fetch('/api/release', { credentials: 'same-origin' });
    if (!res.ok) {
      return { ok: false, status: res.status, error: 'release_fetch_failed' };
    }
    const data = await res.json();
    return { ok: true, status: 200, data };
  } catch {
    return { ok: false, status: 0, error: 'network_error' };
  }
}

export async function checkAndStartDownload() {
  if (IS_MOCK_AUTH) {
    const mode = getMockReleaseOverride();
    if (mode === 'error') {
      return { ok: false, status: 0, error: 'network_error' };
    }
    if (mode === 'unpublished') {
      return { ok: false, status: 404, error: 'not_published' };
    }
    const hasFile =
      mode === 'published' || readJsonStorage(MOCK_INSTALLER_KEY) === true;
    if (!hasFile) {
      return { ok: false, status: 404, error: 'not_published' };
    }
    return { ok: true, status: 200, mock: true };
  }

  try {
    const head = await fetch('/api/download', {
      method: 'HEAD',
      credentials: 'same-origin',
    });

    if (head.ok) {
      window.location.assign('/api/download');
      return { ok: true, status: 200 };
    }

    if (head.status === 404) {
      return { ok: false, status: 404, error: 'not_published' };
    }
    if (head.status === 401) {
      return { ok: false, status: 401, error: 'unauthenticated' };
    }
    if (head.status === 403) {
      return { ok: false, status: 403, error: 'profile_required' };
    }
    return { ok: false, status: head.status, error: 'download_failed' };
  } catch {
    return { ok: false, status: 0, error: 'network_error' };
  }
}
