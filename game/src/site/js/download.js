import { checkAndStartDownload } from './api.js';
import { withPageLoader } from './page-loader.js';

const TOAST_ICONS = {
  success:
    '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 7 6" shape-rendering="crispEdges">' +
    '<path fill="#0d2a14" d="M6 0h1v1H6zM5 1h1v1H5zM4 2h1v1H4zM3 3h1v1H3zM2 4h1v1H2zM0 2h1v1H0zM1 3h1v1H1z"/>' +
    '</svg>',
  info:
    '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 5 7" shape-rendering="crispEdges">' +
    '<path fill="#060920" d="M2 0h1v1H2zM2 2h1v5H2zM1 6h3v1H1z"/>' +
    '</svg>',
  error:
    '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 5 7" shape-rendering="crispEdges">' +
    '<path fill="#ffffff" d="M2 0h1v4H2zM2 5h1v2H2z"/>' +
    '</svg>',
};

const CLOSE_SVG =
  '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 6 6" shape-rendering="crispEdges">' +
  '<path fill="currentColor" d="M0 0h2v2H0zM4 0h2v2H4zM2 2h2v2H2zM0 4h2v2H0zM4 4h2v2H4z"/>' +
  '</svg>';

let activeToastCleanup = null;

/**
 * Show a temporary non-blocking 3-kind pixel toast in the bottom-right corner.
 * @param {string} message
 * @param {{ kind?: 'success'|'info'|'error', isError?: boolean, durationMs?: number }} [options]
 */
export function showToast(message, { kind, isError = false, durationMs = 5000 } = {}) {
  if (activeToastCleanup) {
    activeToastCleanup();
    activeToastCleanup = null;
  }

  const resolvedKind =
    kind === 'success' || kind === 'info' || kind === 'error'
      ? kind
      : isError
        ? 'error'
        : 'success';

  const el = document.createElement('div');
  el.className = `toast toast--${resolvedKind}`;
  el.setAttribute('role', resolvedKind === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', resolvedKind === 'error' ? 'assertive' : 'polite');

  const body = document.createElement('div');
  body.className = 'toast__body';

  const icon = document.createElement('span');
  icon.className = 'toast__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = TOAST_ICONS[resolvedKind];

  const msg = document.createElement('p');
  msg.className = 'toast__msg';
  msg.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast__close';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.innerHTML = CLOSE_SVG;

  body.append(icon, msg, closeBtn);

  const bar = document.createElement('div');
  bar.className = 'toast__bar';
  bar.setAttribute('aria-hidden', 'true');
  const barFill = document.createElement('span');
  barFill.className = 'toast__bar-fill';
  bar.appendChild(barFill);

  el.append(body, bar);
  document.body.appendChild(el);

  let timerId = null;
  let remaining = Math.max(0, durationMs);
  let lastStartedAt = 0;

  const dismiss = () => {
    if (timerId !== null) {
      window.clearTimeout(timerId);
      timerId = null;
    }
    document.removeEventListener('keydown', onKeyDown);
    if (el.isConnected) el.remove();
    if (activeToastCleanup === dismiss) activeToastCleanup = null;
  };

  const pauseTimer = () => {
    if (timerId === null) return;
    window.clearTimeout(timerId);
    timerId = null;
    remaining = Math.max(0, remaining - (Date.now() - lastStartedAt));
  };

  const resumeTimer = () => {
    if (remaining <= 0 || timerId !== null) return;
    if (el.matches(':hover') || el.contains(document.activeElement)) return;
    lastStartedAt = Date.now();
    timerId = window.setTimeout(dismiss, remaining);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      dismiss();
    }
  };

  closeBtn.addEventListener('click', dismiss);
  el.addEventListener('mouseenter', pauseTimer);
  el.addEventListener('mouseleave', resumeTimer);
  el.addEventListener('focusin', pauseTimer);
  el.addEventListener('focusout', () => {
    window.setTimeout(resumeTimer, 0);
  });
  document.addEventListener('keydown', onKeyDown);

  activeToastCleanup = dismiss;
  if (remaining > 0) {
    lastStartedAt = Date.now();
    timerId = window.setTimeout(dismiss, remaining);
  }
}

/** Pre-check `/api/download`, navigate on 200, or show friendly toast. */
export async function startDownload({ inline = false } = {}) {
  document.dispatchEvent(
    new CustomEvent('ak:download-phase', { detail: { phase: 'starting', inline } })
  );

  const runCheck = () => checkAndStartDownload();
  const result = inline
    ? await runCheck()
    : await withPageLoader(runCheck, { label: 'CHECKING INSTALLER' });

  let phase = 'error';
  if (result.ok) {
    phase = 'done';
    showToast('Your download is starting', { kind: 'success' });
  } else if (result.error === 'not_published') {
    phase = 'unpublished';
    showToast('The installer is not published yet. We will email you when it is ready.', {
      kind: 'info',
    });
  } else if (result.error === 'network_error') {
    phase = 'error';
    showToast('Could not reach the server. Please check your connection.', {
      kind: 'error',
      isError: true,
    });
  } else if (result.error === 'unauthenticated' || result.error === 'profile_required') {
    phase = 'auth_required';
    showToast('Please complete sign-in before downloading.', {
      kind: 'error',
      isError: true,
    });
  } else {
    phase = 'error';
    showToast('Could not start download. Please try again.', {
      kind: 'error',
      isError: true,
    });
  }

  document.dispatchEvent(
    new CustomEvent('ak:download-phase', { detail: { phase, result, inline } })
  );
  return result;
}
