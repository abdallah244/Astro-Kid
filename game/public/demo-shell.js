/* Astro Kid Browser Demo Shell — Pre-play Notice, Persistent Badge & Failure Gates
 * Classic defer script loaded ONLY by /play.html (zero inline JS, zero API/session reads).
 * Keep small (< 8 KB gzip). Pure logic is attached to globalThis.__akDemoShell for Node tests.
 */
(function (global) {
  'use strict';

  var NOTICE_KEY = 'ak_demo_notice_seen';
  var TOUCH_KEY = 'ak_demo_touch_ack';
  var CONTACT_EMAIL = 'abdallahhfares@gmail.com';
  var BOOT_TIMEOUT_MS = 30000;

  var NOTICE_INTRO =
    'This demo is an early version of Astro Kid. We are sharing it now so you can try it and tell us what you think.';
  var NOTICE_BULLETS = [
    'Only the first mission is playable.',
    'Many parts are still missing, rough or not balanced yet.',
    'Things may break or look wrong. Please tell us when they do.',
    'Your progress is saved only in this browser and may be reset when we update the demo.',
    'The full game will be much better. Thank you for testing it!',
  ];
  var NOTICE_CONTROLS =
    'MOVE: A D W S OR ARROWS · RUN: SHIFT · INTERACT: E · TOOL: J OR CLICK · FLASHLIGHT: F · BACKPACK: I · TECH: C · MAP: M · GOALS: O · PAUSE: ESC';

  function isDesktopApp(env) {
    var src = env || {};
    var ua =
      typeof src.userAgent === 'string'
        ? src.userAgent
        : typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
        ? navigator.userAgent
        : '';
    var search =
      typeof src.search === 'string'
        ? src.search
        : typeof window !== 'undefined' && window.location
        ? window.location.search || ''
        : '';
    if (ua.indexOf('Electron/') !== -1) return true;
    try {
      return new URLSearchParams(search).get('app') === 'desktop';
    } catch (_) {
      return /(?:^\?|&)app=desktop(?:&|$)/.test(search);
    }
  }

  function shouldGateTouchDevice(env) {
    var src = env || {};
    var hasCoarse = Boolean(src.hasCoarse);
    var hasFine = Boolean(src.hasFine);
    var innerWidth = typeof src.innerWidth === 'number' ? src.innerWidth : 1280;
    var maxTouch = typeof src.maxTouchPoints === 'number' ? src.maxTouchPoints : 0;
    return (hasCoarse && !hasFine) || innerWidth < 900 || (maxTouch > 0 && !hasFine);
  }

  function readMeta(doc, name, fallback) {
    if (!doc || typeof doc.querySelector !== 'function') return fallback;
    var el = doc.querySelector('meta[name="' + name + '"]');
    var content = el && typeof el.getAttribute === 'function' ? el.getAttribute('content') : '';
    return content ? String(content).trim() : fallback;
  }

  function parseMetaFlags(doc) {
    var buildDate = readMeta(doc, 'ak-build', 'dev');
    var noticeRaw = readMeta(doc, 'ak-demo-notice', 'true').toLowerCase();
    return {
      buildDate: buildDate || 'dev',
      noticeEnabled: noticeRaw !== 'false',
    };
  }

  function readFlag(storage, key) {
    if (!storage || typeof storage.getItem !== 'function') return false;
    try {
      return storage.getItem(key) === '1';
    } catch (_) {
      return false;
    }
  }

  function writeFlag(storage, key) {
    if (!storage || typeof storage.setItem !== 'function') return false;
    try {
      storage.setItem(key, '1');
      return true;
    } catch (_) {
      return false;
    }
  }

  function hasSeenNotice(storage) {
    return readFlag(storage, NOTICE_KEY);
  }

  function markNoticeSeen(storage) {
    return writeFlag(storage, NOTICE_KEY);
  }

  function clip(value, maxLen) {
    return String(value || '')
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, maxLen);
  }

  function buildReportHref(opts) {
    var cfg = opts || {};
    var buildDate = clip(cfg.buildDate || 'dev', 40);
    var userAgent = clip(cfg.userAgent || 'unknown', 220);
    var errorSummary = cfg.errorSummary ? clip(cfg.errorSummary, 280) : '';
    var subject = errorSummary ? 'Astro Kid Demo Startup Error' : 'Astro Kid Demo Bug';
    var lines = [
      'Build: ' + buildDate,
      'Browser: ' + userAgent,
    ];
    if (errorSummary) lines.push('Error: ' + errorSummary);
    lines.push('', 'What happened:');
    return (
      'mailto:' +
      CONTACT_EMAIL +
      '?subject=' +
      encodeURIComponent(subject) +
      '&body=' +
      encodeURIComponent(lines.join('\n'))
    );
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function isCanvasSupported(doc) {
    try {
      var probe = doc.createElement('canvas');
      if (!probe || typeof probe.getContext !== 'function') return false;
      return Boolean(
        probe.getContext('webgl2') ||
          probe.getContext('webgl') ||
          probe.getContext('experimental-webgl') ||
          probe.getContext('2d')
      );
    } catch (_) {
      return false;
    }
  }

  function hideBootLoader(doc) {
    var loader = doc.getElementById('boot-loader');
    if (!loader || loader.classList.contains('is-done')) return;
    loader.classList.add('is-done');
    window.setTimeout(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
    }, 600);
  }

  function bootDemoShell() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;
    if (isDesktopApp()) return null;

    var flags = parseMetaFlags(document);
    var storage = null;
    try {
      storage = window.sessionStorage;
    } catch (_) {
      storage = null;
    }

    var state = {
      activeModal: null, // { backdrop, card, closeOnEsc, onClose }
      canvasReady: false,
      startupFailed: false,
      swallowUntil: 0,
      badge: null,
    };

    function getCanvas() {
      var game = document.getElementById('game');
      return game ? game.querySelector('canvas') : null;
    }

    function focusCanvas() {
      var canvas = getCanvas();
      if (!canvas) return;
      if (!canvas.hasAttribute('tabindex')) canvas.setAttribute('tabindex', '-1');
      try {
        canvas.focus({ preventScroll: true });
      } catch (_) {
        canvas.focus();
      }
    }

    function closeActiveModal(opts) {
      if (!state.activeModal) return;
      var modal = state.activeModal;
      if (opts && opts.fromKey) state.swallowUntil = Date.now() + 180;
      if (modal.backdrop.parentNode) modal.backdrop.parentNode.removeChild(modal.backdrop);
      state.activeModal = null;
      if (typeof modal.onClose === 'function') modal.onClose();
      focusCanvas();
    }

    function getFocusable(root) {
      var nodes = root.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      return Array.prototype.slice.call(nodes);
    }

    function showModal(cfg) {
      if (state.activeModal) closeActiveModal();

      var backdrop = el('div', 'ds-backdrop');
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.setAttribute('aria-labelledby', 'ds-modal-title');

      var card = el('div', 'ds-card' + (cfg.error ? ' ds-card--error' : ''));
      card.setAttribute('tabindex', '-1');

      var eyebrow = el('p', 'ds-eyebrow', cfg.eyebrow);
      var title = el('h1', 'ds-title', cfg.title);
      title.id = 'ds-modal-title';
      card.appendChild(eyebrow);
      card.appendChild(title);

      if (cfg.copy) card.appendChild(el('p', 'ds-copy', cfg.copy));

      if (cfg.bullets && cfg.bullets.length) {
        var list = el('ul', 'ds-list');
        for (var i = 0; i < cfg.bullets.length; i += 1) {
          list.appendChild(el('li', '', cfg.bullets[i]));
        }
        card.appendChild(list);
      }

      if (cfg.controls) card.appendChild(el('p', 'ds-controls', cfg.controls));

      if (cfg.errorDetail) {
        card.appendChild(el('pre', 'ds-error-detail', cfg.errorDetail));
      }

      if (cfg.fine) card.appendChild(el('p', 'ds-fine', cfg.fine));

      var actions = el('div', 'ds-actions');
      var focusTarget = null;
      for (var j = 0; j < cfg.actions.length; j += 1) {
        var act = cfg.actions[j];
        var ctrl = el(act.href ? 'a' : 'button', 'ds-btn ' + act.variant, act.label);
        if (act.href) {
          ctrl.href = act.href;
        } else {
          ctrl.type = 'button';
          (function (handler) {
            ctrl.addEventListener('click', function (ev) {
              handler(ev.detail === 0);
            });
          })(act.onClick);
        }
        if (act.primary) focusTarget = ctrl;
        actions.appendChild(ctrl);
      }
      card.appendChild(actions);

      // Stop allowed events from bubbling out of the dialog to window (Phaser input).
      ['keydown', 'keyup', 'pointerdown', 'mousedown', 'touchstart', 'wheel'].forEach(function (evtName) {
        backdrop.addEventListener(evtName, function (e) {
          e.stopPropagation();
        });
      });

      backdrop.appendChild(card);
      document.body.appendChild(backdrop);
      state.activeModal = { backdrop: backdrop, card: card, onClose: cfg.onClose };

      window.setTimeout(function () {
        if (focusTarget && typeof focusTarget.focus === 'function') {
          focusTarget.focus();
        } else {
          card.focus();
        }
      }, 0);
    }

    function openNotice(mode) {
      if (state.startupFailed) return;
      var label = mode === 'reopen' ? 'KEEP PLAYING' : 'START DEMO';
      showModal({
        eyebrow: 'EARLY DEMO',
        title: 'YOU ARE PLAYING AN UNFINISHED GAME',
        copy: NOTICE_INTRO,
        bullets: NOTICE_BULLETS,
        controls: NOTICE_CONTROLS,
        fine: 'Best on a computer with a keyboard and a mouse. · BUILD ' + flags.buildDate,
        actions: [
          {
            label: label,
            variant: 'ds-btn--primary',
            primary: true,
            onClick: function (fromKey) {
              markNoticeSeen(storage);
              closeActiveModal({ fromKey: fromKey });
            },
          },
          {
            label: 'BACK TO WEBSITE',
            variant: 'ds-btn--secondary',
            href: '/',
          },
        ],
      });
    }

    function openTouchGate(onContinue) {
      showModal({
        eyebrow: 'COMPUTER NEEDED',
        title: 'ASTRO KID NEEDS A KEYBOARD AND MOUSE',
        copy: 'The browser demo is designed for computers with a physical keyboard and mouse. Touch controls are not supported yet.',
        actions: [
          {
            label: 'BACK TO WEBSITE',
            variant: 'ds-btn--primary',
            primary: true,
            href: '/',
          },
          {
            label: 'TRY ANYWAY',
            variant: 'ds-btn--secondary',
            onClick: function (fromKey) {
              writeFlag(storage, TOUCH_KEY);
              closeActiveModal({ fromKey: fromKey });
              onContinue();
            },
          },
        ],
      });
    }

    function openStartupError(reason) {
      if (state.startupFailed) return;
      state.startupFailed = true;
      hideBootLoader(document);
      if (state.badge && state.badge.parentNode) {
        state.badge.parentNode.removeChild(state.badge);
        state.badge = null;
      }
      var summary = clip(reason || 'The game engine failed to initialize.', 280);
      showModal({
        error: true,
        eyebrow: 'STARTUP ERROR',
        title: 'THE DEMO COULD NOT START',
        copy: 'Something blocked Astro Kid from launching in this browser. Try reloading the page or using an updated desktop browser with WebGL enabled.',
        errorDetail: summary,
        actions: [
          {
            label: 'RELOAD',
            variant: 'ds-btn--primary',
            primary: true,
            onClick: function () {
              window.location.reload();
            },
          },
          {
            label: 'BACK TO WEBSITE',
            variant: 'ds-btn--secondary',
            href: '/',
          },
          {
            label: 'REPORT A PROBLEM',
            variant: 'ds-btn--danger-link',
            href: buildReportHref({
              buildDate: flags.buildDate,
              userAgent: navigator.userAgent,
              errorSummary: summary,
            }),
          },
        ],
      });
    }

    function mountBadge() {
      if (state.badge || state.startupFailed) return;
      var badge = el('aside', '');
      badge.id = 'demo-badge';
      badge.setAttribute('aria-label', 'Demo status and controls');

      var topRow = el('div', 'ds-badge__row');
      topRow.appendChild(el('span', 'ds-badge__tag', 'DEMO · EARLY VERSION'));

      if (flags.noticeEnabled) {
        var infoBtn = el('button', 'ds-pill ds-pill--icon', 'i');
        infoBtn.type = 'button';
        infoBtn.setAttribute('aria-label', 'About this early demo');
        infoBtn.title = 'About this early demo';
        infoBtn.addEventListener('click', function () {
          openNotice('reopen');
        });
        topRow.appendChild(infoBtn);
      }

      var bottomRow = el('div', 'ds-badge__row');
      var report = el('a', 'ds-pill', 'REPORT A PROBLEM');
      report.href = buildReportHref({
        buildDate: flags.buildDate,
        userAgent: navigator.userAgent,
      });

      var download = el('a', 'ds-pill ds-pill--cta', 'GET THE FULL GAME');
      download.href = '/download.html';

      bottomRow.appendChild(report);
      bottomRow.appendChild(download);
      badge.appendChild(topRow);
      badge.appendChild(bottomRow);

      badge.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !state.activeModal) {
          e.preventDefault();
          focusCanvas();
        }
      });

      var gameEl = document.getElementById('game');
      if (gameEl && gameEl.parentNode) {
        gameEl.parentNode.insertBefore(badge, gameEl.nextSibling);
      } else {
        document.body.appendChild(badge);
      }
      state.badge = badge;
    }

    // Window-level capture shield while modal is open (Esc is intentionally disabled on notices)
    function onKeyCapture(e) {
      if (Date.now() < state.swallowUntil) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (!state.activeModal) return;
      var card = state.activeModal.card;
      if (e.key === 'Tab') {
        var focusable = getFocusable(card);
        if (!focusable.length) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (e.type === 'keydown') {
          var idx = focusable.indexOf(document.activeElement);
          var nextIdx = e.shiftKey
            ? idx <= 0
              ? focusable.length - 1
              : idx - 1
            : idx === -1 || idx >= focusable.length - 1
            ? 0
            : idx + 1;
          e.preventDefault();
          focusable[nextIdx].focus();
        }
        e.stopPropagation();
        return;
      }
      var allowed = card.contains(e.target) && (e.key === 'Enter' || e.key === ' ');
      if (!allowed) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }

    function onPointerOrWheelCapture(e) {
      if (!state.activeModal) return;
      if (!state.activeModal.card.contains(e.target)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }

    window.addEventListener('keydown', onKeyCapture, true);
    window.addEventListener('keyup', onKeyCapture, true);
    window.addEventListener('pointerdown', onPointerOrWheelCapture, true);
    window.addEventListener('mousedown', onPointerOrWheelCapture, true);
    window.addEventListener('wheel', onPointerOrWheelCapture, { capture: true, passive: false });

    function onBootError(e) {
      if (state.canvasReady || state.startupFailed) return;
      var target = e && e.target;
      var msg =
        e && e.message
          ? e.message
          : target && target.tagName === 'SCRIPT'
          ? 'Failed to load script: ' + (target.src || 'module')
          : '';
      if (msg) openStartupError(msg);
    }

    function onBootRejection(e) {
      if (state.canvasReady || state.startupFailed) return;
      var reason = e && e.reason;
      var msg =
        reason && reason.message
          ? reason.message
          : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection during boot.';
      openStartupError(msg);
    }

    window.addEventListener('error', onBootError, true);
    window.addEventListener('unhandledrejection', onBootRejection);

    if (!isCanvasSupported(document)) {
      openStartupError('This browser has WebGL and HTML5 Canvas disabled.');
      return state;
    }

    var bootTimer = window.setTimeout(function () {
      if (!state.canvasReady && !getCanvas() && !state.startupFailed) {
        openStartupError('Game canvas did not initialize within 30 seconds.');
      }
    }, BOOT_TIMEOUT_MS);

    function afterCanvasReady() {
      if (state.canvasReady) return;
      state.canvasReady = true;
      window.clearTimeout(bootTimer);
      window.removeEventListener('error', onBootError, true);
      window.removeEventListener('unhandledrejection', onBootRejection);

      var canvas = getCanvas();
      if (canvas && !canvas.hasAttribute('tabindex')) {
        canvas.setAttribute('tabindex', '-1');
      }
      if (state.startupFailed) return;
      mountBadge();

      if (flags.noticeEnabled && !hasSeenNotice(storage) && !state.activeModal) {
        openNotice('start');
      }
    }

    function waitForCanvasAndReveal() {
      if (getCanvas()) {
        afterCanvasReady();
        return;
      }
      var gameEl = document.getElementById('game');
      if (!gameEl) return;
      var obs = new MutationObserver(function () {
        if (getCanvas()) {
          obs.disconnect();
          afterCanvasReady();
        }
      });
      obs.observe(gameEl, { childList: true, subtree: true });
    }

    var hasCoarse =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    var hasFine =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
    var needsTouchGate =
      !readFlag(storage, TOUCH_KEY) &&
      shouldGateTouchDevice({
        hasCoarse: hasCoarse,
        hasFine: hasFine,
        innerWidth: window.innerWidth,
        maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
      });

    if (needsTouchGate) {
      openTouchGate(waitForCanvasAndReveal);
    } else {
      waitForCanvasAndReveal();
    }

    return state;
  }

  var api = {
    NOTICE_KEY: NOTICE_KEY,
    TOUCH_KEY: TOUCH_KEY,
    NOTICE_BULLETS: NOTICE_BULLETS,
    isDesktopApp: isDesktopApp,
    shouldGateTouchDevice: shouldGateTouchDevice,
    parseMetaFlags: parseMetaFlags,
    hasSeenNotice: hasSeenNotice,
    markNoticeSeen: markNoticeSeen,
    buildReportHref: buildReportHref,
    bootDemoShell: bootDemoShell,
  };

  global.__akDemoShell = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootDemoShell, { once: true });
    } else {
      bootDemoShell();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
