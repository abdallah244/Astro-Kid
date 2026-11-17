import { ITEMS } from '../data/items.js';
import { audio } from './audio.js';
import { bus } from './events.js';
import { state } from './state.js';
import { UI, registerUi } from '../ui/theme.js';

function getActiveScene() {
  if (typeof window !== 'undefined' && window.__astro && window.__astro.scene) {
    const sc = window.__astro.scene;
    if (sc && sc.add && sc.tweens) return sc;
  }
  return null;
}

export function floatText(scene, x, y, text, color = UI.gold, opts = {}) {
  const targetScene = scene || getActiveScene();
  if (!targetScene || !targetScene.add || !targetScene.tweens) return null;

  const txt = targetScene.add
    .text(x, y, String(text ?? ''), {
      fontFamily: UI.font,
      fontStyle: '700',
      fontSize: '22px',
      color: color || UI.gold,
      stroke: '#070a1c',
      strokeThickness: 4,
    })
    .setOrigin(0.5, 0.5)
    .setDepth(opts.depth ?? 130);

  if (opts.scrollFactor !== undefined) {
    txt.setScrollFactor(opts.scrollFactor);
  }

  registerUi(targetScene, txt);

  const rise = opts.rise ?? 50;
  const duration = opts.duration ?? 900;

  targetScene.tweens.add({
    targets: txt,
    y: y - rise,
    alpha: 0,
    duration,
    ease: 'Cubic.easeOut',
    onComplete: () => {
      if (txt && txt.scene) {
        txt.destroy();
      }
    },
  });

  return txt;
}

export function checkSampleConditions() {
  if (inventory.count('lunar_regolith_sample') >= 5) {
    state.set('regolith_samples_5');
  }
  if (inventory.count('ilmenite_bearing_basalt_sample') >= 5) {
    state.set('ilmenite_samples_5');
  }
  if (inventory.count('silicate_rich_rock_sample') >= 5) {
    state.set('silicate_samples_5');
  }
}

export const inventory = {
  add(id, n = 1) {
    const def = ITEMS[id];
    const requested = Math.max(0, Math.floor(Number(n) || 0));
    if (!def || requested <= 0) return 0;

    if (def.kind === 'tool') {
      const existingHotbar = state.hotbar.indexOf(id);
      if (existingHotbar !== -1) return 0;
      const emptyHotbar = state.hotbar.indexOf(null);
      if (emptyHotbar !== -1) {
        state.hotbar[emptyHotbar] = id;
        state.save();
        bus.emit('inventory');
        return 1;
      }
      audio.play('SFX_Inventory_Full');
      return 0;
    }

    let remaining = requested;
    const maxStack = def.stack || 1;

    // 1. Fill existing stacks of the same item up to maxStack
    for (let i = 0; i < state.bag.length && remaining > 0; i += 1) {
      const slot = state.bag[i];
      if (slot && slot.id === id && slot.n < maxStack) {
        const addable = Math.min(maxStack - slot.n, remaining);
        slot.n += addable;
        remaining -= addable;
      }
    }

    // 2. Fill empty bag slots
    for (let i = 0; i < state.bag.length && remaining > 0; i += 1) {
      if (state.bag[i] === null) {
        const addable = Math.min(maxStack, remaining);
        state.bag[i] = { id, n: addable };
        remaining -= addable;
      }
    }

    const added = requested - remaining;
    state.save();
    bus.emit('inventory');

    if (added > 0 && def.kind === 'sample') {
      checkSampleConditions();
    }

    if (added < requested) {
      audio.play('SFX_Inventory_Full');
      const sc = getActiveScene();
      if (sc) {
        if (sc.backpackPanel && sc.backpackPanel.isOpen) {
          floatText(sc, 640, 120, 'Backpack full', UI.red, {
            scrollFactor: 0,
            depth: 160,
          });
        } else if (sc.player) {
          floatText(
            sc,
            sc.player.x,
            sc.player.y - 120,
            'Backpack full',
            UI.red
          );
        }
      }
    }

    return added;
  },

  remove(id, n = 1) {
    const needed = Math.max(0, Math.floor(Number(n) || 0));
    if (needed === 0) return true;
    if (this.count(id) < needed) return false;

    let remaining = needed;
    for (let i = state.bag.length - 1; i >= 0 && remaining > 0; i -= 1) {
      const slot = state.bag[i];
      if (slot && slot.id === id) {
        const take = Math.min(slot.n, remaining);
        slot.n -= take;
        remaining -= take;
        if (slot.n <= 0) {
          state.bag[i] = null;
        }
      }
    }

    state.save();
    bus.emit('inventory');
    return true;
  },

  count(id) {
    if (!id) return 0;
    if (id === 'flashlight' || id === 'basic_pickaxe') {
      return state.hotbar.includes(id) ? 1 : 0;
    }
    let total = 0;
    for (const slot of state.bag) {
      if (slot && slot.id === id) {
        total += slot.n;
      }
    }
    return total;
  },

  usedSlots() {
    let used = 0;
    for (const slot of state.bag) {
      if (slot) used += 1;
    }
    return used;
  },

  use(slotIndex) {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= state.bag.length) {
      return false;
    }
    const slot = state.bag[slotIndex];
    if (!slot) return false;

    const def = ITEMS[slot.id];
    if (!def || def.kind !== 'use' || !def.use) return false;

    let sfxId = 'SFX_Interact';
    let msg = '';
    let color = UI.gold;

    if (def.use.oxygen) {
      state.vitals.oxygen = Math.max(
        0,
        Math.min(100, state.vitals.oxygen + def.use.oxygen)
      );
      sfxId = 'SFX_Interact';
      msg = `+${def.use.oxygen} Oxygen`;
      color = UI.cyan;
    } else if (def.use.hunger) {
      state.vitals.hunger = Math.max(
        0,
        Math.min(100, state.vitals.hunger + def.use.hunger)
      );
      sfxId = 'SFX_Resource_Pickup';
      msg = `+${def.use.hunger} Hunger`;
      color = UI.greenCss;
    } else if (def.use.flashlight) {
      state.flashlight.charge = 100;
      state.flags.flashlight_low_warned = false;
      sfxId = 'SFX_Battery_Connect';
      msg = 'Flashlight recharged';
      color = UI.gold;
    }

    slot.n -= 1;
    if (slot.n <= 0) {
      state.bag[slotIndex] = null;
    }

    state.save();
    bus.emit('inventory');
    audio.play(sfxId);

    const sc = getActiveScene();
    if (sc && msg) {
      if (sc.backpackPanel && sc.backpackPanel.isOpen) {
        floatText(sc, 940, 470, msg, color, {
          scrollFactor: 0,
          depth: 160,
        });
      } else if (sc.player) {
        floatText(sc, sc.player.x, sc.player.y - 120, msg, color);
      }
    }

    return true;
  },

  move(fromSlot, toSlot) {
    if (
      !Number.isInteger(fromSlot) ||
      !Number.isInteger(toSlot) ||
      fromSlot < 0 ||
      fromSlot >= state.bag.length ||
      toSlot < 0 ||
      toSlot >= state.bag.length ||
      fromSlot === toSlot
    ) {
      return false;
    }

    const src = state.bag[fromSlot];
    if (!src) return false;

    const dst = state.bag[toSlot];
    if (!dst) {
      state.bag[toSlot] = src;
      state.bag[fromSlot] = null;
    } else if (dst.id === src.id) {
      const maxStack = ITEMS[src.id]?.stack || 1;
      const space = maxStack - dst.n;
      if (space > 0) {
        const moved = Math.min(space, src.n);
        dst.n += moved;
        src.n -= moved;
        if (src.n <= 0) {
          state.bag[fromSlot] = null;
        }
      } else {
        state.bag[toSlot] = src;
        state.bag[fromSlot] = dst;
      }
    } else {
      state.bag[toSlot] = src;
      state.bag[fromSlot] = dst;
    }

    state.save();
    bus.emit('inventory');
    return true;
  },

  selectedItem() {
    return state.hotbar[state.selected] || null;
  },
};

export default inventory;
