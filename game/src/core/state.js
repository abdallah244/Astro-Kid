import { bus } from './events.js';
import { OBJECTIVES } from '../data/objectives.js';
import { ITEMS } from '../data/items.js';
import { ROCK_NODES } from './constants.js';

export const L1_STORAGE_KEY = 'astrokid.l1.v1';

const INITIAL_BAG_ORDER = [
  ['oxygen_canister', 3],
  ['canned_food', 5],
  ['battery_cell', 4],
  ['spare_parts_kit', 1],
];

const MIGRATION_ITEM_ORDER = [
  'oxygen_canister',
  'canned_food',
  'battery_cell',
  'spare_parts_kit',
  'lunar_regolith_sample',
  'ilmenite_bearing_basalt_sample',
  'silicate_rich_rock_sample',
];

const INVENTORY_COUNT_KEYS = [
  'lunar_regolith_sample',
  'ilmenite_bearing_basalt_sample',
  'silicate_rich_rock_sample',
  'oxygen_canister',
  'canned_food',
  'battery_cell',
  'spare_parts_kit',
];

export function createDefaultBag() {
  const bag = new Array(24).fill(null);
  INITIAL_BAG_ORDER.forEach(([id, n], idx) => {
    bag[idx] = { id, n };
  });
  return bag;
}

export function createDefaultHotbar() {
  const bar = new Array(9).fill(null);
  bar[0] = 'flashlight';
  bar[1] = 'basic_pickaxe';
  return bar;
}

export function createDefaultStorage() {
  return {
    lunar_regolith_sample: 0,
    ilmenite_bearing_basalt_sample: 0,
    silicate_rich_rock_sample: 0,
    spare_parts_kit: 0,
  };
}

export function createDefaultTech() {
  return {
    processing_researched: false,
    processor_crafted: false,
    processor_installed: false,
  };
}

export function createDefaultRewards() {
  return {
    researchPoints: 0,
    exp: 0,
  };
}

export function createDefaultScoreParts() {
  return {
    objectives: 0,
    samples: 0,
    discovery: 0,
    research: 0,
    craft: 0,
  };
}

function buildBagFromCounts(countsObj) {
  const bag = new Array(24).fill(null);
  let cursor = 0;
  for (const id of MIGRATION_ITEM_ORDER) {
    const def = ITEMS[id];
    if (!def) continue;
    let remaining = Math.max(0, Math.floor(Number(countsObj[id]) || 0));
    while (remaining > 0 && cursor < 24) {
      const n = Math.min(def.stack, remaining);
      bag[cursor] = { id, n };
      cursor += 1;
      remaining -= n;
    }
  }
  return bag;
}

function sanitizeBag(rawBag, rawInventory) {
  if (Array.isArray(rawBag)) {
    const bag = new Array(24).fill(null);
    for (let i = 0; i < 24; i += 1) {
      const entry = rawBag[i];
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        ITEMS[entry.id] &&
        ITEMS[entry.id].kind !== 'tool'
      ) {
        const n = Math.floor(Number(entry.n) || 0);
        if (n > 0) {
          bag[i] = { id: entry.id, n: Math.min(ITEMS[entry.id].stack, n) };
        }
      }
    }
    return bag;
  }

  if (rawInventory && typeof rawInventory === 'object') {
    return buildBagFromCounts(rawInventory);
  }

  return createDefaultBag();
}

function sanitizeHotbar(rawHotbar) {
  if (!Array.isArray(rawHotbar)) {
    return createDefaultHotbar();
  }
  const bar = new Array(9).fill(null);
  for (let i = 0; i < 9; i += 1) {
    const id = rawHotbar[i];
    if (id === 'flashlight' || id === 'basic_pickaxe') {
      bar[i] = id;
    }
  }
  return bar;
}

function sanitizeRockHits(rawHits) {
  const total = ROCK_NODES.length;
  const out = {};
  for (let i = 0; i < total; i += 1) {
    out[String(i)] = 3;
  }
  if (Array.isArray(rawHits)) {
    for (let i = 0; i < total; i += 1) {
      const v = Number(rawHits[i]);
      if (Number.isInteger(v) && v >= 0 && v <= 3) {
        out[String(i)] = v;
      }
    }
  } else if (rawHits && typeof rawHits === 'object') {
    for (const [k, rawVal] of Object.entries(rawHits)) {
      const v = Number(rawVal);
      if (Number.isInteger(v) && v >= 0 && v <= 3) {
        out[String(k)] = v;
      }
    }
  }
  return out;
}

function sanitizeNonNegInt(val, def = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : def;
}

let pendingStartTimer = null;

function clearPendingStartTimer() {
  if (pendingStartTimer !== null) {
    clearTimeout(pendingStartTimer);
    pendingStartTimer = null;
  }
}

export const state = {
  objectiveIndex: 0,
  done: {},
  score: 0,
  lives: 3,
  flags: {},
  bag: createDefaultBag(),
  hotbar: createDefaultHotbar(),
  selected: 0,
  pickaxe: { durability: 30, max: 30 },
  flashlight: { on: false, charge: 100 },
  vitals: { oxygen: 100, stamina: 100, hunger: 85 },
  rockHits: sanitizeRockHits(null),
  storage: createDefaultStorage(),
  tech: createDefaultTech(),
  rewards: createDefaultRewards(),
  playSeconds: 0,
  scoreParts: createDefaultScoreParts(),

  _applyData(raw) {
    if (!raw || typeof raw !== 'object') {
      this.objectiveIndex = 0;
      this.done = {};
      this.score = 0;
      this.lives = 3;
      this.flags = {};
      this.bag = createDefaultBag();
      this.hotbar = createDefaultHotbar();
      this.selected = 0;
      this.pickaxe = { durability: 30, max: 30 };
      this.flashlight = { on: false, charge: 100 };
      this.vitals = { oxygen: 100, stamina: 100, hunger: 85 };
      this.rockHits = sanitizeRockHits(null);
      this.storage = createDefaultStorage();
      this.tech = createDefaultTech();
      this.rewards = createDefaultRewards();
      this.playSeconds = 0;
      this.scoreParts = createDefaultScoreParts();
      return;
    }

    const idx = Number(raw.objectiveIndex);
    this.objectiveIndex =
      Number.isInteger(idx) && idx >= 0 && idx <= OBJECTIVES.length ? idx : 0;

    this.done = {};
    if (raw.done && typeof raw.done === 'object') {
      for (const [k, v] of Object.entries(raw.done)) {
        if (v) this.done[k] = true;
      }
    }

    this.score = sanitizeNonNegInt(raw.score, 0);

    this.lives = Number.isInteger(Number(raw.lives))
      ? Math.max(0, Number(raw.lives))
      : 3;

    this.flags =
      raw.flags && typeof raw.flags === 'object' ? { ...raw.flags } : {};

    this.bag = sanitizeBag(raw.bag, raw.inventory);
    this.hotbar = sanitizeHotbar(raw.hotbar);

    const sel = Number(raw.selected);
    this.selected = Number.isInteger(sel) && sel >= 0 && sel <= 8 ? sel : 0;

    const rawPick =
      raw.pickaxe && typeof raw.pickaxe === 'object' ? raw.pickaxe : {};
    const maxDur = Number.isFinite(Number(rawPick.max))
      ? Math.max(1, Math.floor(Number(rawPick.max)))
      : 30;
    const dur = Number.isFinite(Number(rawPick.durability))
      ? Math.max(0, Math.min(maxDur, Math.floor(Number(rawPick.durability))))
      : 30;
    this.pickaxe = { durability: dur, max: maxDur };

    const rawFlash =
      raw.flashlight && typeof raw.flashlight === 'object' ? raw.flashlight : {};
    const charge = Number.isFinite(Number(rawFlash.charge))
      ? Math.max(0, Math.min(100, Number(rawFlash.charge)))
      : 100;
    const flashOn = Boolean(rawFlash.on) && charge > 0;
    this.flashlight = { on: flashOn, charge };

    const rawVitals =
      raw.vitals && typeof raw.vitals === 'object' ? raw.vitals : {};
    const clampVital = (v, def) =>
      Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Number(v))) : def;
    this.vitals = {
      oxygen: clampVital(rawVitals.oxygen, 100),
      stamina: clampVital(rawVitals.stamina, 100),
      hunger: clampVital(rawVitals.hunger, 85),
    };

    this.rockHits = sanitizeRockHits(raw.rockHits);

    const rawStorage =
      raw.storage && typeof raw.storage === 'object' ? raw.storage : {};
    this.storage = {
      lunar_regolith_sample: sanitizeNonNegInt(
        rawStorage.lunar_regolith_sample,
        0
      ),
      ilmenite_bearing_basalt_sample: sanitizeNonNegInt(
        rawStorage.ilmenite_bearing_basalt_sample,
        0
      ),
      silicate_rich_rock_sample: sanitizeNonNegInt(
        rawStorage.silicate_rich_rock_sample,
        0
      ),
      spare_parts_kit: sanitizeNonNegInt(rawStorage.spare_parts_kit, 0),
    };

    const rawTech = raw.tech && typeof raw.tech === 'object' ? raw.tech : {};
    this.tech = {
      processing_researched: Boolean(rawTech.processing_researched),
      processor_crafted: Boolean(rawTech.processor_crafted),
      processor_installed: Boolean(rawTech.processor_installed),
    };

    const rawRewards =
      raw.rewards && typeof raw.rewards === 'object' ? raw.rewards : {};
    this.rewards = {
      researchPoints: sanitizeNonNegInt(rawRewards.researchPoints, 0),
      exp: sanitizeNonNegInt(rawRewards.exp, 0),
    };

    this.playSeconds = Number.isFinite(Number(raw.playSeconds))
      ? Math.max(0, Number(raw.playSeconds))
      : 0;

    const rawParts =
      raw.scoreParts && typeof raw.scoreParts === 'object'
        ? raw.scoreParts
        : {};
    this.scoreParts = {
      objectives: sanitizeNonNegInt(rawParts.objectives, 0),
      samples: sanitizeNonNegInt(rawParts.samples, 0),
      discovery: sanitizeNonNegInt(rawParts.discovery, 0),
      research: sanitizeNonNegInt(rawParts.research, 0),
      craft: sanitizeNonNegInt(rawParts.craft, 0),
    };
  },

  load() {
    try {
      const raw = window.localStorage.getItem(L1_STORAGE_KEY);
      if (raw) {
        this._applyData(JSON.parse(raw));
      } else {
        this._applyData(null);
      }
    } catch {
      this._applyData(null);
    }
    return this;
  },

  save() {
    try {
      const payload = {
        objectiveIndex: this.objectiveIndex,
        done: this.done,
        score: this.score,
        lives: this.lives,
        flags: this.flags,
        bag: this.bag,
        hotbar: this.hotbar,
        selected: this.selected,
        pickaxe: this.pickaxe,
        flashlight: this.flashlight,
        vitals: this.vitals,
        rockHits: this.rockHits,
        storage: this.storage,
        tech: this.tech,
        rewards: this.rewards,
        playSeconds: this.playSeconds,
        scoreParts: this.scoreParts,
      };
      window.localStorage.setItem(L1_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors (private mode / quota)
    }
  },

  has(conditionId) {
    return Boolean(this.done[conditionId]);
  },

  setFlag(flagName, value = true) {
    this.flags[flagName] = value;
    this.save();
  },

  addScore(n, reason = '') {
    const delta = Number(n) || 0;
    if (delta === 0) return this.score;
    this.score = Math.max(0, this.score + delta);

    if (delta > 0 && this.scoreParts) {
      const r = String(reason || '');
      if (r === 'objective' || r === 'objectives' || r.startsWith('objective:')) {
        this.scoreParts.objectives = (this.scoreParts.objectives || 0) + delta;
      } else if (r === 'sample' || r === 'samples') {
        this.scoreParts.samples = (this.scoreParts.samples || 0) + delta;
      } else if (r === 'discovery') {
        this.scoreParts.discovery = (this.scoreParts.discovery || 0) + delta;
      } else if (r === 'research') {
        this.scoreParts.research = (this.scoreParts.research || 0) + delta;
      } else if (r === 'craft') {
        this.scoreParts.craft = (this.scoreParts.craft || 0) + delta;
      }
    }

    this.save();
    bus.emit('score', this.score, delta, reason);
    return this.score;
  },

  set(conditionId) {
    if (!conditionId) return false;
    if (this.done[conditionId]) return false;

    this.done[conditionId] = true;
    this.save();
    bus.emit('condition', conditionId);
    this._checkCurrentObjective();
    return true;
  },

  _checkCurrentObjective() {
    if (this.objectiveIndex < 0 || this.objectiveIndex >= OBJECTIVES.length) {
      return;
    }

    const currentObj = OBJECTIVES[this.objectiveIndex];
    const allMet = currentObj.conds.every((c) => Boolean(this.done[c.id]));
    if (!allMet) return;

    const completedIndex = this.objectiveIndex;
    bus.emit('objective:complete', completedIndex);
    this.addScore(currentObj.score, 'objective');

    this.objectiveIndex = Math.min(OBJECTIVES.length, completedIndex + 1);
    this.save();

    clearPendingStartTimer();
    const nextIndex = this.objectiveIndex;
    pendingStartTimer = setTimeout(() => {
      pendingStartTimer = null;
      bus.emit('objective:start', nextIndex);
      if (this.objectiveIndex < OBJECTIVES.length) {
        this._checkCurrentObjective();
      }
    }, 1500);
  },

  emitSceneStart() {
    clearPendingStartTimer();
    bus.emit('objective:start', this.objectiveIndex);
    if (this.objectiveIndex < OBJECTIVES.length) {
      this._checkCurrentObjective();
    }
  },

  reset() {
    clearPendingStartTimer();
    this._applyData(null);
    this.save();
    return this;
  },
};

Object.defineProperty(state, 'inventory', {
  enumerable: true,
  configurable: true,
  get() {
    const counts = {};
    for (const k of INVENTORY_COUNT_KEYS) {
      counts[k] = 0;
    }
    if (Array.isArray(this.bag)) {
      for (const slot of this.bag) {
        if (slot && typeof slot.id === 'string') {
          counts[slot.id] = (counts[slot.id] || 0) + (Number(slot.n) || 0);
        }
      }
    }
    return Object.freeze(counts);
  },
});

if (typeof window !== 'undefined') {
  state.load();
}

export default state;
