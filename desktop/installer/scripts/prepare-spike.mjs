import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const installerDir = path.resolve(__dirname, '..');
const desktopDir = path.resolve(installerDir, '..');
const repoDir = path.resolve(desktopDir, '..');
const winUnpackedDir = path.join(desktopDir, 'dist', 'win-unpacked');
const appExe = path.join(winUnpackedDir, 'Astro Kid.exe');
const extraDir = path.join(installerDir, 'extraResources');
const assetsDir = path.join(installerDir, 'assets');
const fontsOutDir = path.join(assetsDir, 'fonts');

const FONT_FILES = [
  {
    pkg: '@fontsource/press-start-2p',
    file: 'press-start-2p-latin-400-normal.woff2',
    family: 'Press Start 2P',
    weight: 400,
  },
  {
    pkg: '@fontsource/silkscreen',
    file: 'silkscreen-latin-400-normal.woff2',
    family: 'Silkscreen',
    weight: 400,
  },
  {
    pkg: '@fontsource/silkscreen',
    file: 'silkscreen-latin-700-normal.woff2',
    family: 'Silkscreen',
    weight: 700,
  },
  {
    pkg: '@fontsource/chakra-petch',
    file: 'chakra-petch-latin-500-normal.woff2',
    family: 'Chakra Petch',
    weight: 500,
  },
  {
    pkg: '@fontsource/chakra-petch',
    file: 'chakra-petch-latin-600-normal.woff2',
    family: 'Chakra Petch',
    weight: 600,
  },
];

function get7zaPath() {
  try {
    return require('7zip-bin').path7za;
  } catch {
    return require(path.join(desktopDir, 'node_modules', '7zip-bin', 'index.js')).path7za;
  }
}

async function folderStats(dir) {
  let bytes = 0;
  let files = 0;
  async function walk(cur) {
    const entries = await fs.readdir(cur, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const st = await fs.stat(full);
        bytes += st.size;
        files += 1;
      }
    }
  }
  await walk(dir);
  return { bytes, files };
}

async function copyStaticAssets() {
  await fs.rm(assetsDir, { recursive: true, force: true });
  await fs.mkdir(fontsOutDir, { recursive: true });

  const copies = [
    ['game/public/assets/installer/inst_scene.png', 'inst_scene.png'],
    ['game/public/favicon-48.png', 'favicon-48.png'],
    ['game/public/assets/landing/nova.png', 'nova.png'],
  ];
  for (const [relSrc, relDst] of copies) {
    const src = path.join(repoDir, relSrc);
    const dst = path.join(assetsDir, relDst);
    await fs.copyFile(src, dst);
  }

  const fontCss = [];
  for (const f of FONT_FILES) {
    const src = path.join(desktopDir, 'node_modules', f.pkg, 'files', f.file);
    const dst = path.join(fontsOutDir, f.file);
    await fs.copyFile(src, dst);
    fontCss.push(
      `@font-face {\n` +
        `  font-family: '${f.family}';\n` +
        `  font-style: normal;\n` +
        `  font-weight: ${f.weight};\n` +
        `  font-display: swap;\n` +
        `  src: url('./${f.file}') format('woff2');\n` +
        `}\n`
    );
  }
  await fs.writeFile(path.join(fontsOutDir, 'fonts.css'), fontCss.join('\n'), 'utf8');
}

async function buildPayloadArchive() {
  const exeStat = await fs.stat(appExe).catch(() => null);
  if (!exeStat || !exeStat.isFile()) {
    throw new Error(`Missing unpacked game at ${appExe}. Run npm --prefix desktop run dist:dir first.`);
  }

  // Read live version from Astro Kid.exe --version with ELECTRON_RUN_AS_NODE cleared
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const verRes = spawnSync(appExe, ['--version'], { env: cleanEnv, encoding: 'utf8' });
  const versionMatch = String(verRes.stdout || '').match(/Astro Kid\s+([0-9]+\.[0-9]+\.[0-9]+[^\s]*)/i);
  const version = versionMatch ? versionMatch[1] : '0.1.0';

  const stats = await folderStats(winUnpackedDir);
  await fs.rm(extraDir, { recursive: true, force: true });
  await fs.mkdir(extraDir, { recursive: true });

  const payloadPath = path.join(extraDir, 'payload.7z');
  const path7za = get7zaPath();
  console.log(`Compressing ${winUnpackedDir} into payload.7z (-mx=5)...`);
  const t0 = Date.now();
  const zRes = spawnSync(path7za, ['a', '-t7z', '-mx=5', '-mmt=on', payloadPath, '*'], {
    cwd: winUnpackedDir,
    stdio: 'inherit',
  });
  if (zRes.status !== 0) {
    throw new Error(`7za failed with exit code ${zRes.status}`);
  }
  const archiveBytes = (await fs.stat(payloadPath)).size;
  const archiveBuf = await fs.readFile(payloadPath);
  const payloadSha256 = createHash('sha256').update(archiveBuf).digest('hex');

  const manifest = {
    productName: 'Astro Kid',
    version,
    platform: 'Windows 10 / 11 · 64-bit',
    unpackedBytes: stats.bytes,
    fileCount: stats.files,
    payloadBytes: archiveBytes,
    payloadSha256,
    builtAt: new Date().toISOString().slice(0, 10),
  };
  await fs.writeFile(path.join(extraDir, 'payload-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(
    `Prepared payload.7z in ${((Date.now() - t0) / 1000).toFixed(2)}s: ` +
      `${archiveBytes.toLocaleString()} B (${(archiveBytes / (1024 * 1024)).toFixed(2)} MiB) ` +
      `from ${stats.files} unpacked files (${(stats.bytes / (1024 * 1024)).toFixed(2)} MiB), v${version}`
  );
}

async function main() {
  await copyStaticAssets();
  await buildPayloadArchive();
}

await main();
