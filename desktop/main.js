'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  protocol,
  screen,
  session,
  shell,
} = require('electron');

const pkg = require('./package.json');
if (!app) {
  console.error(
    'Astro Kid must be launched by Electron, not plain Node. If running from an IDE terminal, unset ELECTRON_RUN_AS_NODE.'
  );
  process.exit(1);
}
const {
  APP_ID,
  APP_ORIGIN,
  APP_SCHEME,
  APP_HOST,
  PRODUCT_NAME,
  SESSION_PARTITION,
  USER_DATA_NAME,
  resolveExternalUrl,
} = require('./src/config.js');
const { createLogger } = require('./src/logger.js');
const { handleAppRequest } = require('./src/protocol.js');
const {
  getSecureWebPreferences,
  installContentsSecurity,
  installSessionSecurity,
} = require('./src/security.js');
const { loadWindowState, saveWindowState } = require('./src/window-state.js');

const argv = process.argv.slice(1);
const hasFlag = (flag) => argv.includes(flag);

const isVersionFlag = hasFlag('--version');
const isQuitFlag = hasFlag('--quit');
const isSmoke = hasFlag('--smoke');
const isDev = hasFlag('--dev') && !app.isPackaged;
const resetWindow = hasFlag('--reset-window');

if (isVersionFlag) {
  process.stdout.write(`${PRODUCT_NAME} ${pkg.version}\n`);
  process.exit(0);
}

const t0 = Date.now();
const userDataDir = path.join(app.getPath('appData'), USER_DATA_NAME);
app.setPath('userData', userDataDir);
app.setAppUserModelId(APP_ID);

const gpuFlagPath = path.join(userDataDir, 'disable-hw-accel.flag');
const hwAccelDisabledByFlag = fs.existsSync(gpuFlagPath);
if (hwAccelDisabledByFlag) {
  app.disableHardwareAcceleration();
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: false,
    },
  },
]);

const gotLock = isSmoke ? true : app.requestSingleInstanceLock();
if (!gotLock || isQuitFlag) {
  app.exit(0);
  process.exit(0);
}

const logger = createLogger({
  logsDir: path.join(userDataDir, 'logs'),
  toConsole: isDev,
});

const gameDistDir = path.join(__dirname, 'game-dist');
const windowStatePath = path.join(userDataDir, 'window-state.json');
const devUrl = isDev && process.env.DESKTOP_DEV_URL ? process.env.DESKTOP_DEV_URL.trim() : '';
const startUrl = devUrl || `${APP_ORIGIN}/play.html?app=desktop`;
const allowDevTools = Boolean(isDev && !app.isPackaged);

let mainWindow = null;
let gameSession = null;
let isClosing = false;
let fatalDialogShown = false;
let gpuCrashes = 0;

function showFatalDialog(title, detail) {
  if (isSmoke || fatalDialogShown) return;
  fatalDialogShown = true;
  try {
    dialog.showErrorBox(title, detail);
  } catch {
    // Fallback if Electron isn't ready enough for GUI dialog
  }
}

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception in main: ${err && err.stack ? err.stack : err}`);
  if (isSmoke) {
    process.stdout.write(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }) + '\n');
    app.exit(1);
    return;
  }
  showFatalDialog(
    `${PRODUCT_NAME} encountered an unexpected error`,
    String(err && err.message ? err.message : err)
  );
  app.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection in main: ${reason && reason.stack ? reason.stack : reason}`);
  if (isSmoke) {
    process.stdout.write(JSON.stringify({ ok: false, error: String(reason) }) + '\n');
    app.exit(1);
    return;
  }
  showFatalDialog(`${PRODUCT_NAME} encountered an unexpected error`, String(reason));
});

async function flushAndCloseWindow(win) {
  if (!win || win.isDestroyed() || isClosing) return;
  isClosing = true;
  if (!isSmoke) {
    saveWindowState(windowStatePath, win);
  }
  try {
    const flushPromise = win.webContents
      .executeJavaScript(
        `(() => {
          try {
            window.dispatchEvent(new Event('pagehide'));
            document.dispatchEvent(new Event('visibilitychange'));
          } catch {}
          return true;
        })()`,
        true
      )
      .catch(() => {});
    await Promise.race([flushPromise, new Promise((r) => setTimeout(r, 300))]);
  } catch {
    // Renderer may already be gone
  }
  try {
    if (gameSession && typeof gameSession.flushStorageData === 'function') {
      gameSession.flushStorageData();
    }
  } catch {
    // Best-effort storage flush
  }
  if (!win.isDestroyed()) {
    win.destroy();
  }
}

function requestGracefulClose() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    void flushAndCloseWindow(mainWindow);
  } else {
    app.quit();
  }
}

if (!isSmoke && gotLock) {
  app.on('second-instance', (_event, secondArgv) => {
    if (Array.isArray(secondArgv) && secondArgv.includes('--quit')) {
      logger.info('Received --quit from second instance; closing gracefully.');
      requestGracefulClose();
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on('child-process-gone', (_event, details) => {
  logger.error(`Child process gone: type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`);
  if (details.type !== 'GPU') return;
  if (details.reason === 'clean-exit' || details.reason === 'killed') return;

  gpuCrashes += 1;
  if (gpuCrashes >= 2 && !hwAccelDisabledByFlag) {
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(gpuFlagPath, '1\n', 'utf8');
    } catch {
      // Ignore flag write failure
    }
    logger.warn('GPU process crashed twice in a row; relaunching with hardware acceleration disabled.');
    app.relaunch({ args: process.argv.slice(1).filter((a) => a !== '--smoke') });
    app.exit(0);
    return;
  }

  if (!isSmoke && mainWindow && !mainWindow.isDestroyed()) {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'error',
      title: PRODUCT_NAME,
      message: 'Graphics process stopped unexpectedly.',
      buttons: ['Reload Game', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 0) {
      void mainWindow.loadURL(startUrl);
    } else {
      requestGracefulClose();
    }
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.on('astrokid:getVersion', (event) => {
  event.returnValue = pkg.version;
});

ipcMain.handle('astrokid:toggleFullscreen', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

ipcMain.handle('astrokid:quit', () => {
  requestGracefulClose();
  return true;
});

ipcMain.handle('astrokid:openExternal', async (_event, key) => {
  const target = resolveExternalUrl(key);
  if (!target) {
    logger.warn(`Ignored openExternal for key=${String(key)}`);
    return false;
  }
  await shell.openExternal(target);
  return true;
});

async function runSmokeProbe(win, { blockedUrls, consoleErrors, timings }) {
  const timeoutMs = 40000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (win.isDestroyed()) {
      return { ok: false, error: 'Window destroyed before canvas mounted' };
    }
    const ready = await win.webContents
      .executeJavaScript(
        `(() => {
          const canvas = document.querySelector('#game canvas');
          return Boolean(canvas && canvas.width > 0 && canvas.height > 0);
        })()`,
        true
      )
      .catch(() => false);
    if (ready) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  const probe = await win.webContents
    .executeJavaScript(
      `(async () => {
        const canvas = document.querySelector('#game canvas');
        const fontSpecs = [
          '16px "Press Start 2P"',
          '16px "Silkscreen"',
          '700 16px "Silkscreen"',
          '500 16px "Chakra Petch"',
          '600 16px "Chakra Petch"',
          '700 16px "Chakra Petch"',
        ];
        await Promise.all(fontSpecs.map((spec) => document.fonts.load(spec)));
        await document.fonts.ready;
        const fontResults = {};
        for (const spec of fontSpecs) {
          fontResults[spec] = document.fonts.check(spec);
        }
        const fontsOk = Object.values(fontResults).every(Boolean);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const firstFrameTs = performance.now();
        const prevRaw = window.localStorage.getItem('ak_smoke_probe');
        const nextVal = String(Date.now()) + '-' + Math.random().toString(16).slice(2, 8);
        window.localStorage.setItem('ak_smoke_probe', nextVal);
        const readBack = window.localStorage.getItem('ak_smoke_probe');
        const demoShellPresent = Boolean(document.getElementById('demo-badge') || document.querySelector('.ds-backdrop'));
        return {
          canvasFound: Boolean(canvas && canvas.width > 0 && canvas.height > 0),
          canvasSize: canvas ? canvas.width + 'x' + canvas.height : null,
          fontsLoaded: fontsOk,
          fontResults,
          platform: window.astroKidDesktop ? window.astroKidDesktop.platform : null,
          version: window.astroKidDesktop ? window.astroKidDesktop.version : null,
          nodeIsolated: typeof require === 'undefined' && typeof process === 'undefined',
          localStorageWritten: readBack === nextVal,
          prevProbe: prevRaw,
          nextProbe: nextVal,
          demoShellSuppressed: !demoShellPresent,
          firstFrameMs: Math.round(firstFrameTs),
        };
      })()`,
      true
    )
    .catch((err) => ({ error: String(err) }));

  if (gameSession && typeof gameSession.flushStorageData === 'function') {
    gameSession.flushStorageData();
  }

  const canvasMs = Date.now() - t0;
  const ok = Boolean(
    probe &&
      !probe.error &&
      probe.canvasFound &&
      probe.fontsLoaded &&
      probe.platform === 'desktop' &&
      probe.nodeIsolated &&
      probe.localStorageWritten &&
      probe.demoShellSuppressed &&
      consoleErrors.length === 0 &&
      blockedUrls.length === 0
  );

  return {
    ok,
    ...probe,
    readyToShowMs: timings.readyToShowMs,
    canvasMs,
    consoleErrors,
    blockedUrls,
  };
}

app.whenReady().then(async () => {
  logger.info(
    `Starting ${PRODUCT_NAME} v${pkg.version} (packaged=${app.isPackaged}, dev=${isDev}, smoke=${isSmoke}, hwAccelDisabled=${hwAccelDisabledByFlag})`
  );
  Menu.setApplicationMenu(null);

  if (!devUrl && !fs.existsSync(path.join(gameDistDir, 'play.html'))) {
    const msg = `Missing game files at ${gameDistDir}. Please reinstall ${PRODUCT_NAME}.`;
    logger.error(msg);
    if (isSmoke) {
      process.stdout.write(JSON.stringify({ ok: false, error: msg }) + '\n');
      app.exit(3);
      return;
    }
    dialog.showErrorBox(`${PRODUCT_NAME} cannot start`, msg);
    app.exit(3);
    return;
  }

  gameSession = session.fromPartition(SESSION_PARTITION);
  if (!devUrl) {
    gameSession.protocol.handle(APP_SCHEME, (req) =>
      handleAppRequest(req, { gameDistDir, expectedHost: APP_HOST })
    );
  }

  const blockedUrls = [];
  const consoleErrors = [];
  installSessionSecurity(gameSession, {
    isDev,
    devOrigin: devUrl ? new URL(devUrl).origin : null,
    logger,
    onBlockedUrl: (url) => blockedUrls.push(url),
  });

  const displays = screen.getAllDisplays().map((d) => d.workArea);
  const initialState = loadWindowState(windowStatePath, displays, resetWindow || isSmoke);
  const iconPath = path.join(__dirname, 'build', 'icon.png');

  const win = new BrowserWindow({
    width: initialState.width,
    height: initialState.height,
    x: initialState.x,
    y: initialState.y,
    minWidth: 960,
    minHeight: 540,
    useContentSize: true,
    backgroundColor: '#060920',
    title: PRODUCT_NAME,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: getSecureWebPreferences({
      preloadPath: path.join(__dirname, 'preload.js'),
      partition: SESSION_PARTITION,
      allowDevTools,
    }),
  });
  mainWindow = win;

  const timings = { readyToShowMs: null };

  installContentsSecurity(win.webContents, {
    logger,
    allowDevTools,
    onBlockedUrl: (url) => blockedUrls.push(url),
  });

  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) {
      consoleErrors.push(message);
      logger.error(`Renderer console error: ${message}`);
    }
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    const isF11 = input.key === 'F11' && !input.control && !input.alt && !input.meta && !input.shift;
    const isAltEnter = input.key === 'Enter' && input.alt && !input.control && !input.meta;
    if (isF11 || isAltEnter) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });

  let saveTimer = null;
  const scheduleSave = () => {
    if (isSmoke || isClosing) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(windowStatePath, win), 250);
  };
  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('maximize', scheduleSave);
  win.on('unmaximize', scheduleSave);
  win.on('enter-full-screen', scheduleSave);
  win.on('leave-full-screen', scheduleSave);

  win.once('ready-to-show', () => {
    timings.readyToShowMs = Date.now() - t0;
    logger.info(`Window ready-to-show in ${timings.readyToShowMs}ms`);
    if (isSmoke) return;
    if (initialState.isMaximized) win.maximize();
    if (initialState.isFullScreen) win.setFullScreen(true);
    win.show();
  });

  win.on('close', (event) => {
    if (isClosing) return;
    clearTimeout(saveTimer);
    event.preventDefault();
    void flushAndCloseWindow(win);
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    logger.error(`Renderer process gone: reason=${details.reason} exitCode=${details.exitCode}`);
    if (isSmoke) {
      process.stdout.write(JSON.stringify({ ok: false, error: `render-process-gone:${details.reason}` }) + '\n');
      app.exit(1);
      return;
    }
    const choice = dialog.showMessageBoxSync(win, {
      type: 'error',
      title: PRODUCT_NAME,
      message: 'Astro Kid stopped responding.',
      detail: `Reason: ${details.reason}`,
      buttons: ['Reload Game', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 0) {
      void win.loadURL(startUrl);
    } else {
      requestGracefulClose();
    }
  });

  win.on('unresponsive', () => {
    logger.warn('Main window became unresponsive.');
    if (isSmoke) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: PRODUCT_NAME,
      message: 'Astro Kid is not responding.',
      buttons: ['Reload Game', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 0) {
      void win.loadURL(startUrl);
    } else {
      requestGracefulClose();
    }
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logger.error(`Failed to load ${validatedURL}: (${errorCode}) ${errorDescription}`);
    if (isSmoke) {
      process.stdout.write(JSON.stringify({ ok: false, error: `did-fail-load:${errorDescription}` }) + '\n');
      app.exit(1);
    }
  });

  await win.loadURL(startUrl);
  if (allowDevTools) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  if (isSmoke) {
    const report = await runSmokeProbe(win, { blockedUrls, consoleErrors, timings });
    process.stdout.write(JSON.stringify(report) + '\n');
    await flushAndCloseWindow(win);
    app.exit(report.ok ? 0 : 1);
  }
});
