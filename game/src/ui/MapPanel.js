import Phaser from 'phaser';
import { actions } from '../core/actions.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { state } from '../core/state.js';
import { InfoCard } from './InfoCard.js';
import { UI, fixUiScroll, registerUi, uiPanel } from './theme.js';

const MAP_REGIONS = [
  { id: 'lunar_base', cx: 610, cy: 416, rx: 200, ry: 120, marker: 'house' },
  { id: 'lunar_plains', cx: 833, cy: 458, rx: 230, ry: 140, marker: 'pickaxe' },
  { id: 'iron_field', cx: 295, cy: 407, rx: 190, ry: 130, marker: 'fog' },
  { id: 'silicon_flats', cx: 721, cy: 573, rx: 190, ry: 100, marker: 'fog' },
  { id: 'highland_ridge', cx: 397, cy: 221, rx: 230, ry: 130, marker: 'padlock' },
  { id: 'shadowed_crater', cx: 907, cy: 309, rx: 200, ry: 110, marker: 'padlock' },
  { id: 'ice_deposit', cx: 1055, cy: 244, rx: 140, ry: 100, marker: 'padlock' },
];

const MAP_CAVES = [
  { id: 'iron_cave', x: 790, y: 380 },
  { id: 'crystal_cave', x: 940, y: 520 },
];

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

function ensureCroppedMapFrame(scene, texKey) {
  if (!scene || !scene.textures || !scene.textures.exists(texKey)) return null;
  const tex = scene.textures.get(texKey);
  if (!tex) return null;
  // Crop (163, 89, 1352, 771) displayed at (160, 108) with 960 x 548 preserves exact 0.7103 scale
  // of (163, 89, 1352, 825) -> 960 x 586 while fitting cleanly inside the (100, 50, 1080, 620) panel.
  if (!tex.has('map_crop')) {
    tex.add('map_crop', 0, 163, 89, 1352, 771);
  }
  return 'map_crop';
}

export class MapPanel {
  constructor(scene, { caveId = null } = {}) {
    this.scene = scene;
    this.caveId = caveId || null;
    this.isOpen = false;
    this._bobTween = null;

    this.container = scene.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(150)
      .setVisible(false);

    // Dim backdrop (black 0.55)
    this.backdrop = scene.add
      .rectangle(0, 0, 1280, 720, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setInteractive();

    // Main panel at (100, 50) size 1080 x 620
    this.mainPanel = uiPanel(scene, 100, 50, 1080, 620);

    // Title 'Map' (Chakra Petch 700 26px gold) at (132, 62)
    this.titleText = scene.add
      .text(132, 62, 'Map', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '26px',
        color: UI.gold,
      })
      .setOrigin(0, 0);

    // Red X button 36 x 36 at (1126, 62)
    this.closeBtnGfx = scene.add.graphics();
    this._drawCloseBtn(false);

    this.closeBtnHit = scene.add
      .rectangle(1126, 62, 36, 36, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.closeBtnHit.on('pointerover', () => this._drawCloseBtn(true));
    this.closeBtnHit.on('pointerout', () => this._drawCloseBtn(false));
    this.closeBtnHit.on('pointerdown', () => this.close(true));

    this.closeBtnText = scene.add
      .text(1144, 80, 'X', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '22px',
        color: UI.white,
      })
      .setOrigin(0.5, 0.5);

    // Map images at (160, 108)
    const fogFrame = ensureCroppedMapFrame(scene, 'map_fog');
    const fullFrame = ensureCroppedMapFrame(scene, 'map_full');

    this.fogImg = scene.textures.exists('map_fog')
      ? scene.add
          .image(160, 108, 'map_fog', fogFrame || undefined)
          .setOrigin(0, 0)
          .setDisplaySize(960, 548)
      : scene.add
          .rectangle(160, 108, 960, 548, 0x0d1333, 1)
          .setOrigin(0, 0);

    this.fullImg = scene.textures.exists('map_full')
      ? scene.add
          .image(160, 108, 'map_full', fullFrame || undefined)
          .setOrigin(0, 0)
          .setDisplaySize(960, 548)
      : scene.add
          .rectangle(160, 108, 960, 548, 0x1a2558, 1)
          .setOrigin(0, 0);

    // Geometry mask for discovered regions on map_full
    this.maskGfx = scene.make.graphics({ x: 0, y: 0, add: false });
    this.maskGfx.setScrollFactor(0);
    this.fullMask = this.maskGfx.createGeometryMask();
    this.fullImg.setMask(this.fullMask);

    // Subtle map frame outline + soft discovered region rim
    this.mapFrameGfx = scene.add.graphics();
    this.mapFrameGfx.lineStyle(2, 0x3a4a94, 1);
    this.mapFrameGfx.strokeRect(160, 108, 960, 548);

    // Markers graphics + fog '?' texts
    this.markersGfx = scene.add.graphics();
    this.fogTexts = {};
    for (const reg of MAP_REGIONS) {
      if (reg.marker === 'fog') {
        const txt = scene.add
          .text(reg.cx, reg.cy, '?', {
            fontFamily: UI.font,
            fontStyle: '700',
            fontSize: '44px',
            color: '#8fb4ff',
            stroke: '#070a1c',
            strokeThickness: 4,
          })
          .setOrigin(0.5, 0.5);
        this.fogTexts[reg.id] = txt;
      }
    }

    // Player pin container (yellow 0xffd23f 16x22, bobs 4 px up and down 700 ms yoyo)
    this.pinAnchor = scene.add.container(610, 416);
    this.pinBobGfx = scene.add.graphics();
    this._drawPlayerPin(this.pinBobGfx, 0, 0, 1);
    this.pinAnchor.add(this.pinBobGfx);

    this._bobTween = scene.tweens.add({
      targets: this.pinBobGfx,
      y: -4,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Legend panel tucked in top-left of map frame (avoids ice_deposit & covers raw art corner)
    this.legendPanel = uiPanel(scene, 168, 116, 152, 150);
    this.legendGfx = scene.add.graphics();
    this.legendLabels = [];
    this._buildLegend();

    this.container.add([
      this.backdrop,
      this.mainPanel,
      this.titleText,
      this.closeBtnGfx,
      this.closeBtnHit,
      this.closeBtnText,
      this.fogImg,
      this.fullImg,
      this.mapFrameGfx,
      this.markersGfx,
      ...Object.values(this.fogTexts),
      this.pinAnchor,
      this.legendPanel,
      this.legendGfx,
      ...this.legendLabels,
    ]);

    fixUiScroll(this.container);
    registerUi(scene, this.container);

    this._onKeyDown = (event) => {
      if (!this.isOpen) return;
      if (event.code === 'Escape' || event.key === 'Escape') {
        event.preventDefault();
        this.scene._escConsumedAt = performance.now();
        this.close(true);
      }
    };

    this._onRegionEnter = () => {
      if (this.isOpen) {
        this.refresh();
      }
    };

    if (scene.input && scene.input.keyboard) {
      scene.input.keyboard.on('keydown', this._onKeyDown);
    }
    bus.on('region:enter', this._onRegionEnter);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (scene.input && scene.input.keyboard) {
        scene.input.keyboard.off('keydown', this._onKeyDown);
      }
      bus.off('region:enter', this._onRegionEnter);
      this.destroy();
    });
  }

  _drawCloseBtn(hover) {
    this.closeBtnGfx.clear();
    const x = 1126;
    const y = 62;
    const w = 36;
    const h = 36;
    const topCol = hover ? 0xff8282 : 0xff6b6b;
    const botCol = hover ? 0xe03a3a : 0xd12f2f;

    this.closeBtnGfx.fillStyle(botCol, 1);
    this.closeBtnGfx.fillRoundedRect(x, y, w, h, 8);
    const bands = 6;
    for (let i = 0; i < bands; i += 1) {
      const col = lerpColor(topCol, botCol, i / (bands - 1));
      const by0 = y + Math.round((i * h) / bands);
      const by1 = y + Math.round(((i + 1) * h) / bands);
      const inset = i === 0 || i === bands - 1 ? 2 : 0;
      this.closeBtnGfx.fillStyle(col, 1);
      this.closeBtnGfx.fillRect(x + inset, by0, w - inset * 2, by1 - by0);
    }
    this.closeBtnGfx.lineStyle(3, 0xffd0d0, 1);
    this.closeBtnGfx.strokeRoundedRect(x, y, w, h, 8);
  }

  _drawHousePin(g, cx, cy, scale = 1) {
    const s = scale;
    g.fillStyle(0x070a1c, 0.9);
    g.fillCircle(cx, cy, 18 * s);
    g.lineStyle(2, 0x8e9af0, 1);
    g.strokeCircle(cx, cy, 18 * s);

    g.fillStyle(0xffffff, 1);
    g.beginPath();
    g.moveTo(cx, cy - 10 * s);
    g.lineTo(cx + 10 * s, cy - 2 * s);
    g.lineTo(cx - 10 * s, cy - 2 * s);
    g.closePath();
    g.fillPath();

    g.fillRect(cx - 7 * s, cy - 2 * s, 14 * s, 10 * s);
    g.fillStyle(0x0a0f2c, 1);
    g.fillRect(cx - 2 * s, cy + 2 * s, 4 * s, 6 * s);
  }

  _drawPickaxeMarker(g, cx, cy, scale = 1) {
    const s = scale;
    g.fillStyle(0x070a1c, 0.85);
    g.fillCircle(cx, cy, 18 * s);
    g.lineStyle(2, 0x3fd2ff, 0.9);
    g.strokeCircle(cx, cy, 18 * s);

    // Handle (angled bar)
    g.lineStyle(3 * s, 0xffc83d, 1);
    g.beginPath();
    g.moveTo(cx - 8 * s, cy + 9 * s);
    g.lineTo(cx + 6 * s, cy - 5 * s);
    g.strokePath();

    // Curved pickaxe head
    g.lineStyle(3.5 * s, 0xffffff, 1);
    g.beginPath();
    g.moveTo(cx - 4 * s, cy - 9 * s);
    g.lineTo(cx + 5 * s, cy - 6 * s);
    g.lineTo(cx + 9 * s, cy + 3 * s);
    g.strokePath();
  }

  _drawPadlock(g, cx, cy, cell = 4.8) {
    // Same pixel padlock silhouette as SPEC 02B (~44 px tall when cell=4.8)
    const px = Math.round(cx - 4 * cell);
    const py = Math.round(cy - 4.5 * cell);

    g.fillStyle(0x070a1c, 0.75);
    g.fillRoundedRect(px - 4, py - 4, 8 * cell + 8, 9 * cell + 8, 6);

    g.fillStyle(0xffffff, 0.92);
    g.fillRect(px + 2 * cell, py + 0 * cell, 4 * cell, 1 * cell);
    g.fillRect(px + 1 * cell, py + 1 * cell, 1 * cell, 3 * cell);
    g.fillRect(px + 6 * cell, py + 1 * cell, 1 * cell, 3 * cell);
    g.fillRect(px + 0 * cell, py + 4 * cell, 3 * cell, 5 * cell);
    g.fillRect(px + 5 * cell, py + 4 * cell, 3 * cell, 5 * cell);
    g.fillRect(px + 3 * cell, py + 4 * cell, 2 * cell, 1 * cell);
    g.fillRect(px + 3 * cell, py + 8 * cell, 2 * cell, 1 * cell);
  }

  _drawCaveSilhouette(g, cx, cy, scale = 1) {
    // 28 x 20 dark cave entrance silhouette with cyan rim
    const w = 28 * scale;
    const h = 20 * scale;
    const left = cx - w / 2;
    const bottom = cy + h / 2;
    const top = cy - h / 2;

    g.fillStyle(0x05070f, 1);
    g.lineStyle(2, 0x3fd2ff, 1);
    g.beginPath();
    g.moveTo(left, bottom);
    g.lineTo(left + 3 * scale, top + 6 * scale);
    g.lineTo(cx - 5 * scale, top);
    g.lineTo(cx + 5 * scale, top);
    g.lineTo(left + w - 3 * scale, top + 6 * scale);
    g.lineTo(left + w, bottom);
    g.closePath();
    g.fillPath();
    g.strokePath();

    // Inner dark mouth
    g.fillStyle(0x02040c, 1);
    g.fillRoundedRect(cx - 6 * scale, bottom - 11 * scale, 12 * scale, 11 * scale, {
      tl: 5 * scale,
      tr: 5 * scale,
      bl: 0,
      br: 0,
    });
  }

  _drawPlayerPin(g, cx, cy, scale = 1) {
    g.clear();
    const r = 8 * scale;
    const headY = cy - 14 * scale;

    // Yellow 0xffd23f 16 x 22 map pin anchored at tip (cx, cy)
    g.fillStyle(0xffd23f, 1);
    g.lineStyle(2, 0x070a1c, 1);

    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx - r * 0.88, headY + r * 0.45);
    g.arc(cx, headY, r, Math.PI * 0.85, Math.PI * 2.15, false);
    g.closePath();
    g.fillPath();
    g.strokePath();

    g.fillStyle(0x0a0f2c, 1);
    g.fillCircle(cx, headY, 3 * scale);
  }

  _buildLegend() {
    const rows = [
      { label: 'Base', kind: 'base' },
      { label: 'You', kind: 'you' },
      { label: 'Cave', kind: 'cave' },
      { label: 'Fog', kind: 'fog' },
      { label: 'Locked', kind: 'locked' },
    ];

    const g = this.legendGfx;
    g.clear();

    rows.forEach((row, idx) => {
      const ry = 135 + idx * 27;
      const ix = 192;

      if (row.kind === 'base') {
        this._drawHousePin(g, ix, ry, 0.52);
      } else if (row.kind === 'you') {
        // Mini yellow pin in legendGfx
        const headY = ry - 4;
        g.fillStyle(0xffd23f, 1);
        g.lineStyle(1.5, 0x070a1c, 1);
        g.beginPath();
        g.moveTo(ix, ry + 7);
        g.lineTo(ix - 5, headY + 2);
        g.arc(ix, headY, 5.5, Math.PI * 0.85, Math.PI * 2.15, false);
        g.closePath();
        g.fillPath();
        g.strokePath();
        g.fillStyle(0x0a0f2c, 1);
        g.fillCircle(ix, headY, 2);
      } else if (row.kind === 'cave') {
        this._drawCaveSilhouette(g, ix, ry, 0.68);
      } else if (row.kind === 'fog') {
        g.fillStyle(0x52608a, 1);
        g.fillRoundedRect(ix - 7, ry - 7, 14, 14, 3);
        g.lineStyle(1.5, 0x8fb4ff, 1);
        g.strokeRoundedRect(ix - 7, ry - 7, 14, 14, 3);
      } else if (row.kind === 'locked') {
        this._drawPadlock(g, ix, ry, 1.8);
      }

      const txt = this.scene.add
        .text(214, ry, row.label, {
          fontFamily: UI.font,
          fontStyle: '600',
          fontSize: '14px',
          color: UI.white,
        })
        .setOrigin(0, 0.5);
      this.legendLabels.push(txt);
    });
  }

  _rebuildFogMask() {
    this.maskGfx.clear();
    this.maskGfx.fillStyle(0xffffff, 1);

    for (const reg of MAP_REGIONS) {
      const isDiscovered = Boolean(state.flags[`discovered_${reg.id}`]);

      if (isDiscovered) {
        this.maskGfx.fillEllipse(reg.cx, reg.cy, reg.rx * 2, reg.ry * 2);
      }
    }
  }

  _updatePlayerPinPosition() {
    if (!this.pinAnchor) return;

    // Inside a cave: sit on that cave's icon
    if (this.caveId) {
      const caveEntry = MAP_CAVES.find((c) => c.id === this.caveId);
      if (caveEntry) {
        this.pinAnchor.setPosition(caveEntry.x, caveEntry.y - 4);
        this.pinAnchor.setVisible(true);
        return;
      }
    }

    const player = this.scene && this.scene.player;
    if (!player) {
      this.pinAnchor.setVisible(false);
      return;
    }

    const px = player.x;
    const py = player.y;

    // lunar_base: (1000..2800, 1000..2000) -> (527..703, 369..462)
    if (px >= 1000 && px <= 2800 && py >= 1000 && py <= 2000) {
      const tx = Phaser.Math.Clamp((px - 1000) / (2800 - 1000), 0, 1);
      const ty = Phaser.Math.Clamp((py - 1000) / (2000 - 1000), 0, 1);
      const mx = Phaser.Math.Clamp(527 + tx * (703 - 527), 527, 703);
      const my = Phaser.Math.Clamp(369 + ty * (462 - 369), 369, 462);
      this.pinAnchor.setPosition(Math.round(mx), Math.round(my));
      this.pinAnchor.setVisible(true);
      return;
    }

    // lunar_plains: (2800..7000, 700..2300) -> (731..962, 360..527)
    if (px >= 2800 && px <= 7000 && py >= 700 && py <= 2300) {
      const tx = Phaser.Math.Clamp((px - 2800) / (7000 - 2800), 0, 1);
      const ty = Phaser.Math.Clamp((py - 700) / (2300 - 700), 0, 1);
      const mx = Phaser.Math.Clamp(731 + tx * (962 - 731), 731, 962);
      const my = Phaser.Math.Clamp(360 + ty * (527 - 360), 360, 527);
      this.pinAnchor.setPosition(Math.round(mx), Math.round(my));
      this.pinAnchor.setVisible(true);
      return;
    }

    this.pinAnchor.setVisible(false);
  }

  refresh() {
    this._rebuildFogMask();

    const g = this.markersGfx;
    g.clear();

    for (const reg of MAP_REGIONS) {
      const discovered = Boolean(state.flags[`discovered_${reg.id}`]);
      if (reg.marker === 'house') {
        this._drawHousePin(g, reg.cx, reg.cy, 1);
      } else if (reg.marker === 'pickaxe') {
        if (discovered) {
          this._drawPickaxeMarker(g, reg.cx, reg.cy, 1);
        } else {
          // Still draw subtle plains marker or fog '?' until discovered
          this._drawPickaxeMarker(g, reg.cx, reg.cy, 0.85);
        }
      } else if (reg.marker === 'fog') {
        const txt = this.fogTexts[reg.id];
        if (txt) {
          txt.setVisible(!discovered);
        }
      } else if (reg.marker === 'padlock') {
        this._drawPadlock(g, reg.cx, reg.cy, 4.8);
      }
    }

    // Caves: shown when discovered_<caveId> is true
    for (const cave of MAP_CAVES) {
      if (state.flags[`discovered_${cave.id}`]) {
        this._drawCaveSilhouette(g, cave.x, cave.y, 1);
      }
    }

    this._updatePlayerPinPosition();
  }

  open() {
    if (this.isOpen) return;
    if (InfoCard.isOpen(this.scene)) return;
    if (this.scene.dialogue && this.scene.dialogue.isPlaying) return;
    if (this.scene.backpackPanel && this.scene.backpackPanel.isOpen) return;
    if (
      this.scene.scene &&
      typeof this.scene.scene.isActive === 'function' &&
      this.scene.scene.isActive('TechTreeScene')
    ) {
      return;
    }

    fixUiScroll(this.container);
    this.isOpen = true;
    if (this.scene.player) {
      this.scene.player.stopMotion();
    }

    audio.play('SFX_Menu_Open');
    this.container.setVisible(true);
    this.refresh();
  }

  close(playSound = true) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.container.setVisible(false);

    if (playSound) {
      audio.play('SFX_Menu_Close');
    }

    actions.resetMovementKeys();

    if (
      this.scene.player &&
      !(this.scene.dialogue && this.scene.dialogue.isPlaying) &&
      !(this.scene.backpackPanel && this.scene.backpackPanel.isOpen) &&
      !InfoCard.isOpen(this.scene)
    ) {
      this.scene.player.canMove = true;
    }
  }

  toggle() {
    if (this.isOpen) {
      this.close(true);
    } else {
      this.open();
    }
  }

  destroy() {
    if (this._bobTween) {
      this._bobTween.stop();
      this._bobTween = null;
    }
    if (this.fullImg) {
      this.fullImg.clearMask(false);
    }
    if (this.fullMask) {
      this.fullMask.destroy();
      this.fullMask = null;
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

export default MapPanel;
