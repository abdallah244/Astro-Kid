'use strict';

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, Menu, ipcMain } = require('electron');

if (!app) {
  console.error('Installer must be launched by Electron, not plain Node.');
  process.exit(1);
}

/**
 * Delete a folder tree that may contain `.asar` files. Inside Electron the `fs` module treats an `.asar`
 * archive as a directory, so a plain `fs.rm` leaves `resources/app.asar` behind (54 MB of garbage after a
 * rollback or an uninstall). `process.noAsar` switches that behaviour off for the duration of the delete.
 */
async function removeTree(target) {
  const previous = process.noAsar;
  process.noAsar = true;
  try {
    await fs.promises.rm(target, { recursive: true, force: true });
  } finally {
    process.noAsar = previous;
  }
}

const t0 = Date.now();
const argv = process.argv.slice(1);
const isBenchmark = argv.includes('--spike-benchmark');
const isDev = argv.includes('--dev') && !app.isPackaged;
const startedAtArg = argv.find((a) => a.startsWith('--started-at='));
const spawnStartMs = startedAtArg ? Number(startedAtArg.slice('--started-at='.length)) : t0;

const resourcesBase = app.isPackaged ? process.resourcesPath : path.join(__dirname, 'extraResources');
const payloadPath = path.join(resourcesBase, 'payload.7z');
const manifestPath = path.join(resourcesBase, 'payload-manifest.json');

function get7zaExecutable() {
  const { path7za } = require('7zip-bin');
  return app.isPackaged ? path7za.replace('app.asar', 'app.asar.unpacked') : path7za;
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return {
      productName: 'Astro Kid',
      version: '0.1.0',
      platform: 'Windows 10 / 11 · 64-bit',
      unpackedBytes: 0,
      payloadBytes: 0,
    };
  }
}

let mainWindow = null;
let activeChild = null;
let activeTempDir = null;
let installCancelled = false;

function sendProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('installer:progress', payload);
  }
}

async function verifyPayloadSha256(expectedHex) {
  if (!expectedHex) return;
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(payloadPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  const actual = hash.digest('hex');
  if (actual !== expectedHex) {
    throw new Error(`E-1101: Payload SHA-256 mismatch (expected ${expectedHex.slice(0, 12)}, got ${actual.slice(0, 12)})`);
  }
}

async function extractPayloadToTemp(targetDir, manifest) {
  const path7za = get7zaExecutable();
  if (!fs.existsSync(payloadPath)) {
    throw new Error(`Missing payload archive at ${payloadPath}`);
  }
  await verifyPayloadSha256(manifest.payloadSha256);

  await removeTree(targetDir);
  await fs.promises.mkdir(targetDir, { recursive: true });
  activeTempDir = targetDir;
  installCancelled = false;

  const extractStart = Date.now();
  let lastPercent = 0;
  let lastEmitAt = 0;
  sendProgress({ phase: 'extracting', percent: 0, label: 'Extracting game files…', targetDir });

  await new Promise((resolve, reject) => {
    const child = spawn(path7za, ['x', payloadPath, `-o${targetDir}`, '-y', '-bsp1'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    activeChild = child;
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const parts = chunk.toString('utf8').split(/[\r\n]+/);
      for (const part of parts) {
        const m = /(\d{1,3})%/.exec(part);
        if (!m) continue;
        const pct = Math.min(99, Math.max(lastPercent, Number(m[1])));
        const now = Date.now();
        if (pct > lastPercent && (now - lastEmitAt >= 80 || pct === 99)) {
          lastPercent = pct;
          lastEmitAt = now;
          sendProgress({
            phase: 'extracting',
            percent: pct,
            label: 'Extracting game files…',
            targetDir,
          });
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      activeChild = null;
      reject(err);
    });

    child.on('exit', (code) => {
      activeChild = null;
      if (installCancelled) {
        reject(new Error('CANCELLED'));
        return;
      }
      if (code !== 0) {
        reject(new Error(`7za extraction failed (exit=${code}): ${stderr.trim().slice(0, 200)}`));
        return;
      }
      resolve();
    });
  });

  const extractMs = Date.now() - extractStart;
  sendProgress({
    phase: 'done',
    percent: 100,
    label: 'Extraction complete (Step 0 temp spike)',
    extractMs,
    targetDir,
  });
  return { extractMs, targetDir };
}

async function cleanupTemp() {
  if (activeChild) {
    installCancelled = true;
    try {
      activeChild.kill();
    } catch {
      // ignore
    }
    activeChild = null;
  }
  if (activeTempDir) {
    const dirToClean = activeTempDir;
    activeTempDir = null;
    await removeTree(dirToClean).catch(() => {});
  }
}

ipcMain.handle('installer:getManifest', () => readManifest());
ipcMain.handle('installer:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});
ipcMain.handle('installer:close', async () => {
  await cleanupTemp();
  app.quit();
});
ipcMain.handle('installer:cancelInstall', async () => {
  await cleanupTemp();
  app.quit();
});
ipcMain.handle('installer:startSpikeInstall', async () => {
  const manifest = readManifest();
  const tempTarget = path.join(os.tmpdir(), `AstroKid-Spike-${Date.now()}`);
  try {
    const result = await extractPayloadToTemp(tempTarget, manifest);
    return { ok: true, ...result };
  } catch (err) {
    await cleanupTemp();
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

app.on('window-all-closed', () => {
  void cleanupTemp().finally(() => app.quit());
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const manifest = readManifest();

  const win = new BrowserWindow({
    width: 880,
    height: 600,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    frame: false,
    backgroundColor: '#060920',
    title: 'Astro Kid Setup',
    icon: path.join(__dirname, 'assets', 'favicon-48.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: isDev,
    },
  });
  mainWindow = win;

  let readyToShowMs = null;
  win.once('ready-to-show', async () => {
    readyToShowMs = Date.now() - spawnStartMs;
    if (!isBenchmark) {
      win.show();
      return;
    }
    const benchDir = path.join(os.tmpdir(), `AstroKid-Spike-Bench-${Date.now()}`);
    const tUiExtract = Date.now();
    const result = await extractPayloadToTemp(benchDir, manifest).catch((err) => ({
      error: err && err.message ? err.message : String(err),
    }));
    const unpackedExists = fs.existsSync(path.join(benchDir, 'Astro Kid.exe'));
    await removeTree(benchDir).catch(() => {});

    const report = {
      ok: Boolean(result && !result.error && unpackedExists),
      coldStartToVisibleMs: readyToShowMs,
      readyFromMainMs: Date.now() - t0 - (Date.now() - tUiExtract),
      extractMs: result.extractMs ?? null,
      unpackedExePresent: unpackedExists,
      payloadBytes: manifest.payloadBytes,
      unpackedBytes: manifest.unpackedBytes,
      version: manifest.version,
      logWrittenAt: path.join(os.tmpdir(), 'AstroKid-Setup-spike.json'),
    };
    try {
      fs.writeFileSync(report.logWrittenAt, JSON.stringify(report, null, 2), 'utf8');
    } catch {
      // ignore
    }
    process.stdout.write(JSON.stringify(report) + '\n');
    app.exit(report.ok ? 0 : 1);
  });

  await win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
});
