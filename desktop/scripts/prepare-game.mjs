import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(desktopDir, '..');
const gameDir = path.join(repoDir, 'game');
const gameDistSrc = path.join(gameDir, 'dist');
const desktopGameDist = path.join(desktopDir, 'game-dist');

const GAME_ASSET_DIRS = [
  'assets/level01',
  'assets/backgrounds',
  'assets/ui',
  'assets/sprites',
  'assets/missions',
  'audio',
];

const EXCLUDED_DESCRIPTORS = [
  'index.html',
  'about.html',
  'download.html',
  'policies.html',
  'profile.html',
  'components.html',
  '404.html',
  '429.html',
  '500.html',
  'errors.css',
  'errors.js',
  'intro-gate.js',
  'demo-shell.css',
  'demo-shell.js',
  'robots.txt',
  'sitemap.xml',
  'og-cover.png',
  'lunar-base-favicon.webp',
  'lunar-base-favicon-transparent.png',
  'assets/about/',
  'assets/landing/',
  'assets/installer/',
  'assets/site-*.js|css',
];

const OFFLINE_FONTS = [
  {
    pkg: '@fontsource/press-start-2p',
    file: 'press-start-2p-latin-400-normal.woff2',
    family: 'Press Start 2P',
    style: 'normal',
    weight: 400,
  },
  {
    pkg: '@fontsource/silkscreen',
    file: 'silkscreen-latin-400-normal.woff2',
    family: 'Silkscreen',
    style: 'normal',
    weight: 400,
  },
  {
    pkg: '@fontsource/silkscreen',
    file: 'silkscreen-latin-700-normal.woff2',
    family: 'Silkscreen',
    style: 'normal',
    weight: 700,
  },
  {
    pkg: '@fontsource/chakra-petch',
    file: 'chakra-petch-latin-500-normal.woff2',
    family: 'Chakra Petch',
    style: 'normal',
    weight: 500,
  },
  {
    pkg: '@fontsource/chakra-petch',
    file: 'chakra-petch-latin-600-normal.woff2',
    family: 'Chakra Petch',
    style: 'normal',
    weight: 600,
  },
  {
    pkg: '@fontsource/chakra-petch',
    file: 'chakra-petch-latin-700-normal.woff2',
    family: 'Chakra Petch',
    style: 'normal',
    weight: 700,
  },
];

async function copyFileSafe(src, dst) {
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
}

async function copyDirRecursive(srcDir, dstDir) {
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  await fs.mkdir(dstDir, { recursive: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(src, dst);
    } else if (entry.isFile()) {
      await fs.copyFile(src, dst);
    }
  }
}

async function listFilesRecursive(dir) {
  const out = [];
  async function walk(cur) {
    const entries = await fs.readdir(cur, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const stat = await fs.stat(full);
        out.push({ full, rel: path.relative(dir, full).replace(/\\/g, '/'), size: stat.size });
      }
    }
  }
  await walk(dir);
  return out;
}

function collectHtmlReferences(html) {
  const refs = new Set();
  const tagRegex = /<(script|link)\b[^>]*>/gi;
  for (const m of html.matchAll(tagRegex)) {
    const tag = m[0];
    const relMatch = /\brel=["']([^"']+)["']/i.exec(tag);
    const relVal = relMatch ? relMatch[1].toLowerCase() : '';
    const hrefMatch = /\b(?:src|href)=["']([^"']+)["']/i.exec(tag);
    if (!hrefMatch) continue;
    if (m[1].toLowerCase() === 'link' && relVal === 'canonical') continue;
    refs.add(hrefMatch[1]);
  }
  return Array.from(refs);
}

async function collectJsImportsRecursively(initialRelPaths) {
  const queue = [...initialRelPaths];
  const visited = new Set();
  while (queue.length > 0) {
    const rel = queue.shift().replace(/^\.?\//, '');
    if (visited.has(rel) || !rel.endsWith('.js')) continue;
    visited.add(rel);
    const abs = path.join(gameDistSrc, rel);
    const text = await fs.readFile(abs, 'utf8').catch(() => null);
    if (!text) continue;
    const baseDir = path.posix.dirname(rel);
    for (const m of text.matchAll(/["'](\.[^"']+\.js)["']/g)) {
      const resolved = path.posix.normalize(path.posix.join(baseDir, m[1]));
      if (!visited.has(resolved)) {
        const candidateAbs = path.join(gameDistSrc, resolved);
        const st = await fs.stat(candidateAbs).catch(() => null);
        if (st && st.isFile()) queue.push(resolved);
      }
    }
  }
  return Array.from(visited);
}

function transformPlayHtmlForDesktop(rawHtml) {
  let out = rawHtml;
  let replacedFirstGoogleFont = false;

  // Replace Google Fonts links with single local /fonts/fonts.css and drop preconnect links
  out = out.replace(/<link\b[^>]*fonts\.googleapis\.com[^>]*\/?>/gi, (tag) => {
    if (/rel=["']preconnect["']/i.test(tag)) return '';
    if (!replacedFirstGoogleFont) {
      replacedFirstGoogleFont = true;
      return '<link rel="stylesheet" href="/fonts/fonts.css" />';
    }
    return '';
  });
  out = out.replace(/<link\b[^>]*fonts\.gstatic\.com[^>]*\/?>/gi, '');

  // Remove browser-only demo-shell tags (desktop app uses ?app=desktop and excludes demo-shell.*)
  out = out.replace(/<link\b[^>]*demo-shell\.css[^>]*\/?>/gi, '');
  out = out.replace(/<script\b[^>]*demo-shell\.js[^>]*><\/script>/gi, '');

  if (!replacedFirstGoogleFont) {
    throw new Error('Could not find fonts.googleapis.com link in built play.html to replace with local fonts.css');
  }
  return out.replace(/\n{3,}/g, '\n\n');
}

async function bundleOfflineFonts() {
  const fontsDir = path.join(desktopGameDist, 'fonts');
  await fs.mkdir(fontsDir, { recursive: true });
  const cssBlocks = [];

  for (const font of OFFLINE_FONTS) {
    const src = path.join(desktopDir, 'node_modules', font.pkg, 'files', font.file);
    const dst = path.join(fontsDir, font.file);
    await fs.copyFile(src, dst);
    cssBlocks.push(
      `@font-face {\n` +
        `  font-family: '${font.family}';\n` +
        `  font-style: ${font.style};\n` +
        `  font-weight: ${font.weight};\n` +
        `  font-display: swap;\n` +
        `  src: url('/fonts/${font.file}') format('woff2');\n` +
        `}\n`
    );
  }
  await fs.writeFile(path.join(fontsDir, 'fonts.css'), cssBlocks.join('\n'), 'utf8');
}

async function main() {
  const skipBuild = process.argv.includes('--skip-build');
  if (!skipBuild) {
    const res =
      process.platform === 'win32'
        ? spawnSync('npm run build', [], { cwd: gameDir, stdio: 'inherit', shell: true })
        : spawnSync('npm', ['run', 'build'], { cwd: gameDir, stdio: 'inherit' });
    if (res.status !== 0) {
      throw new Error(`Game build failed with exit code ${res.status}`);
    }
  }

  const rawPlayPath = path.join(gameDistSrc, 'play.html');
  const rawPlayHtml = await fs.readFile(rawPlayPath, 'utf8');

  await fs.rm(desktopGameDist, { recursive: true, force: true });
  await fs.mkdir(desktopGameDist, { recursive: true });

  const desktopPlayHtml = transformPlayHtmlForDesktop(rawPlayHtml);
  await fs.writeFile(path.join(desktopGameDist, 'play.html'), desktopPlayHtml, 'utf8');

  // Bundle offline fonts first so /fonts/fonts.css exists for reference verification
  await bundleOfflineFonts();

  // Copy boot-loader and favicon assets needed by play.html
  const staticRootKeep = [
    'boot-loader.css',
    'boot-loader.js',
    'favicon.ico',
    'favicon-16.png',
    'favicon-32.png',
    'favicon-180.png',
    'favicon-512.png',
  ];
  for (const name of staticRootKeep) {
    const src = path.join(gameDistSrc, name);
    const st = await fs.stat(src).catch(() => null);
    if (st && st.isFile()) {
      await copyFileSafe(src, path.join(desktopGameDist, name));
    }
  }

  // Copy only the Vite JS/CSS chunks referenced directly or transitively from play.html
  const htmlRefs = collectHtmlReferences(desktopPlayHtml);
  const directChunkRefs = htmlRefs
    .map((r) => r.replace(/^\.?\//, ''))
    .filter((r) => r.startsWith('assets/') && /\.(js|css)$/i.test(r));
  const jsDeps = await collectJsImportsRecursively(directChunkRefs.filter((r) => r.endsWith('.js')));
  const allChunkRefs = Array.from(new Set([...directChunkRefs, ...jsDeps]));

  for (const rel of allChunkRefs) {
    const src = path.join(gameDistSrc, rel);
    const st = await fs.stat(src).catch(() => null);
    if (!st || !st.isFile()) {
      throw new Error(`play.html chunk reference missing from game/dist: ${rel}`);
    }
    await copyFileSafe(src, path.join(desktopGameDist, rel));
  }

  // Copy game art & audio asset directories
  for (const dirRel of GAME_ASSET_DIRS) {
    const srcDir = path.join(gameDistSrc, dirRel);
    const st = await fs.stat(srcDir).catch(() => null);
    if (!st || !st.isDirectory()) {
      throw new Error(`Required game asset folder missing: ${srcDir}`);
    }
    await copyDirRecursive(srcDir, path.join(desktopGameDist, dirRel));
  }

  // Strict reference verification: fail if play.html points to anything missing or excluded
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com|demo-shell\./i.test(desktopPlayHtml)) {
    throw new Error('Desktop play.html still references external fonts or demo-shell');
  }
  for (const ref of htmlRefs) {
    if (/^(?:https?:|data:|blob:)/i.test(ref)) {
      throw new Error(`Disallowed external URL in desktop play.html: ${ref}`);
    }
    const cleanRel = ref.replace(/^\.?\//, '').split(/[?#]/)[0];
    const target = path.join(desktopGameDist, cleanRel);
    const st = await fs.stat(target).catch(() => null);
    if (!st || !st.isFile()) {
      throw new Error(`play.html references missing or excluded file: ${ref}`);
    }
  }

  // Print inventory & 20 largest files
  const files = await listFilesRecursive(desktopGameDist);
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  files.sort((a, b) => b.size - a.size);

  console.log(`\nPrepared desktop/game-dist (${files.length} files, ${(totalBytes / (1024 * 1024)).toFixed(2)} MiB / ${totalBytes.toLocaleString()} B)`);
  console.log(`Excluded site files/dirs: ${EXCLUDED_DESCRIPTORS.join(', ')}`);
  console.log('Top 20 largest files in desktop/game-dist:');
  for (const item of files.slice(0, 20)) {
    console.log(`  ${String(item.size).padStart(10, ' ')} B  ${item.rel}`);
  }
}

await main();
