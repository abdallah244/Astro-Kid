import { bus } from '../core/events.js';
import { state } from '../core/state.js';
import { audio } from '../core/audio.js';
import { UI, registerUi, uiPanel } from './theme.js';

const STAR_ROWS = [
  [[8, 8]],
  [[7, 9]],
  [[7, 9]],
  [[6, 10]],
  [[6, 10]],
  [[0, 16]],
  [[1, 15]],
  [[2, 14]],
  [[3, 13]],
  [[4, 12]],
  [[4, 12]],
  [[3, 13]],
  [
    [3, 7],
    [9, 13],
  ],
  [
    [2, 6],
    [10, 14],
  ],
  [
    [2, 5],
    [11, 14],
  ],
  [
    [1, 3],
    [13, 15],
  ],
  [
    [1, 2],
    [14, 15],
  ],
];

export class ScorePanel {
  constructor(scene) {
    this.scene = scene;
    this.displayedScore = state.score;
    this._countTween = null;
    this._lastTickAt = 0;

    this.bg = uiPanel(scene, 514, 12, 252, 62)
      .setScrollFactor(0)
      .setDepth(100);

    // 34x34 pixel gold star centered at (540, 43) => top-left (523, 26)
    this.starGfx = scene.add.graphics().setScrollFactor(0).setDepth(100);
    this._drawStar(540 - 17, 43 - 17);

    this.labelText = scene.add
      .text(586, 26, 'Score', {
        fontFamily: UI.font,
        fontStyle: '600',
        fontSize: '14px',
        color: UI.white,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(100);

    this.valueText = scene.add
      .text(586, 36, `${this.displayedScore}`, {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '30px',
        color: UI.gold,
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100);

    registerUi(scene, [this.bg, this.starGfx, this.labelText, this.valueText]);

    this._onScore = (newTotal) => {
      if (!this.scene || !this.valueText || !this.valueText.scene) return;
      if (this._countTween) {
        this._countTween.stop();
      }

      const startVal = this.displayedScore;
      const counter = { val: startVal };
      this._lastTickAt = 0;

      this._countTween = this.scene.tweens.add({
        targets: counter,
        val: newTotal,
        duration: 500,
        ease: 'Linear',
        onUpdate: () => {
          const rounded = Math.round(counter.val);
          if (rounded !== this.displayedScore) {
            this.displayedScore = rounded;
            this.valueText.setText(`${rounded}`);
          }
          const now = performance.now();
          if (now - this._lastTickAt >= 60) {
            this._lastTickAt = now;
            audio.play('SFX_Score_Tick', { gain: 0.65 });
          }
        },
        onComplete: () => {
          this.displayedScore = newTotal;
          if (this.valueText && this.valueText.scene) {
            this.valueText.setText(`${newTotal}`);
          }
          this._countTween = null;
        },
      });
    };

    bus.on('score', this._onScore);

    scene.events.once('shutdown', () => {
      this.destroy();
    });
  }

  _drawStar(topLeftX, topLeftY) {
    const cell = 2;
    this.starGfx.fillStyle(0xffc83d, 1);
    STAR_ROWS.forEach((segments, rowIdx) => {
      for (const [c0, c1] of segments) {
        this.starGfx.fillRect(
          topLeftX + c0 * cell,
          topLeftY + rowIdx * cell,
          (c1 - c0 + 1) * cell,
          cell
        );
      }
    });
  }

  destroy() {
    if (this._countTween) {
      this._countTween.stop();
      this._countTween = null;
    }
    bus.off('score', this._onScore);
  }
}

export default ScorePanel;
