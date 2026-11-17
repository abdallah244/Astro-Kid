import Phaser from 'phaser';
import { COLORS, HEX, PIXEL, SILK } from '../config.js';
import { SaveManager } from '../save.js';
import { pixelButton } from '../ui.js';

export class MissionStubScene extends Phaser.Scene {
  constructor() {
    super('MissionStubScene');
  }

  init(data) {
    this.mission = data && Number.isInteger(data.mission) ? data.mission : 1;
  }

  create() {
    // Background + overlay alpha 0.6
    this.add
      .image(-80, 0, 'moon_background')
      .setOrigin(0, 0)
      .setDisplaySize(1440, 720);

    this.add.rectangle(0, 0, 1280, 720, HEX.space, 0.6).setOrigin(0, 0);

    // Center text MISSION {n}
    const title = this.add
      .text(640, 260, `MISSION ${this.mission}`, {
        fontFamily: PIXEL,
        fontSize: '40px',
        color: COLORS.yellow,
        stroke: COLORS.ink,
        strokeThickness: 4,
        padding: { top: 0, bottom: 8 },
      })
      .setOrigin(0.5, 0);
    title.setShadow(0, 5, COLORS.orange, 0, true, true);

    // Coming soon text
    this.add
      .text(640, 340, 'Coming soon.', {
        fontFamily: SILK,
        fontStyle: 'bold',
        fontSize: '26px',
        color: COLORS.white,
        stroke: COLORS.ink,
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0);

    // COMPLETE (TEST) button at (490, 440, 300, 54)
    pixelButton(this, {
      x: 490,
      y: 440,
      w: 300,
      h: 54,
      border: 5,
      fill: COLORS.yellow,
      shade: 6,
      shadeColor: COLORS.yellowShade,
      depth: 6,
      fontSize: 15,
      textColor: COLORS.ink,
      label: 'COMPLETE (TEST)',
      onClick: () => {
        SaveManager.completeMission(this.mission);
        this.scene.start('MissionsScene');
      },
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
      onClick: () => {
        this.scene.start('MissionsScene');
      },
    });
  }
}
