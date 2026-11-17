import Phaser from 'phaser';
import { BASE } from '../core/constants.js';
import { SaveManager } from '../save.js';
import { InfoCard } from './InfoCard.js';
import { UI, drawUiPanel, fixUiScroll, registerUi } from './theme.js';

const CENTER_X = 1176;
const CENTER_Y = 106;
const DIAMETER = 180;
const RADIUS = 90;
const VIEW_X = CENTER_X - RADIUS; // 1086
const VIEW_Y = CENTER_Y - RADIUS; // 16

export class Minimap {
  constructor(scene, player, { worldW, worldH, isCave = false, exitPos = null } = {}) {
    this.scene = scene;
    this.player = player;
    this.worldW = worldW || 7680;
    this.worldH = worldH || 2880;
    this.isCave = Boolean(isCave);
    this.exitPos = exitPos || { x: 1280, y: 1360 };
    this.zoom = this.isCave ? 0.1 : 0.06;
    this._ignoredSet = new WeakSet();

    // Second camera for minimap
    this.cam = scene.cameras.add(VIEW_X, VIEW_Y, DIAMETER, DIAMETER, false, 'minimap');
    this.cam.setZoom(this.zoom);
    this.cam.setBounds(0, 0, this.worldW, this.worldH);
    this.cam.startFollow(player, true, 0.2, 0.2);
    this.cam.roundPixels = true;
    this.cam.setBackgroundColor(this.isCave ? 0x04060f : 0x0a1030);

    // Circular geometry mask at (1176, 106) radius 90
    this.maskGfx = scene.make.graphics({ x: 0, y: 0, add: false });
    this.maskGfx.setScrollFactor(0);
    this.maskGfx.fillStyle(0xffffff, 1);
    this.maskGfx.fillCircle(CENTER_X, CENTER_Y, RADIUS);
    this.mask = this.maskGfx.createGeometryMask();
    this.cam.setMask(this.mask);

    // Overlay container (depth 110, scrollFactor 0, ignored by minimap camera)
    this.container = scene.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(110);

    this.ringGfx = scene.add.graphics();
    this._drawRing();

    this.northLabel = scene.add
      .text(CENTER_X, 8, 'N', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '14px',
        color: UI.white,
        stroke: '#070a1c',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5);

    this.baseEdgeGfx = scene.add.graphics();
    this.playerArrowGfx = scene.add.graphics().setPosition(CENTER_X, CENTER_Y);
    this._drawPlayerArrow();

    // Small M button right under the minimap
    this.mapBtnBg = scene.add.graphics();
    this._drawMapBtn(false);

    this.mapBtnText = scene.add
      .text(CENTER_X, 217, `${this._getMapKeyLabel()}  Map`, {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '13px',
        color: UI.gold,
      })
      .setOrigin(0.5, 0.5);

    this.mapBtnHit = scene.add
      .rectangle(CENTER_X - 38, 203, 76, 28, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    this.mapBtnHit.on('pointerover', () => this._drawMapBtn(true));
    this.mapBtnHit.on('pointerout', () => this._drawMapBtn(false));
    this.mapBtnHit.on('pointerdown', () => {
      if (this.scene && this.scene.mapPanel) {
        this.scene.mapPanel.toggle();
      }
    });

    this.container.add([
      this.ringGfx,
      this.northLabel,
      this.baseEdgeGfx,
      this.playerArrowGfx,
      this.mapBtnBg,
      this.mapBtnText,
      this.mapBtnHit,
    ]);

    fixUiScroll(this.container);
    registerUi(scene, this.container);
    this._syncIgnores();

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  _getMapKeyLabel() {
    const save = SaveManager.get();
    const pair = save?.settings?.keys?.map;
    const raw = (Array.isArray(pair) && (pair[0] || pair[1])) || 'M';
    return String(raw).toUpperCase();
  }

  _drawMapBtn(hover) {
    drawUiPanel(
      this.mapBtnBg,
      CENTER_X - 38,
      203,
      76,
      28,
      hover ? 0xffc83d : UI.border
    );
  }

  _drawRing() {
    const g = this.ringGfx;
    g.clear();

    // Radius 92: 6 px 0x1a1a2e, then 4 px 0x8e9af0, then inner 2 px 0x1c2366 at radius 88
    g.lineStyle(6, 0x1a1a2e, 1);
    g.strokeCircle(CENTER_X, CENTER_Y, 92);

    g.lineStyle(4, 0x8e9af0, 1);
    g.strokeCircle(CENTER_X, CENTER_Y, 92);

    g.lineStyle(2, 0x1c2366, 1);
    g.strokeCircle(CENTER_X, CENTER_Y, 88);

    // Four gold 0xffb02e ticks at N, E, S, W
    g.fillStyle(0xffb02e, 1);
    g.fillRoundedRect(CENTER_X - 5, CENTER_Y - 95, 10, 5, 2); // North
    g.fillRoundedRect(CENTER_X - 5, CENTER_Y + 90, 10, 5, 2); // South
    g.fillRoundedRect(CENTER_X + 90, CENTER_Y - 5, 5, 10, 2); // East
    g.fillRoundedRect(CENTER_X - 95, CENTER_Y - 5, 5, 10, 2); // West
  }

  _drawPlayerArrow() {
    const g = this.playerArrowGfx;
    g.clear();
    // 8 px white triangle pointing right (0 rad) with crisp dark outline
    g.fillStyle(0xffffff, 1);
    g.lineStyle(2, 0x070a1c, 1);
    g.beginPath();
    g.moveTo(8, 0);
    g.lineTo(-6, -5);
    g.lineTo(-3, 0);
    g.lineTo(-6, 5);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  _facingRotation() {
    if (!this.player) return 0;
    switch (this.player.facing) {
      case 'down':
        return Math.PI / 2;
      case 'left':
        return Math.PI;
      case 'up':
        return -Math.PI / 2;
      case 'right':
      default:
        return 0;
    }
  }

  _drawHouseIcon(g, cx, cy) {
    // 12x12 white house with dark outline
    const left = Math.round(cx - 6);
    const top = Math.round(cy - 6);

    // Dark outline backing
    g.fillStyle(0x070a1c, 1);
    g.beginPath();
    g.moveTo(cx, top - 2);
    g.lineTo(left + 14, top + 6);
    g.lineTo(left + 12, top + 6);
    g.lineTo(left + 12, top + 13);
    g.lineTo(left, top + 13);
    g.lineTo(left, top + 6);
    g.lineTo(left - 2, top + 6);
    g.closePath();
    g.fillPath();

    // White roof + body
    g.fillStyle(0xffffff, 1);
    g.beginPath();
    g.moveTo(cx, top);
    g.lineTo(left + 12, top + 5);
    g.lineTo(left, top + 5);
    g.closePath();
    g.fillPath();

    g.fillRect(left + 2, top + 5, 8, 7);

    // Tiny door cutout
    g.fillStyle(0x0a0f2c, 1);
    g.fillRect(cx - 1, top + 8, 3, 4);
  }

  _updateBasePointer() {
    const g = this.baseEdgeGfx;
    g.clear();
    if (!this.player || !this.cam) return;

    const targetX = this.isCave ? this.exitPos.x : BASE.x;
    const targetY = this.isCave ? this.exitPos.y : BASE.y;

    const refX = this.cam.midPoint ? this.cam.midPoint.x : this.player.x;
    const refY = this.cam.midPoint ? this.cam.midPoint.y : this.player.y;
    const worldDist = Phaser.Math.Distance.Between(refX, refY, targetX, targetY);
    const screenDist = worldDist * this.zoom;

    // Show edge pointer + house icon when outpost (or cave exit) is outside minimap radius
    if (screenDist <= RADIUS - 10) return;

    const ang = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      targetX,
      targetY
    );

    // Directional arrow at ring edge
    const tipR = 85;
    const baseR = 78;
    const tipX = CENTER_X + Math.cos(ang) * tipR;
    const tipY = CENTER_Y + Math.sin(ang) * tipR;
    const perpX = -Math.sin(ang) * 4.5;
    const perpY = Math.cos(ang) * 4.5;
    const bx = CENTER_X + Math.cos(ang) * baseR;
    const by = CENTER_Y + Math.sin(ang) * baseR;

    g.fillStyle(0xffc83d, 1);
    g.lineStyle(1.5, 0x070a1c, 1);
    g.beginPath();
    g.moveTo(tipX, tipY);
    g.lineTo(bx + perpX, by + perpY);
    g.lineTo(bx - perpX, by - perpY);
    g.closePath();
    g.fillPath();
    g.strokePath();

    // 12x12 white house icon just inside the edge arrow
    const hx = CENTER_X + Math.cos(ang) * 68;
    const hy = CENTER_Y + Math.sin(ang) * 68;
    this._drawHouseIcon(g, hx, hy);
  }

  ignore(objOrList) {
    if (!this.cam || !objOrList) return;
    const items = Array.isArray(objOrList) ? objOrList : [objOrList];
    const fresh = [];
    for (const item of items) {
      if (item && !this._ignoredSet.has(item)) {
        this._ignoredSet.add(item);
        fresh.push(item);
      }
    }
    if (fresh.length > 0) {
      this.cam.ignore(fresh);
    }
  }

  _syncIgnores() {
    if (!this.cam || !this.scene) return;
    if (Array.isArray(this.scene.uiObjects) && this.scene.uiObjects.length > 0) {
      this.ignore(this.scene.uiObjects);
    }
    if (this.scene.children && Array.isArray(this.scene.children.list)) {
      const highDepth = [];
      for (const child of this.scene.children.list) {
        if (
          child &&
          !this._ignoredSet.has(child) &&
          typeof child.depth === 'number' &&
          child.depth >= 90
        ) {
          highDepth.push(child);
        }
      }
      if (highDepth.length > 0) {
        this.ignore(highDepth);
      }
    }
  }

  update() {
    if (!this.cam || !this.container) return;

    this._syncIgnores();

    const modalOrDlgOpen = Boolean(
      (this.scene.backpackPanel && this.scene.backpackPanel.isOpen) ||
        (this.scene.mapPanel && this.scene.mapPanel.isOpen) ||
        InfoCard.isOpen(this.scene) ||
        (this.scene.dialogue && this.scene.dialogue.isPlaying) ||
        (this.scene.scene &&
          typeof this.scene.scene.isActive === 'function' &&
          this.scene.scene.isActive('TechTreeScene'))
    );

    this.cam.setVisible(!modalOrDlgOpen);
    this.container.setVisible(!modalOrDlgOpen);

    if (modalOrDlgOpen) return;

    this.mapBtnText.setText(`${this._getMapKeyLabel()}  Map`);
    this.playerArrowGfx.setRotation(this._facingRotation());
    this._updateBasePointer();
  }

  destroy() {
    if (this.cam) {
      this.cam.clearMask(false);
      if (this.scene && this.scene.cameras) {
        try {
          this.scene.cameras.remove(this.cam, true);
        } catch {
          // Ignore camera removal errors during teardown
        }
      }
      this.cam = null;
    }
    if (this.mask) {
      this.mask.destroy();
      this.mask = null;
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

export default Minimap;
