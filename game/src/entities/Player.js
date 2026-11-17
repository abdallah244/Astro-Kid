import Phaser from 'phaser';
import {
  ACCEL,
  FRICTION,
  PLAYER_SCALE,
  PLAYER_START,
  RUN_SPEED,
  TURN_ACCEL,
  WALK_SPEED,
  depthOf,
} from '../core/constants.js';
import { actions } from '../core/actions.js';
import { audio } from '../core/audio.js';
import { state } from '../core/state.js';

export function ensurePlayerAnimations(scene) {
  if (
    scene.textures.exists('astro_idle') &&
    !scene.anims.exists('idle_down')
  ) {
    scene.anims.create({
      key: 'idle_down',
      frames: scene.anims.generateFrameNumbers('astro_idle', {
        start: 0,
        end: 1,
      }),
      frameRate: 1.8,
      repeat: -1,
    });
  }

  if (
    scene.textures.exists('astro_down') &&
    !scene.anims.exists('walk_down')
  ) {
    scene.anims.create({
      key: 'walk_down',
      frames: scene.anims.generateFrameNumbers('astro_down', {
        start: 0,
        end: 3,
      }),
      frameRate: 8,
      repeat: -1,
    });
  }

  if (scene.textures.exists('astro_up') && !scene.anims.exists('walk_up')) {
    scene.anims.create({
      key: 'walk_up',
      frames: scene.anims.generateFrameNumbers('astro_up', {
        start: 0,
        end: 3,
      }),
      frameRate: 8,
      repeat: -1,
    });
  }

  if (
    scene.textures.exists('astro_walk') &&
    !scene.anims.exists('walk_side')
  ) {
    scene.anims.create({
      key: 'walk_side',
      frames: scene.anims.generateFrameNumbers('astro_walk', {
        start: 0,
        end: 3,
      }),
      frameRate: 8,
      repeat: -1,
    });
  }

  if (
    scene.textures.exists('astro_interact') &&
    !scene.anims.exists('astro_interact')
  ) {
    scene.anims.create({
      key: 'astro_interact',
      frames: scene.anims.generateFrameNumbers('astro_interact', {
        start: 0,
        end: 2,
      }),
      frameRate: 8,
      repeat: 0,
    });
  }
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x = PLAYER_START.x, y = PLAYER_START.y) {
    super(scene, x, y, 'astro_idle', 0);

    ensurePlayerAnimations(scene);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 1);
    this.setScale(PLAYER_SCALE);
    this.setDepth(depthOf(y));

    // Foot collider box (40 x 24 frame pixels, offset (42, 141))
    this.body.setSize(40, 24);
    this.body.setOffset(42, 141);
    this.body.setCollideWorldBounds(false);
    this.body.setAllowGravity(false);
    this.body.setGravity(0, 0);
    this.body.setMaxVelocity(RUN_SPEED * 1.5, RUN_SPEED * 1.5);

    this.state = 'idle';
    this.canMove = true;
    this.interacting = false;
    this.facing = 'down';
    this.facingX = 1;
    this.surface = 'regolith';
    this._bounds = null;
    this._lastStepAt = 0;
    this._lastCaveVariant = 0;
    this._below20Ms = 80;
    this._exhausted = state.vitals.stamina <= 0;
    this._staminaSaveAccum = 0;

    this._floatX = x;
    this._floatY = y;
    this._snappedX = Math.round(x);
    this._snappedY = Math.round(y);
    this._hasSnap = false;

    // Shadow ellipse under feet
    this.shadow = scene.add
      .ellipse(Math.round(this.x), Math.round(this.y), 70, 14, 0x000000, 0.35)
      .setDepth(depthOf(this.y) - 0.01);

    if (scene.anims.exists('idle_down')) {
      this.play('idle_down');
    }

    this._onPreUpdate = () => {
      if (
        this._hasSnap &&
        this.x === this._snappedX &&
        this.y === this._snappedY
      ) {
        this.x = this._floatX;
        this.y = this._floatY;
      }
      this._hasSnap = false;
    };

    this._onPostUpdate = () => {
      if (!this.active) return;
      this._floatX = this.x;
      this._floatY = this.y;
      this._snappedX = Math.round(this.x);
      this._snappedY = Math.round(this.y);
      this._hasSnap = true;
      this.x = this._snappedX;
      this.y = this._snappedY;
      this._syncDepthAndShadow();
    };

    if (scene.events) {
      scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, this._onPreUpdate);
      scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this._onPostUpdate);
    }

    const cleanupListeners = () => {
      if (scene && scene.events) {
        scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, this._onPreUpdate);
        scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this._onPostUpdate);
      }
    };

    if (scene.events) {
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupListeners);
    }

    this.once('destroy', () => {
      cleanupListeners();
      if (this.shadow) {
        this.shadow.destroy();
        this.shadow = null;
      }
    });
  }

  setBounds(x1, y1, x2, y2) {
    this._bounds = { x1, y1, x2, y2 };
    this._clampFeetToBounds();
    return this;
  }

  setFacing(dir) {
    if (dir === 'left' || dir === 'right' || dir === 'up' || dir === 'down') {
      this.facing = dir;
      if (dir === 'left') this.facingX = -1;
      if (dir === 'right') this.facingX = 1;
      if (!this.interacting) {
        this._applyIdleVisual();
      }
    }
    return this;
  }

  stopMotion() {
    this.canMove = false;
    if (this.body) {
      this.body.setVelocity(0, 0);
    }
    this._below20Ms = 80;
    this.state = 'idle';
    if (!this.interacting) {
      this._applyIdleVisual();
    }
    return this;
  }

  teleport(x, y) {
    this._hasSnap = false;
    this.setPosition(x, y);
    if (this._bounds) {
      if (this.x < this._bounds.x1) this.x = this._bounds.x1;
      if (this.x > this._bounds.x2) this.x = this._bounds.x2;
      if (this.y < this._bounds.y1) this.y = this._bounds.y1;
      if (this.y > this._bounds.y2) this.y = this._bounds.y2;
    }
    this._floatX = this.x;
    this._floatY = this.y;
    if (this.body) {
      this.body.updateFromGameObject();
      this.body.setVelocity(0, 0);
    }
    this._syncDepthAndShadow();
  }

  _clampFeetToBounds() {
    if (!this._bounds) return;
    const { x1, y1, x2, y2 } = this._bounds;
    let clamped = false;
    let vx = this.body ? this.body.velocity.x : 0;
    let vy = this.body ? this.body.velocity.y : 0;

    if (this.x < x1) {
      this.x = x1;
      if (vx < 0) vx = 0;
      clamped = true;
    } else if (this.x > x2) {
      this.x = x2;
      if (vx > 0) vx = 0;
      clamped = true;
    }

    if (this.y < y1) {
      this.y = y1;
      if (vy < 0) vy = 0;
      clamped = true;
    } else if (this.y > y2) {
      this.y = y2;
      if (vy > 0) vy = 0;
      clamped = true;
    }

    if (clamped && this.body) {
      this._hasSnap = false;
      this._floatX = this.x;
      this._floatY = this.y;
      this.body.updateFromGameObject();
      this.body.setVelocity(vx, vy);
    }
  }

  _syncDepthAndShadow() {
    const d = depthOf(this.y);
    this.setDepth(d);
    if (this.shadow) {
      this.shadow.setPosition(Math.round(this.x), Math.round(this.y));
      this.shadow.setDepth(Math.round((d - 0.01) * 100) / 100);
    }
  }

  _updateFacingFromInput(dx, dy) {
    if (dx === 0 && dy === 0) return;

    if (dx < 0) this.facingX = -1;
    else if (dx > 0) this.facingX = 1;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX > absY) {
      this.facing = dx < 0 ? 'left' : 'right';
    } else if (absY > absX) {
      this.facing = dy < 0 ? 'up' : 'down';
    } else {
      // Tie (diagonal): keep previous facing if it matches one of the active axes
      const matchesPrev =
        (this.facing === 'left' && dx < 0) ||
        (this.facing === 'right' && dx > 0) ||
        (this.facing === 'up' && dy < 0) ||
        (this.facing === 'down' && dy > 0);
      if (!matchesPrev) {
        this.facing = dx < 0 ? 'left' : 'right';
      }
    }
  }

  _applyIdleVisual() {
    this.anims.timeScale = 1;
    if (this.facing === 'down') {
      this.setFlipX(false);
      if (
        !this.anims.isPlaying ||
        !this.anims.currentAnim ||
        this.anims.currentAnim.key !== 'idle_down'
      ) {
        this.play('idle_down', true);
      }
    } else if (this.facing === 'up') {
      if (this.anims.isPlaying) {
        this.anims.stop();
      }
      this.setFlipX(false);
      this.setTexture('astro_up', 0);
    } else {
      if (this.anims.isPlaying) {
        this.anims.stop();
      }
      this.setFlipX(this.facing === 'left');
      this.setTexture('astro_walk', 0);
    }
  }

  _applyWalkVisual(currentSpeed) {
    let animKey = 'walk_down';
    if (this.facing === 'up') {
      this.setFlipX(false);
      animKey = 'walk_up';
    } else if (this.facing === 'left' || this.facing === 'right') {
      this.setFlipX(this.facing === 'left');
      animKey = 'walk_side';
    } else {
      this.setFlipX(false);
      animKey = 'walk_down';
    }

    if (
      !this.anims.isPlaying ||
      !this.anims.currentAnim ||
      this.anims.currentAnim.key !== animKey
    ) {
      this.play(animKey, true);
    }

    const rate = Phaser.Math.Clamp(
      8 * ((currentSpeed || WALK_SPEED) / WALK_SPEED),
      6,
      12
    );
    this.anims.timeScale = 1;
    this.anims.msPerFrame = 1000 / rate;
  }

  _playCaveFootstep() {
    const candidates = [1, 2, 3].filter((n) => n !== this._lastCaveVariant);
    const pick = candidates[Math.floor(Math.random() * candidates.length)] || 1;
    this._lastCaveVariant = pick;
    const key = `SFX_Footstep_Regolith_0${pick}`;
    audio.play(key, { gain: 0.5 });
    if (this.scene && this.scene.time) {
      this.scene.time.delayedCall(140, () => {
        if (this.scene && this.active) {
          audio.play(key, { gain: 0.18 });
        }
      });
    }
  }

  update(time, delta) {
    const dt = Math.min(Math.max(delta || 0, 0) / 1000, 0.1);

    // Clamp position after physics step (keeping free axis moving)
    this._clampFeetToBounds();

    let rawDx = 0;
    let rawDy = 0;
    let runHeld = false;

    if (this.canMove) {
      const left = actions.isDown('left') ? 1 : 0;
      const right = actions.isDown('right') ? 1 : 0;
      const up = actions.isDown('up') ? 1 : 0;
      const down = actions.isDown('down') ? 1 : 0;
      runHeld = actions.isDown('run');
      rawDx = right - left;
      rawDy = down - up;
    }

    const hasInput = rawDx !== 0 || rawDy !== 0;
    let dirX = rawDx;
    let dirY = rawDy;
    if (rawDx !== 0 && rawDy !== 0) {
      const inv = 1 / Math.hypot(rawDx, rawDy);
      dirX *= inv;
      dirY *= inv;
    }

    // Facing changes ONLY when input direction changes
    if (hasInput) {
      this._updateFacingFromInput(rawDx, rawDy);
    }

    if (this._exhausted && state.vitals.stamina >= 15) {
      this._exhausted = false;
    }
    const effectiveRun =
      runHeld && !this._exhausted && state.vitals.stamina > 0;

    const speed = effectiveRun ? RUN_SPEED : WALK_SPEED;
    const targetVx = hasInput ? dirX * speed : 0;
    const targetVy = hasInput ? dirY * speed : 0;

    let vx = this.body.velocity.x;
    let vy = this.body.velocity.y;

    const dot = dirX * vx + dirY * vy;
    const accelRate = hasInput ? (dot < 0 ? TURN_ACCEL : ACCEL) : FRICTION;
    const maxStep = accelRate * dt;

    const dvx = targetVx - vx;
    const dvy = targetVy - vy;
    const dvLen = Math.hypot(dvx, dvy);

    if (dvLen <= maxStep || dvLen === 0) {
      vx = targetVx;
      vy = targetVy;
    } else {
      vx += (dvx / dvLen) * maxStep;
      vy += (dvy / dvLen) * maxStep;
    }

    // Snap velocity to 0 below 12 px/s when stopping
    if (!hasInput && Math.hypot(vx, vy) < 12) {
      vx = 0;
      vy = 0;
    }

    // Zero only the blocked axis pushing beyond bounds (keep free axis moving)
    if (this._bounds) {
      if (this.x <= this._bounds.x1 && vx < 0) vx = 0;
      if (this.x >= this._bounds.x2 && vx > 0) vx = 0;
      if (this.y <= this._bounds.y1 && vy < 0) vy = 0;
      if (this.y >= this._bounds.y2 && vy > 0) vy = 0;
    }

    this.body.setVelocity(vx, vy);

    const curSpeed = Math.hypot(vx, vy);
    const movingForStamina = curSpeed >= 12;

    // Vitals stamina drain (12/s when running & moving) and recovery (8/s when idle or walking)
    const prevStamina = state.vitals.stamina;
    if (effectiveRun && movingForStamina && hasInput) {
      state.vitals.stamina = Math.max(0, prevStamina - 12 * dt);
      if (state.vitals.stamina <= 0) {
        state.vitals.stamina = 0;
        this._exhausted = true;
      }
    } else if (prevStamina < 100) {
      state.vitals.stamina = Math.min(100, prevStamina + 8 * dt);
      if (this._exhausted && state.vitals.stamina >= 15) {
        this._exhausted = false;
      }
    }
    if (Math.abs(state.vitals.stamina - prevStamina) > 0.0001) {
      this._staminaSaveAccum += dt;
      if (this._staminaSaveAccum >= 1.0) {
        this._staminaSaveAccum = 0;
        state.save();
      }
    }

    if (this.interacting) {
      if (this.body) {
        this.body.setVelocity(0, 0);
      }
      this._syncDepthAndShadow();
      return;
    }

    // Walk <-> Idle state with 80 ms hysteresis below 20 px/s
    if (curSpeed >= 20 || (hasInput && curSpeed >= 12)) {
      this._below20Ms = 0;
      this.state = 'walk';
    } else if (this.state === 'walk') {
      this._below20Ms += Math.max(0, delta || 0);
      if (this._below20Ms >= 80) {
        this.state = 'idle';
      }
    } else {
      this.state = 'idle';
    }

    if (this.state === 'walk') {
      this._applyWalkVisual(curSpeed);

      if (curSpeed >= 12) {
        const now = time || performance.now();
        const stepInterval = effectiveRun ? 190 : 280;
        if (now - this._lastStepAt >= stepInterval) {
          this._lastStepAt = now;
          if (this.surface === 'metal') {
            audio.playFromList(
              [
                'SFX_Footstep_Metal',
                'SFX_Footstep_Metal_02',
                'SFX_Footstep_Metal_03',
              ],
              { gain: 0.7 }
            );
          } else if (this.surface === 'cave') {
            this._playCaveFootstep();
          } else {
            audio.playVariant('SFX_Footstep_Regolith', 3, { gain: 0.7 });
          }
        }
      }
    } else {
      this._applyIdleVisual();
    }

    this._syncDepthAndShadow();
  }
}

export default Player;
