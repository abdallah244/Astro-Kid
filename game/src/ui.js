import { COLORS, HEX, PIXEL, toColorNum } from './config.js';
import { audio } from './core/audio.js';

export function ensureFocusController(scene) {
  if (scene._uiFocus) {
    return scene._uiFocus;
  }

  const state = {
    items: [],
    index: -1,
    showRing: false,
  };

  const syncVisuals = () => {
    state.items.forEach((item, idx) => {
      if (item.setFocused) {
        item.setFocused(idx === state.index, state.showRing);
      }
    });
  };

  state.focusItem = (targetItem, showRing = false) => {
    const idx = state.items.indexOf(targetItem);
    if (idx !== -1) {
      state.index = idx;
      state.showRing = showRing;
      syncVisuals();
    }
  };

  state.setIndex = (idx, showRing = false) => {
    state.index = idx;
    state.showRing = showRing;
    syncVisuals();
  };

  state.sync = syncVisuals;

  const onKeyDown = (event) => {
    if (!state.items.length) return;

    if (event.code === 'Tab') {
      event.preventDefault();
      state.showRing = true;
      if (state.index < 0) {
        state.index = 0;
      } else {
        const delta = event.shiftKey ? state.items.length - 1 : 1;
        state.index = (state.index + delta) % state.items.length;
      }
      syncVisuals();
      return;
    }

    const active = state.index >= 0 ? state.items[state.index] : null;
    if (!active) return;

    if (event.code === 'Enter' || event.code === 'Space') {
      if (active.onActivate && (event.code === 'Enter' || active.allowSpace !== false)) {
        event.preventDefault();
        active.onActivate();
      }
      return;
    }

    if (event.code === 'ArrowLeft' && active.onLeft) {
      event.preventDefault();
      active.onLeft();
      return;
    }

    if (event.code === 'ArrowRight' && active.onRight) {
      event.preventDefault();
      active.onRight();
      return;
    }

    if (event.code === 'ArrowUp' && active.onUp) {
      event.preventDefault();
      active.onUp();
      return;
    }

    if (event.code === 'ArrowDown' && active.onDown) {
      event.preventDefault();
      active.onDown();
    }
  };

  if (scene.input && scene.input.keyboard) {
    scene.input.keyboard.on('keydown', onKeyDown);
  }

  scene.events.once('shutdown', () => {
    if (scene.input && scene.input.keyboard) {
      scene.input.keyboard.off('keydown', onKeyDown);
    }
    scene._uiFocus = null;
  });

  scene._uiFocus = state;
  return state;
}

export function registerFocusable(scene, item, { autoFocus = false } = {}) {
  const focus = ensureFocusController(scene);
  focus.items.push(item);
  if (autoFocus && focus.index === -1) {
    focus.index = focus.items.length - 1;
  }
  focus.sync();
  return item;
}

export function pixelButton(
  scene,
  {
    x,
    y,
    w,
    h,
    label,
    fontSize = 16,
    fill = COLORS.blueButton,
    shade,
    shadeColor,
    border = 5,
    depth,
    textColor = COLORS.white,
    onClick,
    icon = false,
    autoFocus = true,
  }
) {
  const depthPx = depth ?? (h >= 70 ? 8 : 6);
  const shadePx = typeof shade === 'number' ? shade : h >= 70 ? 8 : 6;
  const fillNum = toColorNum(fill);
  const resolvedShadeHex =
    typeof shade === 'string'
      ? toColorNum(shade)
      : shadeColor
        ? toColorNum(shadeColor)
        : fillNum === HEX.yellow
          ? HEX.yellowShade
          : HEX.blueShade;

  // 1. Drop shadow rect
  const shadowGfx = scene.add.graphics();
  shadowGfx.fillStyle(HEX.ink, 1);
  shadowGfx.fillRect(x, y + depthPx, w, h);

  // 2-4. Border rect, fill rect, shade strip, and optional icon
  const bodyGfx = scene.add.graphics();
  bodyGfx.fillStyle(HEX.ink, 1);
  bodyGfx.fillRect(x, y, w, h);

  const innerX = x + border;
  const innerY = y + border;
  const innerW = w - border * 2;
  const innerH = h - border * 2;

  bodyGfx.fillStyle(fillNum, 1);
  bodyGfx.fillRect(innerX, innerY, innerW, innerH);

  bodyGfx.fillStyle(resolvedShadeHex, 1);
  bodyGfx.fillRect(innerX, innerY + innerH - shadePx, innerW, shadePx);

  // 5. Centered label (+ optional play triangle icon left of label with 22px gap)
  const textObj = scene.add.text(0, 0, label, {
    fontFamily: PIXEL,
    fontSize: `${fontSize}px`,
    color: textColor,
  });

  const baseTextY = Math.round(y + h / 2);

  if (icon) {
    const iconW = 20;
    const iconH = 35;
    const gap = 22;
    const totalW = iconW + gap + textObj.width;
    const startX = Math.round(x + (w - totalW) / 2);
    const iconX = startX;
    const iconY = Math.round(y + (h - iconH) / 2);

    bodyGfx.fillStyle(HEX.ink, 1);
    bodyGfx.fillRect(iconX + 0, iconY + 0, 5, 35);
    bodyGfx.fillRect(iconX + 5, iconY + 5, 5, 25);
    bodyGfx.fillRect(iconX + 10, iconY + 10, 5, 15);
    bodyGfx.fillRect(iconX + 15, iconY + 15, 5, 5);

    textObj.setOrigin(0, 0.5);
    textObj.setPosition(iconX + iconW + gap, baseTextY);
  } else {
    textObj.setOrigin(0.5, 0.5);
    textObj.setPosition(Math.round(x + w / 2), baseTextY);
  }

  // Keyboard focus outline (shown when navigating with Tab)
  const focusGfx = scene.add.graphics();
  const ringColor = fillNum === HEX.yellow ? HEX.white : HEX.yellow;
  focusGfx.fillStyle(ringColor, 1);
  focusGfx.fillRect(x - 3, y - 3, w + 6, 3);
  focusGfx.fillRect(x - 3, y + h, w + 6, 3);
  focusGfx.fillRect(x - 3, y, 3, h);
  focusGfx.fillRect(x + w, y, 3, h);
  focusGfx.setVisible(false);

  let isHovered = false;
  let isDown = false;
  let offsetY = 0;

  const applyOffset = (dy) => {
    offsetY = dy;
    bodyGfx.y = offsetY;
    textObj.y = baseTextY + offsetY;
    focusGfx.y = offsetY;
  };

  // Stationary full-rect hit zone prevents hover edge jitter
  const hitZone = scene.add
    .zone(x, y, w, h)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: true });

  const trigger = () => {
    audio.click();
    if (onClick) {
      onClick();
    }
  };

  const focusItem = registerFocusable(
    scene,
    {
      onActivate: trigger,
      setFocused(focused, showRing) {
        focusGfx.setVisible(Boolean(focused && showRing));
      },
    },
    { autoFocus }
  );

  hitZone.on('pointerover', () => {
    isHovered = true;
    if (!isDown) {
      applyOffset(-4);
    }
  });

  hitZone.on('pointerout', () => {
    isHovered = false;
    isDown = false;
    applyOffset(0);
  });

  hitZone.on('pointerdown', () => {
    isDown = true;
    if (scene._uiFocus) {
      scene._uiFocus.focusItem(focusItem, false);
    }
    applyOffset(4);
  });

  hitZone.on('pointerup', () => {
    const wasDown = isDown;
    isDown = false;
    applyOffset(isHovered ? -4 : 0);
    if (wasDown && isHovered) {
      trigger();
    }
  });

  return {
    shadowGfx,
    bodyGfx,
    textObj,
    focusGfx,
    hitZone,
    focusItem,
  };
}

export function pixelPanel(
  scene,
  {
    x,
    y,
    w,
    h,
    fill = COLORS.panel,
    border = 6,
    inner = COLORS.panelBorderLight,
    depth = 8,
  }
) {
  const innerThickness = typeof inner === 'number' ? inner : 4;
  const innerColorNum =
    typeof inner === 'string' ? toColorNum(inner) : HEX.panelBorderLight;
  const fillNum = toColorNum(fill);

  const gfx = scene.add.graphics();

  // Drop shadow
  gfx.fillStyle(HEX.ink, 1);
  gfx.fillRect(x, y + depth, w, h);

  // Outer ink border
  gfx.fillStyle(HEX.ink, 1);
  gfx.fillRect(x, y, w, h);

  // Inner 4px outline inset by border
  gfx.fillStyle(innerColorNum, 1);
  gfx.fillRect(x + border, y + border, w - border * 2, h - border * 2);

  // Interior fill
  const pad = border + innerThickness;
  gfx.fillStyle(fillNum, 1);
  gfx.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);

  return gfx;
}

export function createAstroKidTitle(scene, { y, fontSize }) {
  const astro = scene.add
    .text(0, y, 'ASTRO', {
      fontFamily: PIXEL,
      fontSize: `${fontSize}px`,
      color: COLORS.white,
      stroke: COLORS.ink,
      strokeThickness: 4,
      padding: { top: 0, bottom: 8 },
    })
    .setOrigin(0, 0);
  astro.setShadow(0, 6, COLORS.astroShadow, 0, true, true);

  const kid = scene.add
    .text(0, y, 'KID', {
      fontFamily: PIXEL,
      fontSize: `${fontSize}px`,
      color: COLORS.yellow,
      stroke: COLORS.ink,
      strokeThickness: 4,
      padding: { top: 0, bottom: 8 },
    })
    .setOrigin(0, 0);
  kid.setShadow(0, 6, COLORS.orange, 0, true, true);

  // Word gap is 0.5 em (a full Press Start space is 1 em and looks too wide).
  const wordGap = Math.round(fontSize * 0.5);
  const totalWidth = astro.width + wordGap + kid.width;
  const startX = Math.round(640 - totalWidth / 2);
  astro.setPosition(startX, y);
  kid.setPosition(Math.round(startX + astro.width + wordGap), y);

  return { astro, kid };
}
