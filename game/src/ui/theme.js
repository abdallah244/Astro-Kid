export const UI = {
  font: "'Chakra Petch'",
  navy: 0x0a0f2c,
  navy2: 0x171d48,
  border: 0x8e9af0,
  inner: 0x1c2366,
  shadow: 0x070a1c,
  gold: '#ffc83d',
  white: '#ffffff',
  soft: '#aeb7ea',
  green: 0x99e105,
  greenCss: '#99e105',
  cyan: '#3fd2ff',
  orange: 0xffb02e,
  red: '#ff7b7b',
};

function lerpColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return (r << 16) | (g << 8) | b;
}

export function drawUiPanel(gfx, x, y, w, h, borderColor = UI.border) {
  gfx.clear();

  // Base rounded background fill
  gfx.fillStyle(UI.navy, 1);
  gfx.fillRoundedRect(x, y, w, h, 10);

  // Vertical gradient from navy2 (top) to navy (bottom) using 8 horizontal bands
  const bands = 8;
  const innerX = x + 3;
  const innerY = y + 3;
  const innerW = Math.max(0, w - 6);
  const innerH = Math.max(0, h - 6);

  for (let i = 0; i < bands; i += 1) {
    const t = i / (bands - 1);
    const bandColor = lerpColor(UI.navy2, UI.navy, t);
    const by0 = innerY + Math.round((i * innerH) / bands);
    const by1 = innerY + Math.round(((i + 1) * innerH) / bands);
    const bh = by1 - by0;
    if (bh <= 0) continue;

    // Slight corner inset on top and bottom bands so corners stay inside radius 10
    const cornerInset = i === 0 || i === bands - 1 ? 3 : 0;
    gfx.fillStyle(bandColor, 1);
    gfx.fillRect(
      innerX + cornerInset,
      by0,
      Math.max(0, innerW - cornerInset * 2),
      bh
    );
  }

  // 2 px outer outline color shadow
  gfx.lineStyle(2, UI.shadow, 1);
  gfx.strokeRoundedRect(x - 1, y - 1, w + 2, h + 2, 11);

  // Inner 2 px outline color inner inset 3 px
  gfx.lineStyle(2, UI.inner, 1);
  gfx.strokeRoundedRect(x + 4, y + 4, Math.max(0, w - 8), Math.max(0, h - 8), 7);

  // Main 3 px border with radius 10
  gfx.lineStyle(3, borderColor, 1);
  gfx.strokeRoundedRect(x + 1.5, y + 1.5, Math.max(0, w - 3), Math.max(0, h - 3), 10);

  return gfx;
}

export function uiPanel(scene, x, y, w, h) {
  const gfx = scene.add.graphics();
  return drawUiPanel(gfx, x, y, w, h, UI.border);
}

export default UI;

// Interactive children of a scrollFactor-0 container must also have scrollFactor 0,
// otherwise their hit areas move with the camera and clicks miss.
export function fixUiScroll(obj) {
  if (!obj) return;
  if (obj.setScrollFactor) obj.setScrollFactor(0);
  if (obj.list) obj.list.forEach(fixUiScroll);
}

export function registerUi(scene, obj) {
  if (!scene || !obj) return;
  if (!Array.isArray(scene.uiObjects)) {
    scene.uiObjects = [];
  }
  const items = Array.isArray(obj) ? obj : [obj];
  const added = [];
  for (const item of items) {
    if (!item) continue;
    if (!scene.uiObjects.includes(item)) {
      scene.uiObjects.push(item);
      added.push(item);
    }
  }
  if (
    added.length > 0 &&
    scene.minimap &&
    typeof scene.minimap.ignore === 'function'
  ) {
    scene.minimap.ignore(added);
  }
}

export function ensureLightTextures(scene) {
  if (
    !scene ||
    !scene.textures ||
    typeof scene.textures.createCanvas !== 'function'
  ) {
    return;
  }

  if (!scene.textures.exists('light_radial')) {
    const tex = scene.textures.createCanvas('light_radial', 512, 512);
    if (tex && tex.context) {
      const ctx = tex.context;
      ctx.clearRect(0, 0, 512, 512);
      const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.7)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);
      tex.refresh();
    }
  }

  if (!scene.textures.exists('light_cone')) {
    const tex = scene.textures.createCanvas('light_cone', 512, 512);
    if (tex && tex.context) {
      const ctx = tex.context;
      ctx.clearRect(0, 0, 512, 512);

      // 56 degrees total angle (+/- 28 degrees) from apex (0, 256) to right edge x = 512,
      // drawn with subtle soft angular edge feathering + linear x fade 0.95 -> 0
      const halfRad = (28 * Math.PI) / 180;
      const layers = 6;
      for (let i = 0; i < layers; i += 1) {
        const t = i / (layers - 1);
        const ang = halfRad * (1 - t * 0.14);
        const dy = 512 * Math.tan(ang);
        const peakAlpha = i === 0 ? 0.35 : 0.95 / layers + 0.04;
        const grad = ctx.createLinearGradient(0, 256, 512, 256);
        grad.addColorStop(0, `rgba(255,255,255,${Math.min(0.95, peakAlpha)})`);
        grad.addColorStop(0.55, `rgba(255,255,255,${Math.min(0.65, peakAlpha * 0.65)})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, 256);
        ctx.lineTo(512, 256 - dy);
        ctx.lineTo(512, 256 + dy);
        ctx.closePath();
        ctx.fill();
      }
      tex.refresh();
    }
  }
}
