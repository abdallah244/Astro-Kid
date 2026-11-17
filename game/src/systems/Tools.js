import Phaser from 'phaser';
import { depthOf } from '../core/constants.js';
import { ITEMS } from '../data/items.js';
import { actions } from '../core/actions.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { floatText, inventory } from '../core/inventory.js';
import { state } from '../core/state.js';
import { InfoCard } from '../ui/InfoCard.js';
import { UI } from '../ui/theme.js';

export class Tools {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this._saveAccum = 0;

    // Flashlight beam graphics (additive blend)
    this.beamGfx = scene.add
      .graphics()
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(depthOf(player.y) + 0.02);

    // Held-item icon next to player (44x44)
    this.heldIcon = scene.add
      .image(player.x + 34, player.y - 70, 'icon_flashlight')
      .setDisplaySize(44, 44)
      .setDepth(depthOf(player.y) + 0.01)
      .setVisible(false);

    this._syncHeldIcon();

    this._onInventory = () => {
      this._syncHeldIcon();
    };
    bus.on('inventory', this._onInventory);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off('inventory', this._onInventory);
    });
  }

  current() {
    return inventory.selectedItem();
  }

  onSlotChanged(_prevIndex, _nextIndex) {
    const item = this.current();
    this._syncHeldIcon();

    if (item === 'basic_pickaxe') {
      const wasSet = state.has('pickaxe_equipped');
      state.set('pickaxe_equipped');
      if (!wasSet) {
        audio.play('SFX_Interact');
      }

      if (state.objectiveIndex === 3 && !state.flags.talked_obj04b) {
        this._playObj04bWhenReady();
      }
    }
  }

  _playObj04bWhenReady() {
    if (!this.scene || state.flags.talked_obj04b) return;
    if (
      InfoCard.isOpen(this.scene) ||
      (this.scene.backpackPanel && this.scene.backpackPanel.isOpen) ||
      (this.scene.dialogue && this.scene.dialogue.isPlaying)
    ) {
      if (this.scene.time) {
        this.scene.time.delayedCall(250, () => this._playObj04bWhenReady());
      }
      return;
    }
    state.setFlag('talked_obj04b', true);
    if (this.scene.dialogue) {
      this.scene.dialogue.play(['obj04_nova2', 'obj04_astronaut2'], {
        player: this.player,
      });
    }
  }

  toggleFlashlight() {
    if (state.flashlight.on) {
      state.flashlight.on = false;
      state.save();
      bus.emit('inventory');
      audio.play('SFX_Flashlight_Off');
      return false;
    }

    if (state.flashlight.charge <= 0) {
      audio.play('SFX_Error');
      if (this.player) {
        floatText(
          this.scene,
          this.player.x,
          this.player.y - 120,
          'Battery empty',
          UI.red
        );
      }
      return false;
    }

    state.flashlight.on = true;
    if (state.flashlight.charge > 25) {
      state.flags.flashlight_low_warned = false;
    }
    state.set('flashlight_equipped');
    state.save();
    bus.emit('inventory');
    audio.play('SFX_Flashlight_On');
    return true;
  }

  _syncHeldIcon() {
    if (!this.heldIcon || !this.player) return;
    const item = this.current();
    const def = item ? ITEMS[item] : null;
    if (def && this.scene.textures.exists(def.icon)) {
      this.heldIcon.setTexture(def.icon);
      this.heldIcon.setDisplaySize(44, 44);
      this.heldIcon.setVisible(true);
    } else {
      this.heldIcon.setVisible(false);
    }
  }

  _facingAngleRad() {
    if (!this.player) return 0;
    switch (this.player.facing) {
      case 'down':
        return Math.PI / 2;
      case 'up':
        return -Math.PI / 2;
      case 'left':
        return Math.PI;
      case 'right':
      default:
        return 0;
    }
  }

  _drawBeam(time) {
    this.beamGfx.clear();
    if (!state.flashlight.on || !this.player) return;

    const low = state.flashlight.charge <= 25;
    const blinkFactor = low
      ? Math.floor((time || 0) / 300) % 2 === 0
        ? 1
        : 0.45
      : 1;

    const ox = this.player.x;
    const oy = this.player.y - 70;
    const baseDepth = depthOf(this.player.y);
    this.beamGfx.setDepth(baseDepth + 0.02);

    // Soft circle radius 90 around the player (fill 0xfff2b0, alpha 0.08)
    this.beamGfx.fillStyle(0xfff2b0, 0.08 * blinkFactor);
    this.beamGfx.fillCircle(ox, oy, 90);

    // Cone: angle 56 deg (half = 28 deg), length 320 px, 6 nested triangles with alphas 0.05..0.14
    const centerAng = this._facingAngleRad();
    const fullHalfRad = Phaser.Math.DegToRad(28);
    const layers = 6;

    for (let i = 0; i < layers; i += 1) {
      const t = i / (layers - 1); // 0 (outermost) .. 1 (innermost)
      const alpha = (0.05 + t * (0.14 - 0.05)) * blinkFactor;
      const halfAng = fullHalfRad * (1 - t * 0.58);
      const len = 320 * (1 - t * 0.25);

      const x1 = ox + Math.cos(centerAng - halfAng) * len;
      const y1 = oy + Math.sin(centerAng - halfAng) * len;
      const x2 = ox + Math.cos(centerAng + halfAng) * len;
      const y2 = oy + Math.sin(centerAng + halfAng) * len;

      this.beamGfx.fillStyle(0xfff2b0, alpha);
      this.beamGfx.fillTriangle(ox, oy, x1, y1, x2, y2);
    }
  }

  update(time, delta) {
    if (!this.player) return;
    const dt = Math.min(Math.max(delta || 0, 0) / 1000, 0.1);

    // Toggle flashlight on F when no modal/dialogue is blocking input
    const uiBlocked =
      InfoCard.isOpen(this.scene) ||
      Boolean(this.scene.backpackPanel && this.scene.backpackPanel.isOpen) ||
      Boolean(this.scene.mapPanel && this.scene.mapPanel.isOpen) ||
      Boolean(this.scene.dialogue && this.scene.dialogue.isPlaying);

    if (!uiBlocked && actions.justDown('flashlight')) {
      this.toggleFlashlight();
    }

    // Drain 1 point every 6 seconds while on
    if (state.flashlight.on) {
      const prevCharge = state.flashlight.charge;
      const nextCharge = Math.max(0, prevCharge - dt / 6);
      state.flashlight.charge = nextCharge;

      if (
        nextCharge > 0 &&
        nextCharge <= 25 &&
        (prevCharge > 25 || !state.flags.flashlight_low_warned)
      ) {
        state.setFlag('flashlight_low_warned', true);
        audio.play('SFX_Flashlight_Low_Battery');
        if (this.scene.nova) {
          this.scene.nova.say('Flashlight battery is low.', 3000);
        }
      }

      if (nextCharge <= 0) {
        state.flashlight.charge = 0;
        state.flashlight.on = false;
        state.save();
        bus.emit('inventory');
        audio.play('SFX_Flashlight_Off');
      } else {
        this._saveAccum += dt;
        if (this._saveAccum >= 1.0) {
          this._saveAccum = 0;
          state.save();
        }
      }
    }

    // Position held-item icon at (player.x + player.facingX * 34, player.y - 70)
    this._syncHeldIcon();
    if (this.heldIcon.visible) {
      const facingSign = this.player.facingX || 1;
      this.heldIcon.setPosition(
        this.player.x + facingSign * 34,
        this.player.y - 70
      );
      this.heldIcon.setFlipX(facingSign < 0);
      this.heldIcon.setDepth(depthOf(this.player.y) + 0.01);
    }

    this._drawBeam(time);
  }
}

export default Tools;
