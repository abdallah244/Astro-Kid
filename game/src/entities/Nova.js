import Phaser from 'phaser';
import { SaveManager } from '../save.js';
import { depthOf } from '../core/constants.js';
import { audio } from '../core/audio.js';
import { UI, registerUi } from '../ui/theme.js';

export class Nova {
  constructor(scene, player, opts = {}) {
    this.scene = scene;
    this.player = player;

    const facingSign = player.facingX || 1;
    const startX =
      opts.x !== undefined ? opts.x : player.x - facingSign * 85;
    const startY = opts.y !== undefined ? opts.y : player.y - 150;

    this.baseX = startX;
    this.baseY = startY;
    this.hopOffset = 0;
    this._hopTween = null;

    this.sprite = scene.add
      .sprite(Math.round(startX), Math.round(startY), 'nova', 0)
      .setOrigin(0.5, 0.5)
      .setScale(0.8)
      .setDepth(depthOf(player.y) + 0.02);

    this.sprite.setFlipX(facingSign < 0);

    // Speech bubble above NOVA (for nova.say)
    this.bubbleContainer = scene.add
      .container(Math.round(startX), Math.round(startY - 72))
      .setDepth(102)
      .setAlpha(0)
      .setVisible(false);
    registerUi(scene, this.bubbleContainer);

    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add
      .text(0, 0, '', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '16px',
        color: '#0a0f2c',
        align: 'center',
        wordWrap: { width: 236 },
      })
      .setOrigin(0.5, 0.5);

    this.bubbleContainer.add([this.bubbleBg, this.bubbleText]);

    this._bubbleTween = null;
    this._bubbleTimer = null;

    // Loop subtle NOVA idle hum while present in scene
    audio.loop('SFX_NOVA_Idle_Hum', { gain: 0.15 });

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this._clearSpeechTimers();
      if (this._hopTween) {
        this._hopTween.stop();
        this._hopTween = null;
      }
      audio.stop('SFX_NOVA_Idle_Hum', 120);
    });
  }

  _clearSpeechTimers() {
    if (this._bubbleTween) {
      this._bubbleTween.stop();
      this._bubbleTween = null;
    }
    if (this._bubbleTimer) {
      clearTimeout(this._bubbleTimer);
      this._bubbleTimer = null;
    }
  }

  hop() {
    if (!this.scene || !this.scene.tweens) return;
    if (this._hopTween) {
      this._hopTween.stop();
      this._hopTween = null;
    }
    this.hopOffset = 0;
    this._hopTween = this.scene.tweens.add({
      targets: this,
      hopOffset: -14,
      duration: 125,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.hopOffset = 0;
        this._hopTween = null;
      },
    });
  }

  say(text, ms = 3000, opts = {}) {
    if (!this.scene || !this.bubbleContainer || !this.bubbleContainer.scene) {
      return;
    }
    if (!opts.force && SaveManager.get()?.settings?.tips === false) {
      return;
    }

    this._clearSpeechTimers();

    this.bubbleText.setText(text || '');
    const padX = 12;
    const padY = 8;
    const boxW = Math.min(
      260,
      Math.max(64, Math.ceil(this.bubbleText.width) + padX * 2)
    );
    const boxH = Math.max(32, Math.ceil(this.bubbleText.height) + padY * 2);

    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(0xffffff, 0.96);
    this.bubbleBg.fillRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 8);
    this.bubbleBg.lineStyle(2, UI.navy, 1);
    this.bubbleBg.strokeRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 8);

    this._boxHalfH = boxH / 2;
    this.bubbleContainer.setPosition(
      this.sprite.x,
      this.sprite.y - 56 - this._boxHalfH
    );
    this.bubbleContainer.setVisible(true);
    this.bubbleContainer.setAlpha(0);

    this._bubbleTween = this.scene.tweens.add({
      targets: this.bubbleContainer,
      alpha: 1,
      duration: 150,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this._bubbleTween = null;
        this._bubbleTimer = setTimeout(() => {
          this._bubbleTimer = null;
          if (!this.bubbleContainer || !this.bubbleContainer.scene) return;
          this._bubbleTween = this.scene.tweens.add({
            targets: this.bubbleContainer,
            alpha: 0,
            duration: 200,
            ease: 'Sine.easeIn',
            onComplete: () => {
              this._bubbleTween = null;
              if (this.bubbleContainer && this.bubbleContainer.scene) {
                this.bubbleContainer.setVisible(false);
              }
            },
          });
        }, ms);
      },
    });
  }

  update(time) {
    if (!this.player || !this.sprite) return;

    const facingSign = this.player.facingX || 1;
    const targetX = this.player.x - facingSign * 85;
    const targetY = this.player.y - 150;

    this.baseX = Phaser.Math.Linear(this.baseX, targetX, 0.06);
    this.baseY = Phaser.Math.Linear(this.baseY, targetY, 0.06);

    const bob = Math.sin((time || 0) / 300) * 6;
    this.sprite.x = Math.round(this.baseX);
    this.sprite.y = Math.round(this.baseY + bob + (this.hopOffset || 0));
    this.sprite.setDepth(depthOf(this.player.y) + 0.02);
    this.sprite.setFlipX(facingSign < 0);

    if (this.bubbleContainer && this.bubbleContainer.visible) {
      const halfH = this._boxHalfH || 18;
      this.bubbleContainer.setPosition(
        Math.round(this.sprite.x),
        Math.round(this.sprite.y - 56 - halfH)
      );
    }
  }
}

export default Nova;
