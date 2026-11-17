import Phaser from 'phaser';
import { CAVES, REGIONS, depthOf } from '../core/constants.js';
import { actions } from '../core/actions.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { inventory } from '../core/inventory.js';
import { state } from '../core/state.js';
import { ITEM_ICON_ENTRIES, SAMPLE_TYPES } from '../data/items.js';
import { TECH_TREE_ASSET_ENTRIES } from '../data/tech.js';
import { OBJECTIVES } from '../data/objectives.js';
import { Player, ensurePlayerAnimations } from '../entities/Player.js';
import { Nova } from '../entities/Nova.js';
import { Rock } from '../entities/Rock.js';
import { Interactions } from '../systems/Interactions.js';
import { showRegionToast } from '../systems/Regions.js';
import { Tools } from '../systems/Tools.js';
import { Mining } from '../systems/Mining.js';
import {
  Dialogue,
  GAMEPLAY_DIALOGUE_AUDIO_IDS,
} from '../systems/Dialogue.js';
import { ensureLightTextures, registerUi } from '../ui/theme.js';
import { ObjectivePanel } from '../ui/ObjectivePanel.js';
import { ScorePanel } from '../ui/ScorePanel.js';
import { InfoCard } from '../ui/InfoCard.js';
import { BottomHud } from '../ui/BottomHud.js';
import { BackpackPanel } from '../ui/BackpackPanel.js';
import { Minimap } from '../ui/Minimap.js';
import { MapPanel } from '../ui/MapPanel.js';

const CAVE_W = 2560;
const CAVE_H = 1440;
const CAVE_BOUNDS = { x1: 240, y1: 420, x2: 2320, y2: 1330 };

const IRON_CAVE_ROCKS = [
  [600, 700],
  [900, 1100],
  [1200, 640],
  [1500, 1000],
  [1750, 720],
  [2000, 1150],
  [2200, 820],
  [1000, 860],
];

const IRON_CAVE_DECOR = [
  [1400, 540],
  [400, 1100],
];

const CRYSTAL_CAVE_ROCKS = [
  [540, 820],
  [860, 640],
  [1100, 1150],
  [1420, 760],
  [1680, 1180],
  [1900, 700],
  [2150, 1000],
  [1300, 980],
];

const CRYSTAL_CAVE_DECOR = [
  [700, 540],
  [1560, 560],
  [660, 1180],
  [2080, 620],
];

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAVE_AUDIO_IDS = [
  'SFX_Button_Click',
  'SFX_Error',
  'SFX_Notification',
  'SFX_Footstep_Regolith_01',
  'SFX_Footstep_Regolith_02',
  'SFX_Footstep_Regolith_03',
  'SFX_Radio_Open',
  'SFX_Radio_Beep',
  'SFX_Radio_Close',
  'SFX_Radio_Static',
  'SFX_Objective_Updated',
  'SFX_Objective_Complete',
  'SFX_Score_Tick',
  'SFX_Interaction_Prompt',
  'SFX_Interact',
  'SFX_Menu_Open',
  'SFX_Menu_Close',
  'SFX_Airlock_Unlock',
  'SFX_Airlock_Open',
  'SFX_Airlock_Close',
  'SFX_NOVA_Idle_Hum',
  'SFX_NOVA_Happy_Beep',
  'SFX_NOVA_Alert',
  'SFX_Inventory_Full',
  'SFX_Resource_Pickup',
  'SFX_Battery_Connect',
  'SFX_Tab_Switch',
  'SFX_Flashlight_On',
  'SFX_Flashlight_Off',
  'SFX_Flashlight_Low_Battery',
  'SFX_Pickaxe_Swing',
  'SFX_Tool_Break',
  'SFX_Impact_Regolith',
  'SFX_Impact_IronBearing_Rock',
  'SFX_Impact_Silicate_Rock',
  'SFX_Rock_Crack',
  'SFX_Rock_Break',
  'SFX_Debris_Fall',
  'SFX_Tool_Durability_Low',
  'SFX_Crafting_Complete',
  'SFX_Item_Select',
  'SFX_Not_Enough_Resources',
  'AMB_Shadowed_Area',
  'MUS_Lunar_Exploration',
  ...GAMEPLAY_DIALOGUE_AUDIO_IDS,
];

export class CaveScene extends Phaser.Scene {
  constructor() {
    super('CaveScene');
  }

  init(data) {
    const requested = data && data.cave;
    this.caveId =
      requested === 'crystal_cave' ? 'crystal_cave' : 'iron_cave';
    this.caveDef =
      CAVES.find((c) => c.id === this.caveId) || CAVES[0];
  }

  preload() {
    const images = [
      ['cave_entrance', 'assets/level01/world/cave_entrance.png'],
      ['cave_wall', 'assets/level01/world/cave_wall.png'],
      ['cave_floor', 'assets/level01/world/cave_floor.png'],
      ['decal_pebbles', 'assets/level01/world/decal_pebbles.png'],
      ['decal_dust_dark', 'assets/level01/world/decal_dust_dark.png'],
      ['map_fog', 'assets/ui/map/lunar_map_fog_of_war.webp'],
      ['map_full', 'assets/ui/map/lunar_map_discovered.webp'],
      ['dlg_karim', 'assets/level01/interior/dr_karim.webp'],
      ['dlg_nova', 'assets/level01/interior/nova_portrait.png'],
      ['dlg_astro', 'assets/ui/avatar_face.png'],
      ['avatar_frame', 'assets/ui/avatar_face.png'],
      ['backpack_closed_icon', 'assets/ui/backpack_closed_icon.png'],
      ...ITEM_ICON_ENTRIES,
      ...TECH_TREE_ASSET_ENTRIES,
    ];

    for (const [key, url] of images) {
      if (!this.textures.exists(key)) {
        this.load.image(key, url);
      }
    }

    const sheets = [
      ['astro_idle', 'assets/sprites/astro_idle.png', 125, 169],
      ['astro_walk', 'assets/sprites/astro_walk.png', 125, 169],
      ['astro_down', 'assets/sprites/astro_down.png', 125, 169],
      ['astro_up', 'assets/sprites/astro_up.png', 125, 169],
      ['astro_interact', 'assets/sprites/astro_interact.png', 125, 169],
      ['nova', 'assets/level01/victory/nova_victory.png', 96, 126],
      ['rock_regolith', 'assets/level01/world/rock_regolith.png', 91, 79],
      ['rock_ironrich', 'assets/level01/world/rock_ironrich.png', 91, 82],
      ['rock_silicate', 'assets/level01/world/rock_silicate.png', 91, 82],
      ['rock_ore_extra', 'assets/level01/world/rock_ore_extra.png', 96, 82],
    ];

    for (const [key, url, frameWidth, frameHeight] of sheets) {
      if (!this.textures.exists(key)) {
        this.load.spritesheet(key, url, { frameWidth, frameHeight });
      }
    }

    audio.preload(this, CAVE_AUDIO_IDS);
  }

  create() {
    this.leaving = false;
    this.goingToSurface = false;
    this._obj06cScheduled = false;
    this.rocks = [];
    this.decorGlowPoints = [];

    const linearKeys = [
      'cave_entrance',
      'cave_wall',
      'map_fog',
      'map_full',
      'dlg_karim',
      'dlg_nova',
      'dlg_astro',
      'avatar_frame',
      'backpack_closed_icon',
      ...ITEM_ICON_ENTRIES.map(([k]) => k),
      ...TECH_TREE_ASSET_ENTRIES.map(([k]) => k),
    ];
    for (const texKey of linearKeys) {
      if (this.textures.exists(texKey)) {
        this.textures
          .get(texKey)
          .setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }

    ensureLightTextures(this);
    ensurePlayerAnimations(this);
    actions.init(this);

    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      actions.init(this);
      actions.resetMovementKeys();
      this._exposeTestHooks();
    });

    // World & camera bounds (2560 x 1440)
    this.physics.world.setBounds(0, 0, CAVE_W, CAVE_H);
    this.cameras.main.setBounds(0, 0, CAVE_W, CAVE_H);

    // Layer depth -10: tiled cave floor tinted 0x7f8aa8
    this.add
      .tileSprite(0, 0, CAVE_W, CAVE_H, 'cave_floor')
      .setOrigin(0, 0)
      .setTint(0x7f8aa8)
      .setDepth(-10);

    // Layer depth -5: dust decals inside player bounds via mulberry32(777)
    const rnd = mulberry32(777);
    const playW = CAVE_BOUNDS.x2 - CAVE_BOUNDS.x1;
    const playH = CAVE_BOUNDS.y2 - CAVE_BOUNDS.y1;

    for (let i = 0; i < 18; i += 1) {
      const x = CAVE_BOUNDS.x1 + rnd() * playW;
      const y = CAVE_BOUNDS.y1 + rnd() * playH;
      this.add
        .image(x, y, 'decal_dust_dark')
        .setOrigin(0.5, 0.5)
        .setScale(0.3)
        .setAlpha(0.5)
        .setFlipX(rnd() < 0.5)
        .setDepth(-5);
    }

    for (let i = 0; i < 40; i += 1) {
      const x = CAVE_BOUNDS.x1 + rnd() * playW;
      const y = CAVE_BOUNDS.y1 + rnd() * playH;
      this.add
        .image(x, y, 'decal_pebbles')
        .setOrigin(0.5, 0.5)
        .setScale(0.16)
        .setAlpha(1)
        .setFlipX(rnd() < 0.5)
        .setDepth(-5);
    }

    // Top cave walls: two images side by side at y = 400, x = 700 and x = 1900, display width 1500
    const wallScale = 1500 / 1800;
    this.add
      .image(700, 400, 'cave_wall')
      .setOrigin(0.5, 1)
      .setScale(wallScale)
      .setDepth(depthOf(380));
    this.add
      .image(1900, 400, 'cave_wall')
      .setOrigin(0.5, 1)
      .setScale(wallScale)
      .setDepth(depthOf(380));

    // Left, right, and bottom dark boundary rectangles (kept below depth 90 darkness layer)
    const borderDepth = depthOf(1410);
    this.add
      .rectangle(0, 0, 240, CAVE_H, 0x04060f, 1)
      .setOrigin(0, 0)
      .setDepth(borderDepth);
    this.add
      .rectangle(2320, 0, CAVE_W - 2320, CAVE_H, 0x04060f, 1)
      .setOrigin(0, 0)
      .setDepth(borderDepth);
    this.add
      .rectangle(0, 1380, CAVE_W, CAVE_H - 1380, 0x04060f, 1)
      .setOrigin(0, 0)
      .setDepth(borderDepth);

    // Exit glowing arch: 220 x 40 at (1280, 1360), fill 0x3fd2ff alpha 0.25
    const exitGfx = this.add.graphics().setDepth(depthOf(1360));
    exitGfx.fillStyle(0x3fd2ff, 0.25);
    exitGfx.fillRoundedRect(1280 - 110, 1360 - 20, 220, 40, 12);
    exitGfx.lineStyle(2, 0x3fd2ff, 0.55);
    exitGfx.strokeRoundedRect(1280 - 110, 1360 - 20, 220, 40, 12);

    // Player starts at (1280, 1240) facing up, surface = 'cave'
    this.player = new Player(this, 1280, 1240);
    this.player.surface = 'cave';
    this.player.setBounds(
      CAVE_BOUNDS.x1,
      CAVE_BOUNDS.y1,
      CAVE_BOUNDS.x2,
      CAVE_BOUNDS.y2
    );
    this.player.setFacing('up');

    // 6 big side boulders (rock_regolith frame 0, scale 2.2, origin (0.5, 1), tint 0x556070)
    const boulderXs = [300, 2260];
    const boulderYs = [700, 1000, 1300];
    for (const bx of boulderXs) {
      for (const by of boulderYs) {
        this.add
          .image(bx, by, 'rock_regolith', 0)
          .setOrigin(0.5, 1)
          .setScale(2.2)
          .setTint(0x556070)
          .setDepth(depthOf(by));

        const bCol = this.add
          .rectangle(bx, by - 16, 96, 32)
          .setVisible(false);
        this.physics.add.existing(bCol, true);
        this.physics.add.collider(this.player, bCol);
      }
    }

    // Cave deposits (8 mineable rocks + decorative formations)
    const isCrystal = this.caveId === 'crystal_cave';
    const rockType = isCrystal ? 'silicate' : 'ironrich';
    const positions = isCrystal ? CRYSTAL_CAVE_ROCKS : IRON_CAVE_ROCKS;

    positions.forEach(([rx, ry], idx) => {
      const sprite = this.add
        .image(rx, ry, `rock_${rockType}`, idx % 4)
        .setOrigin(0.5, 1)
        .setScale(1.3)
        .setDepth(depthOf(ry));

      const collider = this.add
        .rectangle(rx, ry - 11, 56, 22)
        .setVisible(false);
      this.physics.add.existing(collider, true);
      const playerCollider = this.physics.add.collider(this.player, collider);

      const rock = new Rock(this, {
        index: idx,
        hitKey: `${this.caveId}_${idx}`,
        type: rockType,
        x: rx,
        y: ry,
        sprite,
        collider,
        playerCollider,
      });
      this.rocks.push(rock);
    });

    if (isCrystal) {
      CRYSTAL_CAVE_DECOR.forEach(([cx, cy], idx) => {
        const g = this.add.graphics().setDepth(depthOf(cy));
        g.fillStyle(0x3fd2ff, 0.35);
        g.fillCircle(cx, cy - 22, 26);
        g.fillStyle(0x88f7ff, 0.9);
        g.beginPath();
        g.moveTo(cx - 14, cy);
        g.lineTo(cx - 6, cy - 38);
        g.lineTo(cx + 2, cy);
        g.closePath();
        g.fillPath();
        g.fillStyle(0x3fd2ff, 0.95);
        g.beginPath();
        g.moveTo(cx - 2, cy);
        g.lineTo(cx + 8, cy - 46 - (idx % 2) * 8);
        g.lineTo(cx + 18, cy);
        g.closePath();
        g.fillPath();
        this.decorGlowPoints.push({ x: cx, y: cy - 22, diameter: 120, alpha: 0.5 });
      });
    } else {
      IRON_CAVE_DECOR.forEach(([ox, oy], idx) => {
        this.add
          .image(ox, oy, 'rock_ore_extra', idx % 2)
          .setOrigin(0.5, 1)
          .setScale(1.3)
          .setDepth(depthOf(oy));
        this.decorGlowPoints.push({ x: ox, y: oy - 36, diameter: 90, alpha: 0.35 });
      });
    }

    // NOVA companion
    this.nova = new Nova(this, this.player);

    // Camera follow (Section 1.3: lerp 0.12, no deadzone, integer scroll rounding)
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this._onPostUpdate = () => {
      if (this.cameras && this.cameras.main) {
        this.cameras.main.scrollX = Math.round(this.cameras.main.scrollX);
        this.cameras.main.scrollY = Math.round(this.cameras.main.scrollY);
      }
      this._renderDarkness(this.time ? this.time.now : 0);
    };

    this._onFollowUpdate = () => {
      if (this.cameras && this.cameras.main) {
        this.cameras.main.scrollX = Math.round(this.cameras.main.scrollX);
        this.cameras.main.scrollY = Math.round(this.cameras.main.scrollY);
      }
      this._renderDarkness(this.time ? this.time.now : 0);
    };

    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this._onPostUpdate);
    this.cameras.main.on(
      Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE,
      this._onFollowUpdate
    );

    // Darkness RenderTexture (depth 90, scrollFactor 0, ignored by minimap camera)
    this.darkness = this.add
      .renderTexture(0, 0, 1280, 720)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(90);
    registerUi(this, this.darkness);

    this._radialBrush = this.make.image({ key: 'light_radial', add: false });
    this._coneBrush = this.make.image({ key: 'light_cone', add: false });

    // HUD, Tools, Mining, Interactions, Dialogue, MapPanel & Minimap
    this.objectivePanel = new ObjectivePanel(this);
    this.scorePanel = new ScorePanel(this);
    this.backpackPanel = new BackpackPanel(this);
    this.mapPanel = new MapPanel(this, { caveId: this.caveId });
    this.bottomHud = new BottomHud(this);
    this.tools = new Tools(this, this.player);
    this.mining = new Mining(this, this.player, this.rocks);
    this.interactions = new Interactions(this, this.player);
    this.dialogue = new Dialogue(this);
    this.minimap = new Minimap(this, this.player, {
      worldW: CAVE_W,
      worldH: CAVE_H,
      isCave: true,
      exitPos: { x: 1280, y: 1360 },
    });

    // Objective 06 completion dialogue listener if final sample is mined inside cave
    const onObjectiveComplete = (completedIndex) => {
      if (completedIndex === 5 && !state.flags.talked_obj06c) {
        this._scheduleObj06Complete(700);
      }
    };
    bus.on('objective:complete', onObjectiveComplete);

    state.emitSceneStart();

    // Exit interactable at (1280, 1300), range 120, label 'Leave Cave'
    this.interactions.add({
      id: 'cave_exit',
      x: 1280,
      y: 1300,
      range: 120,
      label: 'Leave Cave',
      onInteract: () => {
        if (this.leaving) return;
        this.leaving = true;
        this.goingToSurface = true;
        if (this.player) {
          this.player.stopMotion();
        }
        audio.play('SFX_Airlock_Open', { gain: 0.5 });
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once(
          Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
          () => {
            this.scene.start('LevelScene', {
              mission: 1,
              from: 'cave',
              cave: this.caveId,
            });
          }
        );
      },
    });

    // Audio: keep MUS_Lunar_Exploration ducked at 0.4, stop AMB_Lunar_Surface, loop AMB_Shadowed_Area at 0.6
    audio.stop('AMB_Lunar_Surface', 200);
    audio.music('MUS_Lunar_Exploration');
    audio.duck(0.4, 250);
    audio.loop('AMB_Shadowed_Area', { gain: 0.6 });

    this.cameras.main.fadeIn(500, 0, 0, 0);

    // Region discovery toast (+25 score first time, flag discovered_<cave id>)
    const discFlag = `discovered_${this.caveId}`;
    const isFirst = !state.flags[discFlag];
    if (isFirst) {
      state.setFlag(discFlag, true);
      state.addScore(25, 'discovery');
    }
    this._toastHandle = showRegionToast(this, this.caveDef.name, isFirst);

    // Flashlight hint when entering dark cave with flashlight off
    this.time.delayedCall(650, () => {
      if (this.leaving) return;
      if (!state.flashlight.on && !state.flags.hint_cave_dark && this.nova) {
        state.setFlag('hint_cave_dark', true);
        this.nova.say(
          'It is very dark here. Press F to turn on your flashlight.',
          4000
        );
      }
    });

    // ESC returns to MissionsScene unless a modal or dialogue is open
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.leaving) return;
      if (
        this.scene.isActive('TechTreeScene') ||
        (this.backpackPanel && this.backpackPanel.isOpen) ||
        (this.mapPanel && this.mapPanel.isOpen) ||
        (this.dialogue && this.dialogue.isPlaying) ||
        InfoCard.isOpen(this) ||
        performance.now() - (this._escConsumedAt || 0) < 80
      ) {
        return;
      }
      this.leaving = true;
      this.goingToSurface = false;
      if (this.player) {
        this.player.stopMotion();
      }
      this.cameras.main.fadeOut(200, 6, 9, 32);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start('MissionsScene');
        }
      );
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off('objective:complete', onObjectiveComplete);
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this._onPostUpdate);
      if (this.cameras && this.cameras.main) {
        this.cameras.main.off(
          Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE,
          this._onFollowUpdate
        );
      }
      if (this._radialBrush) {
        this._radialBrush.destroy();
        this._radialBrush = null;
      }
      if (this._coneBrush) {
        this._coneBrush.destroy();
        this._coneBrush = null;
      }
      state.save();
      if (this.goingToSurface) {
        audio.stop('AMB_Shadowed_Area', 200);
        audio.stop('SFX_NOVA_Idle_Hum', 120);
        audio.unduck(300);
      } else {
        audio.stopAll();
      }
    });

    this._renderDarkness(0);
    this._exposeTestHooks();
  }

  _scheduleObj06Complete(delayMs) {
    if (this._obj06cScheduled || state.flags.talked_obj06c) return;
    this._obj06cScheduled = true;
    this.time.delayedCall(delayMs, () => {
      this._playObj06CompleteWhenReady();
    });
  }

  _playObj06CompleteWhenReady() {
    if (this.leaving || state.flags.talked_obj06c) return;
    if (
      (this.mining && this.mining.swinging) ||
      InfoCard.isOpen(this) ||
      (this.backpackPanel && this.backpackPanel.isOpen) ||
      (this.mapPanel && this.mapPanel.isOpen) ||
      (this.dialogue && this.dialogue.isPlaying)
    ) {
      this.time.delayedCall(250, () => this._playObj06CompleteWhenReady());
      return;
    }
    state.setFlag('talked_obj06c', true);
    this.dialogue.play(
      [
        'obj06_complete_nova',
        'obj06_complete_astronaut',
        'obj06_complete_nova2',
      ],
      { player: this.player }
    );
  }

  _facingAngleRad() {
    if (!this.player) return 0;
    switch (this.player.facing) {
      case 'down':
        return Math.PI / 2;
      case 'left':
        return Math.PI;
      case 'up':
        return (3 * Math.PI) / 2;
      case 'right':
      default:
        return 0;
    }
  }

  _eraseRadial(sx, sy, diameter, alpha) {
    if (!this.darkness || !this._radialBrush) return;
    this._radialBrush
      .setOrigin(0.5, 0.5)
      .setScale(diameter / 512)
      .setRotation(0)
      .setAlpha(alpha);
    this.darkness.erase(this._radialBrush, sx, sy);
  }

  _renderDarkness(time) {
    if (!this.darkness || !this._radialBrush || !this._coneBrush || !this.player) {
      return;
    }
    const cam = this.cameras.main;
    const sx = (wx) => Math.round(wx - cam.scrollX);
    const sy = (wy) => Math.round(wy - cam.scrollY);

    this.darkness.clear();
    this.darkness.fill(0x02040c, 0.94);

    // Subtle exit arch glow so exit remains recognizable
    this._eraseRadial(sx(1280), sy(1355), 140, 0.32);

    // Deposit glows (crystal 120 px @ 0.5; iron 90 px @ 0.35)
    const isCrystal = this.caveId === 'crystal_cave';
    const rockGlowDiam = isCrystal ? 120 : 90;
    const rockGlowAlpha = isCrystal ? 0.5 : 0.35;

    for (const rock of this.rocks) {
      if (!rock.depleted) {
        this._eraseRadial(
          sx(rock.x),
          sy(rock.y - 38),
          rockGlowDiam,
          rockGlowAlpha
        );
      }
    }

    for (const pt of this.decorGlowPoints) {
      this._eraseRadial(sx(pt.x), sy(pt.y), pt.diameter, pt.alpha);
    }

    // NOVA glow: 110 px @ 0.35
    if (this.nova && this.nova.sprite) {
      this._eraseRadial(
        sx(this.nova.sprite.x),
        sy(this.nova.sprite.y),
        110,
        0.35
      );
    }

    // Always-on tiny player glow: 150 px diameter @ 0.9
    const pScreenX = sx(this.player.x);
    const pChestY = sy(this.player.y - 70);
    this._eraseRadial(pScreenX, pChestY, 150, 0.9);

    // Flashlight cone + 260 px radial when flashlight is ON
    if (state.flashlight.on && state.flashlight.charge > 0) {
      let blink = 1;
      if (state.flashlight.charge <= 25) {
        blink = Math.floor((time || 0) / 300) % 2 === 0 ? 1 : 0.4;
      }

      this._coneBrush
        .setOrigin(0, 0.5)
        .setScale(460 / 512)
        .setRotation(this._facingAngleRad())
        .setAlpha(1.0 * blink);
      this.darkness.erase(this._coneBrush, pScreenX, pChestY);

      this._eraseRadial(pScreenX, pChestY, 260, 0.55 * blink);
    }
  }

  _exposeTestHooks() {
    if (typeof window === 'undefined') return;
    window.__astro = {
      ...(window.__astro || {}),
      scene: this,
      player: this.player,
      dialogue: this.dialogue,
      audio,
      state,
      bus,
      inventory,
      tools: this.tools,
      mining: this.mining,
      objectives: OBJECTIVES,
      regions: REGIONS,
      caves: CAVES,
      rocks: this.rocks,
      teleport: (x, y) => {
        if (this.player) {
          this.player.teleport(x, y);
        }
      },
      go: (sceneKey, data) => {
        this.scene.start(sceneKey, data);
      },
      enterCave: (id) => {
        const target = id === 'crystal_cave' ? 'crystal_cave' : 'iron_cave';
        this.leaving = true;
        this.goingToSurface = true;
        this.scene.start('CaveScene', { cave: target });
      },
      openMap: () => {
        if (this.mapPanel) {
          this.mapPanel.open();
        }
      },
      toggleObjectives: () =>
        this.objectivePanel ? this.objectivePanel.toggle(true) : false,
      playDialogue: (ids) => {
        if (this.dialogue) {
          this.dialogue.play(ids, { player: this.player });
        }
      },
      startCutscene: () => {
        this.scene.start('CutsceneScene');
      },
      inspectAll: () => {
        state.setFlag('inspected_workstation', true);
        state.setFlag('inspected_storage', true);
        state.setFlag('inspected_lifesupport', true);
        state.setFlag('inspected_bed', true);
        state.set('workstation_inspected');
        state.set('storage_inspected');
        state.set('life_support_inspected');
        state.set('sleeping_area_inspected');
      },
      giveItem: (id, n = 1) => inventory.add(id, n),
      setDurability: (n) => {
        const max = Math.max(1, state.pickaxe.max || 30);
        state.pickaxe.durability = Math.max(
          0,
          Math.min(max, Math.floor(Number(n) || 0))
        );
        state.save();
        bus.emit('inventory');
        return state.pickaxe.durability;
      },
      mineNearest: () => (this.mining ? this.mining.mineNearest() : false),
      openBackpack: () => {
        if (
          this.backpackPanel &&
          !(this.mapPanel && this.mapPanel.isOpen) &&
          !(this.dialogue && this.dialogue.isPlaying) &&
          !this.scene.isActive('TechTreeScene')
        ) {
          this.backpackPanel.open();
        }
      },
      openTech: () => {
        if (this.scene.isActive('TechTreeScene')) return;
        if (this.backpackPanel && this.backpackPanel.isOpen) return;
        if (this.mapPanel && this.mapPanel.isOpen) return;
        if (this.dialogue && this.dialogue.isPlaying) return;
        if (this.player && this.player.body) {
          this.player.body.setVelocity(0, 0);
        }
        this.scene.launch('TechTreeScene', { from: 'CaveScene' });
        this.scene.pause('CaveScene');
      },
      deposit: () => {
        let moved = 0;
        for (let i = 0; i < state.bag.length; i += 1) {
          const slot = state.bag[i];
          if (slot && SAMPLE_TYPES.includes(slot.id)) {
            state.storage[slot.id] = (state.storage[slot.id] || 0) + slot.n;
            moved += slot.n;
            state.bag[i] = null;
          }
        }
        if (moved > 0) {
          state.save();
          bus.emit('inventory');
          if (
            state.storage.lunar_regolith_sample >= 5 &&
            state.storage.ilmenite_bearing_basalt_sample >= 5 &&
            state.storage.silicate_rich_rock_sample >= 5
          ) {
            state.set('samples_deposited');
          }
        }
        return moved;
      },
      giveSamples: () => {
        for (const id of SAMPLE_TYPES) {
          inventory.add(id, 5);
        }
      },
      completeLevel: () => {
        this.leaving = true;
        this.goingToSurface = false;
        this.scene.start('LevelCompleteScene');
      },
      get tech() {
        return state.tech;
      },
    };
  }

  update(time, delta) {
    if (
      !this.scene.isActive('TechTreeScene') &&
      !this.scene.isActive('LevelCompleteScene')
    ) {
      const dt = Math.min(Math.max(delta || 0, 0) / 1000, 0.1);
      state.playSeconds = (state.playSeconds || 0) + dt;
    }

    // Map toggle key M
    if (
      !this.leaving &&
      !this.scene.isActive('TechTreeScene') &&
      !InfoCard.isOpen(this) &&
      !(this.backpackPanel && this.backpackPanel.isOpen) &&
      !(this.dialogue && this.dialogue.isPlaying) &&
      actions.justDown('map')
    ) {
      if (this.mapPanel) {
        this.mapPanel.toggle();
      }
    }

    if (!this.leaving && this.player) {
      this.player.update(time, delta);
    }

    if (this.nova) {
      this.nova.update(time, delta);
    }

    if (this.tools) {
      this.tools.update(time, delta);
    }

    if (!this.leaving && this.mining) {
      this.mining.update();
    }

    if (!this.leaving && this.interactions) {
      if (
        (!this.backpackPanel || !this.backpackPanel.isOpen) &&
        (!this.mapPanel || !this.mapPanel.isOpen)
      ) {
        this.interactions.update();
      } else {
        this.interactions.prompt.hide();
      }
    }

    if (this.bottomHud) {
      this.bottomHud.update(time);
    }

    if (this.objectivePanel) {
      this.objectivePanel.update();
    }

    if (this.minimap) {
      this.minimap.update();
    }
  }
}

export default CaveScene;
