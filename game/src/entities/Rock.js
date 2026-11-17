import { depthOf } from '../core/constants.js';
import { state } from '../core/state.js';

export const SAMPLE_BY_ROCK_TYPE = {
  regolith: 'lunar_regolith_sample',
  ironrich: 'ilmenite_bearing_basalt_sample',
  silicate: 'silicate_rich_rock_sample',
};

export class Rock {
  constructor(
    scene,
    { index, hitKey, type, x, y, sprite, collider, playerCollider }
  ) {
    this.scene = scene;
    this.index = index;
    this.hitKey = hitKey !== undefined ? String(hitKey) : String(index);
    this.type = type;
    this.x = x;
    this.y = y;
    this.sampleId = SAMPLE_BY_ROCK_TYPE[type] || 'lunar_regolith_sample';
    this.cost = type === 'regolith' ? 1 : 2;
    this.sprite = sprite;
    this.collider = collider;
    this.playerCollider = playerCollider || null;

    const savedHits =
      state.rockHits && typeof state.rockHits === 'object'
        ? state.rockHits[this.hitKey]
        : undefined;
    this.hitsLeft =
      Number.isInteger(savedHits) && savedHits >= 0 && savedHits <= 3
        ? savedHits
        : 3;

    if (this.sprite) {
      this.sprite.setDepth(depthOf(this.y));
    }

    if (this.hitsLeft <= 0) {
      if (this.sprite) {
        this.sprite.setVisible(false);
        this.sprite.setActive(false);
      }
      this.removeCollider();
    } else if (this.hitsLeft === 1 && this.sprite) {
      this.sprite.setTint(0xb0b0b0);
    }
  }

  removeCollider() {
    if (this.playerCollider) {
      if (this.scene && this.scene.physics && this.scene.physics.world) {
        this.scene.physics.world.removeCollider(this.playerCollider);
      }
      this.playerCollider = null;
    }
    if (this.collider) {
      if (this.collider.body) {
        this.collider.body.enable = false;
      }
      this.collider.destroy();
      this.collider = null;
    }
  }
}

export default Rock;
