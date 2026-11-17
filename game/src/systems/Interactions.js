import Phaser from 'phaser';
import { actions } from '../core/actions.js';
import { audio } from '../core/audio.js';
import { InteractPrompt } from '../ui/InteractPrompt.js';
import { InfoCard } from '../ui/InfoCard.js';

export class Interactions {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.items = [];
    this.prompt = new InteractPrompt(scene);
  }

  add({
    id,
    x,
    y,
    range = 120,
    label = 'Interact',
    enabled = () => true,
    onInteract = () => {},
  }) {
    const resolvedY =
      y !== undefined ? y : this.player ? this.player.y : 600;
    const item = {
      id,
      x,
      y: resolvedY,
      range,
      label,
      enabled,
      onInteract,
    };
    this.items.push(item);
    return item;
  }

  update() {
    if (
      !this.player ||
      !this.player.canMove ||
      (this.scene && this.scene.dialogue && this.scene.dialogue.isPlaying) ||
      (this.scene && this.scene.backpackPanel && this.scene.backpackPanel.isOpen) ||
      (this.scene && this.scene.mapPanel && this.scene.mapPanel.isOpen) ||
      InfoCard.isOpen(this.scene)
    ) {
      this.prompt.hide();
      return;
    }

    const interactPressed = actions.justDown('interact');

    let nearest = null;
    let bestDist = Infinity;

    for (const item of this.items) {
      if (item.enabled && !item.enabled()) continue;
      const dist = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        item.x,
        item.y
      );
      if (dist <= item.range && dist < bestDist) {
        bestDist = dist;
        nearest = item;
      }
    }

    if (!nearest) {
      this.prompt.hide();
      return;
    }

    const resolvedItem =
      typeof nearest.label === 'function'
        ? { ...nearest, label: nearest.label() }
        : nearest;
    this.prompt.show(resolvedItem);

    const cooldownUntil = this.scene._interactCooldownUntil || 0;
    if (interactPressed && performance.now() >= cooldownUntil) {
      audio.play('SFX_Interact');
      nearest.onInteract();
    }
  }
}

export default Interactions;
