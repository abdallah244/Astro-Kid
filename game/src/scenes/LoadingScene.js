import Phaser from 'phaser';
import { COLORS, HEX, MISSIONS, PIXEL, SILK } from '../config.js';
import { audio } from '../core/audio.js';
import { createAstroKidTitle } from '../ui.js';

export class LoadingScene extends Phaser.Scene {
  constructor() {
    super('LoadingScene');
  }

  create() {
    this.real = 0;
    this.shown = 0;
    this.elapsed = 0;
    this.assetsReady = false;
    this.transitioning = false;

    // Ensure moon_background uses LINEAR filtering
    if (this.textures.exists('moon_background')) {
      this.textures
        .get('moon_background')
        .setFilter(Phaser.Textures.FilterMode.LINEAR);
    }

    // Ensure astro_walk animation exists immediately so the walking sprite animates during load
    if (!this.anims.exists('astro_walk')) {
      this.anims.create({
        key: 'astro_walk',
        frames: this.anims.generateFrameNumbers('astro_walk', {
          start: 0,
          end: 3,
        }),
        frameRate: 6.7,
        repeat: -1,
      });
    }

    // Background image + dark space overlay
    this.add
      .image(-80, 0, 'moon_background')
      .setOrigin(0, 0)
      .setDisplaySize(1440, 720);

    this.add.rectangle(0, 0, 1280, 720, HEX.space, 0.5).setOrigin(0, 0);

    // Title ASTRO KID
    createAstroKidTitle(this, { y: 120, fontSize: 72 });

    // Outer progress bar
    const barOuter = this.add.graphics();
    barOuter.fillStyle(HEX.ink, 1);
    barOuter.fillRect(240, 532, 800, 44);
    barOuter.fillStyle(HEX.track, 1);
    barOuter.fillRect(246, 538, 788, 32);

    // Dynamic inner progress bar
    this.barFill = this.add.graphics();

    // Walking Astro sprite above progress bar
    this.astro = this.add
      .sprite(246 - 56, 380, 'astro_walk')
      .setOrigin(0, 0)
      .setDisplaySize(113, 152);
    this.astro.play('astro_walk');

    // Loading percent text
    this.loadingText = this.add
      .text(640, 604, 'LOADING... 0%', {
        fontFamily: PIXEL,
        fontSize: '20px',
        color: COLORS.white,
        stroke: COLORS.ink,
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0);

    // Tip text
    this.add
      .text(640, 656, 'Tip: Keep an eye on your oxygen.', {
        fontFamily: SILK,
        fontStyle: 'bold',
        fontSize: '22px',
        color: COLORS.tipBlue,
        stroke: COLORS.ink,
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0);

    this._drawProgress();
    this._startAssetLoad();
  }

  _startAssetLoad() {
    let queued = 0;

    if (!this.textures.exists('moon_background')) {
      this.load.image('moon_background', 'assets/backgrounds/moon_background.webp');
      queued += 1;
    }

    if (!this.textures.exists('astro_walk')) {
      this.load.spritesheet('astro_walk', 'assets/sprites/astro_walk.png', {
        frameWidth: 125,
        frameHeight: 169,
      });
      queued += 1;
    }

    if (!this.textures.exists('astro_idle')) {
      this.load.spritesheet('astro_idle', 'assets/sprites/astro_idle.png', {
        frameWidth: 125,
        frameHeight: 169,
      });
      queued += 1;
    }

    if (!this.textures.exists('mentor_idle')) {
      this.load.spritesheet('mentor_idle', 'assets/sprites/mentor_idle.png', {
        frameWidth: 155,
        frameHeight: 175,
      });
      queued += 1;
    }

    for (const m of MISSIONS) {
      const key = `mission${m.id}`;
      if (!this.textures.exists(key)) {
        this.load.image(key, `assets/${m.file}`);
        queued += 1;
      }
    }

    queued += audio.preload(this, [
      'SFX_Button_Click',
      'SFX_Error',
      'MUS_Main_Menu',
    ]);

    if (queued === 0) {
      this.real = 100;
      this._finalizeLoadedAssets();
      return;
    }

    this.load.on('progress', (value) => {
      this.real = value * 100;
    });

    this.load.once('complete', () => {
      this.real = 100;
      this._finalizeLoadedAssets();
    });

    this.load.start();
  }

  _finalizeLoadedAssets() {
    // Keep photo-like background and mission badges smooth (LINEAR)
    if (this.textures.exists('moon_background')) {
      this.textures
        .get('moon_background')
        .setFilter(Phaser.Textures.FilterMode.LINEAR);
    }

    for (let i = 1; i <= 6; i += 1) {
      const key = `mission${i}`;
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }

    // Create global sprite animations once
    if (!this.anims.exists('astro_idle')) {
      this.anims.create({
        key: 'astro_idle',
        frames: this.anims.generateFrameNumbers('astro_idle', {
          start: 0,
          end: 1,
        }),
        frameRate: 1.8,
        repeat: -1,
      });
    }

    if (!this.anims.exists('astro_walk')) {
      this.anims.create({
        key: 'astro_walk',
        frames: this.anims.generateFrameNumbers('astro_walk', {
          start: 0,
          end: 3,
        }),
        frameRate: 6.7,
        repeat: -1,
      });
    }

    if (!this.anims.exists('mentor_idle')) {
      this.anims.create({
        key: 'mentor_idle',
        frames: this.anims.generateFrameNumbers('mentor_idle', {
          start: 0,
          end: 2,
        }),
        frameRate: 2,
        repeat: -1,
      });
    }

    this.assetsReady = true;
  }

  _drawProgress() {
    const clamped = Phaser.Math.Clamp(this.shown, 0, 100);
    const fillWidth = Math.round((788 * clamped) / 100);
    const percent = Math.round(clamped);

    this.barFill.clear();
    if (fillWidth > 0) {
      this.barFill.fillStyle(HEX.yellow, 1);
      this.barFill.fillRect(246, 538, fillWidth, 32);
      this.barFill.fillStyle(HEX.yellowShade, 1);
      this.barFill.fillRect(246, 562, fillWidth, 8);
    }

    this.astro.x = 246 + fillWidth - 56;
    this.loadingText.setText(`LOADING... ${percent}%`);
  }

  update(_time, delta) {
    this.elapsed += delta;
    this.shown = Phaser.Math.Linear(this.shown, this.real, 0.15);
    if (this.real >= 100 && 100 - this.shown < 0.4) {
      this.shown = 100;
    }

    this._drawProgress();

    if (
      !this.transitioning &&
      this.assetsReady &&
      this.shown >= 100 &&
      this.elapsed >= 1200
    ) {
      this.transitioning = true;
      this.cameras.main.fadeOut(300, 6, 9, 32);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start('StartScene');
        }
      );
    }
  }
}
