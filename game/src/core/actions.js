import Phaser from 'phaser';
import { DEFAULT_KEYS, SaveManager } from '../save.js';

const FIXED_HOTBAR_KEYS = [
  ['hotbar1', 'ONE'],
  ['hotbar2', 'TWO'],
  ['hotbar3', 'THREE'],
  ['hotbar4', 'FOUR'],
  ['hotbar5', 'FIVE'],
  ['hotbar6', 'SIX'],
  ['hotbar7', 'SEVEN'],
  ['hotbar8', 'EIGHT'],
  ['hotbar9', 'NINE'],
];

function cloneKeysMap(source) {
  const out = {};
  for (const action of Object.keys(DEFAULT_KEYS)) {
    const pair = source && Array.isArray(source[action]) ? source[action] : DEFAULT_KEYS[action];
    out[action] = [pair[0] || null, pair[1] || null];
  }
  return out;
}

class ActionsManager {
  constructor() {
    this.scene = null;
    this._boundKeys = new Map();
    this._mouseFrame = -1;
    this._mousePrevDown = false;
    this._mouseCurrDown = false;
    this._mouseJustDown = false;
    this._mouseJustUp = false;
    this._wheelDelta = 0;
    this._onWheel = null;
    this.lastUseToolWasMouse = false;
  }

  init(scene) {
    this._clearBoundKeys();
    this._detachWheel();
    this.scene = scene;
    this._mouseFrame = -1;
    this._mousePrevDown = false;
    this._mouseCurrDown = false;
    this._mouseJustDown = false;
    this._mouseJustUp = false;
    this._wheelDelta = 0;
    this.lastUseToolWasMouse = false;

    this._rebuildKeys();

    if (scene && scene.input) {
      this._onWheel = (_pointer, _currentlyOver, deltaX, deltaY) => {
        const raw = deltaY !== 0 ? deltaY : deltaX;
        if (raw > 0) this._wheelDelta = 1;
        else if (raw < 0) this._wheelDelta = -1;
      };
      scene.input.on('wheel', this._onWheel);
    }

    if (scene && scene.events) {
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        if (this.scene === scene) {
          this._clearBoundKeys();
          this._detachWheel();
          this.scene = null;
        }
      });
    }
  }

  _detachWheel() {
    if (this.scene && this.scene.input && this._onWheel) {
      try {
        this.scene.input.off('wheel', this._onWheel);
      } catch {
        // Ignore cleanup errors
      }
    }
    this._onWheel = null;
    this._wheelDelta = 0;
  }

  _clearBoundKeys() {
    if (this.scene && this.scene.input && this.scene.input.keyboard) {
      for (const pair of this._boundKeys.values()) {
        for (const keyObj of pair) {
          if (keyObj) {
            try {
              this.scene.input.keyboard.removeKey(keyObj, true);
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      }
    }
    this._boundKeys.clear();
  }

  _rebuildKeys() {
    this._clearBoundKeys();
    if (!this.scene || !this.scene.input || !this.scene.input.keyboard) return;

    const save = SaveManager.get();
    const keysMap = cloneKeysMap(save.settings.keys);

    for (const [actionName, slots] of Object.entries(keysMap)) {
      const pair = [null, null];
      for (let i = 0; i < 2; i += 1) {
        const keyName = slots[i];
        if (typeof keyName === 'string' && keyName.length > 0) {
          const upper = keyName.toUpperCase();
          const code = Phaser.Input.Keyboard.KeyCodes[upper] ?? upper;
          pair[i] = this.scene.input.keyboard.addKey(code);
        }
      }
      this._boundKeys.set(actionName, pair);
    }

    for (const [fixedName, codeName] of FIXED_HOTBAR_KEYS) {
      const code = Phaser.Input.Keyboard.KeyCodes[codeName] ?? codeName;
      this._boundKeys.set(fixedName, [
        this.scene.input.keyboard.addKey(code),
        null,
      ]);
    }
  }

  _syncMouseFrame() {
    if (!this.scene || !this.scene.input || !this.scene.game) return;
    const frame = this.scene.game.loop ? this.scene.game.loop.frame : 0;
    if (frame === this._mouseFrame) return;

    this._mouseFrame = frame;
    const pointer = this.scene.input.activePointer;
    const nowDown = Boolean(pointer && pointer.leftButtonDown());
    this._mouseJustDown = nowDown && !this._mousePrevDown;
    this._mouseJustUp = !nowDown && this._mousePrevDown;
    this._mouseCurrDown = nowDown;
    this._mousePrevDown = nowDown;
  }

  isDown(name) {
    const pair = this._boundKeys.get(name);
    const keyHeld = Boolean(
      pair && ((pair[0] && pair[0].isDown) || (pair[1] && pair[1].isDown))
    );
    if (name === 'useTool') {
      this._syncMouseFrame();
      return keyHeld || this._mouseCurrDown;
    }
    return keyHeld;
  }

  justDown(name) {
    const pair = this._boundKeys.get(name);
    const d0 =
      pair && pair[0] ? Phaser.Input.Keyboard.JustDown(pair[0]) : false;
    const d1 =
      pair && pair[1] ? Phaser.Input.Keyboard.JustDown(pair[1]) : false;

    if (name === 'useTool') {
      this._syncMouseFrame();
      const mDown = this._mouseJustDown;
      this._mouseJustDown = false;
      const keyTriggered = d0 || d1;
      this.lastUseToolWasMouse = !keyTriggered && mDown;
      return keyTriggered || mDown;
    }

    return d0 || d1;
  }

  get wheel() {
    return this._wheelDelta;
  }

  consumeWheel() {
    const d = this._wheelDelta;
    this._wheelDelta = 0;
    return d;
  }

  justUp(name) {
    const pair = this._boundKeys.get(name);
    const u0 = pair && pair[0] ? Phaser.Input.Keyboard.JustUp(pair[0]) : false;
    const u1 = pair && pair[1] ? Phaser.Input.Keyboard.JustUp(pair[1]) : false;

    if (name === 'useTool') {
      this._syncMouseFrame();
      const mUp = this._mouseJustUp;
      this._mouseJustUp = false;
      return u0 || u1 || mUp;
    }

    return u0 || u1;
  }

  get useTool() {
    return this.isDown('useTool');
  }

  resetMovementKeys() {
    const moveActions = ['left', 'right', 'up', 'down', 'run'];
    for (const name of moveActions) {
      const pair = this._boundKeys.get(name);
      if (!pair) continue;
      for (const keyObj of pair) {
        if (keyObj && typeof keyObj.reset === 'function') {
          keyObj.reset();
        }
      }
    }
  }

  rebind(name, slot, keyName) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_KEYS, name)) {
      return { ok: false };
    }
    if (slot !== 0 && slot !== 1) {
      return { ok: false };
    }

    const save = SaveManager.get();
    const keysMap = cloneKeysMap(save.settings.keys);
    const normalized =
      keyName === null || keyName === undefined || keyName === ''
        ? null
        : String(keyName).toUpperCase();

    if (normalized !== null) {
      for (const [otherAction, pair] of Object.entries(keysMap)) {
        if (otherAction === name) continue;
        if (pair[0] === normalized || pair[1] === normalized) {
          return { conflict: otherAction };
        }
      }

      const otherSlot = slot === 0 ? 1 : 0;
      if (keysMap[name][otherSlot] === normalized) {
        keysMap[name][otherSlot] = null;
      }
    }

    keysMap[name][slot] = normalized;
    SaveManager.setSetting('keys', keysMap);
    this._rebuildKeys();
    return { ok: true };
  }

  swap(a, slotA, b, slotB) {
    if (
      !Object.prototype.hasOwnProperty.call(DEFAULT_KEYS, a) ||
      !Object.prototype.hasOwnProperty.call(DEFAULT_KEYS, b)
    ) {
      return;
    }
    if ((slotA !== 0 && slotA !== 1) || (slotB !== 0 && slotB !== 1)) {
      return;
    }

    const save = SaveManager.get();
    const keysMap = cloneKeysMap(save.settings.keys);
    const temp = keysMap[a][slotA];
    keysMap[a][slotA] = keysMap[b][slotB];
    keysMap[b][slotB] = temp;

    SaveManager.setSetting('keys', keysMap);
    this._rebuildKeys();
  }

  reset() {
    const restored = cloneKeysMap(DEFAULT_KEYS);
    SaveManager.setSetting('keys', restored);
    this._rebuildKeys();
    return restored;
  }
}

export const actions = new ActionsManager();
export { ActionsManager };
export default actions;
