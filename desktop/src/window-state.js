'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIN_WIDTH = 960;
const MIN_HEIGHT = 540;
const DEFAULT_WINDOW_STATE = Object.freeze({
  width: 1280,
  height: 720,
  x: undefined,
  y: undefined,
  isMaximized: false,
  isFullScreen: false,
});

function hasSufficientOverlap(bounds, area) {
  if (!area || area.width <= 0 || area.height <= 0) return false;
  const overlapX =
    Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
  const overlapY =
    Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
  const titleBarVisible = bounds.y >= area.y - 8 && bounds.y <= area.y + area.height - 48;
  return overlapX >= 100 && overlapY >= 60 && titleBarVisible;
}

/**
 * Clamp/validate persisted bounds against the current display workAreas.
 * Pure so unit tests can verify off-screen, NaN, tiny, and oversized cases cleanly.
 */
function sanitizeWindowState(raw, displays = []) {
  const validDisplays = Array.isArray(displays)
    ? displays.filter(
        (d) =>
          d &&
          Number.isFinite(d.x) &&
          Number.isFinite(d.y) &&
          Number.isFinite(d.width) &&
          Number.isFinite(d.height) &&
          d.width > 0 &&
          d.height > 0
      )
    : [];
  const primary = validDisplays[0] || { x: 0, y: 0, width: 1920, height: 1080 };

  if (!raw || typeof raw !== 'object') {
    return {
      width: Math.min(DEFAULT_WINDOW_STATE.width, Math.max(MIN_WIDTH, primary.width)),
      height: Math.min(DEFAULT_WINDOW_STATE.height, Math.max(MIN_HEIGHT, primary.height)),
      x: undefined,
      y: undefined,
      isMaximized: false,
      isFullScreen: false,
    };
  }

  let width = Number.isFinite(raw.width) ? Math.round(raw.width) : DEFAULT_WINDOW_STATE.width;
  let height = Number.isFinite(raw.height) ? Math.round(raw.height) : DEFAULT_WINDOW_STATE.height;

  width = Math.max(MIN_WIDTH, width);
  height = Math.max(MIN_HEIGHT, height);

  const hasCoords = Number.isFinite(raw.x) && Number.isFinite(raw.y);
  let x = hasCoords ? Math.round(raw.x) : undefined;
  let y = hasCoords ? Math.round(raw.y) : undefined;

  let matchedDisplay = primary;
  if (hasCoords && validDisplays.length > 0) {
    const candidate = { x, y, width, height };
    const hit = validDisplays.find((area) => hasSufficientOverlap(candidate, area));
    if (hit) {
      matchedDisplay = hit;
    } else {
      // Saved monitor unplugged or window moved off-screen: fall back centered
      x = undefined;
      y = undefined;
    }
  } else if (hasCoords && validDisplays.length === 0) {
    if (x < -width + 100 || y < -8) {
      x = undefined;
      y = undefined;
    }
  }

  // Prevent window larger than its matched monitor workArea
  const maxW = Math.max(MIN_WIDTH, matchedDisplay.width);
  const maxH = Math.max(MIN_HEIGHT, matchedDisplay.height);
  width = Math.min(width, maxW);
  height = Math.min(height, maxH);

  return {
    width,
    height,
    x,
    y,
    isMaximized: Boolean(raw.isMaximized),
    isFullScreen: Boolean(raw.isFullScreen),
  };
}

function loadWindowState(filePath, displays, reset = false) {
  if (reset) {
    return sanitizeWindowState(null, displays);
  }
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return sanitizeWindowState(JSON.parse(text), displays);
  } catch {
    return sanitizeWindowState(null, displays);
  }
}

function saveWindowState(filePath, win) {
  if (!win || win.isDestroyed()) return;
  try {
    const isMaximized = win.isMaximized();
    const isFullScreen = win.isFullScreen();
    const normal = typeof win.getNormalBounds === 'function' ? win.getNormalBounds() : win.getContentBounds();
    let prev = {};
    try {
      prev = JSON.parse(fs.readFileSync(filePath, 'utf8')) || {};
    } catch {
      prev = {};
    }
    const payload = {
      width: isMaximized || isFullScreen ? (prev.width || normal.width) : normal.width,
      height: isMaximized || isFullScreen ? (prev.height || normal.height) : normal.height,
      x: isMaximized || isFullScreen ? prev.x : normal.x,
      y: isMaximized || isFullScreen ? prev.y : normal.y,
      isMaximized,
      isFullScreen,
    };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // Ignore write failure
  }
}

module.exports = {
  MIN_WIDTH,
  MIN_HEIGHT,
  DEFAULT_WINDOW_STATE,
  sanitizeWindowState,
  loadWindowState,
  saveWindowState,
};
