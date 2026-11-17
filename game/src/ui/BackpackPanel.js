import Phaser from 'phaser';
import { ITEMS } from '../data/items.js';
import { actions } from '../core/actions.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { inventory } from '../core/inventory.js';
import { state } from '../core/state.js';
import { InfoCard } from './InfoCard.js';
import { UI, drawUiPanel, uiPanel, fixUiScroll, registerUi } from './theme.js';

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

export class BackpackPanel {
  constructor(scene) {
    this.scene = scene;
    this.isOpen = false;
    this.selectedCell = 0;
    this.hoveredCell = -1;

    this._dragSourceBagIdx = -1;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._isDragging = false;
    this._savedCanMove = true;

    this.container = scene.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(150)
      .setVisible(false);

    // Dim backdrop (black, alpha 0.5)
    this.backdrop = scene.add
      .rectangle(0, 0, 1280, 720, 0x000000, 0.5)
      .setOrigin(0, 0)
      .setInteractive();

    // Main panel at (140, 70) size 1000x580
    this.mainPanel = uiPanel(scene, 140, 70, 1000, 580);

    // Header strip 1000x56 at top (140, 70)
    this.headerStrip = uiPanel(scene, 140, 70, 1000, 56);

    this.titleText = scene.add
      .text(172, 82, 'Backpack', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '26px',
        color: UI.gold,
      })
      .setOrigin(0, 0);

    // Red X button 36x36 at (1090, 80)
    this.closeBtnGfx = scene.add.graphics();
    this._drawCloseButton(false);

    this.closeBtnHit = scene.add
      .rectangle(1090, 80, 36, 36, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.closeBtnHit.on('pointerover', () => this._drawCloseButton(true));
    this.closeBtnHit.on('pointerout', () => this._drawCloseButton(false));
    this.closeBtnHit.on('pointerdown', () => this.close());

    this.closeBtnText = scene.add
      .text(1108, 98, 'X', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '22px',
        color: UI.white,
      })
      .setOrigin(0.5, 0.5);

    // Detail panel at (770, 150) size 340x400
    this.detailPanel = uiPanel(scene, 770, 150, 340, 400);

    // Footer text at (172, 620)
    this.footerText = scene.add
      .text(172, 620, 'Backpack 0 / 24', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '16px',
        color: UI.soft,
      })
      .setOrigin(0, 0);

    this.gridGfx = scene.add.graphics();

    this.container.add([
      this.backdrop,
      this.mainPanel,
      this.headerStrip,
      this.titleText,
      this.closeBtnGfx,
      this.closeBtnHit,
      this.closeBtnText,
      this.detailPanel,
      this.footerText,
      this.gridGfx,
    ]);

    // 6x4 grid of 24 cells at (172, 150), cell 84x84, gap 10
    this.cells = [];
    for (let i = 0; i < 24; i += 1) {
      const col = i % 6;
      const row = Math.floor(i / 6);
      const gx = 172 + col * 94;
      const gy = 150 + row * 94;

      const hit = scene.add
        .rectangle(gx, gy, 84, 84, 0x000000, 0)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });

      hit.on('pointerover', () => {
        this.hoveredCell = i;
        this._drawGridSlots();
      });
      hit.on('pointerout', () => {
        if (this.hoveredCell === i) {
          this.hoveredCell = -1;
          this._drawGridSlots();
        }
      });
      hit.on('pointerdown', (pointer) => {
        this.selectCell(i);
        if (i >= 2) {
          const bagIdx = i - 2;
          if (state.bag[bagIdx]) {
            this._dragSourceBagIdx = bagIdx;
            this._dragStartX = pointer.x;
            this._dragStartY = pointer.y;
            this._isDragging = false;
          }
        }
      });

      const icon = scene.add
        .image(gx + 42, gy + 40, 'icon_oxygen')
        .setDisplaySize(62, 62)
        .setVisible(false);

      const tagBg = scene.add.graphics().setVisible(false);
      const tagText = scene.add
        .text(gx + 78, gy + 78, '', {
          fontFamily: UI.font,
          fontStyle: '700',
          fontSize: '15px',
          color: UI.white,
        })
        .setOrigin(1, 1)
        .setVisible(false);

      this.container.add([hit, icon, tagBg, tagText]);
      this.cells.push({ index: i, gx, gy, hit, icon, tagBg, tagText });
    }

    // Detail panel contents
    this.detailIcon = scene.add
      .image(885, 170, 'icon_flashlight')
      .setOrigin(0, 0)
      .setDisplaySize(110, 110)
      .setVisible(false);

    this.detailName = scene.add
      .text(790, 300, '', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '22px',
        color: UI.white,
      })
      .setOrigin(0, 0);

    this.detailDesc = scene.add
      .text(790, 332, '', {
        fontFamily: UI.font,
        fontStyle: '500',
        fontSize: '16px',
        color: '#aeb7ea',
        wordWrap: { width: 300 },
        lineSpacing: 3,
      })
      .setOrigin(0, 0);

    this.detailStatLabel = scene.add
      .text(790, 404, '', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '17px',
        color: UI.white,
      })
      .setOrigin(0, 0)
      .setVisible(false);

    this.detailStatBarGfx = scene.add.graphics();

    this.actionBtnGfx = scene.add.graphics();
    this.actionBtnHit = scene.add
      .rectangle(840, 480, 200, 48, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);

    this.actionBtnText = scene.add
      .text(940, 504, '', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '22px',
        color: '#2a1a05',
      })
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    this.actionBtnHit.on('pointerdown', () => {
      this._onActionButtonClick();
    });

    this.emptyDetailText = scene.add
      .text(940, 350, 'Select an item to inspect', {
        fontFamily: UI.font,
        fontStyle: '500',
        fontSize: '16px',
        color: '#aeb7ea',
      })
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    // Floating drag icon
    this.dragIcon = scene.add
      .image(0, 0, 'icon_oxygen')
      .setDisplaySize(62, 62)
      .setAlpha(0.88)
      .setVisible(false);

    this.container.add([
      this.detailIcon,
      this.detailName,
      this.detailDesc,
      this.detailStatLabel,
      this.detailStatBarGfx,
      this.actionBtnGfx,
      this.actionBtnHit,
      this.actionBtnText,
      this.emptyDetailText,
      this.dragIcon,
    ]);
    registerUi(scene, this.container);

    this._onPointerMove = (pointer) => {
      if (!this.isOpen || this._dragSourceBagIdx < 0) return;
      const dist = Phaser.Math.Distance.Between(
        this._dragStartX,
        this._dragStartY,
        pointer.x,
        pointer.y
      );
      if (!this._isDragging && dist >= 6) {
        const slot = state.bag[this._dragSourceBagIdx];
        const def = slot ? ITEMS[slot.id] : null;
        if (def && this.scene.textures.exists(def.icon)) {
          this._isDragging = true;
          this.dragIcon.setTexture(def.icon);
          this.dragIcon.setDisplaySize(62, 62);
          this.dragIcon.setVisible(true);
        }
      }
      if (this._isDragging) {
        this.dragIcon.setPosition(pointer.x, pointer.y);
      }
    };

    this._onPointerUp = (pointer) => {
      if (!this.isOpen || this._dragSourceBagIdx < 0) return;
      const fromBag = this._dragSourceBagIdx;
      const wasDragging = this._isDragging;
      this._dragSourceBagIdx = -1;
      this._isDragging = false;
      this.dragIcon.setVisible(false);

      if (wasDragging) {
        const targetCell = this._cellAtPoint(pointer.x, pointer.y);
        if (targetCell >= 2) {
          const toBag = targetCell - 2;
          if (toBag !== fromBag) {
            inventory.move(fromBag, toBag);
            audio.play('SFX_Tab_Switch');
            this.selectCell(targetCell);
          }
        }
      }
    };

    this._onKeyDown = (event) => {
      if (!this.isOpen) return;
      if (event.code === 'Escape' || event.key === 'Escape') {
        event.preventDefault();
        this.scene._escConsumedAt = performance.now();
        this.close();
      }
    };

    this._onInventory = () => {
      if (this.isOpen) {
        this.refresh();
      }
    };

    scene.input.on('pointermove', this._onPointerMove);
    scene.input.on('pointerup', this._onPointerUp);
    if (scene.input.keyboard) {
      scene.input.keyboard.on('keydown', this._onKeyDown);
    }
    bus.on('inventory', this._onInventory);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointermove', this._onPointerMove);
      scene.input.off('pointerup', this._onPointerUp);
      if (scene.input.keyboard) {
        scene.input.keyboard.off('keydown', this._onKeyDown);
      }
      bus.off('inventory', this._onInventory);
    });
  }

  _drawCloseButton(hover) {
    this.closeBtnGfx.clear();
    const x = 1090;
    const y = 80;
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

  _cellAtPoint(px, py) {
    for (const c of this.cells) {
      if (px >= c.gx && px <= c.gx + 84 && py >= c.gy && py <= c.gy + 84) {
        return c.index;
      }
    }
    return -1;
  }

  _getCellEntry(cellIndex) {
    if (cellIndex === 0) {
      return {
        kind: 'toolCell',
        id: 'flashlight',
        n: 1,
        inHotbar: state.hotbar.includes('flashlight'),
      };
    }
    if (cellIndex === 1) {
      return {
        kind: 'toolCell',
        id: 'basic_pickaxe',
        n: 1,
        inHotbar: state.hotbar.includes('basic_pickaxe'),
      };
    }
    const bagIndex = cellIndex - 2;
    const slot = state.bag[bagIndex];
    if (!slot) return null;
    return {
      kind: 'bagCell',
      bagIndex,
      id: slot.id,
      n: slot.n,
    };
  }

  _drawGridSlots() {
    this.gridGfx.clear();
    for (const c of this.cells) {
      const isSel = this.selectedCell === c.index;
      const isHov = this.hoveredCell === c.index;

      if (isSel) {
        this.gridGfx.fillStyle(0xffc83d, 0.35);
        this.gridGfx.fillRoundedRect(c.gx - 2, c.gy - 2, 88, 88, 10);
      }

      this.gridGfx.fillStyle(0x0a0f2c, 1);
      this.gridGfx.fillRoundedRect(c.gx, c.gy, 84, 84, 8);

      let borderCol = 0x3a4a94;
      if (isSel) borderCol = 0xffc83d;
      else if (isHov) borderCol = 0x3fd2ff;

      this.gridGfx.lineStyle(3, borderCol, 1);
      this.gridGfx.strokeRoundedRect(c.gx, c.gy, 84, 84, 8);
    }
  }

  _drawActionButton(label, enabled) {
    this.actionBtnGfx.clear();
    const x = 840;
    const y = 480;
    const w = 200;
    const h = 48;

    if (enabled) {
      this.actionBtnGfx.fillStyle(0xf5a623, 1);
      this.actionBtnGfx.fillRoundedRect(x, y, w, h, 8);
      const bands = 6;
      for (let i = 0; i < bands; i += 1) {
        const col = lerpColor(0xffd94d, 0xf5a623, i / (bands - 1));
        const by0 = y + Math.round((i * h) / bands);
        const by1 = y + Math.round(((i + 1) * h) / bands);
        const inset = i === 0 || i === bands - 1 ? 3 : 0;
        this.actionBtnGfx.fillStyle(col, 1);
        this.actionBtnGfx.fillRect(x + inset, by0, w - inset * 2, by1 - by0);
      }
      this.actionBtnGfx.lineStyle(3, 0xfff2b0, 1);
      this.actionBtnGfx.strokeRoundedRect(x, y, w, h, 8);
      this.actionBtnText.setColor('#2a1a05');
      this.actionBtnHit.setVisible(true);
    } else {
      this.actionBtnGfx.fillStyle(0x1b224f, 1);
      this.actionBtnGfx.fillRoundedRect(x, y, w, h, 8);
      this.actionBtnGfx.lineStyle(3, 0x3a4a94, 1);
      this.actionBtnGfx.strokeRoundedRect(x, y, w, h, 8);
      this.actionBtnText.setColor('#aeb7ea');
      this.actionBtnHit.setVisible(false);
    }

    this.actionBtnText.setText(label);
    this.actionBtnText.setVisible(true);
  }

  _onActionButtonClick() {
    if (!this.isOpen) return;
    const entry = this._getCellEntry(this.selectedCell);
    if (!entry) return;
    const def = ITEMS[entry.id];
    if (!def) return;

    if (def.kind === 'use' && entry.kind === 'bagCell') {
      inventory.use(entry.bagIndex);
      this.refresh();
    } else if (def.kind === 'tool') {
      if (!state.hotbar.includes(entry.id)) {
        state.hotbar[state.selected] = entry.id;
        state.save();
        bus.emit('inventory');
        audio.play('SFX_Interact');
        if (this.scene.tools && typeof this.scene.tools.onSlotChanged === 'function') {
          this.scene.tools.onSlotChanged(state.selected, state.selected);
        }
        this.refresh();
      }
    }
  }

  selectCell(cellIndex) {
    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= 24) return;
    const changed = this.selectedCell !== cellIndex;
    this.selectedCell = cellIndex;
    if (changed && this.isOpen) {
      audio.play('SFX_Tab_Switch');
    }
    this.refresh();

    if (this.isOpen) {
      const entry = this._getCellEntry(this.selectedCell);
      if (entry && entry.id === 'basic_pickaxe') {
        state.set('durability_viewed');
      }
    }
  }

  refresh() {
    this._drawGridSlots();

    for (const c of this.cells) {
      const entry = this._getCellEntry(c.index);
      const def = entry ? ITEMS[entry.id] : null;

      if (entry && def && this.scene.textures.exists(def.icon)) {
        c.icon.setTexture(def.icon);
        c.icon.setDisplaySize(62, 62);
        c.icon.setVisible(true);

        if (entry.kind === 'toolCell' && entry.inHotbar) {
          c.tagText.setFontSize('11px');
          c.tagText.setColor('#99e105');
          c.tagText.setText('In hotbar');
          c.tagText.setOrigin(0.5, 1);
          c.tagText.setPosition(c.gx + 42, c.gy + 80);
          c.tagText.setVisible(true);

          const tw = Math.ceil(c.tagText.width) + 10;
          const th = 16;
          c.tagBg.clear();
          c.tagBg.fillStyle(0x1a1a2e, 0.92);
          c.tagBg.fillRoundedRect(c.gx + 42 - tw / 2, c.gy + 82 - th, tw, th, 4);
          c.tagBg.setVisible(true);
        } else if (entry.kind === 'bagCell' && entry.n > 1) {
          c.tagText.setFontSize('15px');
          c.tagText.setColor(UI.white);
          c.tagText.setText(String(entry.n));
          c.tagText.setOrigin(1, 1);
          c.tagText.setPosition(c.gx + 78, c.gy + 80);
          c.tagText.setVisible(true);

          const tw = Math.max(22, Math.ceil(c.tagText.width) + 10);
          const th = 20;
          c.tagBg.clear();
          c.tagBg.fillStyle(0x1a1a2e, 0.94);
          c.tagBg.fillRoundedRect(c.gx + 80 - tw, c.gy + 81 - th, tw, th, 5);
          c.tagBg.setVisible(true);
        } else {
          c.tagBg.setVisible(false);
          c.tagText.setVisible(false);
        }
      } else {
        c.icon.setVisible(false);
        c.tagBg.setVisible(false);
        c.tagText.setVisible(false);
      }
    }

    // Footer text
    this.footerText.setText(`Backpack ${inventory.usedSlots()} / 24`);

    // Detail panel
    const selEntry = this._getCellEntry(this.selectedCell);
    const selDef = selEntry ? ITEMS[selEntry.id] : null;

    this.detailStatBarGfx.clear();
    this.actionBtnGfx.clear();
    this.actionBtnHit.setVisible(false);
    this.actionBtnText.setVisible(false);

    if (!selEntry || !selDef) {
      this.detailIcon.setVisible(false);
      this.detailName.setVisible(false);
      this.detailDesc.setVisible(false);
      this.detailStatLabel.setVisible(false);
      this.emptyDetailText.setVisible(true);
      return;
    }

    this.emptyDetailText.setVisible(false);
    if (this.scene.textures.exists(selDef.icon)) {
      this.detailIcon.setTexture(selDef.icon);
      this.detailIcon.setDisplaySize(110, 110);
      this.detailIcon.setVisible(true);
    } else {
      this.detailIcon.setVisible(false);
    }

    this.detailName.setText(selDef.name);
    this.detailName.setVisible(true);

    this.detailDesc.setText(selDef.desc);
    this.detailDesc.setVisible(true);

    if (selEntry.id === 'basic_pickaxe') {
      const d = state.pickaxe.durability;
      const max = Math.max(1, state.pickaxe.max || 30);
      const pct = Math.max(0, Math.min(1, d / max));
      this.detailStatLabel.setText(`Durability ${d} / ${max}`);
      this.detailStatLabel.setVisible(true);

      this.detailStatBarGfx.fillStyle(0x05070f, 1);
      this.detailStatBarGfx.fillRoundedRect(790, 432, 300, 12, 4);
      const fw = Math.round(300 * pct);
      if (fw > 0) {
        this.detailStatBarGfx.fillStyle(barColorForPct(pct), 1);
        this.detailStatBarGfx.fillRoundedRect(790, 432, fw, 12, 4);
      }
      this.detailStatBarGfx.lineStyle(2, 0x3a4a94, 1);
      this.detailStatBarGfx.strokeRoundedRect(790, 432, 300, 12, 4);
    } else if (selEntry.id === 'flashlight') {
      const ch = Math.round(state.flashlight.charge);
      const pct = Math.max(0, Math.min(1, state.flashlight.charge / 100));
      this.detailStatLabel.setText(`Battery ${ch}%`);
      this.detailStatLabel.setVisible(true);

      this.detailStatBarGfx.fillStyle(0x05070f, 1);
      this.detailStatBarGfx.fillRoundedRect(790, 432, 300, 12, 4);
      const fw = Math.round(300 * pct);
      if (fw > 0) {
        this.detailStatBarGfx.fillStyle(barColorForPct(pct), 1);
        this.detailStatBarGfx.fillRoundedRect(790, 432, fw, 12, 4);
      }
      this.detailStatBarGfx.lineStyle(2, 0x3a4a94, 1);
      this.detailStatBarGfx.strokeRoundedRect(790, 432, 300, 12, 4);
    } else {
      this.detailStatLabel.setVisible(false);
    }

    if (selDef.kind === 'use' && selEntry.kind === 'bagCell') {
      this._drawActionButton('Use', true);
    } else if (selDef.kind === 'tool') {
      const alreadyEquipped = state.hotbar.includes(selEntry.id);
      if (alreadyEquipped) {
        this._drawActionButton('Equipped', false);
      } else {
        this._drawActionButton('Equip', true);
      }
    }
  }

  open() {
    if (this.isOpen) return;
    if (InfoCard.isOpen(this.scene)) return;
    if (this.scene.mapPanel && this.scene.mapPanel.isOpen) return;
    if (this.scene.dialogue && this.scene.dialogue.isPlaying) return;
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
      this._savedCanMove = this.scene.player.canMove;
      this.scene.player.stopMotion();
    }

    audio.play('SFX_Menu_Open');
    this.container.setVisible(true);
    this.refresh();

    const entry = this._getCellEntry(this.selectedCell);
    if (entry && entry.id === 'basic_pickaxe') {
      state.set('durability_viewed');
    }
  }

  close(playSound = true) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this._dragSourceBagIdx = -1;
    this._isDragging = false;
    this.dragIcon.setVisible(false);
    this.container.setVisible(false);

    if (playSound) {
      audio.play('SFX_Menu_Close');
    }

    actions.resetMovementKeys();

    if (
      this.scene.player &&
      !(this.scene.dialogue && this.scene.dialogue.isPlaying) &&
      !(this.scene.mapPanel && this.scene.mapPanel.isOpen) &&
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
}

export default BackpackPanel;
