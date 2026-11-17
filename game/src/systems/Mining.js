import Phaser from 'phaser';
import { SaveManager } from '../save.js';
import { depthOf } from '../core/constants.js';
import { ITEMS } from '../data/items.js';
import { actions } from '../core/actions.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { checkSampleConditions, floatText, inventory } from '../core/inventory.js';
import { state } from '../core/state.js';
import { InteractPrompt } from '../ui/InteractPrompt.js';
import { InfoCard } from '../ui/InfoCard.js';
import { UI } from '../ui/theme.js';

const IMPACT_SFX_BY_TYPE = {
  regolith: 'SFX_Impact_Regolith',
  ironrich: 'SFX_Impact_IronBearing_Rock',
  silicate: 'SFX_Impact_Silicate_Rock',
};

const DEBRIS_COLOR_BY_TYPE = {
  regolith: 0xb9bfd6,
  ironrich: 0xb4562e,
  silicate: 0x5ec8ff,
};

export class Mining {
  constructor(scene, player, rocks = []) {
    this.scene = scene;
    this.player = player;
    this.rocks = rocks;
    this.swinging = false;
    this.prompt = new InteractPrompt(scene);
  }

  _getUseToolKeyLabel() {
    const save = SaveManager.get();
    const pair = save?.settings?.keys?.useTool;
    const raw = (Array.isArray(pair) && (pair[0] || pair[1])) || 'J';
    return String(raw).toUpperCase();
  }

  findNearestRock(maxDist = 140) {
    if (!this.player || !Array.isArray(this.rocks)) return null;
    let best = null;
    let bestDist = Infinity;
    for (const rock of this.rocks) {
      if (!rock || rock.hitsLeft <= 0) continue;
      const dist = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        rock.x,
        rock.y
      );
      if (dist <= maxDist && dist < bestDist) {
        bestDist = dist;
        best = rock;
      }
    }
    return best;
  }

  _spawnDebris(x, y, type, count = 6) {
    if (!this.scene || !this.scene.add || !this.scene.tweens) return;
    const color = DEBRIS_COLOR_BY_TYPE[type] || 0xb9bfd6;
    const depth = depthOf(y) + 0.05;

    for (let i = 0; i < count; i += 1) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.55;
      const dist = 22 + Math.random() * 34;
      const rect = this.scene.add
        .rectangle(x, y - 28, 4, 4, color, 1)
        .setDepth(depth);

      this.scene.tweens.add({
        targets: rect,
        x: x + Math.cos(ang) * dist,
        y: y - 28 + Math.sin(ang) * dist + 10,
        alpha: 0,
        duration: 500,
        ease: 'Quad.easeOut',
        onComplete: () => {
          if (rect && rect.scene) rect.destroy();
        },
      });
    }
  }

  _spawnSwingArc() {
    if (!this.scene || !this.player) return;
    let ang = 0;
    if (this.player.facing === 'down') ang = Math.PI / 2;
    else if (this.player.facing === 'up') ang = -Math.PI / 2;
    else if (this.player.facing === 'left') ang = Math.PI;
    else ang = 0;

    const cx = this.player.x + Math.cos(ang) * 24;
    const cy = this.player.y - 64 + Math.sin(ang) * 20;
    const r = 36;
    const pts = [];
    const span = 0.95;
    for (let i = 0; i < 4; i += 1) {
      const a = ang - span + (2 * span * i) / 3;
      pts.push({
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
      });
    }

    const arcGfx = this.scene.add
      .graphics()
      .setDepth(depthOf(this.player.y) + 0.06);
    arcGfx.lineStyle(4, 0xffffff, 0.8);
    arcGfx.beginPath();
    arcGfx.moveTo(pts[0].x, pts[0].y);
    arcGfx.lineTo(pts[1].x, pts[1].y);
    arcGfx.lineTo(pts[2].x, pts[2].y);
    arcGfx.lineTo(pts[3].x, pts[3].y);
    arcGfx.strokePath();

    this.scene.time.delayedCall(150, () => {
      if (arcGfx && arcGfx.scene) {
        arcGfx.destroy();
      }
    });
  }

  _faceRock(rock) {
    if (!this.player || !rock) return;
    const dx = rock.x - this.player.x;
    const dy = rock.y - this.player.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.player.setFacing(dx < 0 ? 'left' : 'right');
    } else {
      this.player.setFacing(dy < 0 ? 'up' : 'down');
    }
  }

  _executeSwing(targetRock) {
    if (!this.player || this.swinging) return false;

    if (state.pickaxe.durability <= 0) {
      audio.play('SFX_Tool_Break');
      floatText(
        this.scene,
        this.player.x,
        this.player.y - 120,
        'Pickaxe is broken',
        UI.red
      );
      return false;
    }

    this.swinging = true;
    this.prompt.hide();
    this.player.canMove = false;
    this.player.interacting = true;
    if (this.player.body) {
      this.player.body.setVelocity(0, 0);
    }

    if (targetRock) {
      this._faceRock(targetRock);
    }

    this.player.setFlipX(this.player.facing === 'left');
    if (this.scene.anims.exists('astro_interact')) {
      this.player.anims.timeScale = 1;
      this.player.play('astro_interact', true);
    }

    audio.play('SFX_Pickaxe_Swing');
    this._spawnSwingArc();

    if (targetRock) {
      this.scene.time.delayedCall(220, () => {
        this._applyImpact(targetRock);
      });
    }

    this.scene.time.delayedCall(450, () => {
      this.swinging = false;
      if (!this.player || !this.player.scene) return;
      this.player.interacting = false;
      const modalOpen =
        InfoCard.isOpen(this.scene) ||
        Boolean(this.scene.backpackPanel && this.scene.backpackPanel.isOpen) ||
        Boolean(this.scene.mapPanel && this.scene.mapPanel.isOpen) ||
        Boolean(this.scene.dialogue && this.scene.dialogue.isPlaying);
      if (
        !modalOpen &&
        !this.scene.exiting &&
        !this.scene.leaving &&
        !this.scene.enteringAirlock &&
        !this.scene.enteringCave
      ) {
        this.player.canMove = true;
      }
      this.player._applyIdleVisual();
    });

    return true;
  }

  _applyImpact(rock) {
    if (!rock || rock.hitsLeft <= 0 || !this.scene) return;

    const prevDur = state.pickaxe.durability;
    state.pickaxe.durability = Math.max(0, prevDur - rock.cost);
    rock.hitsLeft = Math.max(0, rock.hitsLeft - 1);
    if (state.rockHits && typeof state.rockHits === 'object') {
      const key = rock.hitKey !== undefined ? String(rock.hitKey) : String(rock.index);
      state.rockHits[key] = rock.hitsLeft;
    }
    state.save();
    bus.emit('inventory');

    const impactSfx = IMPACT_SFX_BY_TYPE[rock.type] || 'SFX_Impact_Regolith';
    audio.play(impactSfx);

    // 6 debris pixels on every hit
    this._spawnDebris(rock.x, rock.y, rock.type, 6);

    // Rock shake if still standing
    if (rock.hitsLeft > 0 && rock.sprite && rock.sprite.scene) {
      rock.sprite.x = rock.x - 4;
      this.scene.tweens.add({
        targets: rock.sprite,
        x: rock.x + 4,
        duration: 25,
        yoyo: true,
        repeat: 3,
        onComplete: () => {
          if (rock.sprite && rock.sprite.scene) {
            rock.sprite.x = rock.x;
          }
        },
      });
    }

    // Collect sample
    const added = inventory.add(rock.sampleId, 1);
    if (added > 0) {
      this.scene.time.delayedCall(120, () => {
        audio.play('SFX_Resource_Pickup');
      });
      const itemDef = ITEMS[rock.sampleId];
      floatText(
        this.scene,
        rock.x,
        rock.y - 72,
        `+1 ${itemDef ? itemDef.name : 'Sample'}`,
        UI.gold,
        { rise: 50, duration: 900 }
      );
      if (inventory.count(rock.sampleId) <= 5) {
        state.addScore(10, 'sample');
      }
    }

    // Crack at 1 hit left; break at 0 hits left
    if (rock.hitsLeft === 1) {
      audio.play('SFX_Rock_Crack');
      if (rock.sprite && rock.sprite.scene) {
        rock.sprite.setTint(0xb0b0b0);
      }
    } else if (rock.hitsLeft === 0) {
      audio.play('SFX_Rock_Break');
      this.scene.time.delayedCall(150, () => {
        audio.play('SFX_Debris_Fall');
      });
      rock.removeCollider();
      this._spawnDebris(rock.x, rock.y, rock.type, 10);

      if (rock.sprite && rock.sprite.scene) {
        this.scene.tweens.add({
          targets: rock.sprite,
          scaleX: 0.3,
          scaleY: 0.3,
          alpha: 0,
          duration: 300,
          ease: 'Quad.easeIn',
          onComplete: () => {
            if (rock.sprite && rock.sprite.scene) {
              rock.sprite.setVisible(false);
            }
          },
        });
      }
    }

    // Durability warnings
    const newDur = state.pickaxe.durability;
    if (newDur === 0) {
      audio.play('SFX_Tool_Break');
      if (this.player) {
        floatText(
          this.scene,
          this.player.x,
          this.player.y - 120,
          'Pickaxe is broken',
          UI.red
        );
      }
      if (this.scene.nova) {
        this.scene.nova.say('Take it to the Workstation for a repair.', 3000);
      }
    } else if (prevDur > 10 && newDur <= 10) {
      audio.play('SFX_Tool_Durability_Low');
      if (this.scene.nova) {
        this.scene.nova.say('Your pickaxe is getting worn.', 3000);
      }
    }

    // Check sample objective conditions
    checkSampleConditions();
  }

  mineNearest() {
    if (this.swinging) return false;
    const rock = this.findNearestRock(140) || this.findNearestRock(320);
    return this._executeSwing(rock);
  }

  update() {
    const uiBlocked =
      !this.player ||
      !this.player.canMove ||
      this.swinging ||
      InfoCard.isOpen(this.scene) ||
      Boolean(this.scene.backpackPanel && this.scene.backpackPanel.isOpen) ||
      Boolean(this.scene.mapPanel && this.scene.mapPanel.isOpen) ||
      Boolean(this.scene.dialogue && this.scene.dialogue.isPlaying);

    if (uiBlocked) {
      this.prompt.hide();
      // Clear stale mouse-down edge while UI is open
      actions.justDown('useTool');
      return;
    }

    const pickaxeSelected = inventory.selectedItem() === 'basic_pickaxe';
    if (!pickaxeSelected) {
      this.prompt.hide();
      actions.justDown('useTool');
      return;
    }

    const nearest = this.findNearestRock(140);
    if (nearest) {
      this.prompt.show({
        id: `rock_${nearest.hitKey || nearest.index}`,
        x: nearest.x,
        label: 'Mine rock',
        keyLabel: this._getUseToolKeyLabel(),
      });
    } else {
      this.prompt.hide();
    }

    if (actions.justDown('useTool')) {
      if (actions.lastUseToolWasMouse && this.scene.bottomHud) {
        const ptr = this.scene.input.activePointer;
        if (ptr && this.scene.bottomHud.isPointerOverHud(ptr.x, ptr.y)) {
          return;
        }
      }

      if (state.objectiveIndex < 4) {
        floatText(
          this.scene,
          this.player.x,
          this.player.y - 120,
          'Finish the first tasks first',
          UI.gold
        );
        return;
      }

      this._executeSwing(nearest);
    }
  }
}

export default Mining;
