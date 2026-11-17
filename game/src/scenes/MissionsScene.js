import Phaser from 'phaser';
import { COLORS, HEX, PIXEL } from '../config.js';
import { SaveManager } from '../save.js';
import { audio } from '../core/audio.js';
import { state } from '../core/state.js';
import { pixelButton, registerFocusable } from '../ui.js';

export class MissionsScene extends Phaser.Scene {
  constructor() {
    super('MissionsScene');
  }

  create() {
    this.transitioning = false;
    const save = SaveManager.get();
    audio.music('MUS_Main_Menu');

    // Background + overlay
    this.add
      .image(-80, 0, 'moon_background')
      .setOrigin(0, 0)
      .setDisplaySize(1440, 720);

    this.add.rectangle(0, 0, 1280, 720, HEX.space, 0.6).setOrigin(0, 0);

    // Title SELECT MISSION
    const title = this.add
      .text(640, 44, 'SELECT MISSION', {
        fontFamily: PIXEL,
        fontSize: '44px',
        color: COLORS.yellow,
        stroke: COLORS.ink,
        strokeThickness: 4,
        padding: { top: 0, bottom: 8 },
      })
      .setOrigin(0.5, 0);
    title.setShadow(0, 5, COLORS.orange, 0, true, true);

    const openMission = (missionNum) => {
      if (this.transitioning) return;
      audio.click();
      if (missionNum === 1) {
        this.transitioning = true;
        if (state.flags && state.flags.level1_complete) {
          const keptRewards = {
            researchPoints: state.rewards?.researchPoints || 0,
            exp: state.rewards?.exp || 0,
          };
          state.reset();
          state.rewards = keptRewards;
          state.save();
        }
        const latestSave = SaveManager.get();
        const targetScene =
          latestSave.progress && latestSave.progress.cutsceneSeen
            ? 'LevelScene'
            : 'CutsceneScene';
        this.cameras.main.fadeOut(250, 6, 9, 32);
        this.cameras.main.once(
          Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
          () => {
            this.scene.start(targetScene, { mission: 1 });
          }
        );
      } else {
        this.scene.start('MissionStubScene', { mission: missionNum });
      }
    };

    // 3x2 mission slots grid
    const slotW = 300;
    const slotH = 250;
    this.slots = [];
    this.focusedSlot = 0;
    this.gridFocused = true;

    for (let i = 0; i < 6; i += 1) {
      const missionNum = i + 1;
      const col = i % 3;
      const row = Math.floor(i / 3);
      const slotLeft = 130 + col * 360;
      const slotTop = 136 + row * 274;
      const unlocked = missionNum <= save.unlocked;

      const baseCenterX = slotLeft + slotW / 2;
      const baseCenterY = slotTop + slotH / 2;

      const img = this.add.image(baseCenterX, baseCenterY, `mission${missionNum}`);
      const scale = Math.min(slotW / img.width, slotH / img.height);
      img.setScale(scale);

      let padlockGfx = null;
      if (!unlocked) {
        img.setTint(HEX.lockedTint);
        padlockGfx = this._drawPadlock(118 + slotLeft, 62 + slotTop);
      }

      const slotEntry = {
        index: i,
        missionNum,
        slotLeft,
        slotTop,
        unlocked,
        img,
        baseCenterY,
        padlockGfx,
        offsetY: 0,
        stepTimer: null,
      };

      const setSlotOffset = (targetDy) => {
        if (slotEntry.stepTimer) {
          slotEntry.stepTimer.remove(false);
          slotEntry.stepTimer = null;
        }
        const midDy = Math.round((slotEntry.offsetY + targetDy) / 2);
        slotEntry.offsetY = midDy;
        img.y = baseCenterY + midDy;
        this._renderFocusOutline();

        slotEntry.stepTimer = this.time.delayedCall(25, () => {
          if (!img.scene) return;
          slotEntry.offsetY = targetDy;
          img.y = baseCenterY + targetDy;
          slotEntry.stepTimer = null;
          this._renderFocusOutline();
        });
      };

      const hitZone = this.add
        .zone(slotLeft, slotTop, slotW, slotH)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: unlocked });

      if (unlocked) {
        let downInside = false;
        hitZone.on('pointerover', () => {
          setSlotOffset(-6);
        });
        hitZone.on('pointerout', () => {
          downInside = false;
          setSlotOffset(0);
        });
        hitZone.on('pointerdown', () => {
          downInside = true;
        });
        hitZone.on('pointerup', () => {
          if (!downInside) return;
          downInside = false;
          openMission(missionNum);
        });
      } else {
        hitZone.on('pointerdown', () => {
          audio.denied();
        });
      }

      this.slots.push(slotEntry);
    }

    // Focus outline (4 px yellow rect around focused slot box)
    this.focusOutline = this.add.graphics();
    this._renderFocusOutline();

    // Register mission grid as the initial keyboard focus target, with BACK reachable via Tab
    const gridFocusItem = registerFocusable(
      this,
      {
        allowSpace: false,
        onActivate: () => {
          const slot = this.slots[this.focusedSlot];
          if (!slot) return;
          if (slot.unlocked) {
            openMission(slot.missionNum);
          } else {
            audio.denied();
          }
        },
        onLeft: () => {
          if (this.focusedSlot % 3 > 0) {
            this.focusedSlot -= 1;
            this._renderFocusOutline();
          }
        },
        onRight: () => {
          if (this.focusedSlot % 3 < 2) {
            this.focusedSlot += 1;
            this._renderFocusOutline();
          }
        },
        onUp: () => {
          if (this.focusedSlot >= 3) {
            this.focusedSlot -= 3;
            this._renderFocusOutline();
          }
        },
        onDown: () => {
          if (this.focusedSlot < 3) {
            this.focusedSlot += 3;
            this._renderFocusOutline();
          }
        },
        setFocused: (focused) => {
          this.gridFocused = focused;
          this._renderFocusOutline();
        },
      },
      { autoFocus: true }
    );

    const onArrowRedirect = (event) => {
      if (
        !this.gridFocused &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)
      ) {
        if (this._uiFocus) {
          this._uiFocus.focusItem(gridFocusItem, true);
        }
      }
    };
    this.input.keyboard.on('keydown', onArrowRedirect);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard.off('keydown', onArrowRedirect);
    });

    // BACK button at (48, 44, 150, 48)
    pixelButton(this, {
      x: 48,
      y: 44,
      w: 150,
      h: 48,
      border: 5,
      fill: COLORS.blueButton,
      shade: 6,
      shadeColor: COLORS.blueShade,
      depth: 6,
      fontSize: 14,
      textColor: COLORS.white,
      label: 'BACK',
      autoFocus: false,
      onClick: () => {
        if (this.transitioning) return;
        this.scene.start('StartScene');
      },
    });
  }

  _drawPadlock(px, py) {
    const cell = 8;
    const g = this.add.graphics();

    g.fillStyle(HEX.white, 1);
    g.fillRect(px + 2 * cell, py + 0 * cell, 4 * cell, 1 * cell);
    g.fillRect(px + 1 * cell, py + 1 * cell, 1 * cell, 3 * cell);
    g.fillRect(px + 6 * cell, py + 1 * cell, 1 * cell, 3 * cell);

    g.fillRect(px + 0 * cell, py + 4 * cell, 8 * cell, 5 * cell);

    g.fillStyle(HEX.ink, 1);
    g.fillRect(px + 3 * cell, py + 5 * cell, 2 * cell, 3 * cell);

    return g;
  }

  _renderFocusOutline() {
    if (!this.focusOutline) return;
    this.focusOutline.clear();
    if (!this.gridFocused) return;

    const slot = this.slots[this.focusedSlot];
    if (!slot) return;

    const x = slot.slotLeft;
    const y = slot.slotTop + slot.offsetY;
    const w = 300;
    const h = 250;
    const t = 4;

    this.focusOutline.fillStyle(HEX.yellow, 1);
    this.focusOutline.fillRect(x - t, y - t, w + t * 2, t);
    this.focusOutline.fillRect(x - t, y + h, w + t * 2, t);
    this.focusOutline.fillRect(x - t, y, t, h);
    this.focusOutline.fillRect(x + w, y, t, h);
  }
}
