import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from './config.js';
import { CAVES, REGIONS } from './core/constants.js';
import { SaveManager } from './save.js';
import { audio } from './core/audio.js';
import { bus } from './core/events.js';
import { inventory } from './core/inventory.js';
import { state } from './core/state.js';
import { SAMPLE_TYPES } from './data/items.js';
import { OBJECTIVES } from './data/objectives.js';
import { BootScene } from './scenes/BootScene.js';
import { LoadingScene } from './scenes/LoadingScene.js';
import { StartScene } from './scenes/StartScene.js';
import { SettingsScene } from './scenes/SettingsScene.js';
import { MissionsScene } from './scenes/MissionsScene.js';
import { CutsceneScene } from './scenes/CutsceneScene.js';
import { MissionStubScene } from './scenes/MissionStubScene.js';
import { LevelScene } from './scenes/LevelScene.js';
import { CaveScene } from './scenes/CaveScene.js';
import { InteriorScene } from './scenes/InteriorScene.js';
import { TechTreeScene } from './scenes/TechTreeScene.js';
import { LevelCompleteScene } from './scenes/LevelCompleteScene.js';

async function waitForFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const loadPromise = Promise.all([
    document.fonts.load("28px 'Press Start 2P'"),
    document.fonts.load("700 20px 'Silkscreen'"),
    document.fonts.load("500 18px 'Chakra Petch'"),
    document.fonts.load("600 18px 'Chakra Petch'"),
    document.fonts.load("700 18px 'Chakra Petch'"),
  ]);
  const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 3000));
  try {
    await Promise.race([loadPromise, timeoutPromise]);
  } catch {
    // Ignore font load errors after timeout/network failure
  }
}

async function bootstrap() {
  const saved = SaveManager.load();
  state.load();
  audio.setVolumes(
    saved.settings.music,
    saved.settings.sfx,
    saved.settings.voice
  );

  await waitForFonts();

  const config = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game',
    backgroundColor: COLORS.space,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
        fps: 120,
        debug: false,
      },
    },
    pixelArt: true,
    roundPixels: true,
    scene: [
      BootScene,
      LoadingScene,
      StartScene,
      SettingsScene,
      MissionsScene,
      CutsceneScene,
      MissionStubScene,
      LevelScene,
      CaveScene,
      InteriorScene,
      TechTreeScene,
      LevelCompleteScene,
    ],
  };

  const game = new Phaser.Game(config);
  audio.init(game);

  const switchToScene = (sceneKey, data) => {
    const active = game.scene.getScenes(true);
    if (active.length > 0) {
      for (let i = 1; i < active.length; i += 1) {
        active[i].scene.stop();
      }
      active[0].scene.start(sceneKey, data);
    } else {
      game.scene.start(sceneKey, data);
    }
  };

  // Debug keys: F9 resets Level 1 state & reloads; F10 starts CutsceneScene anywhere
  window.addEventListener('keydown', (event) => {
    if (event.code === 'F9' || event.key === 'F9') {
      event.preventDefault();
      state.reset();
      window.location.reload();
    } else if (event.code === 'F10' || event.key === 'F10') {
      event.preventDefault();
      switchToScene('CutsceneScene');
    }
  });

  window.__astro = {
    scene: null,
    player: null,
    dialogue: null,
    audio,
    state,
    bus,
    inventory,
    tools: null,
    mining: null,
    objectives: OBJECTIVES,
    regions: REGIONS,
    caves: CAVES,
    rocks: [],
    get tech() {
      return state.tech;
    },
    teleport(x, y) {
      const current = window.__astro && window.__astro.player;
      if (current && typeof current.teleport === 'function') {
        current.teleport(x, y);
      }
    },
    go(sceneKey, data) {
      switchToScene(sceneKey, data);
    },
    enterCave(id) {
      const target = id === 'crystal_cave' ? 'crystal_cave' : 'iron_cave';
      switchToScene('CaveScene', { cave: target });
    },
    openMap() {
      const current = window.__astro && window.__astro.scene;
      if (current && current.mapPanel) {
        current.mapPanel.open();
      }
    },
    toggleObjectives() {
      const current = window.__astro && window.__astro.scene;
      if (current && current.objectivePanel) {
        return current.objectivePanel.toggle(true);
      }
      return false;
    },
    playDialogue(ids) {
      const current = window.__astro && window.__astro.scene;
      if (current && current.dialogue) {
        current.dialogue.play(ids, { player: current.player });
      }
    },
    startCutscene() {
      switchToScene('CutsceneScene');
    },
    inspectAll() {
      state.setFlag('inspected_workstation', true);
      state.setFlag('inspected_storage', true);
      state.setFlag('inspected_lifesupport', true);
      state.setFlag('inspected_bed', true);
      state.set('workstation_inspected');
      state.set('storage_inspected');
      state.set('life_support_inspected');
      state.set('sleeping_area_inspected');
      const interior = game.scene.getScene('InteriorScene');
      if (
        interior &&
        interior.scene.isActive() &&
        typeof interior.refreshCheckMarks === 'function'
      ) {
        interior.refreshCheckMarks();
      }
    },
    giveItem(id, n = 1) {
      return inventory.add(id, n);
    },
    setDurability(n) {
      const max = Math.max(1, state.pickaxe.max || 30);
      state.pickaxe.durability = Math.max(
        0,
        Math.min(max, Math.floor(Number(n) || 0))
      );
      state.save();
      bus.emit('inventory');
      return state.pickaxe.durability;
    },
    mineNearest() {
      const current = window.__astro && window.__astro.mining;
      if (current && typeof current.mineNearest === 'function') {
        return current.mineNearest();
      }
      return false;
    },
    openBackpack() {
      const current = window.__astro && window.__astro.scene;
      if (current && current.backpackPanel) {
        current.backpackPanel.open();
      }
    },
    openTech() {
      const current = window.__astro && window.__astro.scene;
      if (current && typeof current.openTechTree === 'function') {
        current.openTechTree();
      } else if (current && current.scene) {
        if (!game.scene.isActive('TechTreeScene')) {
          current.scene.launch('TechTreeScene', { from: current.scene.key });
          current.scene.pause(current.scene.key);
        }
      }
    },
    deposit() {
      const current = window.__astro && window.__astro.scene;
      if (current && typeof current.depositAllSamples === 'function') {
        return current.depositAllSamples();
      }
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
    giveSamples() {
      for (const id of SAMPLE_TYPES) {
        inventory.add(id, 5);
      }
    },
    completeLevel() {
      switchToScene('LevelCompleteScene');
    },
  };
}

bootstrap();
