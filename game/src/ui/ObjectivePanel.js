import { OBJECTIVES } from '../data/objectives.js';
import { bus } from '../core/events.js';
import { state } from '../core/state.js';
import { actions } from '../core/actions.js';
import { audio } from '../core/audio.js';
import { UI, drawUiPanel, fixUiScroll, registerUi } from './theme.js';
import { InfoCard } from './InfoCard.js';

export const UI_STORAGE_KEY = 'astrokid.ui.v1';

export function loadUiPrefs() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { objCollapsed: false };
    }
    const raw = window.localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return { objCollapsed: false };
    const parsed = JSON.parse(raw);
    return {
      objCollapsed: Boolean(parsed && parsed.objCollapsed),
    };
  } catch {
    return { objCollapsed: false };
  }
}

export function saveUiPrefs(prefs) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const payload = {
      objCollapsed: Boolean(prefs && prefs.objCollapsed),
    };
    window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore private mode / quota errors
  }
}

export class ObjectivePanel {
  constructor(scene) {
    this.scene = scene;
    this.panelW = 330;
    this.panelH = 148;

    const prefs = loadUiPrefs();
    this.isCollapsed = Boolean(prefs.objCollapsed);
    this.isOpen = !this.isCollapsed;

    this.displayedIndex = -1;
    this.checkboxes = new Map();
    this._flashTimer = null;
    this._tabFlashTimer = null;
    this._autoCollapseTimer = null;
    this._slideTween = null;
    this._tabAlertActive = false;

    const startX = this.isCollapsed ? -this.panelW : 14;
    this.container = scene.add
      .container(startX, 12)
      .setScrollFactor(0)
      .setDepth(100);

    this.bg = scene.add.graphics();
    this.headerGfx = scene.add.graphics();
    this.tabBg = scene.add.graphics();
    this.tabDecorGfx = scene.add.graphics();

    // Tab 28 x 84 attached to right edge of panel at (panel.x + panel.width, 26) => local (330, 14)
    this.tabHit = scene.add
      .rectangle(this.panelW, 14, 28, 84, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    this.tabHit.on('pointerdown', () => {
      if (this._isModalBlocking()) return;
      this.toggle(true);
    });

    this.headerText = scene.add
      .text(46, 24, 'Mission Objective', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '20px',
        color: UI.gold,
      })
      .setOrigin(0, 0.5);

    this.container.add([
      this.bg,
      this.headerGfx,
      this.headerText,
      this.tabBg,
      this.tabDecorGfx,
      this.tabHit,
    ]);

    this.bodyItems = [];

    this._drawHeaderDecor();
    this._buildContent(state.objectiveIndex);
    this._drawTab();
    fixUiScroll(this.container);
    registerUi(scene, this.container);

    this._onStart = (index) => {
      if (!this.scene || !this.container || !this.container.scene) return;
      const isNewObjective = index !== this.displayedIndex;
      this._buildContent(index);

      if (!isNewObjective) {
        // Initial scene emitSceneStart: preserve saved collapsed state across reloads & transitions
        this.container.x = this.isCollapsed ? -this.panelW : 14;
        this._drawTab();
        return;
      }

      if (this._autoCollapseTimer) {
        clearTimeout(this._autoCollapseTimer);
        this._autoCollapseTimer = null;
      }
      if (this._slideTween) {
        this._slideTween.stop();
        this._slideTween = null;
      }

      if (this.isCollapsed) {
        // Flash tab gold + expand automatically for 4 seconds, then collapse again ONLY if still collapsed
        this._triggerTabFlash();
        this.isOpen = true;
        this._drawTab();

        if (this.scene.scene && this.scene.scene.isPaused()) {
          this.container.x = 14;
        } else {
          this._slideTween = this.scene.tweens.add({
            targets: this.container,
            x: 14,
            duration: 250,
            ease: 'Cubic.easeInOut',
          });
        }

        this._autoCollapseTimer = setTimeout(() => {
          this._autoCollapseTimer = null;
          if (!this.scene || !this.container || !this.container.scene) return;
          if (!this.isCollapsed) return;
          this.isOpen = false;
          this._drawTab();
          if (this._slideTween) {
            this._slideTween.stop();
          }
          if (this.scene.scene && this.scene.scene.isPaused()) {
            this.container.x = -this.panelW;
          } else {
            this._slideTween = this.scene.tweens.add({
              targets: this.container,
              x: -this.panelW,
              duration: 250,
              ease: 'Cubic.easeInOut',
            });
          }
        }, 4000);
      } else {
        this.isOpen = true;
        this._drawTab();
        if (this.scene.scene && this.scene.scene.isPaused()) {
          this.container.x = 14;
          return;
        }
        this.container.x = -this.panelW;
        this._slideTween = this.scene.tweens.add({
          targets: this.container,
          x: 14,
          duration: 300,
          ease: 'Back.easeOut',
        });
      }
    };

    this._onCondition = (condId) => {
      if (!this.scene || !this.container || !this.container.scene) return;
      const entry = this.checkboxes.get(condId);
      if (entry) {
        this._drawCheckbox(entry.gfx, true);
        entry.boxContainer.setScale(1.3);
        this.scene.tweens.add({
          targets: entry.boxContainer,
          scaleX: 1,
          scaleY: 1,
          duration: 200,
          ease: 'Sine.easeOut',
        });
      }
      if (this.isCollapsed && !this.isOpen) {
        this._triggerTabFlash();
      }
      audio.play('SFX_Objective_Updated');
    };

    this._onComplete = (completedIdx) => {
      if (!this.scene || !this.container || !this.container.scene) return;
      const obj = OBJECTIVES[completedIdx];
      const pts = obj ? obj.score : 100;

      // Flash border green for 600 ms
      drawUiPanel(this.bg, 0, 0, this.panelW, this.panelH, UI.green);
      if (this._flashTimer) {
        clearTimeout(this._flashTimer);
      }
      this._flashTimer = setTimeout(() => {
        this._flashTimer = null;
        if (this.bg && this.bg.scene) {
          drawUiPanel(this.bg, 0, 0, this.panelW, this.panelH, UI.border);
        }
      }, 600);

      if (this.isCollapsed && !this.isOpen) {
        this._triggerTabFlash();
      }

      audio.play('SFX_Objective_Complete');

      // Floating +100 text at panel bottom-right (or near tab if collapsed)
      const floatX = this.isOpen
        ? Math.max(14, this.container.x) + this.panelW - 14
        : 76;
      const floatY = this.isOpen ? 12 + this.panelH - 8 : 66;
      const floatTxt = this.scene.add
        .text(floatX, floatY, `+${pts}`, {
          fontFamily: UI.font,
          fontStyle: '700',
          fontSize: '22px',
          color: UI.gold,
          stroke: '#070a1c',
          strokeThickness: 3,
        })
        .setOrigin(1, 1)
        .setScrollFactor(0)
        .setDepth(105);
      registerUi(this.scene, floatTxt);

      this.scene.tweens.add({
        targets: floatTxt,
        y: floatY - 40,
        alpha: 0,
        duration: 900,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          floatTxt.destroy();
        },
      });
    };

    bus.on('objective:start', this._onStart);
    bus.on('condition', this._onCondition);
    bus.on('objective:complete', this._onComplete);

    scene.events.once('shutdown', () => {
      this.destroy();
    });
  }

  _isModalBlocking() {
    return Boolean(
      InfoCard.isOpen(this.scene) ||
        (this.scene && this.scene.backpackPanel && this.scene.backpackPanel.isOpen) ||
        (this.scene && this.scene.mapPanel && this.scene.mapPanel.isOpen) ||
        (this.scene &&
          this.scene.scene &&
          typeof this.scene.scene.isActive === 'function' &&
          this.scene.scene.isActive('TechTreeScene'))
    );
  }

  _triggerTabFlash() {
    this._tabAlertActive = true;
    this._drawTab();
    if (this._tabFlashTimer) {
      clearTimeout(this._tabFlashTimer);
    }
    this._tabFlashTimer = setTimeout(() => {
      this._tabFlashTimer = null;
      this._tabAlertActive = false;
      if (this.tabBg && this.tabBg.scene) {
        this._drawTab();
      }
    }, 1200);
  }

  _drawTab() {
    if (!this.tabBg || !this.tabDecorGfx) return;
    const tx = this.panelW;
    const ty = 14;
    const tw = 28;
    const th = 84;
    const borderCol = this._tabAlertActive ? 0xffc83d : UI.border;

    drawUiPanel(this.tabBg, tx, ty, tw, th, borderCol);

    this.tabDecorGfx.clear();
    const showCollapsedDecor = !this.isOpen;

    if (showCollapsedDecor) {
      // Small clipboard icon above chevron when collapsed
      const cx = tx + 8;
      const cy = ty + 14;
      this.tabDecorGfx.fillStyle(0xffffff, 1);
      this.tabDecorGfx.fillRect(cx, cy, 12, 15);
      this.tabDecorGfx.fillStyle(0xff7b7b, 1);
      this.tabDecorGfx.fillRect(cx, cy, 12, 3);
      this.tabDecorGfx.fillStyle(UI.navy, 1);
      this.tabDecorGfx.fillRect(cx + 2, cy + 6, 8, 2);
      this.tabDecorGfx.fillRect(cx + 2, cy + 10, 6, 2);

      // Chevron pointing RIGHT (10 px, white 3 px strokes)
      const chevX = tx + 14;
      const chevY = ty + 54;
      this.tabDecorGfx.lineStyle(3, 0xffffff, 1);
      this.tabDecorGfx.beginPath();
      this.tabDecorGfx.moveTo(chevX - 3, chevY - 5);
      this.tabDecorGfx.lineTo(chevX + 3, chevY);
      this.tabDecorGfx.lineTo(chevX - 3, chevY + 5);
      this.tabDecorGfx.strokePath();
    } else {
      // Chevron pointing LEFT (10 px, white 3 px strokes)
      const chevX = tx + 14;
      const chevY = ty + 42;
      this.tabDecorGfx.lineStyle(3, 0xffffff, 1);
      this.tabDecorGfx.beginPath();
      this.tabDecorGfx.moveTo(chevX + 3, chevY - 5);
      this.tabDecorGfx.lineTo(chevX - 3, chevY);
      this.tabDecorGfx.lineTo(chevX + 3, chevY + 5);
      this.tabDecorGfx.strokePath();
    }

    // Tiny '!' dot when flashing alert while collapsed
    if (this._tabAlertActive) {
      const ax = tx + tw - 5;
      const ay = ty + 5;
      this.tabDecorGfx.fillStyle(0xffc83d, 1);
      this.tabDecorGfx.fillCircle(ax, ay, 6);
      this.tabDecorGfx.fillStyle(0x0a0f2c, 1);
      this.tabDecorGfx.fillRect(ax - 1, ay - 4, 2, 5);
      this.tabDecorGfx.fillRect(ax - 1, ay + 2, 2, 2);
    }
  }

  _drawHeaderDecor() {
    this.headerGfx.clear();

    const ix = 14;
    const iy = 12;
    this.headerGfx.fillStyle(0xffffff, 1);
    this.headerGfx.fillRect(ix + 4, iy + 3, 16, 18);
    this.headerGfx.fillStyle(0xff7b7b, 1);
    this.headerGfx.fillRect(ix + 4, iy + 3, 16, 3);
    this.headerGfx.fillStyle(UI.navy, 1);
    this.headerGfx.fillRect(ix + 7, iy + 9, 10, 2);
    this.headerGfx.fillRect(ix + 7, iy + 13, 10, 2);
    this.headerGfx.fillRect(ix + 7, iy + 17, 8, 2);

    this.headerGfx.fillStyle(0x2d377e, 1);
    this.headerGfx.fillRect(14, 38, 302, 2);
  }

  _drawCheckbox(gfx, isDone) {
    gfx.clear();
    if (isDone) {
      gfx.fillStyle(UI.green, 1);
      gfx.fillRoundedRect(-9, -9, 18, 18, 3);
      gfx.lineStyle(2, UI.green, 1);
      gfx.strokeRoundedRect(-9, -9, 18, 18, 3);

      gfx.lineStyle(2, 0xffffff, 1);
      gfx.beginPath();
      gfx.moveTo(-5, 0);
      gfx.lineTo(-1, 4);
      gfx.lineTo(5, -4);
      gfx.strokePath();
    } else {
      gfx.fillStyle(0x05070f, 1);
      gfx.fillRoundedRect(-9, -9, 18, 18, 3);
      gfx.lineStyle(2, 0xc9d1ff, 1);
      gfx.strokeRoundedRect(-9, -9, 18, 18, 3);
    }
  }

  _clearBody() {
    for (const item of this.bodyItems) {
      item.destroy();
    }
    this.bodyItems = [];
    this.checkboxes.clear();
  }

  _buildContent(index) {
    this._clearBody();
    this.displayedIndex = index;

    if (index >= OBJECTIVES.length) {
      const boxContainer = this.scene.add.container(14 + 9, 58 + 9);
      const boxGfx = this.scene.add.graphics();
      this._drawCheckbox(boxGfx, true);
      boxContainer.add(boxGfx);

      const doneTitle = this.scene.add
        .text(14 + 26, 58 + 9, 'All objectives complete', {
          fontFamily: UI.font,
          fontStyle: '700',
          fontSize: '17px',
          color: UI.greenCss,
        })
        .setOrigin(0, 0.5);

      const footer = this.scene.add
        .text(14, 92, 'Objective 10 of 10', {
          fontFamily: UI.font,
          fontStyle: '600',
          fontSize: '13px',
          color: '#8e9af0',
        })
        .setOrigin(0, 0);

      this.container.add([boxContainer, doneTitle, footer]);
      this.bodyItems.push(boxContainer, doneTitle, footer);
      fixUiScroll(boxContainer);
      fixUiScroll(doneTitle);
      fixUiScroll(footer);

      this.panelH = 118;
      drawUiPanel(this.bg, 0, 0, this.panelW, this.panelH, UI.border);
      return;
    }

    const obj = OBJECTIVES[Math.max(0, index)];

    const titleText = this.scene.add
      .text(14, 44, obj.title, {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '17px',
        color: UI.white,
        wordWrap: { width: 300 },
      })
      .setOrigin(0, 0);

    const descY = 44 + Math.max(24, Math.ceil(titleText.height) + 4);
    const descText = this.scene.add
      .text(14, descY, obj.desc, {
        fontFamily: UI.font,
        fontStyle: '500',
        fontSize: '14px',
        color: UI.soft,
        wordWrap: { width: 300 },
        lineSpacing: 3,
      })
      .setOrigin(0, 0);

    this.container.add([titleText, descText]);
    this.bodyItems.push(titleText, descText);
    fixUiScroll(titleText);
    fixUiScroll(descText);

    const descH = Math.max(20, Math.ceil(descText.height));
    const condStartY = descY + descH + 8;

    obj.conds.forEach((cond, i) => {
      const rowY = condStartY + i * 22;
      const isDone = state.has(cond.id);

      const boxContainer = this.scene.add.container(14 + 9, rowY + 9);
      const boxGfx = this.scene.add.graphics();
      this._drawCheckbox(boxGfx, isDone);
      boxContainer.add(boxGfx);

      const labelText = this.scene.add
        .text(14 + 26, rowY + 9, cond.label, {
          fontFamily: UI.font,
          fontStyle: '600',
          fontSize: '15px',
          color: UI.white,
        })
        .setOrigin(0, 0.5);

      this.container.add([boxContainer, labelText]);
      this.bodyItems.push(boxContainer, labelText);
      fixUiScroll(boxContainer);
      fixUiScroll(labelText);
      this.checkboxes.set(cond.id, { boxContainer, gfx: boxGfx });
    });

    const footerY = condStartY + obj.conds.length * 22 + 8;
    const footerText = this.scene.add
      .text(14, footerY, `Objective ${index + 1} of 10`, {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '13px',
        color: '#8e9af0',
      })
      .setOrigin(0, 0);

    this.container.add(footerText);
    this.bodyItems.push(footerText);
    fixUiScroll(footerText);

    this.panelH = footerY + 26;
    drawUiPanel(this.bg, 0, 0, this.panelW, this.panelH, UI.border);
  }

  toggle(playSound = true) {
    if (this._autoCollapseTimer) {
      clearTimeout(this._autoCollapseTimer);
      this._autoCollapseTimer = null;
    }

    // If currently in temporary auto-expand while saved as collapsed, clicking collapses immediately;
    // otherwise flip collapsed <-> expanded.
    if (this.isCollapsed && this.isOpen) {
      this.isCollapsed = false;
      this.isOpen = true;
    } else {
      this.isCollapsed = !this.isCollapsed;
      this.isOpen = !this.isCollapsed;
    }

    if (this.isOpen) {
      this._tabAlertActive = false;
    }

    saveUiPrefs({ objCollapsed: this.isCollapsed });
    this._drawTab();

    if (playSound) {
      audio.play('SFX_Tab_Switch');
    }

    if (this._slideTween) {
      this._slideTween.stop();
      this._slideTween = null;
    }

    const targetX = this.isOpen ? 14 : -this.panelW;
    if (this.scene && this.scene.tweens) {
      this._slideTween = this.scene.tweens.add({
        targets: this.container,
        x: targetX,
        duration: 250,
        ease: 'Cubic.easeInOut',
      });
    } else if (this.container) {
      this.container.x = targetX;
    }

    return this.isOpen;
  }

  update() {
    if (this._isModalBlocking()) {
      return;
    }
    if (actions.justDown('objectives')) {
      this.toggle(true);
    }
  }

  destroy() {
    if (this._flashTimer) {
      clearTimeout(this._flashTimer);
      this._flashTimer = null;
    }
    if (this._tabFlashTimer) {
      clearTimeout(this._tabFlashTimer);
      this._tabFlashTimer = null;
    }
    if (this._autoCollapseTimer) {
      clearTimeout(this._autoCollapseTimer);
      this._autoCollapseTimer = null;
    }
    bus.off('objective:start', this._onStart);
    bus.off('condition', this._onCondition);
    bus.off('objective:complete', this._onComplete);
  }
}

export default ObjectivePanel;
