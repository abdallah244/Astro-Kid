import Phaser from 'phaser';
import { SaveManager } from '../save.js';
import { ITEM_ICON_ENTRIES } from '../data/items.js';
import { TECH_TREE_ASSET_ENTRIES } from '../data/tech.js';
import { OBJECTIVES } from '../data/objectives.js';
import { CAVES, REGIONS } from '../core/constants.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { inventory } from '../core/inventory.js';
import { state } from '../core/state.js';
import { UI } from '../ui/theme.js';

const LEVEL_COMPLETE_AUDIO_IDS = [
  'MUS_Level_Complete_Sting',
  'SFX_Level_Complete',
  'SFX_Victory_Cheer',
  'SFX_NOVA_Excited',
  'SFX_Score_Tick',
  'SFX_Score_Total',
  'SFX_Button_Hover',
  'SFX_Button_Click',
];

function formatDuration(totalSeconds) {
  const secs = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export class LevelCompleteScene extends Phaser.Scene {
  constructor() {
    super('LevelCompleteScene');
  }

  preload() {
    const assets = [...TECH_TREE_ASSET_ENTRIES, ...ITEM_ICON_ENTRIES];
    for (const [key, url] of assets) {
      if (!this.textures.exists(key)) {
        this.load.image(key, url);
      }
    }
    audio.preload(this, LEVEL_COMPLETE_AUDIO_IDS);
  }

  create() {
    this._transitioning = false;

    const linearKeys = [
      'lc_bg',
      'tree_res_gear',
      'tree_n_factory',
      'icon_regolith',
      'icon_ironrock',
      'icon_silicate',
    ];
    for (const k of linearKeys) {
      if (this.textures.exists(k)) {
        this.textures.get(k).setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }

    this.cameras.main.setBounds(0, 0, 1280, 720);

    // Persist level1_complete & mark cutscene seen
    state.setFlag('level1_complete', true);
    SaveManager.markCutsceneSeen();

    // Compute time bonus & grant once
    const computedBonus = Math.max(
      0,
      1500 - Math.floor((state.playSeconds || 0) / 2)
    );
    let shownTimeBonus = computedBonus;
    if (!state.flags.timeBonusGiven) {
      state.score = Math.max(0, (state.score || 0) + computedBonus);
      state.flags.timeBonusGiven = true;
      state.flags.savedTimeBonus = computedBonus;
      state.save();
    } else if (Number.isFinite(Number(state.flags.savedTimeBonus))) {
      shownTimeBonus = Number(state.flags.savedTimeBonus);
    }
    const finalTotalScore = state.score || 0;

    // Grant rewards once
    if (!state.flags.rewardsGiven) {
      state.rewards.researchPoints = (state.rewards.researchPoints || 0) + 250;
      state.rewards.exp = (state.rewards.exp || 0) + 500;
      state.flags.rewardsGiven = true;
      state.save();
      inventory.add('spare_parts_kit', 3);
    }

    // Stop previous music/loops and play Level Complete sting & fanfare
    audio.stopAll();
    audio.play('MUS_Level_Complete_Sting', { gain: 0.8 });
    audio.play('SFX_Level_Complete');
    this.time.delayedCall(200, () => {
      audio.play('SFX_Victory_Cheer');
    });
    this.time.delayedCall(600, () => {
      audio.play('SFX_NOVA_Excited');
    });

    // Background
    this.add.rectangle(0, 0, 1280, 720, 0x050918, 1).setOrigin(0, 0);
    this.add
      .image(0, 0, 'lc_bg')
      .setOrigin(0, 0)
      .setDisplaySize(1280, 715);

    // Title & Subtitle aligned to painted banner (y = 65..121 -> 93) & bar (y = 121..157 -> 139)
    const title = this.add
      .text(640, 93, 'LEVEL COMPLETE', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '44px',
        color: '#ffffff',
        letterSpacing: 3,
      })
      .setOrigin(0.5, 0.5);
    title.setShadow(0, 0, '#2ad4ff', 14, true, true);

    this.add
      .text(640, 139, 'LEVEL 01 - FIRST LANDING', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0.5);

    // SCORE label (tab center 528, 183) & counting score value (box center 526, 240)
    this.add
      .text(528, 183, 'SCORE', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '23px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0.5);

    this.scoreText = this.add
      .text(526, 240, '0', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '64px',
        color: '#ffc928',
      })
      .setOrigin(0.5, 0.5);
    this.scoreText.setShadow(0, 4, '#8a4f0a', 0, false, true);

    this._startScoreCountUp(finalTotalScore);

    // Breakdown rows centered inside right score box (x = 720..1025, y = 167..280, center y = 223.5)
    const breakdownGfx = this.add.graphics();
    const parts = state.scoreParts || {};
    const breakdownRows = [
      {
        kind: 'cube',
        label: 'Objectives',
        val: `+${(parts.objectives || 0) + (parts.discovery || 0)}`,
        y: 186,
      },
      {
        kind: 'rock',
        label: 'Resources',
        val: `+${parts.samples || 0}`,
        y: 211,
      },
      {
        kind: 'flask',
        label: 'Research',
        val: `+${(parts.research || 0) + (parts.craft || 0)}`,
        y: 236,
      },
      {
        kind: 'clock',
        label: `Time Bonus (${formatDuration(state.playSeconds)})`,
        val: `+${shownTimeBonus}`,
        y: 261,
      },
    ];

    for (const row of breakdownRows) {
      this._drawBreakdownIcon(breakdownGfx, row.kind, 736, row.y - 10);
      this.add
        .text(760, row.y, row.label, {
          fontFamily: UI.font,
          fontStyle: '600',
          fontSize: '16px',
          color: '#eaf6ff',
        })
        .setOrigin(0, 0.5);

      this.add
        .text(1008, row.y, row.val, {
          fontFamily: UI.font,
          fontStyle: '600',
          fontSize: '16px',
          color: '#ffd23f',
        })
        .setOrigin(1, 0.5);
    }

    // Completed objectives rows centered inside left box (x = 334..688, open y = 325..457)
    const checksGfx = this.add.graphics();
    const completedLabels = [
      'Establish Communication',
      'Explore the Lunar Outpost',
      'Inspect Base Systems',
      'Collect Required Resources',
      'Research & Build Material Processor',
    ];
    const objYs = [345, 368, 391, 414, 437];

    completedLabels.forEach((lbl, idx) => {
      const ry = objYs[idx];
      const bx = 350;
      const by = ry - 8;

      checksGfx.fillStyle(0x07310f, 1);
      checksGfx.fillRoundedRect(bx, by, 16, 16, 3);
      checksGfx.lineStyle(2, 0x4cff6b, 1);
      checksGfx.strokeRoundedRect(bx, by, 16, 16, 3);

      checksGfx.lineStyle(2, 0xd8ffe0, 1);
      checksGfx.beginPath();
      checksGfx.moveTo(bx + 3, by + 8);
      checksGfx.lineTo(bx + 7, by + 12);
      checksGfx.lineTo(bx + 13, by + 4);
      checksGfx.strokePath();

      this.add
        .text(376, ry, lbl, {
          fontFamily: UI.font,
          fontStyle: '600',
          fontSize: idx === 4 ? '15px' : '16px',
          color: '#eaf6ff',
        })
        .setOrigin(0, 0.5);
    });

    // Resources collected rows centered inside right box (x = 704..1025, open y = 325..457)
    const resBoxGfx = this.add.graphics();
    const resRows = [
      { y: 351, icon: 'icon_regolith', name: 'Lunar Regolith' },
      { y: 391, icon: 'icon_ironrock', name: 'Iron-bearing Rock' },
      { y: 431, icon: 'icon_silicate', name: 'Silicate Rock' },
    ];

    for (const r of resRows) {
      resBoxGfx.fillStyle(0x050e28, 0.8);
      resBoxGfx.fillRoundedRect(718, r.y - 17, 293, 34, 6);
      resBoxGfx.lineStyle(1, 0x1b4a8c, 1);
      resBoxGfx.strokeRoundedRect(718, r.y - 17, 293, 34, 6);

      this.add
        .image(740, r.y, r.icon)
        .setOrigin(0.5, 0.5)
        .setDisplaySize(32, 24);

      this.add
        .text(764, r.y, r.name, {
          fontFamily: UI.font,
          fontStyle: '600',
          fontSize: '16px',
          color: '#eaf6ff',
        })
        .setOrigin(0, 0.5);

      this.add
        .text(1001, r.y, '5/5', {
          fontFamily: UI.font,
          fontStyle: '700',
          fontSize: '16px',
          color: '#4cff6b',
        })
        .setOrigin(1, 0.5);
    }

    // REWARDS title (tab center 654, 482) & 5 symmetrically spaced reward columns
    this.add
      .text(654, 482, 'REWARDS', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '20px',
        color: '#ffd23f',
      })
      .setOrigin(0.5, 0.5);

    this._buildRewardsRow();

    // Bottom buttons: RETURN TO BASE (316, 617, 316, 68) & NEXT LEVEL (667, 617, 303, 68)
    this._buildBottomButtons();

    this.cameras.main.fadeIn(400, 0, 0, 0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      audio.stopVoicesAndSfx(150);
    });
    this._exposeTestHooks();
  }

  _startScoreCountUp(targetScore) {
    if (targetScore <= 0) {
      this.scoreText.setText('0');
      audio.play('SFX_Score_Total');
      return;
    }

    const durationMs = 1800;
    const startedAt = performance.now();
    let lastTickAt = 0;

    const timer = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        const now = performance.now();
        const elapsed = now - startedAt;
        const t = Math.max(0, Math.min(1, elapsed / durationMs));
        const current = Math.round(targetScore * t);
        this.scoreText.setText(String(current));

        if (now - lastTickAt >= 50 && t < 1) {
          lastTickAt = now;
          audio.play('SFX_Score_Tick');
        }

        if (t >= 1) {
          timer.remove(false);
          this.scoreText.setText(String(targetScore));
          audio.play('SFX_Score_Total');
        }
      },
    });
  }

  _drawBreakdownIcon(gfx, kind, x, y) {
    if (kind === 'cube') {
      gfx.fillStyle(0x4fd2ff, 1);
      gfx.fillRect(x + 3, y + 3, 14, 14);
      gfx.lineStyle(2, 0xb8f0ff, 1);
      gfx.strokeRect(x + 3, y + 3, 14, 14);
    } else if (kind === 'rock') {
      gfx.fillStyle(0xd98a4e, 1);
      gfx.beginPath();
      gfx.moveTo(x + 3, y + 15);
      gfx.lineTo(x + 6, y + 5);
      gfx.lineTo(x + 14, y + 4);
      gfx.lineTo(x + 18, y + 12);
      gfx.lineTo(x + 15, y + 17);
      gfx.closePath();
      gfx.fillPath();
    } else if (kind === 'flask') {
      gfx.fillStyle(0x4cff9f, 1);
      gfx.fillRect(x + 8, y + 2, 4, 5);
      gfx.beginPath();
      gfx.moveTo(x + 8, y + 7);
      gfx.lineTo(x + 3, y + 17);
      gfx.lineTo(x + 17, y + 17);
      gfx.lineTo(x + 12, y + 7);
      gfx.closePath();
      gfx.fillPath();
    } else if (kind === 'clock') {
      gfx.lineStyle(2, 0xffd23f, 1);
      gfx.strokeCircle(x + 10, y + 10, 8);
      gfx.beginPath();
      gfx.moveTo(x + 10, y + 10);
      gfx.lineTo(x + 10, y + 5);
      gfx.moveTo(x + 10, y + 10);
      gfx.lineTo(x + 14, y + 10);
      gfx.strokePath();
    }
  }

  _buildRewardsRow() {
    const gfx = this.add.graphics();
    // Gold box spans x = 315..1024 (center 670), open body y = 499..598
    const cols = [395, 532, 670, 807, 945];
    const iconY = 526;
    const line1Y = 552;
    const line2Y = 570;

    // 1. Material Processor
    this.add.image(cols[0], iconY, 'tree_res_gear').setDisplaySize(54, 42);
    this.add
      .text(cols[0], line1Y, 'Material Processor', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '14px',
        color: '#eaf6ff',
      })
      .setOrigin(0.5, 0);
    this.add
      .text(cols[0], line2Y, '(Unlocked)', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '13px',
        color: '#4cff6b',
      })
      .setOrigin(0.5, 0);

    // 2. Basic Processing
    this.add.image(cols[1], iconY, 'tree_n_factory').setDisplaySize(42, 42);
    this.add
      .text(cols[1], line1Y, 'Basic Processing', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '14px',
        color: '#eaf6ff',
      })
      .setOrigin(0.5, 0);
    this.add
      .text(cols[1], line2Y, '(Research)', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '13px',
        color: '#4cff6b',
      })
      .setOrigin(0.5, 0);

    // 3. Cyan hexagon icon +250 Research Points
    const hexPts = [];
    for (let i = 0; i < 6; i += 1) {
      const a = Phaser.Math.DegToRad(-90 + i * 60);
      hexPts.push({
        x: cols[2] + Math.cos(a) * 19,
        y: iconY + Math.sin(a) * 19,
      });
    }
    gfx.fillStyle(0x0b4f7c, 1);
    gfx.beginPath();
    gfx.moveTo(hexPts[0].x, hexPts[0].y);
    for (let i = 1; i < 6; i += 1) gfx.lineTo(hexPts[i].x, hexPts[i].y);
    gfx.closePath();
    gfx.fillPath();
    gfx.lineStyle(2.5, 0x3fd2ff, 1);
    gfx.strokePath();
    gfx.fillStyle(0x7be8ff, 0.9);
    gfx.fillCircle(cols[2], iconY, 6.5);

    this.add
      .text(cols[2], line1Y - 1, '+250', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '16px',
        color: '#eaf6ff',
      })
      .setOrigin(0.5, 0);
    this.add
      .text(cols[2], line2Y, 'Research Points', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '13px',
        color: '#eaf6ff',
      })
      .setOrigin(0.5, 0);

    // 4. Gray gear icon +3 Spare Parts
    gfx.fillStyle(0x9aa9c4, 1);
    for (let i = 0; i < 8; i += 1) {
      const a = (Math.PI * 2 * i) / 8;
      gfx.fillCircle(
        cols[3] + Math.cos(a) * 15,
        iconY + Math.sin(a) * 15,
        4.5
      );
    }
    gfx.fillCircle(cols[3], iconY, 14);
    gfx.lineStyle(2, 0xd8e2f5, 1);
    gfx.strokeCircle(cols[3], iconY, 14);
    gfx.fillStyle(0x0a1535, 1);
    gfx.fillCircle(cols[3], iconY, 5.5);

    this.add
      .text(cols[3], line1Y - 1, '+3', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '16px',
        color: '#eaf6ff',
      })
      .setOrigin(0.5, 0);
    this.add
      .text(cols[3], line2Y, 'Spare Parts', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '13px',
        color: '#eaf6ff',
      })
      .setOrigin(0.5, 0);

    // 5. Blue shield icon with XP +500 EXP
    const sx = cols[4];
    gfx.fillStyle(0x1858b8, 1);
    gfx.beginPath();
    gfx.moveTo(sx, iconY - 19);
    gfx.lineTo(sx + 18, iconY - 12);
    gfx.lineTo(sx + 15, iconY + 7);
    gfx.lineTo(sx, iconY + 19);
    gfx.lineTo(sx - 15, iconY + 7);
    gfx.lineTo(sx - 18, iconY - 12);
    gfx.closePath();
    gfx.fillPath();
    gfx.lineStyle(2.5, 0x6ecbff, 1);
    gfx.strokePath();

    this.add
      .text(sx, iconY - 1, 'XP', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0.5);
    this.add
      .text(sx, line1Y - 1, '+500', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '16px',
        color: '#eaf6ff',
      })
      .setOrigin(0.5, 0);
    this.add
      .text(sx, line2Y, 'EXP', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '13px',
        color: '#eaf6ff',
      })
      .setOrigin(0.5, 0);
  }

  _buildBottomButtons() {
    // RETURN TO BASE: painted blue button spans x = 315..633 (center 474), y = 620..688 (center 654)
    const retCenterY = 654;
    const retContainer = this.add.container(474, retCenterY);
    const retLabel = this.add
      .text(0, 0, 'RETURN TO BASE', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '23px',
        color: '#ffffff',
      })
      .setOrigin(0, 0.5);
    retLabel.setShadow(0, 3, '#0b254a', 0, false, true);

    const retIconW = 28;
    const retGap = 10;
    const retTotalW = retIconW + retGap + retLabel.width;
    const retStartX = -Math.round(retTotalW / 2);
    retLabel.x = retStartX + retIconW + retGap;

    const retIcon = this.add.graphics();
    const hx = retStartX;
    const hy = -13;
    retIcon.fillStyle(0xffffff, 1);
    retIcon.beginPath();
    retIcon.moveTo(hx + 14, hy + 1);
    retIcon.lineTo(hx + 27, hy + 12);
    retIcon.lineTo(hx + 23, hy + 12);
    retIcon.lineTo(hx + 23, hy + 25);
    retIcon.lineTo(hx + 16.5, hy + 25);
    retIcon.lineTo(hx + 16.5, hy + 17);
    retIcon.lineTo(hx + 11.5, hy + 17);
    retIcon.lineTo(hx + 11.5, hy + 25);
    retIcon.lineTo(hx + 5, hy + 25);
    retIcon.lineTo(hx + 5, hy + 12);
    retIcon.lineTo(hx + 1, hy + 12);
    retIcon.closePath();
    retIcon.fillPath();
    retContainer.add([retIcon, retLabel]);

    const retHit = this.add
      .rectangle(315, 620, 318, 68, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    retHit.on('pointerover', () => {
      retContainer.y = retCenterY - 2;
      audio.play('SFX_Button_Hover');
    });
    retHit.on('pointerout', () => {
      retContainer.y = retCenterY;
    });
    retHit.on('pointerdown', () => {
      if (this._transitioning) return;
      this._transitioning = true;
      audio.play('SFX_Button_Click');
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start('LevelScene', { mission: 1, from: 'interior' });
        }
      );
    });

    // NEXT LEVEL: painted orange button spans x = 668..967 (center 818), y = 620..688 (center 654)
    const nextCenterY = 654;
    const nextContainer = this.add.container(818, nextCenterY);
    const nextLabel = this.add
      .text(0, 0, 'NEXT LEVEL', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0, 0.5);
    nextLabel.setShadow(0, 3, '#7a3a05', 0, false, true);

    const nextIconW = 28;
    const nextGap = 10;
    const nextTotalW = nextIconW + nextGap + nextLabel.width;
    const nextStartX = -Math.round(nextTotalW / 2);
    nextLabel.x = nextStartX + nextIconW + nextGap;

    const nextIcon = this.add.graphics();
    const cx = nextStartX;
    const cy = -12;
    nextIcon.lineStyle(4.5, 0xffffff, 1);
    nextIcon.beginPath();
    nextIcon.moveTo(cx + 2, cy + 2);
    nextIcon.lineTo(cx + 13, cy + 12);
    nextIcon.lineTo(cx + 2, cy + 22);
    nextIcon.moveTo(cx + 15, cy + 2);
    nextIcon.lineTo(cx + 26, cy + 12);
    nextIcon.lineTo(cx + 15, cy + 22);
    nextIcon.strokePath();
    nextContainer.add([nextIcon, nextLabel]);

    const nextHit = this.add
      .rectangle(668, 620, 300, 68, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    nextHit.on('pointerover', () => {
      nextContainer.y = nextCenterY - 2;
      audio.play('SFX_Button_Hover');
    });
    nextHit.on('pointerout', () => {
      nextContainer.y = nextCenterY;
    });
    nextHit.on('pointerdown', () => {
      if (this._transitioning) return;
      this._transitioning = true;
      audio.play('SFX_Button_Click');
      SaveManager.completeMission(1);
      this.cameras.main.fadeOut(300, 6, 9, 32);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start('MissionsScene');
        }
      );
    });
  }

  _exposeTestHooks() {
    if (typeof window === 'undefined') return;
    window.__astro = {
      ...(window.__astro || {}),
      scene: this,
      player: null,
      dialogue: null,
      audio,
      state,
      bus,
      inventory,
      tech: state.tech,
      objectives: OBJECTIVES,
      regions: REGIONS,
      caves: CAVES,
      go: (sceneKey, data) => {
        this.scene.start(sceneKey, data);
      },
      enterCave: (id) => {
        const target = id === 'crystal_cave' ? 'crystal_cave' : 'iron_cave';
        this.scene.start('CaveScene', { cave: target });
      },
      openMap: () => false,
      toggleObjectives: () => false,
      completeLevel: () => {
        this.scene.start('LevelCompleteScene');
      },
    };
  }
}

export default LevelCompleteScene;
