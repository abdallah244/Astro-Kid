import { SaveManager } from '../save.js';
import { actions } from '../core/actions.js';
import { audio } from '../core/audio.js';
import { UI, registerUi, uiPanel } from './theme.js';

export const InfoCard = {
  isOpen(scene) {
    return Boolean(scene && scene._activeInfoCard);
  },

  show(scene, { title, body, onClose } = {}) {
    if (!scene) return null;

    if (scene._activeInfoCard) {
      scene._activeInfoCard.close(false);
    }

    if (scene.player) {
      scene.player.stopMotion();
    }

    // Consume any pending interact press from the opening frame
    actions.justDown('interact');
    audio.play('SFX_Menu_Open');

    const backdrop = scene.add
      .rectangle(0, 0, 1280, 720, 0x000000, 0.45)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(149)
      .setInteractive();

    const panel = uiPanel(scene, 320, 195, 640, 330)
      .setScrollFactor(0)
      .setDepth(150);

    const divider = scene.add.graphics().setScrollFactor(0).setDepth(150);
    divider.fillStyle(0x2d377e, 1);
    divider.fillRect(350, 262, 580, 2);

    const titleText = scene.add
      .text(350, 218, title || '', {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '26px',
        color: UI.gold,
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(150);

    const bodyText = scene.add
      .text(350, 280, body || '', {
        fontFamily: UI.font,
        fontStyle: '500',
        fontSize: '18px',
        color: UI.white,
        wordWrap: { width: 580 },
        lineSpacing: 6,
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(150);

    const save = SaveManager.get();
    const interactPair = save?.settings?.keys?.interact;
    const keyName =
      (Array.isArray(interactPair) && (interactPair[0] || interactPair[1])) ||
      'E';

    const closeHint = scene.add
      .text(930, 502, `${String(keyName).toUpperCase()}  Close`, {
        fontFamily: UI.font,
        fontStyle: '700',
        fontSize: '15px',
        color: UI.soft,
      })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(150)
      .setInteractive({ useHandCursor: true });

    registerUi(scene, [backdrop, panel, divider, titleText, bodyText, closeHint]);

    const openedAt = performance.now();
    let closed = false;

    const close = (playSound = true) => {
      if (closed) return;
      closed = true;

      scene._activeInfoCard = null;
      scene._escConsumedAt = performance.now();
      scene._interactCooldownUntil = performance.now() + 120;
      actions.justDown('interact');
      actions.resetMovementKeys();

      if (scene.input && scene.input.keyboard) {
        scene.input.keyboard.off('keydown', onKeyDown);
      }

      backdrop.destroy();
      panel.destroy();
      divider.destroy();
      titleText.destroy();
      bodyText.destroy();
      closeHint.destroy();

      if (playSound) {
        audio.play('SFX_Menu_Close');
      }

      if (scene.player) {
        scene.player.canMove = true;
      }

      if (onClose) {
        onClose();
      }
    };

    const onKeyDown = (event) => {
      if (closed) return;
      if (performance.now() - openedAt < 90) return;

      if (event.code === 'Escape') {
        event.preventDefault();
        close(true);
        return;
      }

      const currentSave = SaveManager.get();
      const pair = currentSave?.settings?.keys?.interact || ['E', null];
      const pressedKey = event.key ? event.key.toUpperCase() : '';
      const codeKey = event.code
        ? event.code.replace(/^Key/, '').toUpperCase()
        : '';

      for (const bound of pair) {
        if (!bound) continue;
        const b = String(bound).toUpperCase();
        if (
          pressedKey === b ||
          codeKey === b ||
          (b === 'SPACE' && event.code === 'Space')
        ) {
          event.preventDefault();
          close(true);
          return;
        }
      }
    };

    closeHint.on('pointerdown', () => {
      if (performance.now() - openedAt >= 90) {
        close(true);
      }
    });

    if (scene.input && scene.input.keyboard) {
      scene.input.keyboard.on('keydown', onKeyDown);
    }

    scene.events.once('shutdown', () => {
      if (!closed) {
        closed = true;
        if (scene.input && scene.input.keyboard) {
          scene.input.keyboard.off('keydown', onKeyDown);
        }
        scene._activeInfoCard = null;
      }
    });

    const handle = { close };
    scene._activeInfoCard = handle;
    return handle;
  },
};

export default InfoCard;
