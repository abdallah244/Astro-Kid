import Phaser from 'phaser';
import { COLORS, PIXEL } from '../config.js';
import {
  BASE,
  CAVES,
  DOOR,
  PLAYABLE,
  PLAYER_START,
  REGIONS,
  ROCK_NODES,
  WORLD_H,
  WORLD_W,
  depthOf,
} from '../core/constants.js';
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
import { RegionManager } from '../systems/Regions.js';
import { Tools } from '../systems/Tools.js';
import { Mining } from '../systems/Mining.js';
import {
  Dialogue,
  GAMEPLAY_DIALOGUE_AUDIO_IDS,
} from '../systems/Dialogue.js';
import { UI, ensureLightTextures, registerUi } from '../ui/theme.js';
import { ObjectivePanel } from '../ui/ObjectivePanel.js';
import { ScorePanel } from '../ui/ScorePanel.js';
import { InfoCard } from '../ui/InfoCard.js';
import { BottomHud } from '../ui/BottomHud.js';
import { BackpackPanel } from '../ui/BackpackPanel.js';
import { Minimap } from '../ui/Minimap.js';
import { MapPanel } from '../ui/MapPanel.js';

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEVEL_AUDIO_IDS = [
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
  'SFX_Research_Start',
  'SFX_Research_Loop',
  'SFX_Research_Complete',
  'SFX_Crafting_Start',
  'SFX_Crafting_Loop',
  'SFX_Processor_Start',
  'SFX_Processor_Grind_Loop',
  'SFX_Processor_Complete',
  'SFX_Level_Complete',
  'SFX_Victory_Cheer',
  'SFX_NOVA_Excited',
  'SFX_Score_Total',
  'SFX_Button_Hover',
  'MUS_Level_Complete_Sting',
  'AMB_Lunar_Surface',
  'AMB_Shadowed_Area',
  'MUS_Lunar_Exploration',
  'MUS_Main_Menu',
  ...GAMEPLAY_DIALOGUE_AUDIO_IDS,
];

const DECAL_SPECS = [
  { key: 'decal_crater_s', count: 14, scale: 0.4, alpha: 1 },
  { key: 'decal_crater_m', count: 12, scale: 0.45, alpha: 1 },
  { key: 'decal_crater_l', count: 6, scale: 0.5, alpha: 0.95 },
  { key: 'decal_pebbles', count: 60, scale: 0.18, alpha: 1 },
  { key: 'decal_dust_dark', count: 22, scale: 0.3, alpha: 0.7 },
  { key: 'decal_dust_light', count: 22, scale: 0.3, alpha: 0.7 },
];

export class LevelScene extends Phaser.Scene {
  constructor() {
    super('LevelScene');
  }

  init(data) {
    this.mission = data && Number.isInteger(data.mission) ? data.mission : 1;
    this.from = (data && data.from) || null;
    this.fromCave = (data && data.cave) || null;
  }

  preload() {
    const worldImages = [
      ['ground_a', 'assets/level01/world/ground_a.png'],
      ['ground_b', 'assets/level01/world/ground_b.png'],
      ['decal_crater_s', 'assets/level01/world/decal_crater_s.png'],
      ['decal_crater_m', 'assets/level01/world/decal_crater_m.png'],
      ['decal_crater_l', 'assets/level01/world/decal_crater_l.png'],
      ['decal_pebbles', 'assets/level01/world/decal_pebbles.png'],
      ['decal_dust_dark', 'assets/level01/world/decal_dust_dark.png'],
      ['decal_dust_light', 'assets/level01/world/decal_dust_light.png'],
      ['cliff_1', 'assets/level01/world/cliff_1.png'],
      ['cliff_2', 'assets/level01/world/cliff_2.png'],
      ['base_ext', 'assets/level01/world/base_exterior_hd.png'],
      ['cave_entrance', 'assets/level01/world/cave_entrance.png'],
      ['cave_wall', 'assets/level01/world/cave_wall.png'],
      ['cave_floor', 'assets/level01/world/cave_floor.png'],
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

    for (const [key, url] of worldImages) {
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

    audio.preload(this, LEVEL_AUDIO_IDS);
  }

  create() {
    this.exiting = false;
    this.enteringAirlock = false;
    this.enteringCave = false;
    this.goingToInterior = false;
    this.goingToCave = false;
    this._obj01Queued = false;
    this._obj05Scheduled = false;
    this._obj06cScheduled = false;
    this.rocks = [];

    // Smooth LINEAR filter on HD outpost, caves, map & UI portraits/icons; rocks, decals and astronaut stay NEAREST
    const linearKeys = [
      'base_ext',
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

    // World & camera bounds
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    // Ground + seeded random patches
    this.add
      .tileSprite(0, 0, WORLD_W, WORLD_H, 'ground_a')
      .setOrigin(0, 0)
      .setDepth(-10);

    const rnd = mulberry32(20261114);
    const playW = PLAYABLE.x2 - PLAYABLE.x1;
    const playH = PLAYABLE.y2 - PLAYABLE.y1;

    for (let i = 0; i < 40; i += 1) {
      const rx = rnd();
      const ry = rnd();
      const px = PLAYABLE.x1 + rx * playW;
      const py = PLAYABLE.y1 + ry * playH;
      const patch = this.add
        .tileSprite(px, py, 640, 420, 'ground_b')
        .setOrigin(0.5, 0.5)
        .setAlpha(0.55)
        .setDepth(-9);
      patch.tilePositionX = Math.floor(rx * 64) * 8;
      patch.tilePositionY = Math.floor(ry * 64) * 8;
    }

    // Decals (depth -5, no collision)
    const isValidDecalPoint = (x, y) => {
      if (Math.hypot(x - BASE.x, y - BASE.y) < 380) return false;
      if (Math.hypot(x - PLAYER_START.x, y - PLAYER_START.y) < 160) {
        return false;
      }
      for (const [, rx, ry] of ROCK_NODES) {
        if (Math.hypot(x - rx, y - ry) < 130) return false;
      }
      for (const cave of CAVES) {
        if (Math.hypot(x - cave.x, y - cave.y) < 320) return false;
      }
      return true;
    };

    for (const spec of DECAL_SPECS) {
      for (let i = 0; i < spec.count; i += 1) {
        let x = 0;
        let y = 0;
        let guard = 0;
        do {
          x = PLAYABLE.x1 + rnd() * playW;
          y = PLAYABLE.y1 + rnd() * playH;
          guard += 1;
        } while (!isValidDecalPoint(x, y) && guard < 500);

        this.add
          .image(x, y, spec.key)
          .setOrigin(0.5, 0.5)
          .setScale(spec.scale)
          .setAlpha(spec.alpha)
          .setFlipX(rnd() < 0.5)
          .setDepth(-5);
      }
    }

    // Outpost exterior HD (1520 x 963 -> 760 x 481.5) + static dome collision
    this.outpost = this.add
      .image(BASE.x, BASE.y, 'base_ext')
      .setOrigin(0.5, 1)
      .setDisplaySize(760, (760 * 963) / 1520)
      .setDepth(depthOf(BASE.y));

    const baseCollider = this.add
      .rectangle(BASE.x, BASE.y - 24, 640, 48)
      .setVisible(false);
    this.physics.add.existing(baseCollider, true);

    // Spawn position (interior return, cave return, or initial start)
    let spawnX = PLAYER_START.x;
    let spawnY = PLAYER_START.y;
    if (this.from === 'cave' && this.fromCave) {
      const caveFrom = CAVES.find((c) => c.id === this.fromCave) || CAVES[0];
      spawnX = caveFrom.door.x;
      spawnY = caveFrom.door.y + 70;
    } else if (this.from === 'interior') {
      spawnX = DOOR.x + 60;
      spawnY = DOOR.y + 70;
    }

    this.player = new Player(this, spawnX, spawnY);
    this.player.surface = 'regolith';
    this.player.setBounds(
      PLAYABLE.x1,
      PLAYABLE.y1,
      PLAYABLE.x2,
      PLAYABLE.y2
    );
    this.player.setFacing('down');
    this.physics.add.collider(this.player, baseCollider);

    // Cave entrances + split colliders (leaving the doorway open in the middle)
    for (const cave of CAVES) {
      this.add
        .image(cave.x, cave.y, 'cave_entrance')
        .setOrigin(0.5, 1)
        .setDisplaySize(520, (520 * 558) / 1000)
        .setDepth(depthOf(cave.y));

      const leftCol = this.add
        .rectangle(cave.x - 190, cave.y - 14, 140, 28)
        .setVisible(false);
      this.physics.add.existing(leftCol, true);
      this.physics.add.collider(this.player, leftCol);

      const rightCol = this.add
        .rectangle(cave.x + 190, cave.y - 14, 140, 28)
        .setVisible(false);
      this.physics.add.existing(rightCol, true);
      this.physics.add.collider(this.player, rightCol);
    }

    // Surface rock nodes (6 regolith rocks, 56 x 22 colliders)
    ROCK_NODES.forEach(([type, rx, ry], idx) => {
      const sprite = this.add
        .image(rx, ry, `rock_${type}`, idx % 4)
        .setOrigin(0.5, 1)
        .setScale(1.15)
        .setDepth(depthOf(ry));

      const collider = this.add
        .rectangle(rx, ry - 11, 56, 22)
        .setVisible(false);
      this.physics.add.existing(collider, true);
      const playerCollider = this.physics.add.collider(this.player, collider);

      const rock = new Rock(this, {
        index: idx,
        hitKey: String(idx),
        type,
        x: rx,
        y: ry,
        sprite,
        collider,
        playerCollider,
      });
      this.rocks.push(rock);
    });

    // Top and bottom boundary cliff ridges
    for (let x = 300, idx = 0; x <= 7380; x += 600, idx += 1) {
      const cliffKey = idx % 2 === 0 ? 'cliff_1' : 'cliff_2';
      this.add
        .image(x, 700, cliffKey)
        .setOrigin(0.5, 1)
        .setScale(0.33)
        .setDepth(depthOf(700));

      this.add
        .image(x, 2480, cliffKey)
        .setOrigin(0.5, 1)
        .setScale(0.33)
        .setDepth(depthOf(2480));
    }

    // Fog & region markers
    this._createFogAndMarkers();

    // NOVA companion
    this.nova = new Nova(this, this.player);

    // Camera follow (Section 1.3: lerp 0.12, no deadzone, integer scroll rounding)
    this.cameras.main.centerOn(spawnX, spawnY);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this._onPostUpdate = () => {
      if (this.cameras && this.cameras.main) {
        this.cameras.main.scrollX = Math.round(this.cameras.main.scrollX);
        this.cameras.main.scrollY = Math.round(this.cameras.main.scrollY);
      }
    };
    this._onFollowUpdate = () => {
      if (this.cameras && this.cameras.main) {
        this.cameras.main.scrollX = Math.round(this.cameras.main.scrollX);
        this.cameras.main.scrollY = Math.round(this.cameras.main.scrollY);
      }
    };
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this._onPostUpdate);
    this.cameras.main.on(
      Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE,
      this._onFollowUpdate
    );

    // HUD, Tools, Mining, Interactions, Dialogue, Region discovery, MapPanel & Minimap
    this.objectivePanel = new ObjectivePanel(this);
    this.scorePanel = new ScorePanel(this);
    this.backpackPanel = new BackpackPanel(this);
    this.mapPanel = new MapPanel(this);
    this.bottomHud = new BottomHud(this);
    this.tools = new Tools(this, this.player);
    this.mining = new Mining(this, this.player, this.rocks);
    this.interactions = new Interactions(this, this.player);
    this.dialogue = new Dialogue(this);
    this.regionManager = new RegionManager(this, this.player);
    this.minimap = new Minimap(this, this.player, {
      worldW: WORLD_W,
      worldH: WORLD_H,
      isCave: false,
    });

    // Objective event listeners (registered before emitSceneStart)
    const onObjectiveStart = (index) => {
      if (index === 3 && !state.flags.hint_obj04) {
        this._scheduleObj04Hint();
      }
      if (index === 4 && !state.flags.talked_obj05) {
        this._scheduleObj05(1500);
      }
    };

    const onObjectiveComplete = (completedIndex) => {
      if (completedIndex === 5 && !state.flags.talked_obj06c) {
        this._scheduleObj06Complete(700);
      }
    };

    bus.on('objective:start', onObjectiveStart);
    bus.on('objective:complete', onObjectiveComplete);

    if (state.objectiveIndex === 4 && !state.flags.talked_obj05) {
      this._scheduleObj05(1500);
    }

    state.emitSceneStart();

    // Outpost airlock interactable at (DOOR.x, DOOR.y), range 120
    this.interactions.add({
      id: 'airlock',
      x: DOOR.x,
      y: DOOR.y,
      range: DOOR.range,
      label: 'Enter Outpost',
      onInteract: () => {
        if (this.enteringAirlock || this.enteringCave || this.exiting) return;
        this.enteringAirlock = true;
        this.goingToInterior = true;
        if (this.player) {
          this.player.stopMotion();
        }

        audio.play('SFX_Airlock_Unlock');
        this.time.delayedCall(300, () => {
          audio.play('SFX_Airlock_Open');
        });

        this.cameras.main.fadeOut(700, 0, 0, 0);
        this.cameras.main.once(
          Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
          () => {
            state.set('airlock_entered');
            this.scene.start('InteriorScene', { from: 'level' });
          }
        );
      },
    });

    // Cave entrance interactables (range 120, label 'Enter Cave')
    for (const cave of CAVES) {
      this.interactions.add({
        id: cave.id,
        x: cave.door.x,
        y: cave.door.y,
        range: 120,
        label: 'Enter Cave',
        onInteract: () => {
          if (this.enteringAirlock || this.enteringCave || this.exiting) return;
          this.enteringCave = true;
          this.goingToCave = true;
          if (this.player) {
            this.player.stopMotion();
          }

          audio.play('SFX_Airlock_Open', { gain: 0.5 });
          this.cameras.main.fadeOut(500, 0, 0, 0);
          this.cameras.main.once(
            Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
            () => {
              this.scene.start('CaveScene', { cave: cave.id });
            }
          );
        },
      });
    }

    // Trigger obj01: 1500 ms after scene start if objective 01 is not done and talked_obj01 is false
    this.time.delayedCall(1500, () => {
      if (
        this.exiting ||
        this.enteringAirlock ||
        this.enteringCave ||
        this._obj01Queued ||
        state.has('radio_message_received') ||
        state.objectiveIndex !== 0 ||
        state.flags.talked_obj01
      ) {
        return;
      }
      this._obj01Queued = true;
      this.dialogue.play(
        [
          'obj01_dr1',
          'obj01_astronaut',
          'obj01_dr2',
          'obj01_astronaut2',
          'obj01_dr3',
          'obj01_dr4',
        ],
        {
          player: this.player,
          onDone: () => {
            state.setFlag('talked_obj01', true);
            state.set('radio_message_received');
          },
        }
      );
    });

    // Optional ?debug overlay
    this.isDebug =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('debug');

    if (this.isDebug) {
      this._createDebugOverlay();
    }

    // Audio: exploration music + lunar surface ambience
    audio.stop('AMB_Shadowed_Area', 200);
    audio.unduck(250);
    audio.music('MUS_Lunar_Exploration');
    audio.loop('AMB_Lunar_Surface', { gain: 0.6 });

    if (this.from === 'interior') {
      this.cameras.main.fadeIn(500, 0, 0, 0);
      audio.play('SFX_Airlock_Close');
    } else if (this.from === 'cave') {
      this.cameras.main.fadeIn(500, 0, 0, 0);
    } else {
      this.cameras.main.fadeIn(400, 0, 0, 0);
    }

    // ESC returns to MissionsScene unless TechTreeScene, BackpackPanel, MapPanel, InfoCard or Dialogue is open
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.exiting || this.enteringAirlock || this.enteringCave) return;
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
      this.exiting = true;
      this.goingToInterior = false;
      this.goingToCave = false;
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

    // Stop level loops when transitioning to interior/cave; stop all sounds when leaving to menus
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off('objective:start', onObjectiveStart);
      bus.off('objective:complete', onObjectiveComplete);
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this._onPostUpdate);
      if (this.cameras && this.cameras.main) {
        this.cameras.main.off(
          Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE,
          this._onFollowUpdate
        );
      }
      state.save();
      if (this.goingToInterior || this.goingToCave) {
        audio.stop('AMB_Lunar_Surface', 200);
        audio.stop('SFX_NOVA_Idle_Hum', 120);
      } else {
        audio.stopAll();
      }
    });

    this._exposeTestHooks();
  }

  _scheduleObj04Hint() {
    this.time.delayedCall(25000, () => {
      if (
        this.exiting ||
        this.enteringAirlock ||
        this.enteringCave ||
        state.objectiveIndex !== 3 ||
        state.flags.hint_obj04
      ) {
        return;
      }
      if (
        state.has('flashlight_equipped') ||
        state.has('pickaxe_equipped') ||
        state.has('durability_viewed')
      ) {
        return;
      }
      state.setFlag('hint_obj04', true);
      if (this.nova) {
        this.nova.say(
          'Press 2 to equip your pickaxe, F for the flashlight and I for your backpack.',
          5000
        );
      }
    });
  }

  _scheduleObj05(delayMs) {
    if (this._obj05Scheduled || state.flags.talked_obj05) return;
    this._obj05Scheduled = true;
    this.time.delayedCall(delayMs, () => {
      this._playObj05WhenReady();
    });
  }

  _playObj05WhenReady() {
    if (
      this.exiting ||
      this.enteringAirlock ||
      this.enteringCave ||
      state.flags.talked_obj05
    ) {
      return;
    }
    if (
      InfoCard.isOpen(this) ||
      (this.backpackPanel && this.backpackPanel.isOpen) ||
      (this.mapPanel && this.mapPanel.isOpen) ||
      (this.dialogue && this.dialogue.isPlaying)
    ) {
      this.time.delayedCall(250, () => this._playObj05WhenReady());
      return;
    }
    state.setFlag('talked_obj05', true);
    this.dialogue.play(['obj05_nova', 'obj05_astronaut', 'obj05_nova2'], {
      player: this.player,
    });
  }

  _scheduleObj06Complete(delayMs) {
    if (this._obj06cScheduled || state.flags.talked_obj06c) return;
    this._obj06cScheduled = true;
    this.time.delayedCall(delayMs, () => {
      this._playObj06CompleteWhenReady();
    });
  }

  _playObj06CompleteWhenReady() {
    if (
      this.exiting ||
      this.enteringAirlock ||
      this.enteringCave ||
      state.flags.talked_obj06c
    ) {
      return;
    }
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

  _createFogAndMarkers() {
    const fogGfx = this.add.graphics().setDepth(97);

    // Map edge fog (alpha 0.62) outside x: 600..7000 and bands y < 700, y > 2300
    fogGfx.fillStyle(0x0a1030, 0.62);
    fogGfx.fillRect(0, 0, WORLD_W, 700);
    fogGfx.fillRect(0, 2300, WORLD_W, WORLD_H - 2300);
    fogGfx.fillRect(0, 700, 600, 1600);
    fogGfx.fillRect(7000, 700, WORLD_W - 7000, 1600);

    // Region fog + markers
    const markerGfx = this.add.graphics().setDepth(98);

    for (const reg of REGIONS) {
      if (reg.state === 'open') continue;

      const rw = reg.x2 - reg.x1;
      const rh = reg.y2 - reg.y1;
      const cx = (reg.x1 + reg.x2) / 2;
      const cy = (reg.y1 + reg.y2) / 2;

      const fogAlpha = reg.state === 'locked' ? 0.8 : 0.62;
      fogGfx.fillStyle(0x0a1030, fogAlpha);
      fogGfx.fillRect(reg.x1, reg.y1, rw, rh);

      if (reg.state === 'fogged') {
        this.add
          .text(cx, cy, '?', {
            fontFamily: UI.font,
            fontStyle: '700',
            fontSize: '80px',
            color: '#8fb4ff',
          })
          .setOrigin(0.5, 0.5)
          .setAlpha(0.8)
          .setDepth(98);
      } else if (reg.state === 'locked') {
        const cell = 10;
        const px = Math.round(cx - 4 * cell);
        const py = Math.round(cy - 4.5 * cell);

        markerGfx.fillStyle(0xffffff, 0.8);
        markerGfx.fillRect(px + 2 * cell, py + 0 * cell, 4 * cell, 1 * cell);
        markerGfx.fillRect(px + 1 * cell, py + 1 * cell, 1 * cell, 3 * cell);
        markerGfx.fillRect(px + 6 * cell, py + 1 * cell, 1 * cell, 3 * cell);
        markerGfx.fillRect(px + 0 * cell, py + 4 * cell, 3 * cell, 5 * cell);
        markerGfx.fillRect(px + 5 * cell, py + 4 * cell, 3 * cell, 5 * cell);
        markerGfx.fillRect(px + 3 * cell, py + 4 * cell, 2 * cell, 1 * cell);
        markerGfx.fillRect(px + 3 * cell, py + 8 * cell, 2 * cell, 1 * cell);
      }
    }
  }

  _createDebugOverlay() {
    this.debugText = this.add
      .text(12, 12, '', {
        fontFamily: PIXEL,
        fontSize: '12px',
        color: COLORS.white,
        stroke: COLORS.ink,
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(200);
    registerUi(this, this.debugText);

    const staticDebug = this.add.graphics().setDepth(199);

    staticDebug.lineStyle(2, 0x3fd2ff, 0.95);
    staticDebug.strokeRect(
      PLAYABLE.x1,
      PLAYABLE.y1,
      PLAYABLE.x2 - PLAYABLE.x1,
      PLAYABLE.y2 - PLAYABLE.y1
    );

    staticDebug.lineStyle(2, 0xffd23f, 0.9);
    for (const reg of REGIONS) {
      staticDebug.strokeRect(
        reg.x1,
        reg.y1,
        reg.x2 - reg.x1,
        reg.y2 - reg.y1
      );
      this.add
        .text(reg.x1 + 8, reg.y1 + 8, reg.id, {
          fontFamily: PIXEL,
          fontSize: '10px',
          color: '#ffd23f',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setDepth(199);
    }

    staticDebug.fillStyle(0xff4b4b, 1);
    staticDebug.fillCircle(DOOR.x, DOOR.y, 7);

    staticDebug.fillStyle(0x3fbf5f, 1);
    for (const [, rx, ry] of ROCK_NODES) {
      staticDebug.fillCircle(rx, ry, 5);
    }

    // Caves on debug overlay
    staticDebug.fillStyle(0x3fd2ff, 1);
    staticDebug.lineStyle(2, 0x3fd2ff, 0.9);
    for (const cave of CAVES) {
      staticDebug.strokeCircle(cave.door.x, cave.door.y, 120);
      staticDebug.fillCircle(cave.door.x, cave.door.y, 7);
      this.add
        .text(cave.x - 40, cave.y - 310, cave.id, {
          fontFamily: PIXEL,
          fontSize: '10px',
          color: '#3fd2ff',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setDepth(199);
    }

    this.debugBodyGfx = this.add.graphics().setDepth(199);
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
        this.enteringCave = true;
        this.goingToCave = true;
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
        this.scene.launch('TechTreeScene', { from: 'LevelScene' });
        this.scene.pause('LevelScene');
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
        this.exiting = true;
        this.goingToInterior = false;
        this.goingToCave = false;
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

    const busyTransition =
      this.exiting || this.enteringAirlock || this.enteringCave;

    // Map toggle key M
    if (
      !busyTransition &&
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

    if (!busyTransition && this.player) {
      this.player.update(time, delta);
    }

    if (this.regionManager) {
      this.regionManager.update();
    }

    // Trigger obj02 when approaching the outpost airlock while objective index is 1
    if (
      !busyTransition &&
      this.player &&
      this.dialogue &&
      !this.dialogue.isPlaying &&
      !(this.backpackPanel && this.backpackPanel.isOpen) &&
      !(this.mapPanel && this.mapPanel.isOpen) &&
      !InfoCard.isOpen(this) &&
      state.objectiveIndex === 1 &&
      !state.flags.talked_obj02 &&
      Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        DOOR.x,
        DOOR.y
      ) < 260
    ) {
      state.setFlag('talked_obj02', true);
      this.dialogue.play(['obj02_nova', 'obj02_astronaut'], {
        player: this.player,
      });
    }

    // Trigger obj06 when first entering the rock field (x >= 3000) while objective index is 5
    if (
      !busyTransition &&
      this.player &&
      this.dialogue &&
      !this.dialogue.isPlaying &&
      !(this.backpackPanel && this.backpackPanel.isOpen) &&
      !(this.mapPanel && this.mapPanel.isOpen) &&
      !InfoCard.isOpen(this) &&
      state.objectiveIndex === 5 &&
      !state.flags.talked_obj06 &&
      this.player.x >= 3000
    ) {
      state.setFlag('talked_obj06', true);
      this.dialogue.play(
        ['obj06_dr1', 'obj06_astronaut', 'obj06_dr2', 'obj06_nova'],
        { player: this.player }
      );
    }

    // Objective 06 cave hint: first cave entrance within 700 px while objective 06 is current
    if (
      !busyTransition &&
      this.player &&
      this.nova &&
      !(this.dialogue && this.dialogue.isPlaying) &&
      state.objectiveIndex === 5 &&
      !state.flags.hint_caves
    ) {
      const nearCave = CAVES.some(
        (c) =>
          Phaser.Math.Distance.Between(
            this.player.x,
            this.player.y,
            c.door.x,
            c.door.y
          ) < 700 ||
          Phaser.Math.Distance.Between(this.player.x, this.player.y, c.x, c.y) <
            700
      );
      if (nearCave) {
        state.setFlag('hint_caves', true);
        this.nova.say(
          'Valuable rock hides in caves. It is dark inside, so turn on your flashlight.',
          4000
        );
      }
    }

    if (this.nova) {
      this.nova.update(time, delta);
    }

    if (this.tools) {
      this.tools.update(time, delta);
    }

    if (!busyTransition && this.mining) {
      this.mining.update();
    }

    if (!busyTransition && this.interactions) {
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

    if (this.isDebug && this.player && this.player.body) {
      const regId = this.regionManager ? this.regionManager.currentId : 'none';
      this.debugText.setText(
        `x:${Math.round(this.player.x)} y:${Math.round(this.player.y)} vx:${Math.round(this.player.body.velocity.x)} vy:${Math.round(this.player.body.velocity.y)} facing:${this.player.facing} state:${this.player.state} region:${regId}`
      );
      this.debugBodyGfx.clear();
      this.debugBodyGfx.lineStyle(2, 0x3fbf5f, 1);
      this.debugBodyGfx.strokeRect(
        this.player.body.x,
        this.player.body.y,
        this.player.body.width,
        this.player.body.height
      );
    }
  }
}

export default LevelScene;
