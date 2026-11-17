'use strict';

const DESKTOP_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob: data:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

/**
 * Pure check for whether a network request URL is allowed inside the desktop app.
 * Blocks all external HTTP/HTTPS/WS/file traffic in production; only app://, data:, blob: pass.
 */
function isAllowedRequestUrl(rawUrl, { isDev = false, devOrigin = null } = {}) {
  if (typeof rawUrl !== 'string' || !rawUrl) return false;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  const scheme = parsed.protocol.toLowerCase();
  if (scheme === 'app:' || scheme === 'data:' || scheme === 'blob:') {
    return true;
  }
  if (isDev && scheme === 'devtools:') {
    return true;
  }
  if (isDev && devOrigin) {
    try {
      const allowedDev = new URL(devOrigin);
      if (parsed.origin === allowedDev.origin) return true;
      if (
        (scheme === 'ws:' || scheme === 'wss:') &&
        parsed.hostname === allowedDev.hostname &&
        parsed.port === allowedDev.port
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

function getSecureWebPreferences({ preloadPath, partition, allowDevTools = false } = {}) {
  return {
    preload: preloadPath,
    partition,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: false,
    autoplayPolicy: 'no-user-gesture-required',
    webviewTag: false,
    devTools: Boolean(allowDevTools),
  };
}

function installSessionSecurity(ses, { isDev = false, devOrigin = null, logger = null, onBlockedUrl = null } = {}) {
  const loggedBlocked = new Set();

  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = isAllowedRequestUrl(details.url, { isDev, devOrigin });
    if (allowed) {
      callback({ cancel: false });
      return;
    }
    if (!loggedBlocked.has(details.url)) {
      loggedBlocked.add(details.url);
      if (logger) logger.warn(`Blocked external network request: ${details.url}`);
      if (typeof onBlockedUrl === 'function') onBlockedUrl(details.url);
    }
    callback({ cancel: true });
  });

  ses.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  ses.setPermissionCheckHandler(() => false);
}

function installContentsSecurity(webContents, { logger = null, allowDevTools = false, onBlockedUrl = null } = {}) {
  webContents.on('will-navigate', (event, targetUrl) => {
    event.preventDefault();
    if (logger) logger.warn(`Blocked navigation attempt: ${targetUrl}`);
    if (typeof onBlockedUrl === 'function') onBlockedUrl(targetUrl);
  });

  webContents.on('will-redirect', (event, targetUrl) => {
    event.preventDefault();
    if (logger) logger.warn(`Blocked redirect attempt: ${targetUrl}`);
    if (typeof onBlockedUrl === 'function') onBlockedUrl(targetUrl);
  });

  webContents.setWindowOpenHandler(({ url }) => {
    if (logger) logger.warn(`Blocked window.open attempt: ${url}`);
    if (typeof onBlockedUrl === 'function') onBlockedUrl(url);
    return { action: 'deny' };
  });

  if (!allowDevTools) {
    webContents.on('before-input-event', (event, input) => {
      const key = String(input.key || '').toUpperCase();
      const ctrlOrCmd = Boolean(input.control || input.meta);
      const isDevToolsShortcut =
        key === 'F12' || (ctrlOrCmd && input.shift && (key === 'I' || key === 'J' || key === 'C'));
      if (isDevToolsShortcut) {
        event.preventDefault();
      }
    });
  }
}

module.exports = {
  DESKTOP_CSP,
  isAllowedRequestUrl,
  getSecureWebPreferences,
  installSessionSecurity,
  installContentsSecurity,
};
