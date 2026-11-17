import Phaser from 'phaser';
import { SaveManager } from '../save.js';
import { UI, registerUi } from './theme.js';

const BASE_X = 250;
const BASE_Y = 446;
const SLIDE_OFFSET = 200;

export const SPEAKER_META = {
  'DR. KARIM': {
    name: 'Dr. Karim',
    portrait: 'dlg_karim',
    radio: true,
  },
  MISSION_CONTROL: {
    name: 'Mission Control',
    portrait: 'dlg_karim',
    radio: true,
  },
  NOVA: {
    name: 'NOVA',
    portrait: 'dlg_nova',
    radio: false,
  },
  ASTRONAUT: {
    name: 'Astronaut',
    portrait: 'dlg_astro',
    radio: false,
  },
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

function getInteractKeyLabel() {
  const saved = SaveManager.get();
  const keys = saved && saved.settings && saved.settings.keys;
  const primary =
    keys && Array.isArray(keys.interact) && keys.interact[0]
      ? keys.interact[0]
      : 'E';
  return String(primary).toUpperCase();
}

export class DialogueBox {
  constructor(scene) {
    this.scene = scene;
    this.isVisible = false;
    this._slideTween = null;

    this.container = scene.add
      .container(BASE_X, BASE_Y + SLIDE_OFFSET)
      .setScrollFactor(0)
      .setDepth(120)
      .setVisible(false);

    // 1. Name tab graphics at (146, -22), height 32
    this.tabGfx = scene.add.graphics();

    // Blinking 10x10 red dot for radio speakers
    this.radioDot = scene.add.graphics();
    this.radioDot.fillStyle(0xff4b4b, 1);
    this.radioDot.fillCircle(5, 5, 5);
    this.radioDot.setVisible(false);

    this.speakerText = scene.add
      .text(171, -6, '', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0, 0.5);

    this.radioSuffixText = scene.add
      .text(171, -6, ' · Radio', {
        fontFamily: UI.font,
        fontStyle: '500',
        fontSize: '18px',
        color: '#c9d1ff',
      })
      .setOrigin(0, 0.5)
      .setVisible(false);

    // 2. Text panel at (0, 10) size 780x118, radius 12
    this.panelGfx = scene.add.graphics();
    this._drawTextPanel();

    // Body text at (150, 24), Chakra Petch 600 25px #141a42, wrap 590
    this.bodyText = scene.add
      .text(150, 24, '', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '25px',
        color: '#141a42',
        wordWrap: { width: 590 },
      })
      .setOrigin(0, 0);

    // Next hint E ▶ at (750, 112) origin (1, 1)
    this.nextHint = scene.add
      .text(750, 112, `${getInteractKeyLabel()} ▶`, {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '14px',
        color: '#b36a10',
      })
      .setOrigin(1, 1)
      .setVisible(false);

    // 3. Portrait box at (0, -58) size 132x132, radius 14
    this.portraitBgGfx = scene.add.graphics();
    this.portraitBgGfx.fillStyle(0x0b0f21, 1);
    this.portraitBgGfx.fillRoundedRect(0, -58, 132, 132, 14);

    const fallbackTex = scene.textures.exists('dlg_karim')
      ? 'dlg_karim'
      : '__DEFAULT';
    this.portraitImg = scene.add
      .image(66, 8, fallbackTex)
      .setOrigin(0.5, 0.5)
      .setDisplaySize(124, 124);

    // Screen-space GeometryMask synced with container (x, y)
    this.maskGfx = scene.make.graphics({
      x: BASE_X,
      y: BASE_Y + SLIDE_OFFSET,
      add: false,
    });
    this.maskGfx.setScrollFactor(0);
    this.maskGfx.fillStyle(0xffffff, 1);
    this.maskGfx.fillRoundedRect(4, -54, 124, 124, 11);
    this.portraitMask = this.maskGfx.createGeometryMask();
    this.portraitImg.setMask(this.portraitMask);

    this.portraitBorderGfx = scene.add.graphics();
    this.portraitBorderGfx.lineStyle(4, 0xffb02e, 1);
    this.portraitBorderGfx.strokeRoundedRect(2, -56, 128, 128, 14);

    this.container.add([
      this.tabGfx,
      this.radioDot,
      this.speakerText,
      this.radioSuffixText,
      this.panelGfx,
      this.bodyText,
      this.nextHint,
      this.portraitBgGfx,
      this.portraitImg,
      this.portraitBorderGfx,
    ]);
    registerUi(scene, this.container);

    // 500 ms step blink timer for radio dot and nextHint
    this._blinkToggle = false;
    this._blinkTimer = scene.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        this._blinkToggle = !this._blinkToggle;
        if (this.radioDot && this.radioDot.visible) {
          this.radioDot.setAlpha(this._blinkToggle ? 0.3 : 1);
        }
        if (this.nextHint && this.nextHint.visible) {
          this.nextHint.setAlpha(this._blinkToggle ? 0.35 : 1);
        }
      },
    });

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  _syncMaskPosition() {
    if (this.maskGfx && this.container) {
      this.maskGfx.setPosition(this.container.x, this.container.y);
    }
  }

  _drawTextPanel() {
    const g = this.panelGfx;
    g.clear();

    // Fill white rounded rect at (0, 10) size 780x118, radius 12
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 10, 780, 118, 12);

    // 3 px inner outline 0x1c2366 inset 4 px
    g.lineStyle(3, 0x1c2366, 1);
    g.strokeRoundedRect(5.5, 15.5, 780 - 11, 118 - 11, 8);

    // 4 px outer border 0xffb02e
    g.lineStyle(4, 0xffb02e, 1);
    g.strokeRoundedRect(2, 12, 780 - 4, 118 - 4, 12);
  }

  _drawNameTab(tabW) {
    const g = this.tabGfx;
    g.clear();

    const x = 146;
    const y = -22;
    const h = 32;
    const r = 10;

    // Base fill with top corners rounded
    g.fillStyle(0x38429a, 1);
    g.fillRoundedRect(x, y, tabW, h, { tl: r, tr: r, bl: 0, br: 0 });

    // Vertical gradient 0x38429a -> 0x2a337c
    const bands = 8;
    for (let i = 0; i < bands; i += 1) {
      const t = i / (bands - 1);
      const bandColor = lerpColor(0x38429a, 0x2a337c, t);
      const by0 = y + Math.round((i * h) / bands);
      const by1 = y + Math.round(((i + 1) * h) / bands);
      const bh = by1 - by0;
      if (bh <= 0) continue;
      const topInset = i === 0 ? 5 : i === 1 ? 2 : 0;
      g.fillStyle(bandColor, 1);
      g.fillRect(x + topInset + 1, by0, Math.max(0, tabW - (topInset + 1) * 2), bh);
    }

    // 3 px border 0xffb02e on left, top, right (no bottom border), top corners radius 10
    const half = 1.5;
    const rad = r - half;
    g.lineStyle(3, 0xffb02e, 1);
    g.beginPath();
    g.moveTo(x + half, y + h);
    g.lineTo(x + half, y + r);
    g.arc(x + r, y + r, rad, Math.PI, Math.PI * 1.5, false);
    g.lineTo(x + tabW - r, y + half);
    g.arc(x + tabW - r, y + r, rad, Math.PI * 1.5, 0, false);
    g.lineTo(x + tabW - half, y + h);
    g.strokePath();
  }

  setLine(speakerKey, shownText = '', isComplete = false) {
    const meta = SPEAKER_META[speakerKey] || {
      name: speakerKey || 'Mission Control',
      portrait: 'dlg_karim',
      radio: false,
    };

    if (this.scene.textures.exists(meta.portrait)) {
      this.portraitImg.setTexture(meta.portrait);
      this.portraitImg.setDisplaySize(124, 124);
    }

    this.speakerText.setText(meta.name);
    this.nextHint.setText(`${getInteractKeyLabel()} ▶`);

    const tabStartX = 146;
    const padX = 25;
    const centerY = -6;

    if (meta.radio) {
      const dotSpace = 18; // 10px dot + 8px gap
      this.radioDot.setPosition(tabStartX + padX - 4, centerY - 5);
      this.radioDot.setVisible(true);
      this.radioDot.setAlpha(1);

      const nameX = tabStartX + padX - 4 + dotSpace;
      this.speakerText.setPosition(nameX, centerY);

      this.radioSuffixText.setPosition(
        nameX + this.speakerText.width,
        centerY
      );
      this.radioSuffixText.setVisible(true);

      const contentW =
        dotSpace + this.speakerText.width + this.radioSuffixText.width - 8;
      this._drawNameTab(Math.ceil(contentW + 50));
    } else {
      this.radioDot.setVisible(false);
      this.radioSuffixText.setVisible(false);
      this.speakerText.setPosition(tabStartX + padX, centerY);
      this._drawNameTab(Math.ceil(this.speakerText.width + 50));
    }

    this.bodyText.setText(shownText);
    this.setComplete(isComplete);
  }

  setText(shownText) {
    if (this.bodyText) {
      this.bodyText.setText(shownText);
    }
  }

  setComplete(done) {
    if (!this.nextHint) return;
    if (done) {
      if (!this.nextHint.visible) {
        this.nextHint.setAlpha(1);
      }
      this.nextHint.setVisible(true);
    } else {
      this.nextHint.setVisible(false);
    }
  }

  slideIn(onDone) {
    if (!this.container || !this.container.scene) {
      if (onDone) onDone();
      return;
    }

    if (this._slideTween) {
      this._slideTween.stop();
      this._slideTween = null;
    }

    if (!this.isVisible) {
      this.container.y = BASE_Y + SLIDE_OFFSET;
    }
    this.isVisible = true;
    this.container.setVisible(true);
    this._syncMaskPosition();

    this._slideTween = this.scene.tweens.add({
      targets: this.container,
      y: BASE_Y,
      duration: 220,
      ease: 'Cubic.easeOut',
      onUpdate: () => this._syncMaskPosition(),
      onComplete: () => {
        this._slideTween = null;
        this._syncMaskPosition();
        if (onDone) onDone();
      },
    });
  }

  slideOut(onDone) {
    if (!this.container || !this.container.scene) {
      this.isVisible = false;
      if (onDone) onDone();
      return;
    }

    if (this._slideTween) {
      this._slideTween.stop();
      this._slideTween = null;
    }

    this.nextHint.setVisible(false);

    this._slideTween = this.scene.tweens.add({
      targets: this.container,
      y: BASE_Y + SLIDE_OFFSET,
      duration: 200,
      ease: 'Cubic.easeIn',
      onUpdate: () => this._syncMaskPosition(),
      onComplete: () => {
        this._slideTween = null;
        this.isVisible = false;
        if (this.container && this.container.scene) {
          this.container.setVisible(false);
        }
        this._syncMaskPosition();
        if (onDone) onDone();
      },
    });
  }

  hideImmediate() {
    if (this._slideTween) {
      this._slideTween.stop();
      this._slideTween = null;
    }
    this.isVisible = false;
    if (this.container && this.container.scene) {
      this.container.y = BASE_Y + SLIDE_OFFSET;
      this.container.setVisible(false);
    }
    this._syncMaskPosition();
  }

  destroy() {
    if (this._slideTween) {
      this._slideTween.stop();
      this._slideTween = null;
    }
    if (this._blinkTimer) {
      this._blinkTimer.remove(false);
      this._blinkTimer = null;
    }
    if (this.portraitImg) {
      this.portraitImg.clearMask(false);
    }
    if (this.portraitMask) {
      this.portraitMask.destroy();
      this.portraitMask = null;
    }
    if (this.maskGfx) {
      this.maskGfx.destroy();
      this.maskGfx = null;
    }
    if (this.container) {
      this.container.destroy(true);
      this.container = null;
    }
  }
}

export default DialogueBox;
