import Phaser from 'phaser';
import { ensureLightTextures } from '../ui/theme.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    this.load.image('moon_background', 'assets/backgrounds/moon_background.webp');
    this.load.spritesheet('astro_walk', 'assets/sprites/astro_walk.png', {
      frameWidth: 125,
      frameHeight: 169,
    });
  }

  create() {
    if (this.textures.exists('moon_background')) {
      this.textures
        .get('moon_background')
        .setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    ensureLightTextures(this);
    this.scene.start('LoadingScene');
  }
}
