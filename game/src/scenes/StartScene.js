import Phaser from 'phaser';
import { COLORS, HEX, SILK } from '../config.js';
import { audio } from '../core/audio.js';
import { createAstroKidTitle, pixelButton } from '../ui.js';

export class StartScene extends Phaser.Scene {
  constructor() {
    super('StartScene');
  }

  create() {
    this.transitioning = false;
    audio.music('MUS_Main_Menu');

    // Background
    this.add
      .image(-80, 0, 'moon_background')
      .setOrigin(0, 0)
      .setDisplaySize(1440, 720);

    // Title ASTRO KID
    createAstroKidTitle(this, { y: 56, fontSize: 84 });

    // Tagline
    this.add
      .text(640, 176, 'Run your own base on the Moon.', {
        fontFamily: SILK,
        fontStyle: 'bold',
        fontSize: '26px',
        color: COLORS.white,
        stroke: COLORS.ink,
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0);

    // Astro idle sprite
    this.add
      .sprite(170, 337, 'astro_idle')
      .setOrigin(0, 0)
      .setDisplaySize(175, 237)
      .play('astro_idle');

    // Mentor idle sprite
    this.add
      .sprite(880, 320, 'mentor_idle')
      .setOrigin(0, 0)
      .setDisplaySize(225, 254)
      .play('mentor_idle');

    // Speech bubble over the mentor
    const bubble = this.add.graphics();
    // Outer ink rect (806, 236, 372, 68), border 4 (widened from 300 so the text fits)
    bubble.fillStyle(HEX.ink, 1);
    bubble.fillRect(806, 236, 372, 68);
    bubble.fillStyle(HEX.white, 1);
    bubble.fillRect(810, 240, 364, 60);

    // Tail: 4 stacked rects, white with 4px ink left/right edges, plus ink tip
    // Connect bubble interior seamlessly into top tail slice
    bubble.fillStyle(HEX.white, 1);
    bubble.fillRect(989, 300, 24, 4);

    const tailRows = [
      { x: 985, y: 304, w: 32, h: 8 },
      { x: 989, y: 312, w: 24, h: 8 },
      { x: 993, y: 320, w: 16, h: 8 },
    ];
    for (const r of tailRows) {
      bubble.fillStyle(HEX.ink, 1);
      bubble.fillRect(r.x, r.y, r.w, r.h);
      bubble.fillStyle(HEX.white, 1);
      bubble.fillRect(r.x + 4, r.y, r.w - 8, r.h);
    }
    bubble.fillStyle(HEX.ink, 1);
    bubble.fillRect(997, 328, 8, 4);

    this.add
      .text(806 + 186, 236 + 34, 'Ready for your mission?', {
        fontFamily: SILK,
        fontStyle: 'bold',
        fontSize: '18px',
        color: COLORS.ink,
      })
      .setOrigin(0.5, 0.5);

    // Button 1: START TO PLAY
    pixelButton(this, {
      x: 380,
      y: 400,
      w: 520,
      h: 80,
      border: 6,
      fill: COLORS.yellow,
      shade: 8,
      shadeColor: COLORS.yellowShade,
      depth: 8,
      fontSize: 26,
      textColor: COLORS.ink,
      icon: true,
      label: 'START TO PLAY',
      onClick: () => {
        if (this.transitioning) return;
        this.transitioning = true;
        this.cameras.main.fadeOut(200, 6, 9, 32);
        this.cameras.main.once(
          Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
          () => {
            this.scene.start('MissionsScene');
          }
        );
      },
    });

    // Button 2: SETTINGS
    pixelButton(this, {
      x: 490,
      y: 504,
      w: 300,
      h: 54,
      border: 5,
      fill: COLORS.blueButton,
      shade: 6,
      shadeColor: COLORS.blueShade,
      depth: 6,
      fontSize: 15,
      textColor: COLORS.white,
      label: 'SETTINGS',
      onClick: () => {
        if (this.transitioning) return;
        this.scene.start('SettingsScene');
      },
    });
  }
}
