import Phaser from 'phaser';
import { REGIONS } from '../core/constants.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { state } from '../core/state.js';
import { UI, registerUi, uiPanel } from '../ui/theme.js';

export function showRegionToast(scene, regionName, isFirstDiscovery) {
  if (!scene || !scene.add || !scene.tweens) return null;

  const container = scene.add
    .container(460, -60)
    .setScrollFactor(0)
    .setDepth(125)
    .setAlpha(1);

  const panel = uiPanel(scene, 0, 0, 360, 56);
  const titleY = isFirstDiscovery ? 19 : 28;
  const titleText = scene.add
    .text(180, titleY, regionName, {
      fontFamily: UI.font,
      fontStyle: '700',
      fontSize: '24px',
      color: UI.gold,
    })
    .setOrigin(0.5, 0.5);

  container.add([panel, titleText]);

  if (isFirstDiscovery) {
    const subText = scene.add
      .text(180, 42, 'New area discovered!', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '14px',
        color: UI.white,
      })
      .setOrigin(0.5, 0.5);
    container.add(subText);
  }

  registerUi(scene, container);
  audio.play('SFX_Notification');

  let holdTimer = null;
  let activeTween = scene.tweens.add({
    targets: container,
    y: 96,
    duration: 260,
    ease: 'Cubic.easeOut',
    onComplete: () => {
      activeTween = null;
      holdTimer = scene.time.delayedCall(1800, () => {
        holdTimer = null;
        if (!container || !container.scene) return;
        activeTween = scene.tweens.add({
          targets: container,
          alpha: 0,
          duration: 280,
          ease: 'Sine.easeIn',
          onComplete: () => {
            activeTween = null;
            if (container && container.scene) {
              container.destroy(true);
            }
          },
        });
      });
    },
  });

  const cancel = () => {
    if (activeTween) {
      activeTween.stop();
      activeTween = null;
    }
    if (holdTimer) {
      holdTimer.remove(false);
      holdTimer = null;
    }
    if (container && container.scene) {
      container.destroy(true);
    }
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cancel);
  return { container, cancel };
}

export class RegionManager {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this._toastHandle = null;

    // Start with lunar_base discovered silently (no toast, no score)
    if (!state.flags.discovered_lunar_base) {
      state.setFlag('discovered_lunar_base', true);
    }

    const initial = this._findOpenRegion(player.x, player.y);
    this.currentId = initial ? initial.id : 'lunar_base';
    if (initial && !state.flags[`discovered_${initial.id}`]) {
      if (initial.id === 'lunar_base') {
        state.setFlag('discovered_lunar_base', true);
      }
    }

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this._clearToast();
    });
  }

  _findOpenRegion(x, y) {
    for (const reg of REGIONS) {
      if (reg.state !== 'open') continue;
      if (x >= reg.x1 && x <= reg.x2 && y >= reg.y1 && y <= reg.y2) {
        return reg;
      }
    }
    return null;
  }

  _clearToast() {
    if (this._toastHandle) {
      this._toastHandle.cancel();
      this._toastHandle = null;
    }
  }

  _showToast(regionName, isFirstDiscovery) {
    this._clearToast();
    this._toastHandle = showRegionToast(
      this.scene,
      regionName,
      isFirstDiscovery
    );
  }

  update() {
    if (!this.player) return;
    const reg = this._findOpenRegion(this.player.x, this.player.y);
    if (!reg || reg.id === this.currentId) return;

    this.currentId = reg.id;
    bus.emit('region:enter', reg.id);

    const flagKey = `discovered_${reg.id}`;
    const isFirst = !state.flags[flagKey];
    if (isFirst) {
      state.setFlag(flagKey, true);
      state.addScore(25, 'discovery');
    }

    if (reg.id === 'lunar_plains') {
      state.set('lunar_plains_entered');
    }

    this._showToast(reg.name, isFirst);
  }
}

export default RegionManager;
