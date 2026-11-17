import Phaser from 'phaser';
import { CAVES, REGIONS, VIEW_H, VIEW_W, depthOf } from '../core/constants.js';
import { actions } from '../core/actions.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { floatText, inventory } from '../core/inventory.js';
import { state } from '../core/state.js';
import { ITEM_ICON_ENTRIES, SAMPLE_TYPES } from '../data/items.js';
import { TECH_TREE_ASSET_ENTRIES } from '../data/tech.js';
import { OBJECTIVES } from '../data/objectives.js';
import { Player, ensurePlayerAnimations } from '../entities/Player.js';
import { Nova } from '../entities/Nova.js';
import { Interactions } from '../systems/Interactions.js';
import { Tools } from '../systems/Tools.js';
import {
  Dialogue,
  GAMEPLAY_DIALOGUE_AUDIO_IDS,
} from '../systems/Dialogue.js';
import { UI } from '../ui/theme.js';
import { ObjectivePanel } from '../ui/ObjectivePanel.js';
import { ScorePanel } from '../ui/ScorePanel.js';
import { InfoCard } from '../ui/InfoCard.js';
import { BottomHud } from '../ui/BottomHud.js';
import { BackpackPanel } from '../ui/BackpackPanel.js';

const INTERIOR_AUDIO_IDS = [
  'MUS_Base_Interior',
  'AMB_Base_Interior',
  'SFX_LifeSupport_Hum',
  'SFX_NOVA_Idle_Hum',
  'SFX_NOVA_Happy_Beep',
  'SFX_Footstep_Metal',
  'SFX_Footstep_Metal_02',
  'SFX_Footstep_Metal_03',
  'SFX_Airlock_Close',
  'SFX_Pressure_Seal',
  'SFX_Airlock_Unlock',
  'SFX_Airlock_Open',
  'SFX_Workstation_On',
  'SFX_Storage_Open',
  'SFX_Storage_Close',
  'SFX_Battery_Connect',
  'SFX_Bed_Activate',
  'SFX_Radio_Open',
  'SFX_Radio_Beep',
  'SFX_Radio_Close',
  'SFX_Radio_Static',
  'SFX_Interact',
  'SFX_Interaction_Prompt',
  'SFX_Menu_Open',
  'SFX_Menu_Close',
  'SFX_Objective_Updated',
  'SFX_Objective_Complete',
  'SFX_Score_Tick',
  'SFX_Button_Click',
  'SFX_Button_Hover',
  'SFX_Error',
  'SFX_Inventory_Full',
  'SFX_Resource_Pickup',
  'SFX_Tab_Switch',
  'SFX_Flashlight_On',
  'SFX_Flashlight_Off',
  'SFX_Flashlight_Low_Battery',
  'SFX_Tool_Break',
  'SFX_Tool_Durability_Low',
  'SFX_Item_Select',
  'SFX_Not_Enough_Resources',
  'SFX_Research_Start',
  'SFX_Research_Loop',
  'SFX_Research_Complete',
  'SFX_Crafting_Start',
  'SFX_Crafting_Loop',
  'SFX_Crafting_Complete',
  'SFX_Processor_Start',
  'SFX_Processor_Grind_Loop',
  'SFX_Processor_Complete',
  'SFX_Level_Complete',
  'SFX_Victory_Cheer',
  'SFX_NOVA_Excited',
  'SFX_Score_Total',
  'MUS_Level_Complete_Sting',
  ...GAMEPLAY_DIALOGUE_AUDIO_IDS,
];

const STATIONS = [
  {
    id: 'workstation',
    spriteKey: 'i_workstation',
    spriteX: 226,
    displayW: 250,
    interactX: 351,
    range: 150,
    label: 'Inspect Workstation',
    sfx: 'SFX_Workstation_On',
    cardTitle: 'Workstation',
    cardBody:
      'Your research station. It opens the Technology Tree, where you learn new ways to use what you find on the Moon. Right now it is working, but only the basics are open.',
    conditionId: 'workstation_inspected',
    flag: 'inspected_workstation',
  },
  {
    id: 'storage',
    spriteKey: 'i_storage',
    spriteX: 520,
    displayW: 168,
    interactX: 604,
    range: 120,
    label: 'Inspect Supply Storage',
    sfx: 'SFX_Storage_Open',
    cardTitle: 'Supply Storage',
    cardBody:
      'Supplies from Earth: 3 oxygen canisters, 5 cans of food, 4 spare batteries and 1 spare parts kit. There is not enough here to last forever, so use it carefully.',
    conditionId: 'storage_inspected',
    flag: 'inspected_storage',
  },
  {
    id: 'lifesupport',
    spriteKey: 'i_lifesupport',
    spriteX: 722,
    displayW: 190,
    interactX: 817,
    range: 130,
    label: 'Inspect Life Support',
    sfx: 'SFX_Battery_Connect',
    cardTitle: 'Temporary Life Support',
    cardBody:
      'This machine keeps the air breathable. It has enough reserve for about 72 hours. That number is a game setting, not a real engineering number. When it runs low you will see warnings first.',
    conditionId: 'life_support_inspected',
    flag: 'inspected_lifesupport',
  },
  {
    id: 'bed',
    spriteKey: 'i_bed',
    spriteX: 1090,
    displayW: 180,
    interactX: 1180,
    range: 120,
    label: 'Inspect Sleeping Area',
    sfx: 'SFX_Bed_Activate',
    cardTitle: 'Sleeping Area',
    cardBody:
      'A bed for resting. Sleeping brings your stamina back, but time keeps moving and the life support keeps running. Sleeping will be available later in the mission.',
    conditionId: 'sleeping_area_inspected',
    flag: 'inspected_bed',
  },
];

export class InteriorScene extends Phaser.Scene {
  constructor() {
    super('InteriorScene');
  }

  init(data) {
    this.from = (data && data.from) || 'level';
  }

  preload() {
    const images = [
      ['cabin', 'assets/level01/interior/cabin_empty.webp'],
      ['dlg_karim', 'assets/level01/interior/dr_karim.webp'],
      ['dlg_nova', 'assets/level01/interior/nova_portrait.png'],
      ['dlg_astro', 'assets/ui/avatar_face.png'],
      ['avatar_frame', 'assets/ui/avatar_face.png'],
      ['backpack_closed_icon', 'assets/ui/backpack_closed_icon.png'],
      ['i_airlock', 'assets/level01/base/airlock_door.png'],
      ['i_workstation', 'assets/level01/base/workstation.png'],
      ['i_storage', 'assets/level01/base/supply_storage.png'],
      ['i_lifesupport', 'assets/level01/base/life_support.png'],
      ['i_processor', 'assets/level01/base/material_processor.png'],
      ['i_bed', 'assets/level01/bed/bed_r0_c0.png'],
      ...ITEM_ICON_ENTRIES,
      ...TECH_TREE_ASSET_ENTRIES,
    ];

    for (const [key, url] of images) {
      if (!this.textures.exists(key)) {
        this.load.image(key, url);
      }
    }

    if (!this.textures.exists('nova')) {
      this.load.spritesheet('nova', 'assets/level01/victory/nova_victory.png', {
        frameWidth: 96,
        frameHeight: 126,
      });
    }

    const sheets = [
      ['astro_idle', 'assets/sprites/astro_idle.png'],
      ['astro_walk', 'assets/sprites/astro_walk.png'],
      ['astro_down', 'assets/sprites/astro_down.png'],
      ['astro_up', 'assets/sprites/astro_up.png'],
      ['astro_interact', 'assets/sprites/astro_interact.png'],
    ];
    for (const [key, url] of sheets) {
      if (!this.textures.exists(key)) {
        this.load.spritesheet(key, url, { frameWidth: 125, frameHeight: 169 });
      }
    }

    audio.preload(this, INTERIOR_AUDIO_IDS);
  }

  create() {
    this.leaving = false;
    this.goingToLevel = false;
    this._obj04aScheduled = false;
    this._obj04HintScheduled = false;
    this._obj10EndingScheduled = false;
    this._pendingObj10Ending = false;
    this._techOpenedAfterLifeSupport = false;
    this.rocks = [];
    this.mining = null;

    const linearKeys = [
      'cabin',
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

    ensurePlayerAnimations(this);
    actions.init(this);
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      actions.init(this);
      actions.resetMovementKeys();
      this._exposeTestHooks();
    });

    // Fixed 1280x720 interior camera & physics bounds
    this.physics.world.setBounds(0, 0, VIEW_W, VIEW_H);
    this.cameras.main.setBounds(0, 0, VIEW_W, VIEW_H);

    // Cabin backdrop displayed 1280x715 at (0,0), depth 0
    this.add
      .image(0, 0, 'cabin')
      .setOrigin(0, 0)
      .setDisplaySize(1280, 715)
      .setDepth(0);

    const stationDepth = depthOf(596);
    const placeStationSprite = (key, x, targetW) => {
      const img = this.add
        .image(x, 596, key)
        .setOrigin(0, 1)
        .setDepth(stationDepth);
      const targetH = Math.round((targetW * img.height) / img.width);
      img.setDisplaySize(targetW, targetH);
      return img;
    };

    // Airlock door on left
    placeStationSprite('i_airlock', 14, 170);

    // Four inspectable stations
    for (const st of STATIONS) {
      placeStationSprite(st.spriteKey, st.spriteX, st.displayW);
    }

    // 6.4 Processor install spot (ghost until installed, full color once installed)
    this.processorSprite = placeStationSprite('i_processor', 946, 170);
    this._processorBaseScaleX = this.processorSprite.scaleX;
    this._processorBaseScaleY = this.processorSprite.scaleY;
    if (state.tech.processor_installed) {
      this.processorSprite.clearTint();
      this.processorSprite.setAlpha(1);
    } else {
      this.processorSprite.setAlpha(0.28);
      this.processorSprite.setTint(0x999999);
    }

    // Player at (190, 600), facing right, metal surface, floor band bounds (60, 572, 1220, 650)
    this.player = new Player(this, 190, 600);
    this.player.surface = 'metal';
    this.player.setBounds(60, 572, 1220, 650);
    this.player.setFacing('right');

    // NOVA starts at x = 280
    this.nova = new Nova(this, this.player, { x: 280, y: 600 - 150 });

    // Persistent gold check marks at (interaction x, 330), depth 30
    this.checkMarksGfx = this.add.graphics().setDepth(30);
    this.objTargetGfx = this.add.graphics().setDepth(32);
    this.refreshCheckMarks();

    // HUD, Tools, Interactions & Dialogue (no minimap inside interior per SPEC 07 Section 4)
    this.objectivePanel = new ObjectivePanel(this);
    this.scorePanel = new ScorePanel(this);
    this.backpackPanel = new BackpackPanel(this);
    this.bottomHud = new BottomHud(this);
    this.tools = new Tools(this, this.player);
    this.interactions = new Interactions(this, this.player);
    this.dialogue = new Dialogue(this);

    const onObjectiveComplete = (completedIndex) => {
      if (completedIndex === 2 && !state.flags.talked_obj04a) {
        this._scheduleObj04a(1600);
      }
      if (completedIndex === 9 && !state.flags.talked_ending) {
        this._pendingObj10Ending = true;
        if (!this.scene.isActive('TechTreeScene')) {
          this._scheduleObj10Ending(450);
        }
      }
    };

    const onTechTreeClosed = (payload = {}) => {
      if (this.leaving) return;

      const linesToPlay = [];

      if (
        (payload.openedAtObj08 || state.objectiveIndex === 7) &&
        !state.flags.talked_obj08a
      ) {
        state.setFlag('talked_obj08a', true);
        if (!state.tech.processing_researched) {
          linesToPlay.push('obj08_nova', 'obj08_astronaut');
        }
      }

      if (
        (payload.researchedNow || state.tech.processing_researched) &&
        !state.flags.talked_obj08b
      ) {
        state.setFlag('talked_obj08b', true);
        linesToPlay.push('obj08_nova2', 'obj08_astronaut2');
      }

      if (
        (payload.craftedNow || state.tech.processor_crafted) &&
        !state.flags.talked_obj09
      ) {
        state.setFlag('talked_obj09', true);
        linesToPlay.push('obj09_nova', 'obj09_astronaut', 'obj09_nova2');
      }

      if (linesToPlay.length > 0 && this.dialogue) {
        this.dialogue.play(linesToPlay, { player: this.player });
      } else if (state.objectiveIndex === 9 && this.nova) {
        if (!state.has('next_research_reviewed')) {
          const seenO2 = Boolean(state.flags.viewed_oxygen_recovery);
          const seenSolar = Boolean(state.flags.viewed_basic_solar_systems);
          if (seenO2 && !seenSolar) {
            this.nova.say(
              'Almost done! Open Power -> Basic Solar Systems in the Workstation.',
              4200
            );
          } else if (!seenO2 && seenSolar) {
            this.nova.say(
              'Almost done! Open Life Support -> Oxygen Recovery in the Workstation.',
              4200
            );
          } else {
            this.nova.say(
              'In the Workstation, inspect Oxygen Recovery (Life Support) and Basic Solar Systems (Power).',
              4500
            );
          }
        } else if (!state.has('life_support_checked')) {
          this.nova.say(
            'Next research reviewed! Now check the Life Support unit.',
            4000
          );
        }
      }

      if (
        this._pendingObj10Ending ||
        (state.objectiveIndex >= 10 && !state.flags.talked_ending)
      ) {
        this._scheduleObj10Ending(300);
      }
    };

    bus.on('objective:complete', onObjectiveComplete);
    bus.on('techtree:closed', onTechTreeClosed);

    state.emitSceneStart();

    // Trigger obj03: 1200 ms after scene starts when objective index is 2 and talked_obj03 is false
    this.time.delayedCall(1200, () => {
      if (
        this.leaving ||
        state.objectiveIndex !== 2 ||
        state.flags.talked_obj03
      ) {
        return;
      }
      this._playObj03WhenReady();
    });

    // 6.2 Returning with the samples (objective 07): play obj07_nova, obj07_astronaut after fade in
    this.time.delayedCall(600, () => {
      if (
        this.leaving ||
        state.objectiveIndex !== 6 ||
        state.flags.talked_obj07
      ) {
        return;
      }
      this._playObj07WhenReady();
    });

    if (
      state.objectiveIndex >= 3 &&
      state.objectiveIndex <= 4 &&
      !state.flags.talked_obj04a &&
      state.has('workstation_inspected') &&
      state.has('storage_inspected') &&
      state.has('life_support_inspected') &&
      state.has('sleeping_area_inspected')
    ) {
      this._scheduleObj04a(1600);
    } else if (
      state.objectiveIndex === 3 &&
      state.flags.talked_obj04a &&
      !state.flags.hint_obj04
    ) {
      this._scheduleObj04Hint();
    }

    if (state.objectiveIndex >= 10 && !state.flags.talked_ending) {
      this._pendingObj10Ending = true;
      this._scheduleObj10Ending(600);
    }

    // Door interactable to leave outpost: (99, 600), range 120
    this.interactions.add({
      id: 'door',
      x: 99,
      y: 600,
      range: 120,
      label: 'Leave Outpost',
      onInteract: () => {
        if (this.leaving) return;
        this.leaving = true;
        this.goingToLevel = true;
        if (this.player) {
          this.player.stopMotion();
        }

        audio.play('SFX_Airlock_Unlock');
        this.time.delayedCall(250, () => {
          audio.play('SFX_Airlock_Open');
        });

        this.cameras.main.fadeOut(600, 0, 0, 0);
        this.cameras.main.once(
          Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
          () => {
            this.scene.start('LevelScene', { mission: 1, from: 'interior' });
          }
        );
      },
    });

    // Four station interactables at y = 600
    for (const st of STATIONS) {
      if (st.id === 'workstation') {
        this.interactions.add({
          id: st.id,
          x: st.interactX,
          y: 600,
          range: st.range,
          label: () => {
            if (
              state.objectiveIndex === 9 &&
              !state.has('next_research_reviewed')
            ) {
              return 'Review Next Research';
            }
            return state.objectiveIndex >= 7 ? 'Open Workstation' : st.label;
          },
          onInteract: () => {
            const wasInspected = Boolean(
              state.flags.inspected_workstation ||
                state.has('workstation_inspected')
            );
            const shouldRepair = state.pickaxe.durability <= 12;

            state.setFlag(st.flag, true);
            this.refreshCheckMarks();

            // Objective 08 or later: open Technology Tree directly instead of InfoCard
            if (state.objectiveIndex >= 7) {
              if (!state.has(st.conditionId)) {
                state.set(st.conditionId);
              }
              if (shouldRepair) {
                this._repairPickaxeNow();
              }
              this.openTechTree();
              return;
            }

            audio.play(st.sfx);
            InfoCard.show(this, {
              title: st.cardTitle,
              body: st.cardBody,
              onClose: () => {
                if (!state.has(st.conditionId)) {
                  state.set(st.conditionId);
                }
                if (shouldRepair || state.pickaxe.durability <= 12) {
                  this._repairPickaxeNow();
                }
                // Second and later inspections open the Technology Tree after closing the card
                if (wasInspected) {
                  this.openTechTree();
                }
              },
            });
          },
        });
      } else if (st.id === 'storage') {
        this.interactions.add({
          id: st.id,
          x: st.interactX,
          y: 600,
          range: st.range,
          label: () =>
            state.objectiveIndex >= 6 && this._bagSampleCount() > 0
              ? 'Store samples'
              : st.label,
          onInteract: () => {
            if (state.objectiveIndex >= 6 && this._bagSampleCount() > 0) {
              this.depositAllSamples();
              return;
            }

            audio.play(st.sfx);
            state.setFlag(st.flag, true);
            this.refreshCheckMarks();

            InfoCard.show(this, {
              title: st.cardTitle,
              body: st.cardBody,
              onClose: () => {
                if (!state.has(st.conditionId)) {
                  state.set(st.conditionId);
                }
              },
            });
          },
        });
      } else if (st.id === 'lifesupport') {
        this.interactions.add({
          id: st.id,
          x: st.interactX,
          y: 600,
          range: st.range,
          label: () =>
            state.objectiveIndex === 9 && !state.has('life_support_checked')
              ? 'Check Life Support'
              : st.label,
          onInteract: () => {
            const isObj10Check =
              state.objectiveIndex === 9 && Boolean(state.tech.processor_installed);

            audio.play(st.sfx);
            state.setFlag(st.flag, true);
            this.refreshCheckMarks();

            const cardBody = isObj10Check
              ? 'Reserve is stable, but limited. Oxygen comes from supplies sent from Earth, so the outpost needs a permanent solution.'
              : st.cardBody;

            InfoCard.show(this, {
              title: st.cardTitle,
              body: cardBody,
              onClose: () => {
                if (!state.has(st.conditionId)) {
                  state.set(st.conditionId);
                }
                if (isObj10Check) {
                  this._techOpenedAfterLifeSupport = false;
                  state.set('life_support_checked');
                  const promptNextResearch = () => {
                    if (
                      this.leaving ||
                      this._techOpenedAfterLifeSupport ||
                      state.has('next_research_reviewed') ||
                      this.scene.isActive('TechTreeScene')
                    ) {
                      return;
                    }
                    if (this.nova) {
                      this.nova.say(
                        'Open the Workstation (or press C) to inspect Oxygen Recovery and Basic Solar Systems.',
                        4500
                      );
                    }
                  };
                  if (!state.flags.talked_obj10a && this.dialogue) {
                    state.setFlag('talked_obj10a', true);
                    this.dialogue.play(
                      [
                        'obj10_dr1',
                        'obj10_astronaut',
                        'obj10_dr2',
                        'obj10_nova',
                      ],
                      {
                        player: this.player,
                        onDone: () => {
                          this.time.delayedCall(350, promptNextResearch);
                        },
                      }
                    );
                  } else {
                    this.time.delayedCall(250, promptNextResearch);
                  }
                  this.time.delayedCall(20000, promptNextResearch);
                }
              },
            });
          },
        });
      } else {
        this.interactions.add({
          id: st.id,
          x: st.interactX,
          y: 600,
          range: st.range,
          label: st.label,
          onInteract: () => {
            audio.play(st.sfx);
            state.setFlag(st.flag, true);
            this.refreshCheckMarks();

            InfoCard.show(this, {
              title: st.cardTitle,
              body: st.cardBody,
              onClose: () => {
                if (!state.has(st.conditionId)) {
                  state.set(st.conditionId);
                }
              },
            });
          },
        });
      }
    }

    // 6.4 Processor install & inspect interactable at (1031, 600), range 130
    this.interactions.add({
      id: 'processor',
      x: 1031,
      y: 600,
      range: 130,
      enabled: () =>
        Boolean(state.tech.processor_crafted || state.tech.processor_installed),
      label: () =>
        state.tech.processor_installed
          ? 'Inspect Processor'
          : 'Install Processor',
      onInteract: () => {
        if (!state.tech.processor_installed) {
          audio.play('SFX_Processor_Start');
          if (this.processorSprite) {
            this.processorSprite.clearTint();
            this.processorSprite.setAlpha(1);
            this.processorSprite.setScale(
              this._processorBaseScaleX * 1.12,
              this._processorBaseScaleY * 1.12
            );
            this.tweens.add({
              targets: this.processorSprite,
              scaleX: this._processorBaseScaleX,
              scaleY: this._processorBaseScaleY,
              duration: 250,
              ease: 'Back.easeOut',
            });
          }

          audio.loop('SFX_Processor_Grind_Loop', { gain: 0.3 });
          this.time.delayedCall(3000, () => {
            audio.stop('SFX_Processor_Grind_Loop', 120);
            if (!this.leaving) {
              audio.play('SFX_Processor_Complete');
            }
          });

          floatText(this, 1031, 450, 'Processor installed!', UI.gold);
          state.tech.processor_installed = true;
          state.save();
          state.set('processor_installed');
          this.time.delayedCall(900, () => {
            if (
              this.leaving ||
              state.objectiveIndex !== 9 ||
              state.has('life_support_checked') ||
              (this.dialogue && this.dialogue.isPlaying)
            ) {
              return;
            }
            if (this.nova) {
              this.nova.say(
                'Processor online! Check the Life Support unit next.',
                4000
              );
            }
          });
        } else {
          InfoCard.show(this, {
            title: 'Basic Material Processor',
            body: 'It crushes and sorts lunar rock samples. This is a simple game version, not a real factory.',
          });
        }
      },
    });

    // Interior audio + entrance airlock sequence
    audio.stop('AMB_Lunar_Surface', 200);
    audio.stop('AMB_Shadowed_Area', 200);
    audio.unduck(200);
    audio.music('MUS_Base_Interior');
    audio.loop('AMB_Base_Interior', { gain: 0.5 });
    audio.loop('SFX_LifeSupport_Hum', { gain: 0.25 });

    this.cameras.main.fadeIn(500, 0, 0, 0);
    audio.play('SFX_Airlock_Close');
    this.time.delayedCall(150, () => {
      audio.play('SFX_Pressure_Seal');
    });

    // ESC order: TechTreeScene, BackpackPanel, InfoCard first; otherwise MissionsScene
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.leaving) return;
      if (
        this.scene.isActive('TechTreeScene') ||
        (this.backpackPanel && this.backpackPanel.isOpen) ||
        (this.dialogue && this.dialogue.isPlaying) ||
        InfoCard.isOpen(this) ||
        performance.now() - (this._escConsumedAt || 0) < 80
      ) {
        return;
      }
      this.leaving = true;
      this.goingToLevel = false;
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
      bus.off('techtree:closed', onTechTreeClosed);
      audio.stop('SFX_Processor_Grind_Loop', 80);
      state.save();
      if (this.goingToLevel) {
        audio.stop('AMB_Base_Interior', 200);
        audio.stop('SFX_LifeSupport_Hum', 200);
        audio.stop('SFX_NOVA_Idle_Hum', 120);
      } else {
        audio.stopAll();
      }
    });

    this._exposeTestHooks();
  }

  _bagSampleCount() {
    let total = 0;
    for (const id of SAMPLE_TYPES) {
      total += inventory.count(id);
    }
    return total;
  }

  depositAllSamples() {
    let totalMoved = 0;
    for (let i = 0; i < state.bag.length; i += 1) {
      const slot = state.bag[i];
      if (slot && SAMPLE_TYPES.includes(slot.id)) {
        state.storage[slot.id] = (state.storage[slot.id] || 0) + slot.n;
        totalMoved += slot.n;
        state.bag[i] = null;
      }
    }

    if (totalMoved <= 0) return 0;

    state.save();
    bus.emit('inventory');

    audio.play('SFX_Storage_Open');
    this.time.delayedCall(400, () => {
      audio.play('SFX_Storage_Close');
      audio.play('SFX_Objective_Updated');
    });

    floatText(this, 604, 450, `Samples stored: ${totalMoved}`, UI.gold);

    if (
      state.storage.lunar_regolith_sample >= 5 &&
      state.storage.ilmenite_bearing_basalt_sample >= 5 &&
      state.storage.silicate_rich_rock_sample >= 5
    ) {
      state.set('samples_deposited');
    }

    if (
      state.objectiveIndex <= 7 &&
      !state.flags.talked_obj07b &&
      this.dialogue
    ) {
      state.setFlag('talked_obj07b', true);
      this.dialogue.play(['obj07_nova2'], { player: this.player });
    }

    return totalMoved;
  }

  _repairPickaxeNow() {
    audio.play('SFX_Crafting_Complete');
    state.pickaxe.durability = 30;
    state.save();
    bus.emit('inventory');
    if (this.player) {
      floatText(
        this,
        this.player.x,
        this.player.y - 120,
        'Pickaxe repaired',
        UI.gold
      );
    }
    if (this.nova) {
      this.nova.say('All fixed. The pickaxe is like new.', 3000);
    }
  }

  openTechTree() {
    if (this.leaving) return;
    if (this.scene.isActive('TechTreeScene')) return;
    if (InfoCard.isOpen(this)) return;
    if (this.backpackPanel && this.backpackPanel.isOpen) return;
    if (this.dialogue && this.dialogue.isPlaying) return;

    this._techOpenedAfterLifeSupport = true;
    if (this.player && this.player.body) {
      this.player.body.setVelocity(0, 0);
    }
    if (this.interactions && this.interactions.prompt) {
      this.interactions.prompt.hide();
    }

    this.scene.launch('TechTreeScene', { from: 'InteriorScene' });
    this.scene.pause('InteriorScene');
  }

  _playObj03WhenReady() {
    if (this.leaving || state.flags.talked_obj03 || state.objectiveIndex !== 2) {
      return;
    }
    if (
      this.scene.isActive('TechTreeScene') ||
      InfoCard.isOpen(this) ||
      (this.backpackPanel && this.backpackPanel.isOpen) ||
      (this.dialogue && this.dialogue.isPlaying)
    ) {
      this.time.delayedCall(250, () => this._playObj03WhenReady());
      return;
    }
    state.setFlag('talked_obj03', true);
    this.dialogue.play(
      [
        'obj03_nova1',
        'obj03_astronaut',
        'obj03_nova2',
        'obj03_astronaut2',
        'obj03_nova3',
      ],
      { player: this.player }
    );
  }

  _playObj07WhenReady() {
    if (this.leaving || state.flags.talked_obj07 || state.objectiveIndex !== 6) {
      return;
    }
    if (
      this.scene.isActive('TechTreeScene') ||
      InfoCard.isOpen(this) ||
      (this.backpackPanel && this.backpackPanel.isOpen) ||
      (this.dialogue && this.dialogue.isPlaying)
    ) {
      this.time.delayedCall(250, () => this._playObj07WhenReady());
      return;
    }
    state.setFlag('talked_obj07', true);
    this.dialogue.play(['obj07_nova', 'obj07_astronaut'], {
      player: this.player,
    });
  }

  _scheduleObj04a(delayMs) {
    if (this._obj04aScheduled || state.flags.talked_obj04a) return;
    this._obj04aScheduled = true;
    this.time.delayedCall(delayMs, () => {
      this._playObj04aWhenReady();
    });
  }

  _playObj04aWhenReady() {
    if (this.leaving || state.flags.talked_obj04a) return;
    if (
      this.scene.isActive('TechTreeScene') ||
      InfoCard.isOpen(this) ||
      (this.backpackPanel && this.backpackPanel.isOpen) ||
      (this.dialogue && this.dialogue.isPlaying)
    ) {
      this.time.delayedCall(250, () => this._playObj04aWhenReady());
      return;
    }
    state.setFlag('talked_obj04a', true);
    this.dialogue.play(
      [
        'obj04_dr1',
        'obj04_dr2',
        'obj04_astronaut',
        'obj04_dr3',
        'obj04_nova',
      ],
      {
        player: this.player,
        onDone: () => {
          this._scheduleObj04Hint();
        },
      }
    );
  }

  _scheduleObj04Hint() {
    if (this._obj04HintScheduled || state.flags.hint_obj04) return;
    this._obj04HintScheduled = true;
    this.time.delayedCall(25000, () => {
      if (
        this.leaving ||
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

  _scheduleObj10Ending(delayMs) {
    if (this._obj10EndingScheduled || state.flags.talked_ending) return;
    this._obj10EndingScheduled = true;
    this.time.delayedCall(delayMs, () => {
      this._playObj10EndingWhenReady();
    });
  }

  _playObj10EndingWhenReady() {
    if (this.leaving || state.flags.talked_ending) return;
    if (
      this.scene.isActive('TechTreeScene') ||
      InfoCard.isOpen(this) ||
      (this.backpackPanel && this.backpackPanel.isOpen) ||
      (this.dialogue && this.dialogue.isPlaying)
    ) {
      this.time.delayedCall(250, () => this._playObj10EndingWhenReady());
      return;
    }

    this._pendingObj10Ending = false;
    if (this.player) {
      this.player.canMove = false;
      if (this.player.body) {
        this.player.body.setVelocity(0, 0);
      }
    }

    const startEndingDialogue = () => {
      state.setFlag('talked_ending', true);
      this.dialogue.play(
        [
          'ending_astronaut',
          'ending_nova',
          'ending_astronaut2',
          'ending_nova2',
        ],
        {
          player: this.player,
          onDone: () => {
            if (this.leaving) return;
            this.leaving = true;
            this.goingToLevel = false;
            if (this.player) {
              this.player.canMove = false;
            }
            this.cameras.main.fadeOut(1000, 0, 0, 0);
            this.cameras.main.once(
              Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
              () => {
                this.scene.start('LevelCompleteScene');
              }
            );
          },
        }
      );
    };

    if (!state.flags.talked_obj10b) {
      state.setFlag('talked_obj10b', true);
      this.dialogue.play(['obj10_astronaut2', 'obj10_nova2'], {
        player: this.player,
        onDone: () => {
          startEndingDialogue();
        },
      });
    } else {
      startEndingDialogue();
    }
  }

  _drawObjectiveTarget(time) {
    if (!this.objTargetGfx) return;
    this.objTargetGfx.clear();

    if (
      this.leaving ||
      this.scene.isActive('TechTreeScene') ||
      (this.dialogue && this.dialogue.isPlaying) ||
      InfoCard.isOpen(this)
    ) {
      return;
    }

    let targetX = null;
    if (
      state.objectiveIndex === 6 &&
      this._bagSampleCount() > 0 &&
      !state.has('samples_deposited')
    ) {
      targetX = 604;
    } else if (
      state.objectiveIndex === 7 &&
      !state.has('basic_material_processing_researched')
    ) {
      targetX = 351;
    } else if (state.objectiveIndex === 8) {
      if (!state.tech.processor_crafted) {
        targetX = 351;
      } else if (!state.tech.processor_installed) {
        targetX = 1031;
      }
    } else if (state.objectiveIndex === 9) {
      if (!state.has('life_support_checked')) {
        targetX = 817;
      } else if (!state.has('next_research_reviewed')) {
        targetX = 351;
      }
    }

    if (targetX === null) return;

    const bob = Math.sin((time || 0) / 220) * 4;
    const cy = 294 + bob;
    const pulse = 0.55 + 0.35 * Math.sin((time || 0) / 260);

    this.objTargetGfx.fillStyle(0x070d24, 0.85);
    this.objTargetGfx.fillCircle(targetX, cy, 15);
    this.objTargetGfx.lineStyle(2.5, 0xffd23f, pulse);
    this.objTargetGfx.strokeCircle(targetX, cy, 15);

    this.objTargetGfx.lineStyle(3, 0xffd23f, 1);
    this.objTargetGfx.beginPath();
    this.objTargetGfx.moveTo(targetX - 6, cy - 3);
    this.objTargetGfx.lineTo(targetX, cy + 4);
    this.objTargetGfx.lineTo(targetX + 6, cy - 3);
    this.objTargetGfx.strokePath();
  }

  refreshCheckMarks() {
    if (!this.checkMarksGfx) return;
    this.checkMarksGfx.clear();

    for (const st of STATIONS) {
      if (state.flags[st.flag] || state.has(st.conditionId)) {
        const cx = st.interactX;
        const cy = 330;

        this.checkMarksGfx.lineStyle(5, 0x070a1c, 0.85);
        this.checkMarksGfx.beginPath();
        this.checkMarksGfx.moveTo(cx - 7, cy);
        this.checkMarksGfx.lineTo(cx - 2, cy + 5);
        this.checkMarksGfx.lineTo(cx + 7, cy - 6);
        this.checkMarksGfx.strokePath();

        this.checkMarksGfx.lineStyle(3, 0xffc83d, 1);
        this.checkMarksGfx.beginPath();
        this.checkMarksGfx.moveTo(cx - 7, cy);
        this.checkMarksGfx.lineTo(cx - 2, cy + 5);
        this.checkMarksGfx.lineTo(cx + 7, cy - 6);
        this.checkMarksGfx.strokePath();
      }
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
      mining: null,
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
        this.goingToLevel = false;
        this.scene.start('CaveScene', { cave: target });
      },
      openMap: () => {
        if (this.player) {
          floatText(
            this,
            this.player.x,
            this.player.y - 120,
            'The map works outside the outpost',
            UI.gold
          );
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
        this.refreshCheckMarks();
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
      mineNearest: () => false,
      openBackpack: () => {
        if (this.backpackPanel) {
          this.backpackPanel.open();
        }
      },
      openTech: () => {
        this.openTechTree();
      },
      deposit: () => this.depositAllSamples(),
      giveSamples: () => {
        for (const id of SAMPLE_TYPES) {
          inventory.add(id, 5);
        }
      },
      completeLevel: () => {
        this.leaving = true;
        this.goingToLevel = false;
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

    // Pressing M inside interior shows floating text 'The map works outside the outpost'
    if (
      !this.leaving &&
      !this.scene.isActive('TechTreeScene') &&
      !InfoCard.isOpen(this) &&
      !(this.backpackPanel && this.backpackPanel.isOpen) &&
      !(this.dialogue && this.dialogue.isPlaying) &&
      actions.justDown('map')
    ) {
      if (this.player) {
        floatText(
          this,
          this.player.x,
          this.player.y - 120,
          'The map works outside the outpost',
          UI.gold
        );
      }
    }

    // Technology key (C) opens TechTree inside interior when no modal/dialogue is open
    if (
      !this.leaving &&
      !this.scene.isActive('TechTreeScene') &&
      !InfoCard.isOpen(this) &&
      !(this.backpackPanel && this.backpackPanel.isOpen) &&
      !(this.dialogue && this.dialogue.isPlaying) &&
      actions.justDown('technology')
    ) {
      this.openTechTree();
      return;
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
    if (!this.leaving && this.interactions) {
      if (
        (!this.backpackPanel || !this.backpackPanel.isOpen) &&
        !this.scene.isActive('TechTreeScene')
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
    this._drawObjectiveTarget(time);
  }
}

export default InteriorScene;
