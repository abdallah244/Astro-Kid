import { STORAGE_KEY } from './config.js';

export const DEFAULT_KEYS = {
  left: ['A', 'LEFT'],
  right: ['D', 'RIGHT'],
  up: ['W', 'UP'],
  down: ['S', 'DOWN'],
  run: ['SHIFT', null],
  interact: ['E', null],
  useTool: ['J', null],
  flashlight: ['F', null],
  backpack: ['I', null],
  technology: ['C', null],
  map: ['M', null],
  objectives: ['O', null],
};

export function cloneDefaultKeys() {
  const out = {};
  for (const [k, pair] of Object.entries(DEFAULT_KEYS)) {
    out[k] = [pair[0], pair[1]];
  }
  return out;
}

function sanitizeKeys(rawKeys) {
  const merged = cloneDefaultKeys();
  if (!rawKeys || typeof rawKeys !== 'object') {
    return merged;
  }

  for (const action of Object.keys(DEFAULT_KEYS)) {
    if (Array.isArray(rawKeys[action])) {
      const s0 =
        typeof rawKeys[action][0] === 'string' && rawKeys[action][0].length > 0
          ? rawKeys[action][0].toUpperCase()
          : null;
      const s1 =
        typeof rawKeys[action][1] === 'string' && rawKeys[action][1].length > 0
          ? rawKeys[action][1].toUpperCase()
          : null;
      merged[action] = [s0, s1];
    }
  }
  return merged;
}

function createDefaultState() {
  return {
    unlocked: 1,
    completed: [],
    progress: {
      cutsceneSeen: false,
    },
    settings: {
      music: 70,
      sfx: 80,
      voice: 80,
      tips: true,
      keys: cloneDefaultKeys(),
    },
  };
}

function sanitizeState(raw) {
  const defaults = createDefaultState();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const completed = Array.isArray(raw.completed)
    ? Array.from(
        new Set(
          raw.completed
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= 6)
        )
      )
    : [];

  let unlocked = Number(raw.unlocked);
  if (!Number.isInteger(unlocked) || unlocked < 1) {
    unlocked = 1;
  }
  if (unlocked > 6) {
    unlocked = 6;
  }

  let sequentialUnlocked = 1;
  while (sequentialUnlocked < 6 && completed.includes(sequentialUnlocked)) {
    sequentialUnlocked += 1;
  }
  unlocked = Math.max(1, Math.min(6, Math.max(unlocked, sequentialUnlocked)));

  const rawProgress =
    raw.progress && typeof raw.progress === 'object' ? raw.progress : {};
  const cutsceneSeen =
    typeof rawProgress.cutsceneSeen === 'boolean'
      ? rawProgress.cutsceneSeen
      : defaults.progress.cutsceneSeen;

  const rawSettings =
    raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const music = Number.isFinite(Number(rawSettings.music))
    ? Math.max(0, Math.min(100, Number(rawSettings.music)))
    : defaults.settings.music;
  const sfx = Number.isFinite(Number(rawSettings.sfx))
    ? Math.max(0, Math.min(100, Number(rawSettings.sfx)))
    : defaults.settings.sfx;
  const voice = Number.isFinite(Number(rawSettings.voice))
    ? Math.max(0, Math.min(100, Number(rawSettings.voice)))
    : defaults.settings.voice;
  const tips =
    typeof rawSettings.tips === 'boolean'
      ? rawSettings.tips
      : defaults.settings.tips;
  const keys = sanitizeKeys(rawSettings.keys);

  return {
    unlocked,
    completed,
    progress: {
      cutsceneSeen,
    },
    settings: {
      music,
      sfx,
      voice,
      tips,
      keys,
    },
  };
}

let state = null;

function persist() {
  if (!state) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures (e.g. private browsing / quota)
  }
}

export const SaveManager = {
  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const needsKeyMigration = Boolean(
          parsed?.settings?.keys &&
            ('jump' in parsed.settings.keys ||
              !('up' in parsed.settings.keys) ||
              !('down' in parsed.settings.keys))
        );
        state = sanitizeState(parsed);
        if (needsKeyMigration) {
          persist();
        }
      } else {
        state = createDefaultState();
      }
    } catch {
      state = createDefaultState();
    }
    return state;
  },

  get() {
    if (!state) {
      return this.load();
    }
    return state;
  },

  setSetting(key, value) {
    const current = this.get();
    current.settings[key] = value;
    persist();
    return current;
  },

  markCutsceneSeen() {
    const current = this.get();
    if (!current.progress || typeof current.progress !== 'object') {
      current.progress = { cutsceneSeen: true };
    } else {
      current.progress.cutsceneSeen = true;
    }
    persist();
    return current;
  },

  completeMission(n) {
    const current = this.get();
    const missionNum = Number(n);
    if (!Number.isInteger(missionNum) || missionNum < 1 || missionNum > 6) {
      return current;
    }
    if (!current.completed.includes(missionNum)) {
      current.completed.push(missionNum);
    }
    current.unlocked = Math.max(current.unlocked, Math.min(6, missionNum + 1));
    persist();
    return current;
  },

  reset() {
    state = createDefaultState();
    persist();
    return state;
  },
};

export default SaveManager;
