import Phaser from 'phaser';
import { COLORS, HEX, PIXEL } from '../config.js';
import { SaveManager } from '../save.js';
import { audio } from '../core/audio.js';
import { pixelButton, pixelPanel, registerFocusable } from '../ui.js';

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene');
    this._voicePreview = null;
  }

  preload() {
    audio.preload(this, ['VOICE_obj02_nova']);
  }

  create() {
    this._voicePreview = null;
    const save = SaveManager.get();
    audio.music('MUS_Main_Menu');

    // Background + overlay
    this.add
      .image(-80, 0, 'moon_background')
      .setOrigin(0, 0)
      .setDisplaySize(1440, 720);

    this.add.rectangle(0, 0, 1280, 720, HEX.space, 0.68).setOrigin(0, 0);

    // Title SETTINGS
    const title = this.add
      .text(640, 56, 'SETTINGS', {
        fontFamily: PIXEL,
        fontSize: '54px',
        color: COLORS.yellow,
        stroke: COLORS.ink,
        strokeThickness: 4,
        padding: { top: 0, bottom: 8 },
      })
      .setOrigin(0.5, 0);
    title.setShadow(0, 6, COLORS.orange, 0, true, true);

    // Main settings panel (5 rows -> h = 504)
    pixelPanel(this, {
      x: 240,
      y: 170,
      w: 800,
      h: 504,
      fill: COLORS.panel,
      border: 6,
      inner: COLORS.panelBorderLight,
      depth: 8,
    });

    // Row dividers between the 5 rows
    const dividers = this.add.graphics();
    dividers.fillStyle(HEX.track, 1);
    for (let i = 0; i < 4; i += 1) {
      const rowTop = 198 + i * 96;
      dividers.fillRect(280, rowTop + 64 + 14, 720, 4);
    }

    // Row 0: MUSIC
    this._createSliderRow({
      rowIndex: 0,
      label: 'MUSIC',
      initialValue: save.settings.music,
      onChange: (val) => {
        const updated = SaveManager.setSetting('music', val);
        audio.setVolumes(
          updated.settings.music,
          updated.settings.sfx,
          updated.settings.voice
        );
      },
    });

    // Row 1: SOUND FX
    this._createSliderRow({
      rowIndex: 1,
      label: 'SOUND FX',
      initialValue: save.settings.sfx,
      onChange: (val, playPreview) => {
        const updated = SaveManager.setSetting('sfx', val);
        audio.setVolumes(
          updated.settings.music,
          updated.settings.sfx,
          updated.settings.voice
        );
        if (playPreview) {
          audio.click();
        }
      },
    });

    // Row 2: VOICE
    this._createSliderRow({
      rowIndex: 2,
      label: 'VOICE',
      initialValue: save.settings.voice ?? 80,
      onPreview: () => {
        if (this._voicePreview) {
          audio.fadeOutSound(this._voicePreview, 60);
          this._voicePreview = null;
        }
        const snd = audio.play('VOICE_obj02_nova');
        if (snd) {
          this._voicePreview = snd;
        } else {
          audio.click();
        }
      },
      onChange: (val, playPreview) => {
        const updated = SaveManager.setSetting('voice', val);
        audio.setVolumes(
          updated.settings.music,
          updated.settings.sfx,
          updated.settings.voice
        );
        if (playPreview) {
          if (this._voicePreview) {
            audio.fadeOutSound(this._voicePreview, 60);
            this._voicePreview = null;
          }
          const snd = audio.play('VOICE_obj02_nova');
          if (snd) {
            this._voicePreview = snd;
          } else {
            audio.click();
          }
        }
      },
    });

    // Row 3: MENTOR TIPS (shifted down by 96 px)
    this._createToggleRow({
      rowIndex: 3,
      label: 'MENTOR TIPS',
      initialValue: Boolean(save.settings.tips),
      onChange: (val) => {
        SaveManager.setSetting('tips', val);
      },
    });

    // Row 4: FULLSCREEN (shifted down by 96 px)
    const fullscreenToggle = this._createToggleRow({
      rowIndex: 4,
      label: 'FULLSCREEN',
      initialValue: Boolean(this.scale.isFullscreen),
      onChange: (val) => {
        try {
          if (val) {
            this.scale.startFullscreen();
          } else if (this.scale.isFullscreen) {
            this.scale.stopFullscreen();
          }
        } catch {
          fullscreenToggle.setValue(Boolean(this.scale.isFullscreen));
        }
      },
    });

    const onEnterFs = () => fullscreenToggle.setValue(true);
    const onLeaveFs = () => fullscreenToggle.setValue(false);
    this.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, onEnterFs);
    this.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, onLeaveFs);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, onEnterFs);
      this.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, onLeaveFs);
      if (this._voicePreview) {
        audio.fadeOutSound(this._voicePreview, 60);
        this._voicePreview = null;
      }
    });

    // BACK button (focused as the first button on scene start; Tab cycles all rows + BACK)
    const backBtn = pixelButton(this, {
      x: 48,
      y: 636,
      w: 180,
      h: 52,
      border: 5,
      fill: COLORS.blueButton,
      shade: 6,
      shadeColor: COLORS.blueShade,
      depth: 6,
      fontSize: 15,
      textColor: COLORS.white,
      label: 'BACK',
      autoFocus: false,
      onClick: () => {
        this.scene.start('StartScene');
      },
    });

    if (this._uiFocus) {
      this._uiFocus.focusItem(backBtn.focusItem, false);
    }

    // Pressing Escape also goes back
    this.input.keyboard.on('keydown-ESC', () => {
      audio.click();
      this.scene.start('StartScene');
    });
  }

  _createSliderRow({ rowIndex, label, initialValue, onChange, onPreview }) {
    const rowTop = 198 + rowIndex * 96;
    let value = Math.round(Phaser.Math.Clamp(initialValue, 0, 100) / 5) * 5;

    this.add
      .text(280, rowTop + 24, label, {
        fontFamily: PIXEL,
        fontSize: '18px',
        color: COLORS.white,
      })
      .setOrigin(0, 0);

    const trackX = 660;
    const trackY = rowTop + 14;
    const trackW = 300;
    const trackH = 36;
    const thumbW = 24;
    const thumbH = 36;

    const trackGfx = this.add.graphics();
    trackGfx.fillStyle(HEX.ink, 1);
    trackGfx.fillRect(trackX, trackY, trackW, trackH);
    trackGfx.fillStyle(HEX.sliderInner, 1);
    trackGfx.fillRect(trackX + 4, trackY + 4, trackW - 8, trackH - 8);

    const focusGfx = this.add.graphics();
    focusGfx.fillStyle(HEX.yellow, 1);
    focusGfx.fillRect(trackX - 3, trackY - 3, trackW + 6, 3);
    focusGfx.fillRect(trackX - 3, trackY + trackH, trackW + 6, 3);
    focusGfx.fillRect(trackX - 3, trackY, 3, trackH);
    focusGfx.fillRect(trackX + trackW, trackY, 3, trackH);
    focusGfx.setVisible(false);

    const thumbGfx = this.add.graphics();

    const valText = this.add
      .text(1000, rowTop + 24, `${value}`, {
        fontFamily: PIXEL,
        fontSize: '18px',
        color: COLORS.yellow,
        fixedWidth: 64,
        align: 'right',
      })
      .setOrigin(1, 0);

    const render = () => {
      const thumbX = Math.round(trackX + (value / 100) * (trackW - thumbW));
      thumbGfx.clear();
      thumbGfx.fillStyle(HEX.ink, 1);
      thumbGfx.fillRect(thumbX, trackY, thumbW, thumbH);
      thumbGfx.fillStyle(HEX.yellow, 1);
      thumbGfx.fillRect(thumbX + 4, trackY + 4, thumbW - 8, thumbH - 8);
      thumbGfx.fillStyle(HEX.yellowShade, 1);
      thumbGfx.fillRect(thumbX + 4, trackY + thumbH - 4 - 6, thumbW - 8, 6);
      valText.setText(`${value}`);
    };

    const updateValue = (nextVal, playPreview = false) => {
      const stepped =
        Math.round(Phaser.Math.Clamp(nextVal, 0, 100) / 5) * 5;
      if (stepped === value) return false;
      value = stepped;
      render();
      onChange(value, playPreview);
      return true;
    };

    const valueFromPointer = (pointer) => {
      const ratio = Phaser.Math.Clamp(
        (pointer.x - (trackX + thumbW / 2)) / (trackW - thumbW),
        0,
        1
      );
      return Math.round((ratio * 100) / 5) * 5;
    };

    render();

    const focusItem = registerFocusable(
      this,
      {
        allowSpace: false,
        onLeft: () => {
          updateValue(value - 5, true);
        },
        onRight: () => {
          updateValue(value + 5, true);
        },
        setFocused: (focused, showRing) => {
          focusGfx.setVisible(Boolean(focused && showRing));
        },
      },
      { autoFocus: false }
    );

    let dragging = false;
    let changedDuringDrag = false;

    const hitZone = this.add
      .zone(trackX - 6, trackY - 6, trackW + 12, trackH + 12)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    hitZone.on('pointerdown', (pointer) => {
      dragging = true;
      changedDuringDrag = false;
      if (this._uiFocus) {
        this._uiFocus.focusItem(focusItem, true);
      }
      if (updateValue(valueFromPointer(pointer), false)) {
        changedDuringDrag = true;
      }
    });

    const onPointerMove = (pointer) => {
      if (!dragging || !pointer.isDown) return;
      if (updateValue(valueFromPointer(pointer), false)) {
        changedDuringDrag = true;
      }
    };

    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      if (changedDuringDrag) {
        if (onPreview) {
          onPreview();
        } else {
          audio.click();
        }
      }
    };

    this.input.on('pointermove', onPointerMove);
    this.input.on('pointerup', onPointerUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointermove', onPointerMove);
      this.input.off('pointerup', onPointerUp);
    });
  }

  _createToggleRow({ rowIndex, label, initialValue, onChange }) {
    const rowTop = 198 + rowIndex * 96;
    let isOn = Boolean(initialValue);

    this.add
      .text(280, rowTop + 24, label, {
        fontFamily: PIXEL,
        fontSize: '18px',
        color: COLORS.white,
      })
      .setOrigin(0, 0);

    const toggleX = 860;
    const toggleY = rowTop + 8;
    const toggleW = 140;
    const toggleH = 48;
    const border = 5;

    const focusGfx = this.add.graphics();
    focusGfx.fillStyle(HEX.yellow, 1);
    focusGfx.fillRect(toggleX - 3, toggleY - 3, toggleW + 6, 3);
    focusGfx.fillRect(toggleX - 3, toggleY + toggleH, toggleW + 6, 3);
    focusGfx.fillRect(toggleX - 3, toggleY, 3, toggleH);
    focusGfx.fillRect(toggleX + toggleW, toggleY, 3, toggleH);
    focusGfx.setVisible(false);

    const gfx = this.add.graphics();
    const knobText = this.add
      .text(0, toggleY + border + 19, 'ON', {
        fontFamily: PIXEL,
        fontSize: '12px',
        color: COLORS.ink,
      })
      .setOrigin(0.5, 0.5);

    const render = () => {
      gfx.clear();
      gfx.fillStyle(HEX.ink, 1);
      gfx.fillRect(toggleX, toggleY, toggleW, toggleH);

      const innerX = toggleX + border;
      const innerY = toggleY + border;
      const innerW = toggleW - border * 2;
      const innerH = toggleH - border * 2;

      gfx.fillStyle(isOn ? HEX.green : HEX.panelBorderLight, 1);
      gfx.fillRect(innerX, innerY, innerW, innerH);
      gfx.fillStyle(isOn ? HEX.greenShade : HEX.toggleOffShade, 1);
      gfx.fillRect(innerX, innerY + innerH - 6, innerW, 6);

      const knobX = isOn ? innerX + 74 : innerX;
      gfx.fillStyle(HEX.ink, 1);
      gfx.fillRect(knobX, innerY, 56, 38);
      gfx.fillStyle(HEX.white, 1);
      gfx.fillRect(knobX + 4, innerY + 4, 48, 30);

      knobText.setText(isOn ? 'ON' : 'OFF');
      knobText.setPosition(knobX + 28, innerY + 19);
    };

    render();

    const flip = () => {
      isOn = !isOn;
      render();
      audio.click();
      onChange(isOn);
    };

    const focusItem = registerFocusable(
      this,
      {
        onActivate: flip,
        onLeft: () => {
          if (isOn) flip();
        },
        onRight: () => {
          if (!isOn) flip();
        },
        setFocused: (focused, showRing) => {
          focusGfx.setVisible(Boolean(focused && showRing));
        },
      },
      { autoFocus: false }
    );

    const hitZone = this.add
      .zone(toggleX, toggleY, toggleW, toggleH)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    hitZone.on('pointerdown', () => {
      if (this._uiFocus) {
        this._uiFocus.focusItem(focusItem, false);
      }
      flip();
    });

    return {
      setValue(nextVal) {
        isOn = Boolean(nextVal);
        render();
      },
    };
  }
}
