import assert from 'node:assert/strict';
import test from 'node:test';

await import('../public/demo-shell.js');
const shell = globalThis.__akDemoShell;

test('isDesktopApp detects Electron UA and ?app=desktop query parameter', () => {
  assert.equal(shell.isDesktopApp({ userAgent: 'Mozilla/5.0 Electron/31.2.0 Chrome/126', search: '' }), true);
  assert.equal(shell.isDesktopApp({ userAgent: 'Mozilla/5.0 Windows NT 10.0 Chrome/130', search: '?app=desktop' }), true);
  assert.equal(shell.isDesktopApp({ userAgent: 'Mozilla/5.0 Windows NT 10.0 Chrome/130', search: '?foo=1&app=desktop' }), true);
  assert.equal(shell.isDesktopApp({ userAgent: 'Mozilla/5.0 Windows NT 10.0 Chrome/130', search: '' }), false);
  assert.equal(shell.isDesktopApp({ userAgent: 'Mozilla/5.0 Windows NT 10.0 Chrome/130', search: '?app=web' }), false);
});

test('shouldGateTouchDevice gates phones, narrow screens, and touch-only devices, but allows touch-capable laptops', () => {
  // Mobile phone
  assert.equal(
    shell.shouldGateTouchDevice({ hasCoarse: true, hasFine: false, innerWidth: 390, maxTouchPoints: 5 }),
    true
  );
  // Desktop narrow window (< 900px)
  assert.equal(
    shell.shouldGateTouchDevice({ hasCoarse: false, hasFine: true, innerWidth: 820, maxTouchPoints: 0 }),
    true
  );
  // Touch-only tablet at 1024px without fine pointer
  assert.equal(
    shell.shouldGateTouchDevice({ hasCoarse: true, hasFine: false, innerWidth: 1024, maxTouchPoints: 5 }),
    true
  );
  // Windows touchscreen laptop (1366px, mouse + touch) -> must NOT be blocked
  assert.equal(
    shell.shouldGateTouchDevice({ hasCoarse: false, hasFine: true, innerWidth: 1366, maxTouchPoints: 10 }),
    false
  );
  // Standard desktop
  assert.equal(
    shell.shouldGateTouchDevice({ hasCoarse: false, hasFine: true, innerWidth: 1280, maxTouchPoints: 0 }),
    false
  );
});

test('parseMetaFlags reads ak-build and ak-demo-notice cleanly', () => {
  const mockDoc = (values) => ({
    querySelector(sel) {
      const m = sel.match(/meta\[name="([^"]+)"\]/);
      if (!m || !(m[1] in values)) return null;
      return { getAttribute: () => values[m[1]] };
    },
  });

  assert.deepEqual(shell.parseMetaFlags(mockDoc({ 'ak-build': '2026-11-16', 'ak-demo-notice': 'true' })), {
    buildDate: '2026-11-16',
    noticeEnabled: true,
  });
  assert.deepEqual(shell.parseMetaFlags(mockDoc({ 'ak-build': '2026-12-01', 'ak-demo-notice': 'false' })), {
    buildDate: '2026-12-01',
    noticeEnabled: false,
  });
  assert.deepEqual(shell.parseMetaFlags(mockDoc({})), {
    buildDate: 'dev',
    noticeEnabled: true,
  });
});

test('hasSeenNotice and markNoticeSeen persist in storage and survive storage errors', () => {
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
  };
  assert.equal(shell.hasSeenNotice(storage), false);
  assert.equal(shell.markNoticeSeen(storage), true);
  assert.equal(shell.hasSeenNotice(storage), true);

  const broken = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(shell.hasSeenNotice(broken), false);
  assert.equal(shell.markNoticeSeen(broken), false);
});

test('buildReportHref creates sanitized mailto URL with build, browser, and optional error', () => {
  const bugHref = shell.buildReportHref({
    buildDate: '2026-11-16',
    userAgent: 'TestBrowser/1.0\r\nInjected: bad',
  });
  assert.ok(bugHref.startsWith('mailto:abdallahhfares@gmail.com?subject=Astro%20Kid%20Demo%20Bug&body='));
  const bodyDecoded = decodeURIComponent(bugHref.split('&body=')[1]);
  assert.ok(bodyDecoded.includes('Build: 2026-11-16'));
  assert.ok(bodyDecoded.includes('Browser: TestBrowser/1.0 Injected: bad'));

  const errHref = shell.buildReportHref({
    buildDate: '2026-11-16',
    userAgent: 'UA',
    errorSummary: 'WebGL lost context',
  });
  assert.ok(errHref.includes('subject=Astro%20Kid%20Demo%20Startup%20Error'));
  assert.ok(decodeURIComponent(errHref).includes('Error: WebGL lost context'));
});

test('site intent helper only persists download and purges legacy demo intent', async () => {
  const store = new Map([['ak_intent', 'demo']]);
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const intent = await import('../src/site/js/intent.js');
  assert.equal(intent.getIntent(), null);
  assert.equal(store.has('ak_intent'), false);
  intent.setIntent('demo');
  assert.equal(intent.getIntent(), null);
  intent.setIntent('download');
  assert.equal(intent.getIntent(), 'download');
});
