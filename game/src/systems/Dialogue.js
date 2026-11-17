import Phaser from 'phaser';
import dialogueFile from '../data/dialogues.json';
import { SFX_MAP } from '../data/sfxmap.js';
import { SaveManager } from '../save.js';
import { actions } from '../core/actions.js';
import { audio } from '../core/audio.js';
import { DialogueBox } from '../ui/DialogueBox.js';

const LINES_BY_ID = new Map();
if (dialogueFile && Array.isArray(dialogueFile.dialogues)) {
  for (const entry of dialogueFile.dialogues) {
    if (entry && entry.id) {
      LINES_BY_ID.set(entry.id, entry);
    }
  }
}

export function isRadioSpeaker(speaker) {
  return speaker === 'DR. KARIM' || speaker === 'MISSION_CONTROL';
}

export function getDialogueLine(id) {
  return LINES_BY_ID.get(id) || null;
}

export function getDialogueLines(ids) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  for (const id of ids) {
    const line = LINES_BY_ID.get(id);
    if (line) out.push(line);
  }
  return out;
}

export function getDialogueAudioIds(ids) {
  const set = new Set([
    'SFX_Radio_Open',
    'SFX_Radio_Beep',
    'SFX_Radio_Close',
  ]);
  const targetLines = ids
    ? getDialogueLines(ids)
    : Array.from(LINES_BY_ID.values());

  for (const line of targetLines) {
    set.add(`VOICE_${line.id}`);
    if (Array.isArray(line.sfx)) {
      for (const tag of line.sfx) {
        const mapped = SFX_MAP[tag];
        if (mapped) {
          set.add(`SFX_${mapped}`);
        }
      }
    }
  }
  return Array.from(set);
}

export const GAMEPLAY_DIALOGUE_AUDIO_IDS = getDialogueAudioIds(
  Array.from(LINES_BY_ID.keys()).filter((id) => !id.startsWith('cutscene_'))
);

function matchesBoundActionKey(event, actionName) {
  if (!event) return false;
  const saved = SaveManager.get();
  const pair =
    saved &&
      saved.settings &&
      saved.settings.keys &&
      Array.isArray(saved.settings.keys[actionName])
      ? saved.settings.keys[actionName]
      : ['E', null];

  const pressedKey = String(event.key || '').toUpperCase();
  const pressedCode = String(event.code || '').toUpperCase();

  for (const slot of pair) {
    if (!slot) continue;
    const target = String(slot).toUpperCase();
    if (pressedKey === target) return true;
    if (pressedCode === `KEY${target}`) return true;
    if (target === 'SPACE' && (pressedCode === 'SPACE' || pressedKey === ' ')) {
      return true;
    }
    if (
      (target === 'LEFT' ||
        target === 'RIGHT' ||
        target === 'UP' ||
        target === 'DOWN') &&
      pressedCode === `ARROW${target}`
    ) {
      return true;
    }
    if (target === 'SHIFT' && pressedCode.startsWith('SHIFT')) return true;
  }
  return false;
}

export class Dialogue {
  constructor(scene) {
    this.scene = scene;
    this.box = new DialogueBox(scene);
    this.isPlaying = false;

    this._activeCtrl = null;
    this._lockedPlayer = null;
    this._savedCanMove = true;
    this._onDone = null;

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this._abortOnShutdown();
    });
  }

  static playLines(scene, lines, renderFn, opts = {}) {
    const {
      duck = true,
      radioFraming = true,
      handleEsc = true,
      onDone = null,
      onSkipAll = null,
      onLineStart = null,
      shouldIgnorePointer = null,
    } = opts;

    const validLines = Array.isArray(lines) ? lines.filter(Boolean) : [];
    if (!scene || validLines.length === 0) {
      if (onDone) onDone({ skipped: false });
      return {
        isPlaying: false,
        skipAll() { },
        cancel() { },
      };
    }

    let active = true;
    let lineIndex = -1;
    let typingDone = false;
    let voiceEnded = false;
    let advanceScheduled = false;
    let currentVoice = null;
    let currentFullText = '';
    let lineStartTime = 0;

    const timers = new Set();
    let typeEvent = null;

    const addDelay = (ms, cb) => {
      if (!active || !scene.time) return null;
      const ev = scene.time.delayedCall(ms, () => {
        timers.delete(ev);
        if (active) cb();
      });
      timers.add(ev);
      return ev;
    };

    const clearLineTimers = () => {
      if (typeEvent) {
        typeEvent.remove(false);
        typeEvent = null;
      }
      for (const ev of timers) {
        ev.remove(false);
      }
      timers.clear();
    };

    const stopCurrentVoice = (fadeMs = 120) => {
      if (currentVoice) {
        const v = currentVoice;
        currentVoice = null;
        audio.fadeOutSound(v, fadeMs);
      }
    };

    const detachInput = () => {
      if (scene.input && scene.input.keyboard) {
        scene.input.keyboard.off('keydown', onKeyDown);
      }
      if (scene.input) {
        scene.input.off('pointerdown', onPointerDown);
      }
    };

    const finish = (skipped) => {
      if (!active) return;
      active = false;
      ctrl.isPlaying = false;
      clearLineTimers();
      detachInput();
      stopCurrentVoice(120);

      if (!skipped && radioFraming && validLines.length > 0) {
        const last = validLines[validLines.length - 1];
        if (isRadioSpeaker(last.speaker)) {
          audio.play('SFX_Radio_Close');
        }
      }

      if (duck) {
        audio.unduck(400);
      }

      scene._interactCooldownUntil = performance.now() + 180;

      if (skipped && onSkipAll) {
        onSkipAll();
      } else if (onDone) {
        onDone({ skipped });
      }
    };

    const cancel = () => {
      if (!active) return;
      active = false;
      ctrl.isPlaying = false;
      clearLineTimers();
      detachInput();
      stopCurrentVoice(0);
    };

    const revealCurrentLine = () => {
      if (lineIndex < 0 || lineIndex >= validLines.length) return;
      typingDone = true;
      if (typeEvent) {
        typeEvent.remove(false);
        typeEvent = null;
      }
      const line = validLines[lineIndex];
      if (renderFn) {
        renderFn({
          type: 'update',
          line,
          index: lineIndex,
          shownText: currentFullText,
          fullText: currentFullText,
          isComplete: true,
        });
      }
    };

    const checkLineFinished = () => {
      if (!active || advanceScheduled) return;
      if (typingDone && voiceEnded) {
        advanceScheduled = true;
        addDelay(500, () => {
          advanceToNextLine(false);
        });
      }
    };

    const advanceToNextLine = (fromUserSkip = false) => {
      if (!active) return;
      clearLineTimers();
      if (fromUserSkip) {
        stopCurrentVoice(120);
      } else {
        currentVoice = null;
      }

      const prevLine = lineIndex >= 0 ? validLines[lineIndex] : null;
      const nextIdx = lineIndex + 1;

      if (nextIdx >= validLines.length) {
        finish(false);
        return;
      }

      if (radioFraming && prevLine && prevLine.speaker === 'DR. KARIM') {
        audio.play('SFX_Radio_Beep');
      }

      startLine(nextIdx);
    };

    const startLine = (idx) => {
      if (!active) return;
      lineIndex = idx;
      const line = validLines[idx];
      currentFullText = String(line.line || '');
      typingDone = currentFullText.length === 0;
      voiceEnded = false;
      advanceScheduled = false;
      lineStartTime = performance.now();

      if (
        line.speaker === 'NOVA' &&
        scene.nova &&
        typeof scene.nova.hop === 'function'
      ) {
        scene.nova.hop();
      }

      let customOpts = null;
      if (onLineStart) {
        customOpts = onLineStart(line, idx) || null;
      }

      if (renderFn) {
        renderFn({
          type: 'start',
          line,
          index: idx,
          shownText: typingDone ? currentFullText : '',
          fullText: currentFullText,
          isComplete: typingDone,
        });
      }

      // Play mapped SFX tags 120 ms apart unless suppressed by step handler
      if (!(customOpts && customOpts.suppressLineSfx) && Array.isArray(line.sfx)) {
        const mappedList = line.sfx
          .map((tag) => SFX_MAP[tag])
          .filter(Boolean);
        mappedList.forEach((sfxName, sfxIdx) => {
          if (sfxIdx === 0) {
            audio.play(`SFX_${sfxName}`);
          } else {
            addDelay(sfxIdx * 120, () => {
              audio.play(`SFX_${sfxName}`);
            });
          }
        });
      }

      const minHoldMs =
        customOpts && Number.isFinite(customOpts.minHoldMs)
          ? customOpts.minHoldMs
          : 0;
      let minHoldDone = minHoldMs <= 0;
      let rawVoiceDone = false;

      const tryCompleteVoice = () => {
        if (!active || lineIndex !== idx) return;
        if (!rawVoiceDone || !minHoldDone) return;
        if (voiceEnded) return;
        voiceEnded = true;
        currentVoice = null;
        if (!typingDone) {
          revealCurrentLine();
        }
        checkLineFinished();
      };

      if (!minHoldDone) {
        addDelay(minHoldMs, () => {
          minHoldDone = true;
          tryCompleteVoice();
        });
      }

      // Play voice or fall back to reading time max(1500, 55 ms per character)
      const voiceSound = audio.play(`VOICE_${line.id}`);
      currentVoice = voiceSound;

      if (voiceSound) {
        const onVoiceComplete = () => {
          rawVoiceDone = true;
          tryCompleteVoice();
        };
        voiceSound.once('complete', onVoiceComplete);

        const durSec = Number(
          voiceSound.totalDuration || voiceSound.duration || 0
        );
        const safetyMs =
          durSec > 0
            ? Math.ceil(durSec * 1000) + 450
            : Math.max(1500, currentFullText.length * 55) + 500;
        addDelay(safetyMs, onVoiceComplete);
      } else {
        const fallbackMs = Math.max(1500, currentFullText.length * 55);
        addDelay(fallbackMs, () => {
          rawVoiceDone = true;
          tryCompleteVoice();
        });
      }

      // Typewriter at 32 characters per second
      if (!typingDone) {
        let lastCount = 0;
        typeEvent = scene.time.addEvent({
          delay: 16,
          loop: true,
          callback: () => {
            if (!active || lineIndex !== idx || typingDone) return;
            const elapsedSec = (performance.now() - lineStartTime) / 1000;
            const count = Math.min(
              currentFullText.length,
              Math.floor(elapsedSec * 32)
            );
            if (count !== lastCount) {
              lastCount = count;
              const slice = currentFullText.slice(0, count);
              const doneNow = count >= currentFullText.length;
              if (doneNow) {
                typingDone = true;
                if (typeEvent) {
                  typeEvent.remove(false);
                  typeEvent = null;
                }
              }
              if (renderFn) {
                renderFn({
                  type: 'update',
                  line,
                  index: idx,
                  shownText: slice,
                  fullText: currentFullText,
                  isComplete: doneNow,
                });
              }
              if (doneNow) {
                checkLineFinished();
              }
            }
          },
        });
      } else {
        checkLineFinished();
      }
    };

    const handleUserAdvance = () => {
      if (!active) return;
      // Ignore input before first line starts (e.g. during 250ms Radio_Open)
      if (lineIndex < 0) return;

      if (!typingDone) {
        revealCurrentLine();
        checkLineFinished();
      } else {
        advanceToNextLine(true);
      }
    };

    const onKeyDown = (event) => {
      if (!active) return;
      if (handleEsc && (event.code === 'Escape' || event.key === 'Escape')) {
        scene._escConsumedAt = performance.now();
        finish(true);
        return;
      }
      if (matchesBoundActionKey(event, 'interact')) {
        scene._interactCooldownUntil = performance.now() + 180;
        handleUserAdvance();
      }
    };

    const onPointerDown = (pointer, currentlyOver) => {
      if (!active) return;
      if (
        shouldIgnorePointer &&
        shouldIgnorePointer(pointer, currentlyOver || [])
      ) {
        return;
      }
      handleUserAdvance();
    };

    if (scene.input && scene.input.keyboard) {
      scene.input.keyboard.on('keydown', onKeyDown);
    }
    if (scene.input) {
      scene.input.on('pointerdown', onPointerDown);
    }

    if (duck) {
      audio.duck(0.35, 250);
    }

    const ctrl = {
      isPlaying: true,
      skipAll: () => finish(true),
      cancel,
    };

    const first = validLines[0];
    const firstHasRadioConnect =
      Array.isArray(first.sfx) && first.sfx.includes('RADIO_CONNECT');

    if (radioFraming && isRadioSpeaker(first.speaker) && !firstHasRadioConnect) {
      audio.play('SFX_Radio_Open');
      addDelay(250, () => {
        startLine(0);
      });
    } else {
      startLine(0);
    }

    return ctrl;
  }

  play(ids, { onDone = null, lockPlayer = true, player = null } = {}) {
    const idList = Array.isArray(ids) ? ids : [ids];
    const lines = getDialogueLines(idList);

    if (lines.length === 0) {
      if (onDone) onDone();
      return;
    }

    // If another sequence was already playing, cancel it cleanly while preserving original player lock state
    const wasPlaying = this.isPlaying;
    if (this._activeCtrl) {
      this._activeCtrl.cancel();
      this._activeCtrl = null;
    }

    const targetPlayer = player || this.scene.player || null;
    if (lockPlayer && targetPlayer) {
      if (!wasPlaying || this._lockedPlayer !== targetPlayer) {
        this._savedCanMove = Boolean(targetPlayer.canMove);
        this._lockedPlayer = targetPlayer;
      }
      if (typeof targetPlayer.stopMotion === 'function') {
        targetPlayer.stopMotion();
      } else {
        targetPlayer.canMove = false;
      }
    } else if (!wasPlaying) {
      this._lockedPlayer = null;
    }

    this._onDone = onDone;
    this.isPlaying = true;

    // Pre-populate first line speaker & empty text before sliding in
    this.box.setLine(lines[0].speaker, '', false);
    this.box.slideIn();

    const completeSequence = () => {
      this._activeCtrl = null;
      const doneCb = this._onDone;
      this._onDone = null;

      const restorePlayer = () => {
        actions.resetMovementKeys();
        if (this._lockedPlayer) {
          this._lockedPlayer.canMove = this._savedCanMove;
          this._lockedPlayer = null;
        }
        this.isPlaying = false;
        this.scene._interactCooldownUntil = performance.now() + 180;
        if (doneCb) doneCb();
      };

      this.box.slideOut(() => {
        restorePlayer();
      });
    };

    this._activeCtrl = Dialogue.playLines(
      this.scene,
      lines,
      ({ type, line, shownText, isComplete }) => {
        if (type === 'start') {
          this.box.setLine(line.speaker, shownText, isComplete);
        } else {
          this.box.setText(shownText);
          this.box.setComplete(isComplete);
        }
      },
      {
        duck: true,
        radioFraming: true,
        handleEsc: true,
        onDone: () => completeSequence(),
        onSkipAll: () => completeSequence(),
      }
    );
  }

  skipAll() {
    if (this._activeCtrl) {
      this._activeCtrl.skipAll();
    }
  }

  _abortOnShutdown() {
    if (this._activeCtrl) {
      this._activeCtrl.cancel();
      this._activeCtrl = null;
    }
    this.isPlaying = false;
    this._onDone = null;
    this._lockedPlayer = null;
  }
}

export default Dialogue;
