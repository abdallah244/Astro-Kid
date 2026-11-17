function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

class AudioManager {
  constructor() {
    this.game = null;
    this.volumes = {
      music: 70,
      sfx: 80,
      voice: 80,
    };

    this._duckFactor = 1;
    this._duckCancel = null;

    this._currentMusicId = null;
    this._currentMusic = null;
    this._fadingMusic = new Set();

    this._loops = new Map();
    this._fadingLoops = new Set();
    this._oneshots = new Set();

    this._pendingMusic = null;
    this._pendingLoops = new Map();
    this._lastVariant = new Map();

    this._inputBound = false;
  }

  init(game) {
    if (game) {
      this.game = game;
      if (this.game.sound && typeof this.game.sound.on === 'function') {
        this.game.sound.on('unlocked', () => {
          this._flushPending();
        });
      }
    }

    if (!this._inputBound && typeof window !== 'undefined') {
      this._inputBound = true;
      const onUserGesture = () => {
        if (
          this.game &&
          this.game.sound &&
          this.game.sound.context &&
          this.game.sound.context.state === 'suspended'
        ) {
          this.game.sound.context
            .resume()
            .then(() => this._flushPending())
            .catch(() => {});
        }
        if (this._isUnlocked()) {
          this._flushPending();
        }
      };

      window.addEventListener('pointerdown', onUserGesture, { passive: true });
      window.addEventListener('pointerup', onUserGesture, { passive: true });
      window.addEventListener('keydown', onUserGesture, { passive: true });
      window.addEventListener('keyup', onUserGesture, { passive: true });
    }
  }

  _isUnlocked() {
    if (!this.game || !this.game.sound) return false;
    if (this.game.sound.locked) return false;
    if (
      this.game.sound.context &&
      this.game.sound.context.state === 'suspended'
    ) {
      return false;
    }
    return true;
  }

  _normalizeId(id) {
    if (!id || typeof id !== 'string') return '';
    if (
      id.startsWith('SFX_') ||
      id.startsWith('AMB_') ||
      id.startsWith('MUS_') ||
      id.startsWith('VOICE_')
    ) {
      return id;
    }
    return `SFX_${id}`;
  }

  _idToUrl(rawId) {
    const id = this._normalizeId(rawId);
    if (!id) return null;
    if (id.startsWith('SFX_')) {
      return `audio/sfx/${id}.ogg`;
    }
    if (id.startsWith('AMB_')) {
      return `audio/amb/${id}.ogg`;
    }
    if (id.startsWith('MUS_')) {
      return `audio/mus/${id}.ogg`;
    }
    if (id.startsWith('VOICE_')) {
      return `audio/voice/${id.slice(6)}.ogg`;
    }
    return null;
  }

  _busForId(id) {
    if (id.startsWith('MUS_')) return 'music';
    if (id.startsWith('AMB_')) return 'amb';
    if (id.startsWith('VOICE_')) return 'voice';
    return 'sfx';
  }

  _busVolumeNorm(bus) {
    if (bus === 'music') return this.volumes.music / 100;
    if (bus === 'voice') return this.volumes.voice / 100;
    // 'sfx' and 'amb' both follow sfx
    return this.volumes.sfx / 100;
  }

  _calcEffectiveVolume(bus, gain = 1, fadeFactor = 1) {
    const busNorm = this._busVolumeNorm(bus);
    const duck = bus === 'music' || bus === 'amb' ? this._duckFactor : 1;
    return clamp(busNorm * gain * fadeFactor * duck, 0, 1);
  }

  _applySoundVolume(sound, vol) {
    if (!sound) return;
    try {
      if (typeof sound.setVolume === 'function') {
        sound.setVolume(vol);
      } else {
        sound.volume = vol;
      }
    } catch {
      // Ignore destroyed sound errors
    }
  }

  _syncEntryVolume(entry) {
    if (!entry || !entry.sound) return;
    const vol = this._calcEffectiveVolume(
      entry.bus,
      entry.gain,
      entry.fadeFactor
    );
    this._applySoundVolume(entry.sound, vol);
  }

  _syncAllVolumes() {
    if (this._currentMusic) {
      this._syncEntryVolume(this._currentMusic);
    }
    for (const entry of this._fadingMusic) {
      this._syncEntryVolume(entry);
    }
    for (const entry of this._loops.values()) {
      this._syncEntryVolume(entry);
    }
    for (const entry of this._fadingLoops) {
      this._syncEntryVolume(entry);
    }
    for (const entry of this._oneshots) {
      this._syncEntryVolume(entry);
    }
  }

  _animateValue(from, to, durationMs, onUpdate, onDone) {
    if (!durationMs || durationMs <= 0 || typeof window === 'undefined') {
      onUpdate(to);
      if (onDone) onDone();
      return () => {};
    }

    let cancelled = false;
    const start = performance.now();

    const id = setInterval(() => {
      if (cancelled) return;
      const elapsed = performance.now() - start;
      const t = clamp(elapsed / durationMs, 0, 1);
      const val = from + (to - from) * t;
      onUpdate(val);
      if (t >= 1) {
        clearInterval(id);
        cancelled = true;
        if (onDone) onDone();
      }
    }, 16);

    return () => {
      if (!cancelled) {
        cancelled = true;
        clearInterval(id);
      }
    };
  }

  _canPlayKey(key) {
    return Boolean(
      this.game &&
        this.game.sound &&
        this.game.cache &&
        this.game.cache.audio &&
        this.game.cache.audio.exists(key)
    );
  }

  _flushPending() {
    if (!this._isUnlocked()) return;

    if (this._pendingMusic) {
      const pending = this._pendingMusic;
      this._pendingMusic = null;
      if (this._currentMusicId === pending.id && !this._currentMusic) {
        this._startMusicNow(pending.id, pending.fadeMs, pending.rampIn);
      }
    }

    if (this._pendingLoops.size > 0) {
      const entries = Array.from(this._pendingLoops.entries());
      this._pendingLoops.clear();
      for (const [id, opts] of entries) {
        if (!this._loops.has(id)) {
          this._startLoopNow(id, opts);
        }
      }
    }
  }

  preload(scene, ids) {
    let count = 0;
    if (!scene || !scene.load || !Array.isArray(ids)) return count;
    for (const rawId of ids) {
      const id = this._normalizeId(rawId);
      const url = this._idToUrl(id);
      if (!url) continue;
      const exists =
        scene.cache && scene.cache.audio && scene.cache.audio.exists(id);
      if (!exists) {
        scene.load.audio(id, url);
        count += 1;
      }
    }
    return count;
  }

  play(rawId, { gain = 1, rate = 1, detune = 0 } = {}) {
    const id = this._normalizeId(rawId);
    if (!id || !this._isUnlocked() || !this._canPlayKey(id)) return null;

    const bus = this._busForId(id);
    const vol = this._calcEffectiveVolume(bus, gain, 1);

    try {
      const sound = this.game.sound.add(id, {
        volume: vol,
        rate,
        detune,
        loop: false,
      });

      const entry = {
        sound,
        id,
        bus,
        gain,
        fadeFactor: 1,
        cancelFade: null,
      };
      this._oneshots.add(entry);

      const cleanup = () => {
        if (entry.cancelFade) {
          entry.cancelFade();
          entry.cancelFade = null;
        }
        this._oneshots.delete(entry);
        try {
          sound.destroy();
        } catch {
          // Ignore
        }
      };

      sound.once('complete', cleanup);
      sound.once('destroy', () => {
        if (entry.cancelFade) {
          entry.cancelFade();
          entry.cancelFade = null;
        }
        this._oneshots.delete(entry);
      });

      sound.play();
      return sound;
    } catch {
      return null;
    }
  }

  fadeOutSound(sound, fadeMs = 120) {
    if (!sound) return;

    let foundEntry = null;
    for (const entry of this._oneshots) {
      if (entry.sound === sound) {
        foundEntry = entry;
        break;
      }
    }

    if (!foundEntry) {
      try {
        sound.stop();
        sound.destroy();
      } catch {
        // Ignore
      }
      return;
    }

    if (foundEntry.cancelFade) {
      foundEntry.cancelFade();
      foundEntry.cancelFade = null;
    }

    if (!fadeMs || fadeMs <= 0) {
      this._oneshots.delete(foundEntry);
      try {
        sound.stop();
        sound.destroy();
      } catch {
        // Ignore
      }
      return;
    }

    const startFade = foundEntry.fadeFactor;
    foundEntry.cancelFade = this._animateValue(
      startFade,
      0,
      fadeMs,
      (val) => {
        foundEntry.fadeFactor = val;
        this._syncEntryVolume(foundEntry);
      },
      () => {
        foundEntry.cancelFade = null;
        this._oneshots.delete(foundEntry);
        try {
          sound.stop();
          sound.destroy();
        } catch {
          // Ignore
        }
      }
    );
  }

  stopVoicesAndSfx(fadeMs = 0) {
    const entries = Array.from(this._oneshots);
    for (const entry of entries) {
      this.fadeOutSound(entry.sound, fadeMs);
    }
  }

  playVariant(baseId, count, opts = {}) {
    const normalizedBase = this._normalizeId(baseId);
    const n = Math.max(1, Math.floor(Number(count) || 1));
    let pick = 1;

    if (n > 1) {
      const prev = this._lastVariant.get(normalizedBase);
      const candidates = [];
      for (let i = 1; i <= n; i += 1) {
        if (i !== prev) candidates.push(i);
      }
      pick = candidates[Math.floor(Math.random() * candidates.length)];
    }

    this._lastVariant.set(normalizedBase, pick);
    const suffix = String(pick).padStart(2, '0');
    return this.play(`${normalizedBase}_${suffix}`, opts);
  }

  playFromList(ids, opts = {}) {
    if (!Array.isArray(ids) || ids.length === 0) return null;
    const listKey = `list:${ids.join('|')}`;
    let pick = 0;

    if (ids.length > 1) {
      const prev = this._lastVariant.get(listKey);
      const candidates = [];
      for (let i = 0; i < ids.length; i += 1) {
        if (i !== prev) candidates.push(i);
      }
      pick = candidates[Math.floor(Math.random() * candidates.length)];
    }

    this._lastVariant.set(listKey, pick);
    return this.play(ids[pick], opts);
  }

  loop(rawId, { gain = 1, bus } = {}) {
    const id = this._normalizeId(rawId);
    if (!id) return null;
    const resolvedBus = bus || this._busForId(id);

    if (this._loops.has(id)) {
      const existing = this._loops.get(id);
      existing.gain = gain;
      existing.bus = resolvedBus;
      this._syncEntryVolume(existing);
      return existing.sound;
    }

    if (!this._isUnlocked() || !this._canPlayKey(id)) {
      this._pendingLoops.set(id, { gain, bus: resolvedBus });
      return null;
    }

    return this._startLoopNow(id, { gain, bus: resolvedBus });
  }

  _startLoopNow(id, { gain = 1, bus }) {
    if (!this._canPlayKey(id)) {
      this._pendingLoops.set(id, { gain, bus });
      return null;
    }

    try {
      const vol = this._calcEffectiveVolume(bus, gain, 1);
      const sound = this.game.sound.add(id, {
        loop: true,
        volume: vol,
      });
      const entry = {
        sound,
        id,
        bus,
        gain,
        fadeFactor: 1,
        cancelFade: null,
      };
      this._loops.set(id, entry);
      sound.play();
      return sound;
    } catch {
      return null;
    }
  }

  stop(rawId, fadeMs = 300) {
    const id = this._normalizeId(rawId);
    this._pendingLoops.delete(id);

    const entry = this._loops.get(id);
    if (!entry) return;

    this._loops.delete(id);
    if (entry.cancelFade) {
      entry.cancelFade();
      entry.cancelFade = null;
    }

    if (!fadeMs || fadeMs <= 0) {
      try {
        entry.sound.stop();
        entry.sound.destroy();
      } catch {
        // Ignore
      }
      return;
    }

    this._fadingLoops.add(entry);
    const startFade = entry.fadeFactor;
    entry.cancelFade = this._animateValue(
      startFade,
      0,
      fadeMs,
      (val) => {
        entry.fadeFactor = val;
        this._syncEntryVolume(entry);
      },
      () => {
        this._fadingLoops.delete(entry);
        try {
          entry.sound.stop();
          entry.sound.destroy();
        } catch {
          // Ignore
        }
      }
    );
  }

  music(rawId, opts = {}) {
    const explicitFade =
      opts && typeof opts.fadeMs === 'number' && opts.fadeMs > 0;
    const fadeMs =
      opts && typeof opts.fadeMs === 'number' ? opts.fadeMs : 800;
    const rampIn = Boolean((opts && opts.rampIn) || explicitFade);

    if (!rawId) {
      this._currentMusicId = null;
      this._pendingMusic = null;
      this._fadeOutCurrentMusic(fadeMs);
      return;
    }

    const id = this._normalizeId(rawId);
    if (this._currentMusicId === id) {
      // Same id = no-op (keep playing or pending)
      return;
    }

    this._currentMusicId = id;

    if (!this._isUnlocked() || !this._canPlayKey(id)) {
      this._fadeOutCurrentMusic(fadeMs);
      this._pendingMusic = { id, fadeMs, rampIn };
      return;
    }

    this._pendingMusic = null;
    this._startMusicNow(id, fadeMs, rampIn);
  }

  _fadeOutCurrentMusic(fadeMs) {
    if (!this._currentMusic) return;
    const outgoing = this._currentMusic;
    this._currentMusic = null;

    if (outgoing.cancelFade) {
      outgoing.cancelFade();
      outgoing.cancelFade = null;
    }

    if (!fadeMs || fadeMs <= 0) {
      try {
        outgoing.sound.stop();
        outgoing.sound.destroy();
      } catch {
        // Ignore
      }
      return;
    }

    this._fadingMusic.add(outgoing);
    const startFactor = outgoing.fadeFactor;
    outgoing.cancelFade = this._animateValue(
      startFactor,
      0,
      fadeMs,
      (val) => {
        outgoing.fadeFactor = val;
        this._syncEntryVolume(outgoing);
      },
      () => {
        this._fadingMusic.delete(outgoing);
        try {
          outgoing.sound.stop();
          outgoing.sound.destroy();
        } catch {
          // Ignore
        }
      }
    );
  }

  _startMusicNow(id, fadeMs, rampIn = false) {
    if (!this._canPlayKey(id)) {
      this._pendingMusic = { id, fadeMs, rampIn };
      return;
    }

    const hadOutgoing = Boolean(
      this._currentMusic || this._fadingMusic.size > 0
    );
    this._fadeOutCurrentMusic(fadeMs);

    try {
      const shouldFadeIn = (hadOutgoing || rampIn) && fadeMs > 0;
      const initialFade = shouldFadeIn ? 0 : 1;
      const vol = this._calcEffectiveVolume('music', 1, initialFade);
      const sound = this.game.sound.add(id, {
        loop: true,
        volume: vol,
      });

      const entry = {
        sound,
        id,
        bus: 'music',
        gain: 1,
        fadeFactor: initialFade,
        cancelFade: null,
      };
      this._currentMusic = entry;
      sound.play();

      if (initialFade < 1 && fadeMs > 0) {
        entry.cancelFade = this._animateValue(
          0,
          1,
          fadeMs,
          (val) => {
            entry.fadeFactor = val;
            this._syncEntryVolume(entry);
          },
          () => {
            entry.cancelFade = null;
          }
        );
      }
    } catch {
      // Ignore playback errors
    }
  }

  duck(amount = 0.35, ms = 250) {
    if (this._duckCancel) {
      this._duckCancel();
      this._duckCancel = null;
    }
    const target = clamp(Number(amount) || 0.35, 0, 1);
    const start = this._duckFactor;
    this._duckCancel = this._animateValue(
      start,
      target,
      ms,
      (val) => {
        this._duckFactor = val;
        this._syncAllVolumes();
      },
      () => {
        this._duckCancel = null;
      }
    );
  }

  unduck(ms = 400) {
    if (this._duckCancel) {
      this._duckCancel();
      this._duckCancel = null;
    }
    const start = this._duckFactor;
    this._duckCancel = this._animateValue(
      start,
      1,
      ms,
      (val) => {
        this._duckFactor = val;
        this._syncAllVolumes();
      },
      () => {
        this._duckCancel = null;
      }
    );
  }

  setVolumes(music, sfx, voice) {
    if (Number.isFinite(Number(music))) {
      this.volumes.music = clamp(Number(music), 0, 100);
    }
    if (Number.isFinite(Number(sfx))) {
      this.volumes.sfx = clamp(Number(sfx), 0, 100);
    }
    if (Number.isFinite(Number(voice))) {
      this.volumes.voice = clamp(Number(voice), 0, 100);
    }
    this._syncAllVolumes();
  }

  click() {
    this.play('SFX_Button_Click');
  }

  denied() {
    this.play('SFX_Error');
  }

  stopAll() {
    this._pendingMusic = null;
    this._pendingLoops.clear();
    this._currentMusicId = null;

    if (this._duckCancel) {
      this._duckCancel();
      this._duckCancel = null;
    }
    this._duckFactor = 1;

    const killEntry = (entry) => {
      if (!entry) return;
      if (entry.cancelFade) {
        entry.cancelFade();
        entry.cancelFade = null;
      }
      try {
        entry.sound.stop();
        entry.sound.destroy();
      } catch {
        // Ignore
      }
    };

    killEntry(this._currentMusic);
    this._currentMusic = null;

    for (const entry of this._fadingMusic) {
      killEntry(entry);
    }
    this._fadingMusic.clear();

    for (const entry of this._loops.values()) {
      killEntry(entry);
    }
    this._loops.clear();

    for (const entry of this._fadingLoops) {
      killEntry(entry);
    }
    this._fadingLoops.clear();

    for (const entry of this._oneshots) {
      killEntry(entry);
    }
    this._oneshots.clear();
  }
}

export const audio = new AudioManager();
export { AudioManager };
export default audio;
