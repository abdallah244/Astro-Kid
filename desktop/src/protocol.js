'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { DESKTOP_CSP } = require('./security.js');

const MIME_MAP = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
});

function getMimeType(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

function getCacheControl(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/').toLowerCase();
  if (normalized.endsWith('.html')) return 'no-cache';
  if (/^assets\/.+-[a-z0-9_-]{6,}\.(js|css)$/.test(normalized)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=86400';
}

/**
 * Safely map a URL pathname under rootDir, returning null on any traversal attempt
 * (.. segments, backslashes, Windows drive letters, null bytes, or escaping rootDir).
 */
function resolveSafePath(rootDir, requestPath) {
  if (typeof requestPath !== 'string') return null;
  let pathname = requestPath;
  if (pathname.includes('\\') || pathname.includes('\0')) return null;

  // Iteratively decode up to 2 passes to catch double-encoded traversal (%252e%252e)
  for (let i = 0; i < 2; i += 1) {
    if (/%00/i.test(pathname) || /%5c/i.test(pathname)) return null;
    try {
      const next = decodeURIComponent(pathname);
      if (next === pathname) break;
      pathname = next;
    } catch {
      return null;
    }
    if (pathname.includes('\\') || pathname.includes('\0')) return null;
  }

  if (/^[A-Za-z]:/.test(pathname)) return null;
  const trimmed = pathname.replace(/^\/+/, '');
  const rel = trimmed === '' ? 'play.html' : trimmed;
  const segments = rel.split('/');
  for (const seg of segments) {
    if (seg === '..' || seg === '.' || /^[A-Za-z]:/.test(seg)) {
      return null;
    }
  }

  const rootAbs = path.resolve(rootDir);
  const candidate = path.resolve(rootAbs, ...segments);
  const rootPrefix = rootAbs.endsWith(path.sep) ? rootAbs : rootAbs + path.sep;
  if (candidate !== rootAbs && !candidate.startsWith(rootPrefix)) {
    return null;
  }
  return { absPath: candidate, relPath: segments.join('/') };
}

/**
 * Parse a single HTTP byte-range header against totalSize.
 * Returns null if header is absent/ignored, { unsatisfiable: true } on 416, or { start, end, length }.
 */
function parseRangeHeader(rangeHeader, totalSize) {
  if (!rangeHeader || typeof rangeHeader !== 'string') return null;
  if (!Number.isInteger(totalSize) || totalSize <= 0) {
    return { unsatisfiable: true };
  }
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return { unsatisfiable: true };

  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return { unsatisfiable: true };

  let start;
  let end;
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return { unsatisfiable: true };
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else if (rawEnd === '') {
    start = Number(rawStart);
    end = totalSize - 1;
  } else {
    start = Number(rawStart);
    end = Number(rawEnd);
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start >= totalSize ||
    start > end
  ) {
    return { unsatisfiable: true };
  }

  end = Math.min(end, totalSize - 1);
  return { start, end, length: end - start + 1 };
}

function baseHeaders(extra = {}) {
  return {
    'Content-Security-Policy': DESKTOP_CSP,
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  };
}

/**
 * Handle an Electron `protocol.handle` Fetch Request for `app://astrokid/<path>`.
 */
async function handleAppRequest(request, { gameDistDir, expectedHost = 'astrokid' }) {
  const method = (request.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: baseHeaders({ Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return new Response('Not Found', {
      status: 404,
      headers: baseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }

  if (url.hostname && url.hostname.toLowerCase() !== expectedHost) {
    return new Response('Not Found', {
      status: 404,
      headers: baseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }

  const resolved = resolveSafePath(gameDistDir, url.pathname || '/');
  if (!resolved) {
    return new Response('Not Found', {
      status: 404,
      headers: baseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }

  let stat;
  try {
    stat = await fs.promises.stat(resolved.absPath);
  } catch {
    return new Response('Not Found', {
      status: 404,
      headers: baseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }

  if (!stat.isFile()) {
    return new Response('Not Found', {
      status: 404,
      headers: baseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }

  const totalSize = stat.size;
  const contentType = getMimeType(resolved.absPath);
  const cacheControl = getCacheControl(resolved.relPath);
  const rangeHeader = request.headers && typeof request.headers.get === 'function'
    ? request.headers.get('range')
    : null;

  const range = parseRangeHeader(rangeHeader, totalSize);
  if (range && range.unsatisfiable) {
    return new Response(null, {
      status: 416,
      headers: baseHeaders({
        'Content-Range': `bytes */${totalSize}`,
        'Accept-Ranges': 'bytes',
      }),
    });
  }

  if (range) {
    const headers = baseHeaders({
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${range.start}-${range.end}/${totalSize}`,
      'Content-Length': String(range.length),
    });
    if (method === 'HEAD') {
      return new Response(null, { status: 206, headers });
    }
    const stream = Readable.toWeb(
      fs.createReadStream(resolved.absPath, { start: range.start, end: range.end })
    );
    return new Response(stream, { status: 206, headers });
  }

  const headers = baseHeaders({
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(totalSize),
  });
  if (method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }
  const stream = Readable.toWeb(fs.createReadStream(resolved.absPath));
  return new Response(stream, { status: 200, headers });
}

module.exports = {
  MIME_MAP,
  getMimeType,
  getCacheControl,
  resolveSafePath,
  parseRangeHeader,
  handleAppRequest,
};
