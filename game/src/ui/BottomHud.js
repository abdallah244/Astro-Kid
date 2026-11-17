import Phaser from 'phaser';
import { ITEMS, SAMPLE_TYPES } from '../data/items.js';
import { actions } from '../core/actions.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { inventory } from '../core/inventory.js';
import { state } from '../core/state.js';
import { InfoCard } from './InfoCard.js';
import { UI, drawUiPanel, uiPanel, fixUiScroll, registerUi } from './theme.js';

const HEART_GRID = [
  '.OO...OO.',
  'ORRO.ORRO',
  'OWRRRRRRO',
  'ORRRRRRRO',
  '.ORRRRRO.',
  '..ORRRO..',
  '...ORO...',
  '....O....',
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

function barColorForPct(pct) {
  if (pct > 0.5) return 0x99e105;
  if (pct > 0.25) return 0xffc83d;
  return 0xff4b4b;
}

export class BottomHud {
  constructor(scene) {
    this.scene = scene;
    this._lastLives = -1;

    this.root = scene.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(100);

    // 5.1 Left block: Portrait + Vital bars + 3 Pixel Hearts
    // Portrait: clean circular face (avatar_frame key now points to avatar_face.png) with a ring drawn in code
    this.portrait = scene.add
      .image(72, 610, 'avatar_frame')
      .setOrigin(0.5, 0.5)
      .setDisplaySize(100, 100);
    this.portraitRing = scene.add.graphics();
    this.portraitRing.lineStyle(6, 0x1a1a2e, 1);
    this.portraitRing.strokeCircle(72, 610, 53);
    this.portraitRing.lineStyle(4, 0x8e9af0, 1);
    this.portraitRing.strokeCircle(72, 610, 53);
    this.portraitRing.lineStyle(2, 0x1c2366, 1);
    this.portraitRing.strokeCircle(72, 610, 49);
    this.portraitRing.fillStyle(0xffb02e, 1);
    this.portraitRing.fillRoundedRect(66, 553, 12, 6, 3);
    this.portraitRing.fillRoundedRect(17, 604, 6, 12, 3);
    this.portraitRing.fillRoundedRect(121, 604, 6, 12, 3);

    this.vitalsPanel = uiPanel(scene, 144, 566, 136, 140);

    this.o2Label = scene.add
      .text(175, 576, 'O2', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '15px',
        color: '#3fd2ff',
      })
      .setOrigin(0.5, 0.5);

    this.vitalIconsGfx = scene.add.graphics();
    this._drawVitalHeaderIcons();

    this.tubesGfx = scene.add.graphics();
    this.heartsGfx = scene.add.graphics();

    this.root.add([
      this.portrait,
      this.portraitRing,
      this.vitalsPanel,
      this.o2Label,
      this.vitalIconsGfx,
      this.tubesGfx,
      this.heartsGfx,
    ]);

    // 5.2 Hotbar (9 slots, 64x64, gap 6, left x = 328, y = 628)
    this.hotbarContainer = scene.add.container(0, 0);
    this.hotbarGfx = scene.add.graphics();
    this.hotbarContainer.add(this.hotbarGfx);

    this.slotViews = [];
    for (let i = 0; i < 9; i += 1) {
      const sx = 328 + i * 70;
      const sy = 628;

      const hit = scene.add
        .rectangle(sx, sy, 64, 64, 0x000000, 0)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });

      hit.on('pointerdown', () => {
        if (!this.hotbarContainer.visible) return;
        if (this.scene.dialogue && this.scene.dialogue.isPlaying) return;
        this.selectSlot(i, true);
      });

      const icon = scene.add
        .image(sx + 32, sy + 30, 'icon_flashlight')
        .setDisplaySize(50, 50)
        .setVisible(false);

      const numText = scene.add
        .text(sx + 6, sy + 3, String(i + 1), {
          fontFamily: UI.font,
          fontStyle: '700',
          fontSize: '13px',
          color: UI.white,
        })
        .setOrigin(0, 0);

      const onTagBg = scene.add.graphics();
      onTagBg.fillStyle(0x143306, 0.95);
      onTagBg.fillRoundedRect(sx + 38, sy + 4, 22, 14, 3);
      onTagBg.lineStyle(1, 0x99e105, 1);
      onTagBg.strokeRoundedRect(sx + 38, sy + 4, 22, 14, 3);
      onTagBg.setVisible(false);

      const onTagText = scene.add
        .text(sx + 49, sy + 11, 'ON', {
          fontFamily: UI.font,
          fontStyle: '700',
          fontSize: '10px',
          color: '#99e105',
        })
        .setOrigin(0.5, 0.5)
        .setVisible(false);

      this.hotbarContainer.add([hit, icon, numText, onTagBg, onTagText]);
      this.slotViews.push({ sx, sy, hit, icon, numText, onTagBg, onTagText });
    }

    this.root.add(this.hotbarContainer);
    this._scrollFixed = false;

    // 5.3 Backpack button at (1166, 590), width 100
    this.backpackBtnContainer = scene.add.container(0, 0);
    this.backpackImg = scene.add
      .image(1166, 590, 'backpack_closed_icon')
      .setOrigin(0, 0);
    const bpH =
      this.backpackImg.width > 0
        ? Math.round((100 * this.backpackImg.height) / this.backpackImg.width)
        : 108;
    this.backpackImg.setDisplaySize(100, bpH);
    this.backpackImg.setInteractive({ useHandCursor: true });
    this.backpackImg.on('pointerdown', () => {
      if (this.scene.dialogue && this.scene.dialogue.isPlaying) return;
      if (InfoCard.isOpen(this.scene)) return;
      if (this.scene.mapPanel && this.scene.mapPanel.isOpen) return;
      if (this.scene.backpackPanel) {
        this.scene.backpackPanel.toggle();
      }
    });

    this.backpackBadgesGfx = scene.add.graphics();
    const keyBadgeX = 1166 + 100 - 28;
    const keyBadgeY = 590 + bpH - 28;
    this.backpackBadgesGfx.fillStyle(0x05070f, 1);
    this.backpackBadgesGfx.fillRoundedRect(keyBadgeX, keyBadgeY, 28, 28, 6);
    this.backpackBadgesGfx.lineStyle(2, 0xffc83d, 1);
    this.backpackBadgesGfx.strokeRoundedRect(keyBadgeX, keyBadgeY, 28, 28, 6);

    this.backpackKeyText = scene.add
      .text(keyBadgeX + 14, keyBadgeY + 14, 'I', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '17px',
        color: UI.white,
      })
      .setOrigin(0.5, 0.5);

    this.usedBadgeGfx = scene.add.graphics();
    this.usedBadgeText = scene.add
      .text(1252, 602, '0', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '13px',
        color: UI.white,
      })
      .setOrigin(0.5, 0.5);

    this.backpackBtnContainer.add([
      this.backpackImg,
      this.backpackBadgesGfx,
      this.backpackKeyText,
      this.usedBadgeGfx,
      this.usedBadgeText,
    ]);
    this.root.add(this.backpackBtnContainer);

    // 9.4 Inventory counters panel (under ObjectivePanel while objective 06 is current)
    this._createSampleCounters();

    registerUi(scene, [this.root, this.countersContainer]);

    this._onInventory = () => {
      this._refreshUsedBadge();
      this._refreshHotbarIcons();
      this._refreshSampleCounters();
    };
    this._onObjChange = () => {
      this._refreshSampleCounters();
    };

    bus.on('inventory', this._onInventory);
    bus.on('objective:start', this._onObjChange);
    bus.on('objective:complete', this._onObjChange);
    bus.on('condition', this._onObjChange);

    this._refreshUsedBadge();
    this._refreshHotbarIcons();
    this._drawHearts(state.lives);
    this._drawTubes(0);
    this._drawHotbarGfx();
    this._refreshSampleCounters();

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off('inventory', this._onInventory);
      bus.off('objective:start', this._onObjChange);
      bus.off('objective:complete', this._onObjChange);
      bus.off('condition', this._onObjChange);
    });
  }

  _drawVitalHeaderIcons() {
    this.vitalIconsGfx.clear();

    // Stamina bolt icon at x = 216, y = 566..586 (14x20 centered around y=576 -> top y=566)
    const bx = 209;
    const by = 566;
    this.vitalIconsGfx.fillStyle(0xffc83d, 1);
    this.vitalIconsGfx.fillRect(bx + 6, by + 0, 6, 4);
    this.vitalIconsGfx.fillRect(bx + 4, by + 4, 6, 4);
    this.vitalIconsGfx.fillRect(bx + 2, by + 8, 10, 3);
    this.vitalIconsGfx.fillRect(bx + 5, by + 11, 5, 4);
    this.vitalIconsGfx.fillRect(bx + 3, by + 15, 4, 5);

    // Food icon at x = 256, y = 566..586 (14x20 drawn with rects in #99e105 and #ffc83d)
    const fx = 251;
    const fy = 566;
    // Stem/leaf (#99e105) + body (#99e105) + gold label strip (#ffc83d)
    this.vitalIconsGfx.fillStyle(0xffc83d, 1);
    this.vitalIconsGfx.fillRect(fx + 5, fy + 0, 4, 3);
    this.vitalIconsGfx.fillStyle(0x99e105, 1);
    this.vitalIconsGfx.fillRect(fx + 8, fy + 2, 4, 2);
    this.vitalIconsGfx.fillRect(fx + 2, fy + 5, 10, 13);
    this.vitalIconsGfx.fillRect(fx + 1, fy + 7, 12, 9);
    this.vitalIconsGfx.fillStyle(0xffc83d, 1);
    this.vitalIconsGfx.fillRect(fx + 3, fy + 10, 8, 3);
  }

  _drawHearts(lives) {
    this._lastLives = lives;
    this.heartsGfx.clear();
    const cell = 4;
    const xs = [14, 56, 98];
    const hy = 670;

    for (let h = 0; h < 3; h += 1) {
      const full = h < lives;
      const hx = xs[h];
      for (let r = 0; r < HEART_GRID.length; r += 1) {
        const row = HEART_GRID[r];
        for (let c = 0; c < row.length; c += 1) {
          const ch = row[c];
          if (ch === '.') continue;
          let color = 0x000000;
          if (ch === 'R') {
            color = full ? 0xe63946 : 0x2b3566;
          } else if (ch === 'W') {
            color = full ? 0xffffff : 0x2b3566;
          }
          this.heartsGfx.fillStyle(color, 1);
          this.heartsGfx.fillRect(hx + c * cell, hy + r * cell, cell, cell);
        }
      }
    }
  }

  _drawTubes(time) {
    this.tubesGfx.clear();
    const blinkOn = Math.floor((time || 0) / 400) % 2 === 0;

    const specs = [
      {
        x: 160,
        val: state.vitals.oxygen,
        c1: 0x00b2e5,
        c2: 0x4fe0ff,
      },
      {
        x: 202,
        val: state.vitals.stamina,
        c1: 0xf5a623,
        c2: 0xffd24a,
      },
      {
        x: 244,
        val: state.vitals.hunger,
        c1: 0x7dc400,
        c2: 0xb8f23a,
      },
    ];

    const topY = 692 - 104; // 588
    const tubeW = 30;
    const tubeH = 104;

    for (const sp of specs) {
      const val = Math.max(0, Math.min(100, Number(sp.val) || 0));
      const low = val < 25;

      // Outer dark tube background
      this.tubesGfx.fillStyle(0x050914, 1);
      this.tubesGfx.fillRoundedRect(sp.x, topY, tubeW, tubeH, 15);

      // Rising fill inside 3 px border (x+3 .. x+27, bottom y=689, max height 98)
      const maxFillH = 98;
      const fillH = Math.round((val / 100) * maxFillH);
      if (fillH > 0) {
        const innerX = sp.x + 3;
        const innerW = 24;
        const bottomY = 689;
        const startY = bottomY - fillH;
        const cols = 6;

        // Draw horizontal scan rows clipped to capsule radius 12 at top and bottom
        for (let py = startY; py < bottomY; py += 2) {
          const sliceH = Math.min(2, bottomY - py);
          const cy = py + sliceH * 0.5;
          let inset = 0;
          const topCapCenter = topY + 15;
          const botCapCenter = topY + tubeH - 15;
          const r = 12;
          if (cy < topCapCenter) {
            const dy = topCapCenter - cy;
            const halfW = dy < r ? Math.sqrt(r * r - dy * dy) : 0;
            inset = Math.max(0, Math.ceil(r - halfW));
          } else if (cy > botCapCenter) {
            const dy = cy - botCapCenter;
            const halfW = dy < r ? Math.sqrt(r * r - dy * dy) : 0;
            inset = Math.max(0, Math.ceil(r - halfW));
          }
          const rowW = innerW - inset * 2;
          if (rowW <= 0) continue;

          if (low) {
            this.tubesGfx.fillStyle(0xff4b4b, 1);
            this.tubesGfx.fillRect(innerX + inset, py, rowW, sliceH);
          } else {
            for (let ci = 0; ci < cols; ci += 1) {
              const colX0 = Math.round((ci * rowW) / cols);
              const colX1 = Math.round(((ci + 1) * rowW) / cols);
              const cw = colX1 - colX0;
              if (cw <= 0) continue;
              const gradCol = lerpColor(sp.c1, sp.c2, ci / (cols - 1));
              this.tubesGfx.fillStyle(gradCol, 1);
              this.tubesGfx.fillRect(innerX + inset + colX0, py, cw, sliceH);
            }
          }
        }
      }

      // 3 px border (blinks alpha 1 / 0.4 at 400 ms when < 25)
      const borderAlpha = low ? (blinkOn ? 1 : 0.4) : 1;
      const borderColor = low ? 0xff4b4b : 0xc9d1ff;
      this.tubesGfx.lineStyle(3, borderColor, borderAlpha);
      this.tubesGfx.strokeRoundedRect(sp.x, topY, tubeW, tubeH, 15);
    }
  }

  _refreshUsedBadge() {
    const used = inventory.usedSlots();
    this.usedBadgeText.setText(String(used));
    const w = Math.max(26, Math.ceil(this.usedBadgeText.width) + 12);
    const h = 22;
    const bx = 1166 + 100 - w + 6;
    const by = 590 - 4;
    this.usedBadgeGfx.clear();
    this.usedBadgeGfx.fillStyle(0x05070f, 0.95);
    this.usedBadgeGfx.fillRoundedRect(bx, by, w, h, 6);
    this.usedBadgeGfx.lineStyle(2, 0x8e9af0, 1);
    this.usedBadgeGfx.strokeRoundedRect(bx, by, w, h, 6);
    this.usedBadgeText.setPosition(bx + w / 2, by + h / 2);
  }

  _refreshHotbarIcons() {
    for (let i = 0; i < 9; i += 1) {
      const view = this.slotViews[i];
      const itemId = state.hotbar[i];
      const def = itemId ? ITEMS[itemId] : null;
      if (def && this.scene.textures.exists(def.icon)) {
        view.icon.setTexture(def.icon);
        view.icon.setDisplaySize(50, 50);
        view.icon.setVisible(true);
      } else {
        view.icon.setVisible(false);
      }

      const showOn = itemId === 'flashlight' && Boolean(state.flashlight.on);
      view.onTagBg.setVisible(showOn);
      view.onTagText.setVisible(showOn);
    }
  }

  _drawHotbarGfx() {
    this.hotbarGfx.clear();

    for (let i = 0; i < 9; i += 1) {
      const sx = 328 + i * 70;
      const sy = 628;
      const isSel = state.selected === i;

      if (isSel) {
        this.hotbarGfx.fillStyle(0xffc83d, 0.35);
        this.hotbarGfx.fillRoundedRect(sx - 2, sy - 2, 68, 68, 10);
      }

      this.hotbarGfx.fillStyle(0x0a0f2c, 1);
      this.hotbarGfx.fillRoundedRect(sx, sy, 64, 64, 8);

      this.hotbarGfx.lineStyle(3, isSel ? 0xffc83d : 0x3a4a94, 1);
      this.hotbarGfx.strokeRoundedRect(sx, sy, 64, 64, 8);

      const itemId = state.hotbar[i];
      if (itemId === 'basic_pickaxe') {
        const max = Math.max(1, state.pickaxe.max || 30);
        const pct = Math.max(0, Math.min(1, state.pickaxe.durability / max));
        this.hotbarGfx.fillStyle(0x05070f, 1);
        this.hotbarGfx.fillRect(sx + 8, sy + 54, 48, 5);
        const fw = Math.round(48 * pct);
        if (fw > 0) {
          this.hotbarGfx.fillStyle(barColorForPct(pct), 1);
          this.hotbarGfx.fillRect(sx + 8, sy + 54, fw, 5);
        }
      } else if (itemId === 'flashlight') {
        const pct = Math.max(0, Math.min(1, state.flashlight.charge / 100));
        this.hotbarGfx.fillStyle(0x05070f, 1);
        this.hotbarGfx.fillRect(sx + 8, sy + 54, 48, 5);
        const fw = Math.round(48 * pct);
        if (fw > 0) {
          this.hotbarGfx.fillStyle(barColorForPct(pct), 1);
          this.hotbarGfx.fillRect(sx + 8, sy + 54, fw, 5);
        }
      }

      const view = this.slotViews[i];
      const showOn = itemId === 'flashlight' && Boolean(state.flashlight.on);
      view.onTagBg.setVisible(showOn);
      view.onTagText.setVisible(showOn);
    }
  }

  _createSampleCounters() {
    this.countersContainer = this.scene.add
      .container(14, 170)
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false);

    this.countersBg = this.scene.add.graphics();
    drawUiPanel(this.countersBg, 0, 0, 330, 114, UI.border);
    this.countersContainer.add(this.countersBg);

    this.counterRows = SAMPLE_TYPES.map((sampleId, idx) => {
      const def = ITEMS[sampleId];
      const ry = 14 + idx * 32;
      const icon = this.scene.add
        .image(26, ry + 11, def.icon)
        .setDisplaySize(28, 28);
      const nameText = this.scene.add
        .text(48, ry + 11, def.name, {
          fontFamily: UI.font,
          fontStyle: '600',
          fontSize: '15px',
          color: UI.white,
        })
        .setOrigin(0, 0.5);
      const countText = this.scene.add
        .text(314, ry + 11, '0 / 5', {
          fontFamily: UI.font,
          fontStyle: '700',
          fontSize: '15px',
          color: UI.white,
        })
        .setOrigin(1, 0.5);

      this.countersContainer.add([icon, nameText, countText]);
      return { sampleId, icon, nameText, countText };
    });
  }

  _refreshSampleCounters() {
    if (!this.countersContainer) return;
    const show = state.objectiveIndex === 5;
    this.countersContainer.setVisible(show);
    if (!show) return;

    for (const row of this.counterRows) {
      const n = inventory.count(row.sampleId);
      row.countText.setText(`${n} / 5`);
      row.countText.setColor(n >= 5 ? UI.greenCss : UI.white);
    }
  }

  selectSlot(index, playSfx = true) {
    if (!Number.isInteger(index) || index < 0 || index > 8) return;
    const prev = state.selected;
    state.selected = index;
    state.save();

    if (playSfx && prev !== index) {
      audio.play('SFX_Tab_Switch');
    } else if (playSfx && prev === index) {
      audio.play('SFX_Tab_Switch');
    }

    this._drawHotbarGfx();
    if (this.scene.tools && typeof this.scene.tools.onSlotChanged === 'function') {
      this.scene.tools.onSlotChanged(prev, index);
    }
  }

  isPointerOverHud(x, y) {
    // Hotbar rect (328..952, 628..692)
    if (this.hotbarContainer.visible && x >= 324 && x <= 956 && y >= 624 && y <= 696) {
      return true;
    }
    // Backpack button rect (1166..1272, 586..704)
    if (x >= 1162 && x <= 1276 && y >= 584 && y <= 706) {
      return true;
    }
    // Left portrait/vitals HUD block (14..284, 560..708)
    if (x >= 10 && x <= 284 && y >= 556 && y <= 712) {
      return true;
    }
    // Top-left ObjectivePanel (+ tab + sample counters when visible)
    if (this.scene && this.scene.objectivePanel) {
      if (this.scene.objectivePanel.isOpen) {
        const extraH =
          this.countersContainer && this.countersContainer.visible ? 126 : 0;
        const maxObjY = 16 + (this.scene.objectivePanel.panelH || 148) + extraH;
        if (x >= 0 && x <= 376 && y >= 8 && y <= maxObjY) {
          return true;
        }
      } else if (x >= 0 && x <= 34 && y >= 20 && y <= 116) {
        return true;
      }
    }
    // Top-center ScorePanel (514..766, 12..74)
    if (x >= 510 && x <= 770 && y >= 8 && y <= 78) {
      return true;
    }
    // Top-right Minimap + M Map button (1080..1272, 8..236)
    if (this.scene && this.scene.minimap && x >= 1080 && x <= 1272 && y >= 8 && y <= 236) {
      return true;
    }
    return false;
  }

  update(time) {
    if (!this._scrollFixed) {
      fixUiScroll(this.root);
      this._scrollFixed = true;
    }
    const modalOpen =
      InfoCard.isOpen(this.scene) ||
      Boolean(this.scene.backpackPanel && this.scene.backpackPanel.isOpen) ||
      Boolean(this.scene.mapPanel && this.scene.mapPanel.isOpen);

    this.hotbarContainer.setVisible(!modalOpen);

    // Sync counters panel below ObjectivePanel while objective 06 is current
    if (this.countersContainer) {
      const showCounters = state.objectiveIndex === 5;
      this.countersContainer.setVisible(showCounters);
      if (showCounters && this.scene.objectivePanel) {
        const objBottom = 12 + (this.scene.objectivePanel.panelH || 148);
        this.countersContainer.setPosition(
          this.scene.objectivePanel.container.x,
          objBottom + 10
        );
      }
    }

    // Handle backpack toggle key I when not in dialogue, InfoCard or MapPanel
    if (
      !(this.scene.dialogue && this.scene.dialogue.isPlaying) &&
      !InfoCard.isOpen(this.scene) &&
      !(this.scene.mapPanel && this.scene.mapPanel.isOpen) &&
      actions.justDown('backpack')
    ) {
      if (this.scene.backpackPanel) {
        this.scene.backpackPanel.toggle();
      }
    }

    // Hotbar selection keys 1..9 and mouse wheel (when hotbar is visible and no dialogue)
    const canUseHotbar =
      !modalOpen && !(this.scene.dialogue && this.scene.dialogue.isPlaying);

    if (canUseHotbar) {
      for (let i = 0; i < 9; i += 1) {
        if (actions.justDown(`hotbar${i + 1}`)) {
          this.selectSlot(i, true);
        }
      }
      const wheelDelta = actions.consumeWheel();
      if (wheelDelta !== 0) {
        const next = (state.selected + (wheelDelta > 0 ? 1 : -1) + 9) % 9;
        this.selectSlot(next, true);
      }
    } else {
      actions.consumeWheel();
    }

    if (state.lives !== this._lastLives) {
      this._drawHearts(state.lives);
    }
    this._drawTubes(time);
    if (this.hotbarContainer.visible) {
      this._drawHotbarGfx();
    }
  }
}

export default BottomHud;
