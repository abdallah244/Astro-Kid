import Phaser from 'phaser';
import { COLORS } from '../config.js';
import { SaveManager } from '../save.js';
import { audio } from '../core/audio.js';
import { pixelButton } from '../ui.js';
import { UI, uiPanel } from '../ui/theme.js';
import { SPEAKER_META } from '../ui/DialogueBox.js';
import {
  Dialogue,
  getDialogueAudioIds,
  getDialogueLines,
} from '../systems/Dialogue.js';

const BUBBLES = {
  cut1: [[66.7, 6.0, 28.9, 38.0]],
  cut4: [[62.3, 67.2, 19.1, 25.6]],
  cut5: [[71.6, 4.6, 24.7, 47.2]],
  cut6: [[61.8, 4.3, 24.7, 46.7]],
  cut7: [
    [69.8, 4.1, 27.3, 24.6],
    [55.6, 73.5, 29.2, 24.1],
  ],
};

const STEPS = [
  {
    panel: 'cut1',
    lines: ['cutscene_01_launch', 'cutscene_01_reply'],
  },
  {
    panel: 'cut4',
    lines: ['cutscene_02_control', 'cutscene_02_reply'],
    liftoff: true,
  },
  {
    panel: 'cut5',
    lines: ['cutscene_03_nova', 'cutscene_03_astronaut', 'cutscene_03_nova2'],
  },
  {
    panel: 'cut6',
    lines: ['cutscene_04_nova', 'cutscene_04_astronaut', 'cutscene_04_nova2'],
  },
  {
    panel: 'cut8',
    lines: ['cutscene_05_nova', 'cutscene_05_astronaut', 'cutscene_05_nova2'],
    shake: [600, 0.003],
  },
  {
    panel: 'cut9',
    lines: ['cutscene_06_nova', 'cutscene_06_astronaut'],
    shake: [500, 0.006],
  },
  {
    panel: 'cut7',
    lines: ['cutscene_07_astronaut', 'cutscene_07_nova'],
    startMusic: true,
  },
];

const ALL_CUTSCENE_LINE_IDS = STEPS.flatMap((s) => s.lines);
const CUTSCENE_AUDIO_IDS = Array.from(
  new Set([
    ...getDialogueAudioIds(ALL_CUTSCENE_LINE_IDS),
    'SFX_Button_Click',
    'SFX_Countdown_Beep',
    'SFX_Engine_Ignition',
    'SFX_Rocket_Thrust',
    'SFX_Metal_Vibration',
    'SFX_Navigation_Beep',
    'SFX_System_Online',
    'SFX_System_Confirmed',
    'SFX_Landing_Impact',
    'SFX_Engine_Shutdown',
    'SFX_Thrust_Activated',
    'SFX_Warning_Beep',
    'MUS_Lunar_Exploration',
  ])
);

export class CutsceneScene extends Phaser.Scene {
  constructor() {
    super('CutsceneScene');
  }

  preload() {
    for (let i = 1; i <= 7; i += 1) {
      const key = `cut${i}`;
      if (!this.textures.exists(key)) {
        this.load.image(key, `assets/level01/cutscene/cutscene_panel${i}.png`);
      }
    }
    if (!this.textures.exists('cut8')) {
      this.load.image('cut8', 'assets/level01/cutscene/cutscene_panel8.webp');
    }
    if (!this.textures.exists('cut9')) {
      this.load.image('cut9', 'assets/level01/cutscene/cutscene_panel9.webp');
    }

    audio.preload(this, CUTSCENE_AUDIO_IDS);
  }

  create() {
    this.finishing = false;
    this._lineCtrl = null;
    this._stepTimers = new Set();
    this._currentPanelContainer = null;
    this._currentPanelRect = null;
    this._overlayContainer = null;

    for (let i = 1; i <= 9; i += 1) {
      const key = `cut${i}`;
      if (this.textures.exists(key)) {
        this.textures
          .get(key)
          .setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }

    // Background 0x05060f
    this.cameras.main.setBackgroundColor(0x05060f);
    this.add.rectangle(0, 0, 1280, 720, 0x05060f, 1).setOrigin(0, 0).setDepth(0);

    // Stop MUS_Main_Menu with 600 ms fade when cutscene starts
    audio.music(null, { fadeMs: 600 });

    // Title text at (60, 40)
    this.add
      .text(60, 40, 'LEVEL 1 · FIRST LANDING', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '22px',
        color: '#ffc83d',
      })
      .setOrigin(0, 0)
      .setDepth(10);

    // SKIP button at (1100, 30) size 120x44
    this.skipBtn = pixelButton(this, {
      x: 1100,
      y: 30,
      w: 120,
      h: 44,
      fill: COLORS.blue,
      fontSize: 12,
      textColor: COLORS.white,
      label: 'SKIP',
      autoFocus: false,
      onClick: () => {
        this._finishCutscene();
      },
    });
    this.skipBtn.shadowGfx.setDepth(30);
    this.skipBtn.bodyGfx.setDepth(30);
    this.skipBtn.textObj.setDepth(31);
    this.skipBtn.focusGfx.setDepth(31);
    this.skipBtn.hitZone.setDepth(32);

    // Progress dots (7 rects 26x12 at (60, 640) with 12 px gaps) + Panel n of 7
    this.progressGfx = this.add.graphics().setDepth(10);
    this.progressLabel = this.add
      .text(60 + 7 * 26 + 6 * 12 + 16, 646, 'Panel 1 of 7', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '14px',
        color: '#aab3cc',
      })
      .setOrigin(0, 0.5)
      .setDepth(10);

    // Blinking hint E  NEXT at bottom right (1220, 650)
    const saved = SaveManager.get();
    const interactKey =
      (saved?.settings?.keys?.interact?.[0] || 'E').toUpperCase();
    this.nextHint = this.add
      .text(1220, 650, `${interactKey}  NEXT`, {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '15px',
        color: '#ffc83d',
      })
      .setOrigin(1, 0.5)
      .setDepth(30);

    this.tweens.add({
      targets: this.nextHint,
      alpha: 0.3,
      duration: 550,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ESC anywhere in CutsceneScene skips immediately
    this.input.keyboard.on('keydown-ESC', () => {
      this._finishCutscene();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this._clearStepTimers();
      if (this._lineCtrl) {
        this._lineCtrl.cancel();
        this._lineCtrl = null;
      }
      audio.stopVoicesAndSfx(0);
    });

    this._exposeTestHooks();
    this._runStep(0);
  }

  _exposeTestHooks() {
    if (typeof window === 'undefined') return;
    window.__astro = {
      ...(window.__astro || {}),
      scene: this,
      player: null,
      dialogue: {
        isPlaying: true,
        skipAll: () => this._finishCutscene(),
      },
      go: (sceneKey, data) => {
        this.scene.start(sceneKey, data);
      },
      startCutscene: () => {
        this.scene.restart();
      },
    };
  }

  _addStepDelay(ms, cb) {
    const ev = this.time.delayedCall(ms, () => {
      this._stepTimers.delete(ev);
      if (!this.finishing) cb();
    });
    this._stepTimers.add(ev);
    return ev;
  }

  _clearStepTimers() {
    for (const ev of this._stepTimers) {
      ev.remove(false);
    }
    this._stepTimers.clear();
  }

  _updateProgress(stepIndex) {
    this.progressGfx.clear();
    for (let i = 0; i < 7; i += 1) {
      const rx = 60 + i * (26 + 12);
      const ry = 640;
      const color = i === stepIndex ? 0xffd23f : 0x243372;
      this.progressGfx.fillStyle(color, 1);
      this.progressGfx.fillRect(rx, ry, 26, 12);
    }
    this.progressLabel.setText(`Panel ${stepIndex + 1} of 7`);
  }

  _showPanel(panelKey, immediate = false) {
    if (this._overlayContainer) {
      this._overlayContainer.destroy(true);
      this._overlayContainer = null;
    }

    const tex = this.textures.get(panelKey);
    const source = tex && tex.getSourceImage ? tex.getSourceImage() : null;
    const texW = (source && source.width) || 1080;
    const texH = (source && source.height) || 480;

    const boxX = 60;
    const boxY = 108;
    const boxW = 1160;
    const boxH = 480;

    const scale = Math.min(boxW / texW, boxH / texH);
    const dispW = Math.round(texW * scale);
    const dispH = Math.round(texH * scale);
    const dispX = Math.round(boxX + (boxW - dispW) / 2);
    const dispY = Math.round(boxY + (boxH - dispH) / 2);

    const container = this.add.container(0, 0).setDepth(12);

    // Frame: outer 4 px line 0x3a4a94 + inner 6 px border 0x1a1a2e around displayed image
    const frameGfx = this.add.graphics();
    frameGfx.fillStyle(0x3a4a94, 1);
    frameGfx.fillRect(dispX - 10, dispY - 10, dispW + 20, dispH + 20);
    frameGfx.fillStyle(0x1a1a2e, 1);
    frameGfx.fillRect(dispX - 6, dispY - 6, dispW + 12, dispH + 12);

    const img = this.add
      .image(dispX, dispY, panelKey)
      .setOrigin(0, 0)
      .setDisplaySize(dispW, dispH);

    container.add([frameGfx, img]);

    const prev = this._currentPanelContainer;
    this._currentPanelContainer = container;
    this._currentPanelRect = { x: dispX, y: dispY, w: dispW, h: dispH };

    if (immediate || !prev) {
      if (prev) prev.destroy(true);
      container.setAlpha(1);
    } else {
      prev.setDepth(11);
      container.setAlpha(0);
      this.tweens.add({
        targets: container,
        alpha: 1,
        duration: 350,
        ease: 'Sine.easeOut',
        onComplete: () => {
          if (prev && prev.scene) {
            prev.destroy(true);
          }
        },
      });
    }

    this._overlayContainer = this.add.container(0, 0).setDepth(22);
    return this._currentPanelRect;
  }

  _buildStepRenderer(panelKey, rect) {
    const bubbleDefs = BUBBLES[panelKey] || null;

    if (bubbleDefs) {
      const slots = bubbleDefs.map(([xp, yp, wp, hp]) => {
        const bx = rect.x + (xp / 100) * rect.w;
        const by = rect.y + (yp / 100) * rect.h;
        const bw = (wp / 100) * rect.w;
        const bh = (hp / 100) * rect.h;

        const textObj = this.add
          .text(bx + bw / 2, by + bh / 2, '', {
            fontFamily: UI.font,
            fontStyle: '700',
            fontSize: '24px',
            color: '#1a1a2e',
            align: 'center',
            wordWrap: { width: Math.max(40, bw - 16) },
          })
          .setOrigin(0.5, 0.5);

        const tagGfx = this.add.graphics().setVisible(false);
        const tagText = this.add
          .text(bx + bw / 2, by + bh + 6, '', {
            fontFamily: UI.font,
            fontStyle: '700',
            fontSize: '14px',
            color: '#1a1a2e',
          })
          .setOrigin(0.5, 0)
          .setVisible(false);

        this._overlayContainer.add([textObj, tagGfx, tagText]);

        return { bx, by, bw, bh, textObj, tagGfx, tagText };
      });

      let activeSlot = slots[0];

      return ({ type, line, index, shownText, fullText }) => {
        if (!this._overlayContainer || !this._overlayContainer.scene) return;

        // cut7 uses slot 0 for line 0 and slot 1 for line 1; other bubble panels reuse slot 0
        const slotIndex =
          panelKey === 'cut7' ? Math.min(index, slots.length - 1) : 0;
        activeSlot = slots[slotIndex];

        if (type === 'start') {
          const wrapW = Math.max(40, activeSlot.bw - 16);
          activeSlot.textObj.setWordWrapWidth(wrapW);

          // Pick largest font size from [24, 22, 20, 18, 16] that fits bubble height
          const sizes = [24, 22, 20, 18, 16];
          let chosen = 16;
          activeSlot.textObj.setText(fullText);
          for (const sz of sizes) {
            activeSlot.textObj.setFontSize(sz);
            if (activeSlot.textObj.height <= activeSlot.bh - 8) {
              chosen = sz;
              break;
            }
          }
          activeSlot.textObj.setFontSize(chosen);
          activeSlot.textObj.setText(shownText);

          // Gold speaker tag below bubble rectangle
          const speakerLabel =
            (SPEAKER_META[line.speaker] && SPEAKER_META[line.speaker].name) ||
            line.speaker;
          activeSlot.tagText.setText(speakerLabel);
          const tagW = Math.ceil(activeSlot.tagText.width + 16);
          const tagH = Math.ceil(activeSlot.tagText.height + 8);
          const tagX = Math.round(activeSlot.bx + (activeSlot.bw - tagW) / 2);
          const tagY = Math.round(activeSlot.by + activeSlot.bh + 4);

          activeSlot.tagGfx.clear();
          activeSlot.tagGfx.fillStyle(0xffd23f, 1);
          activeSlot.tagGfx.fillRoundedRect(tagX, tagY, tagW, tagH, 6);
          activeSlot.tagGfx.setVisible(true);

          activeSlot.tagText.setPosition(
            Math.round(activeSlot.bx + activeSlot.bw / 2),
            tagY + 4
          );
          activeSlot.tagText.setVisible(true);
        } else if (activeSlot && activeSlot.textObj) {
          activeSlot.textObj.setText(shownText);
        }
      };
    }

    // Subtitle bar for panels without speech bubbles (cut8, cut9): uiPanel 800x72 at (240, 604)
    const subPanel = uiPanel(this, 240, 604, 800, 72);
    const speakerPrefix = this.add
      .text(260, 640, '', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '22px',
        color: '#ffc83d',
      })
      .setOrigin(0, 0.5);

    const subText = this.add
      .text(260, 640, '', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '22px',
        color: '#ffffff',
        wordWrap: { width: 760 },
      })
      .setOrigin(0, 0.5);

    this._overlayContainer.add([subPanel, speakerPrefix, subText]);

    return ({ type, line, shownText }) => {
      if (!this._overlayContainer || !this._overlayContainer.scene) return;
      if (type === 'start') {
        const speakerLabel =
          (SPEAKER_META[line.speaker] && SPEAKER_META[line.speaker].name) ||
          line.speaker;
        speakerPrefix.setText(`${speakerLabel}: `);
        const prefixW = speakerPrefix.width;
        subText.setPosition(260 + prefixW, 640);
        subText.setWordWrapWidth(Math.max(200, 760 - prefixW));
        subText.setText(shownText);
      } else {
        subText.setText(shownText);
      }
    };
  }

  _runStep(stepIndex) {
    if (this.finishing) return;

    if (stepIndex >= STEPS.length) {
      // Wait 1200 ms after last line, then fade 600 ms to LevelScene
      this._addStepDelay(1200, () => {
        this._finishCutscene();
      });
      return;
    }

    this._clearStepTimers();
    const step = STEPS[stepIndex];
    this._updateProgress(stepIndex);

    const rect = this._showPanel(step.panel, stepIndex === 0);

    if (step.shake) {
      this.cameras.main.shake(step.shake[0], step.shake[1]);
    }

    if (step.startMusic) {
      audio.music('MUS_Lunar_Exploration', { fadeMs: 2000, rampIn: true });
    }

    const lines = getDialogueLines(step.lines);
    const renderFn = this._buildStepRenderer(step.panel, rect);

    this._lineCtrl = Dialogue.playLines(this, lines, renderFn, {
      duck: false,
      radioFraming: true,
      handleEsc: false, // CutsceneScene handles ESC globally to jump to LevelScene
      shouldIgnorePointer: (_pointer, currentlyOver) => {
        if (!this.skipBtn) return false;
        return Array.isArray(currentlyOver) && currentlyOver.includes(this.skipBtn.hitZone);
      },
      onLineStart: (line, lineIdx) => {
        if (step.liftoff && lineIdx === 0) {
          audio.play('SFX_Countdown_Beep');
          this._addStepDelay(700, () => {
            audio.play('SFX_Countdown_Beep');
          });
          this._addStepDelay(1400, () => {
            audio.play('SFX_Countdown_Beep');
          });
          this._addStepDelay(1800, () => {
            audio.play('SFX_Engine_Ignition');
            audio.play('SFX_Rocket_Thrust', { gain: 0.5 });
            audio.play('SFX_Metal_Vibration');
            this.cameras.main.shake(900, 0.004);
          });
          return { suppressLineSfx: true, minHoldMs: 2300 };
        }
        return null;
      },
      onDone: () => {
        this._lineCtrl = null;
        this._runStep(stepIndex + 1);
      },
    });
  }

  _finishCutscene() {
    if (this.finishing) return;
    this.finishing = true;

    this._clearStepTimers();
    if (this._lineCtrl) {
      this._lineCtrl.cancel();
      this._lineCtrl = null;
    }

    audio.stopVoicesAndSfx(120);
    SaveManager.markCutsceneSeen();

    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => {
        this.scene.start('LevelScene', { mission: 1 });
      }
    );
  }
}

export default CutsceneScene;
