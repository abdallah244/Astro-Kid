'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { resolveExternalUrl } = require('../src/config.js');
const { sanitizeLogMessage, rotateIfNeeded } = require('../src/logger.js');
const {
  getCacheControl,
  getMimeType,
  parseRangeHeader,
  resolveSafePath,
} = require('../src/protocol.js');
const {
  DESKTOP_CSP,
  getSecureWebPreferences,
  isAllowedRequestUrl,
} = require('../src/security.js');
const { MIN_HEIGHT, MIN_WIDTH, sanitizeWindowState } = require('../src/window-state.js');

test('resolveSafePath blocks path traversal, backslashes, drive letters, null bytes, and maps root cleanly', () => {
  const root = path.resolve('C:\\astrokid-test-root\\game-dist');

  const rootRes = resolveSafePath(root, '/');
  assert.equal(rootRes.relPath, 'play.html');
  assert.equal(rootRes.absPath, path.join(root, 'play.html'));

  const assetRes = resolveSafePath(root, '/assets/level01/world/ground_a.png');
  assert.equal(assetRes.relPath, 'assets/level01/world/ground_a.png');

  const blockedInputs = [
    '/../package.json',
    '/../../Windows/win.ini',
    '/%2e%2e/package.json',
    '/%252e%252e/package.json',
    '/assets/..%2f..%2fmain.js',
    '/assets\\..\\main.js',
    '/%5c..%5cmain.js',
    '/C:/Windows/System32/cmd.exe',
    'C:\\Windows\\win.ini',
    '/play.html\0.png',
    '/%00/play.html',
  ];
  for (const input of blockedInputs) {
    assert.equal(resolveSafePath(root, input), null, `Expected traversal blocked for: ${input}`);
  }
});

test('getMimeType and getCacheControl cover every game extension and caching policy', () => {
  assert.equal(getMimeType('play.html'), 'text/html; charset=utf-8');
  assert.equal(getMimeType('bundle.js'), 'text/javascript; charset=utf-8');
  assert.equal(getMimeType('fonts.css'), 'text/css; charset=utf-8');
  assert.equal(getMimeType('data.json'), 'application/json; charset=utf-8');
  assert.equal(getMimeType('sprite.png'), 'image/png');
  assert.equal(getMimeType('bg.webp'), 'image/webp');
  assert.equal(getMimeType('icon.svg'), 'image/svg+xml');
  assert.equal(getMimeType('music.ogg'), 'audio/ogg');
  assert.equal(getMimeType('clip.mp3'), 'audio/mpeg');
  assert.equal(getMimeType('sfx.wav'), 'audio/wav');
  assert.equal(getMimeType('font.woff2'), 'font/woff2');

  assert.equal(getCacheControl('play.html'), 'no-cache');
  assert.equal(getCacheControl('assets/phaser-DlholqvV.js'), 'public, max-age=31536000, immutable');
  assert.equal(getCacheControl('audio/mus/MUS_Main_Menu.ogg'), 'public, max-age=86400');
});

test('parseRangeHeader handles explicit, open-ended, suffix, malformed, and out-of-bounds ranges', () => {
  assert.equal(parseRangeHeader(null, 1000), null);
  assert.deepEqual(parseRangeHeader('bytes=0-99', 1000), { start: 0, end: 99, length: 100 });
  assert.deepEqual(parseRangeHeader('bytes=500-', 1000), { start: 500, end: 999, length: 500 });
  assert.deepEqual(parseRangeHeader('bytes=-200', 1000), { start: 800, end: 999, length: 200 });
  assert.deepEqual(parseRangeHeader('bytes=500-9999', 1000), { start: 500, end: 999, length: 500 });
  assert.deepEqual(parseRangeHeader('bytes=1000-1200', 1000), { unsatisfiable: true });
  assert.deepEqual(parseRangeHeader('bytes=400-100', 1000), { unsatisfiable: true });
  assert.deepEqual(parseRangeHeader('items=0-10', 1000), { unsatisfiable: true });
});

test('sanitizeWindowState handles NaN, tiny, huge, valid multi-monitor, and unplugged off-screen positions', () => {
  const displays = [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: 1920, y: 0, width: 1920, height: 1080 },
  ];

  // NaN / garbage inputs fall back cleanly
  const nanState = sanitizeWindowState(
    { width: Number.NaN, height: 'bad', x: Infinity, y: -Infinity, isMaximized: 'yes' },
    displays
  );
  assert.equal(nanState.width, 1280);
  assert.equal(nanState.height, 720);
  assert.equal(nanState.x, undefined);
  assert.equal(nanState.y, undefined);

  // Tiny window clamps up to min 960x540
  const tinyState = sanitizeWindowState({ width: 200, height: 120, x: 50, y: 50 }, displays);
  assert.equal(tinyState.width, MIN_WIDTH);
  assert.equal(tinyState.height, MIN_HEIGHT);
  assert.equal(tinyState.x, 50);

  // Huge window clamps down to monitor workArea
  const hugeState = sanitizeWindowState({ width: 8000, height: 5000, x: 0, y: 0 }, displays);
  assert.equal(hugeState.width, 1920);
  assert.equal(hugeState.height, 1040);

  // Saved on unplugged 2nd monitor falls back to centered primary bounds
  const unpluggedState = sanitizeWindowState(
    { width: 1400, height: 800, x: 2200, y: 100, isFullScreen: true },
    [displays[0]]
  );
  assert.equal(unpluggedState.x, undefined);
  assert.equal(unpluggedState.y, undefined);
  assert.equal(unpluggedState.width, 1400);
  assert.equal(unpluggedState.isFullScreen, true);
});

test('resolveExternalUrl strictly allowlists website/privacy/terms/support keys', () => {
  assert.equal(resolveExternalUrl('support'), 'mailto:abdallahhfares@gmail.com');
  assert.equal(resolveExternalUrl('website', '[Website URL]'), null);
  assert.equal(resolveExternalUrl('website', 'https://astrokid.example'), 'https://astrokid.example/');
  assert.equal(
    resolveExternalUrl('privacy', 'https://astrokid.example/'),
    'https://astrokid.example/policies.html#privacy'
  );
  assert.equal(
    resolveExternalUrl('terms', 'https://astrokid.example'),
    'https://astrokid.example/policies.html#terms'
  );
  assert.equal(resolveExternalUrl('javascript:alert(1)', 'https://astrokid.example'), null);
  assert.equal(resolveExternalUrl('file:///c:/windows', 'https://astrokid.example'), null);
  assert.equal(resolveExternalUrl('evil', 'https://astrokid.example'), null);
});

test('DESKTOP_CSP contains no external hosts and security lockdown enforces isolation & offline policy', () => {
  assert.equal(/https?:\/\//i.test(DESKTOP_CSP), false);
  assert.equal(/fonts\.googleapis|fonts\.gstatic/i.test(DESKTOP_CSP), false);
  assert.ok(DESKTOP_CSP.includes("font-src 'self'"));
  assert.ok(DESKTOP_CSP.includes("object-src 'none'"));
  assert.ok(DESKTOP_CSP.includes("frame-ancestors 'none'"));

  const prefs = getSecureWebPreferences({ preloadPath: 'preload.js', partition: 'persist:astrokid', allowDevTools: false });
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.webSecurity, true);
  assert.equal(prefs.webviewTag, false);
  assert.equal(prefs.devTools, false);
  assert.equal(prefs.autoplayPolicy, 'no-user-gesture-required');

  assert.equal(isAllowedRequestUrl('app://astrokid/play.html'), true);
  assert.equal(isAllowedRequestUrl('data:image/png;base64,AA=='), true);
  assert.equal(isAllowedRequestUrl('blob:app://astrokid/abc'), true);
  assert.equal(isAllowedRequestUrl('https://fonts.googleapis.com/css2'), false);
  assert.equal(isAllowedRequestUrl('http://localhost:5173/play.html'), false);
  assert.equal(isAllowedRequestUrl('file:///C:/Windows/win.ini'), false);
  assert.equal(isAllowedRequestUrl('devtools://devtools/bundled/inspector.html', { isDev: false }), false);
  assert.equal(isAllowedRequestUrl('devtools://devtools/bundled/inspector.html', { isDev: true }), true);
});

test('logger redacts emails and rotates main.log cleanly up to 3 files', () => {
  assert.equal(
    sanitizeLogMessage('Signed user test.player@example.com\nnext line'),
    'Signed user [redacted-email] next line'
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-log-test-'));
  try {
    const logPath = path.join(tmpDir, 'main.log');
    fs.writeFileSync(logPath, 'x'.repeat(200), 'utf8');
    rotateIfNeeded(logPath, 50, 220, 3);
    assert.equal(fs.existsSync(`${logPath}.1`), true);
    fs.writeFileSync(logPath, 'y'.repeat(200), 'utf8');
    rotateIfNeeded(logPath, 50, 220, 3);
    assert.equal(fs.existsSync(`${logPath}.2`), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
