'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_FILES = 3;

function sanitizeLogMessage(input) {
  return String(input || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
    .trim();
}

function rotateIfNeeded(logPath, incomingBytes, maxBytes = DEFAULT_MAX_BYTES, maxFiles = DEFAULT_MAX_FILES) {
  let currentSize = 0;
  try {
    currentSize = fs.statSync(logPath).size;
  } catch {
    return;
  }
  if (currentSize + incomingBytes <= maxBytes) {
    return;
  }
  const oldest = `${logPath}.${maxFiles - 1}`;
  try {
    if (fs.existsSync(oldest)) fs.unlinkSync(oldest);
  } catch {
    // Ignore rotation cleanup errors
  }
  for (let i = maxFiles - 2; i >= 1; i -= 1) {
    const src = `${logPath}.${i}`;
    const dst = `${logPath}.${i + 1}`;
    try {
      if (fs.existsSync(src)) fs.renameSync(src, dst);
    } catch {
      // Ignore rename error
    }
  }
  try {
    fs.renameSync(logPath, `${logPath}.1`);
  } catch {
    // Ignore active file rename error
  }
}

function createLogger({
  logsDir,
  fileName = 'main.log',
  toConsole = false,
  maxBytes = DEFAULT_MAX_BYTES,
  maxFiles = DEFAULT_MAX_FILES,
} = {}) {
  const logPath = logsDir ? path.join(logsDir, fileName) : null;
  if (logsDir) {
    try {
      fs.mkdirSync(logsDir, { recursive: true });
    } catch {
      // Ignore directory failure; log writes become best-effort
    }
  }

  function write(level, message) {
    const line = `${new Date().toISOString()} [${level}] ${sanitizeLogMessage(message)}\n`;
    if (toConsole) {
      const fn = level === 'ERROR' ? console.error : console.log;
      fn(line.trimEnd());
    }
    if (!logPath) return;
    try {
      rotateIfNeeded(logPath, Buffer.byteLength(line, 'utf8'), maxBytes, maxFiles);
      fs.appendFileSync(logPath, line, 'utf8');
    } catch {
      // Never crash the app over logging IO failure
    }
  }

  return {
    logPath,
    info: (msg) => write('INFO', msg),
    warn: (msg) => write('WARN', msg),
    error: (msg) => write('ERROR', msg),
  };
}

module.exports = {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_FILES,
  sanitizeLogMessage,
  rotateIfNeeded,
  createLogger,
};
