'use strict';

const APP_ID = 'com.abdallahhany.astrokid';
const PRODUCT_NAME = 'Astro Kid';
const AUTHOR = 'Abdallah Hany';
const USER_DATA_NAME = 'Astro Kid';
const SESSION_PARTITION = 'persist:astrokid';

const APP_SCHEME = 'app';
const APP_HOST = 'astrokid';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

const WEBSITE_URL = process.env.ASTROKID_WEBSITE_URL || '[Website URL]';
const SUPPORT_EMAIL = 'abdallahhfares@gmail.com';

const ALLOWED_EXTERNAL_KEYS = Object.freeze(['website', 'privacy', 'terms', 'support']);

/**
 * Resolve an allowlisted external link key into a safe URL for shell.openExternal,
 * or null if unknown or if WEBSITE_URL is still an unconfigured placeholder.
 */
function resolveExternalUrl(key, websiteUrl = WEBSITE_URL, supportEmail = SUPPORT_EMAIL) {
  if (key === 'support') {
    return `mailto:${supportEmail}`;
  }
  if (!ALLOWED_EXTERNAL_KEYS.includes(key)) {
    return null;
  }
  if (typeof websiteUrl !== 'string' || !/^https?:\/\//i.test(websiteUrl)) {
    return null;
  }
  const base = websiteUrl.replace(/\/+$/, '');
  if (key === 'website') return `${base}/`;
  if (key === 'privacy') return `${base}/policies.html#privacy`;
  if (key === 'terms') return `${base}/policies.html#terms`;
  return null;
}

module.exports = {
  APP_ID,
  PRODUCT_NAME,
  AUTHOR,
  USER_DATA_NAME,
  SESSION_PARTITION,
  APP_SCHEME,
  APP_HOST,
  APP_ORIGIN,
  WEBSITE_URL,
  SUPPORT_EMAIL,
  ALLOWED_EXTERNAL_KEYS,
  resolveExternalUrl,
};
