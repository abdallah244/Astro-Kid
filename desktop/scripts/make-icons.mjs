import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');
const sourcePng = path.resolve(desktopDir, '..', 'game', 'public', 'favicon-512.png');
const buildDir = path.join(desktopDir, 'build');
const outPng = path.join(buildDir, 'icon.png');
const outIco = path.join(buildDir, 'icon.ico');

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function packPngsAsIco(entries) {
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = headerSize + dirEntrySize * entries.length;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dirBuffers = [];
  let offset = dirSize;
  for (const { size, png } of entries) {
    const entry = Buffer.alloc(dirEntrySize);
    const dim = size >= 256 ? 0 : size;
    entry.writeUInt8(dim, 0);
    entry.writeUInt8(dim, 1);
    entry.writeUInt8(0, 2); // color palette count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirBuffers.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...dirBuffers, ...entries.map((e) => e.png)]);
}

async function main() {
  await fs.mkdir(buildDir, { recursive: true });
  const srcStat = await fs.stat(sourcePng).catch(() => null);
  if (!srcStat || !srcStat.isFile()) {
    throw new Error(`Missing source icon at ${sourcePng}`);
  }

  // Nearest-neighbor resize keeps pixel-art crisp at every Windows icon resolution
  const png512 = await sharp(sourcePng)
    .resize(512, 512, { fit: 'contain', kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
  await fs.writeFile(outPng, png512);

  const icoEntries = [];
  for (const size of ICO_SIZES) {
    const png = await sharp(sourcePng)
      .resize(size, size, { fit: 'contain', kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    icoEntries.push({ size, png });
  }

  const icoBuffer = packPngsAsIco(icoEntries);
  await fs.writeFile(outIco, icoBuffer);

  console.log(`Generated ${path.relative(desktopDir, outPng)} (512x512, ${png512.length} B)`);
  console.log(
    `Generated ${path.relative(desktopDir, outIco)} (${ICO_SIZES.join(', ')} px, ${icoBuffer.length} B)`
  );
}

await main();
