import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../core/constants.js';
import { SaveManager } from '../save.js';
import { audio } from '../core/audio.js';
import { UI, drawUiPanel, registerUi } from './theme.js';

function lerpColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;
  return (
    (Math.round(r1 + (r2 - r1) * t) << 16) |
    (Math.round(g1 + (g2 - g1) * t) << 8) |
    Math.round(b1 + (b2 - b1) * t)
  );
}

export class InteractPrompt {
  constructor(scene) {
    this.scene = scene;
    this.currentId = null;
    this.seenIds = new Set();
    this._fadeTween = null;
    this._panelW = 140;

    this.container = scene.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setAlpha(0)
      .setVisible(false);

    this.bg = scene.add.graphics();
    this.keyGfx = scene.add.graphics();
    this.keyText = scene.add
      .text(0, 0, 'E', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '16px',
        color: '#0a0f2c',
      })
      .setOrigin(0.5, 0.5);

    this.labelText = scene.add
      .text(0, 0, '', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '17px',
        color: UI.white,
      })
      .setOrigin(0, 0.5);

    this.container.add([this.bg, this.keyGfx, this.keyText, this.labelText]);
    registerUi(scene, this.container);

    this._onSync = () => {
      if (this.container && this.container.visible) {
        this._syncPosition();
      }
    };

    if (scene.events) {
      scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this._onSync);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this._onSync);
        if (scene.cameras && scene.cameras.main) {
          scene.cameras.main.off(
            Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE,
            this._onSync
          );
        }
      });
    }
    if (scene.cameras && scene.cameras.main) {
      scene.cameras.main.on(
        Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE,
        this._onSync
      );
    }
  }

  _getInteractKeyLabel() {
    const save = SaveManager.get();
    const pair = save?.settings?.keys?.interact;
    const raw = (Array.isArray(pair) && (pair[0] || pair[1])) || 'E';
    return String(raw).toUpperCase();
  }

  _syncPosition() {
    const player = this.scene && this.scene.player;
    const cam = this.scene && this.scene.cameras && this.scene.cameras.main;
    if (!player || !this.container) return;

    const worldX = player.x;
    const worldY = player.y - 175;
    const scrollX = cam ? cam.scrollX : 0;
    const scrollY = cam ? cam.scrollY : 0;

    const halfW = Math.ceil(this._panelW / 2);
    const sx = Math.max(
      halfW + 8,
      Math.min(VIEW_W - halfW - 8, Math.round(worldX - scrollX))
    );
    const sy = Math.max(
      26,
      Math.min(VIEW_H - 26, Math.round(worldY - scrollY))
    );
    this.container.setPosition(sx, sy);
  }

  _rebuildLayout(item) {
    const keyLabel = item.keyLabel
      ? String(item.keyLabel).toUpperCase()
      : this._getInteractKeyLabel();
    this.keyText.setText(keyLabel);
    this.labelText.setText(item.label || 'Interact');

    const keyW = Math.max(28, Math.ceil(this.keyText.width) + 12);
    const keyH = 28;
    const panelH = 40;
    const panelW = Math.ceil(this.labelText.width) + 70 + (keyW - 28);
    this._panelW = panelW;

    const left = -Math.round(panelW / 2);
    const top = -Math.round(panelH / 2);

    drawUiPanel(this.bg, left, top, panelW, panelH, UI.border);

    // 28x28 gold key square (rounded 6, gradient 0xffd94d to 0xf5a623)
    const kx = left + 10;
    const ky = -Math.round(keyH / 2);
    this.keyGfx.clear();
    this.keyGfx.fillStyle(0xf5a623, 1);
    this.keyGfx.fillRoundedRect(kx, ky, keyW, keyH, 6);
    const bands = 5;
    for (let i = 0; i < bands; i += 1) {
      const col = lerpColor(0xffd94d, 0xf5a623, i / (bands - 1));
      const by0 = ky + Math.round((i * keyH) / bands);
      const by1 = ky + Math.round(((i + 1) * keyH) / bands);
      const inset = i === 0 || i === bands - 1 ? 2 : 0;
      this.keyGfx.fillStyle(col, 1);
      this.keyGfx.fillRect(kx + inset, by0, keyW - inset * 2, by1 - by0);
    }

    this.keyText.setPosition(kx + Math.round(keyW / 2), 0);
    this.labelText.setPosition(kx + keyW + 12, 0);

    this._syncPosition();
  }

  show(item) {
    if (!item) {
      this.hide();
      return;
    }

    const changed = this.currentId !== item.id;
    this.currentId = item.id;
    this._rebuildLayout(item);

    if (!this.seenIds.has(item.id)) {
      this.seenIds.add(item.id);
      audio.play('SFX_Interaction_Prompt');
    }

    if (!this.container.visible || changed) {
      this.container.setVisible(true);
      if (this._fadeTween) {
        this._fadeTween.stop();
      }
      this.container.setAlpha(0);
      this._fadeTween = this.scene.tweens.add({
        targets: this.container,
        alpha: 1,
        duration: 120,
        ease: 'Sine.easeOut',
      });
    }
  }

  hide() {
    if (!this.container.visible && this.currentId === null) return;
    this.currentId = null;
    if (this._fadeTween) {
      this._fadeTween.stop();
      this._fadeTween = null;
    }
    this.container.setAlpha(0);
    this.container.setVisible(false);
  }
}

export default InteractPrompt;
