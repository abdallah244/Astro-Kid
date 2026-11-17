import {
  deleteAccount,
  firstWordUpper,
  onAuthChange,
  refreshAuthState,
  signOut,
} from './auth.js';
import { clearButtonLoading, setButtonLoading } from './loading.js';

const DEFAULT_AVATAR = './assets/ui/avatar_face.png';

const TRASH_SVG =
  '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 8 9" shape-rendering="crispEdges">' +
  '<path fill="currentColor" d="M3 0h2v1H3zM0 1h8v1H0zM1 2h6v7H1z"/>' +
  '<path fill="#ffffff" d="M2 3h1v5H2zM5 3h1v5H5z" opacity="0.35"/>' +
  '</svg>';

let loadingTimer = null;

function clearLoadingTimer() {
  if (loadingTimer !== null) {
    window.clearTimeout(loadingTimer);
    loadingTimer = null;
  }
}

function setActiveView(root, name) {
  root.querySelectorAll('[data-profile-view]').forEach((view) => {
    view.hidden = view.getAttribute('data-profile-view') !== name;
  });
}

function formatMemberSince(createdAt) {
  if (!createdAt) return '—';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en', {
      month: 'long',
      year: 'numeric',
    })
      .format(date)
      .toUpperCase();
  } catch {
    return '—';
  }
}

function getFocusableInside(container) {
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hidden && el.offsetParent !== null);
}

function setupDeleteDialog(root) {
  const openBtn = root.querySelector('[data-pf-open-delete]');
  const dialog = document.querySelector('[data-pf-delete-dialog]');
  if (!openBtn || !dialog || dialog.dataset.bound === 'true') return;
  dialog.dataset.bound = 'true';

  const card = dialog.querySelector('[data-pf-dlg-card]');
  const input = dialog.querySelector('[data-pf-confirm-input]');
  const errorBox = dialog.querySelector('[data-pf-dlg-error]');
  const cancelBtn = dialog.querySelector('[data-pf-dlg-cancel]');
  const confirmBtn = dialog.querySelector('[data-pf-dlg-confirm]');

  if (!input || !cancelBtn || !confirmBtn) return;

  let isDeleting = false;
  let opener = null;

  const isConfirmed = () => input.value.trim() === 'DELETE';

  const syncConfirmState = () => {
    if (isDeleting) return;
    const ready = isConfirmed();
    input.classList.toggle('is-ready', ready);
    confirmBtn.setAttribute('aria-disabled', ready ? 'false' : 'true');
  };

  const resetDialog = () => {
    isDeleting = false;
    clearButtonLoading(confirmBtn);
    input.disabled = false;
    input.readOnly = false;
    input.value = '';
    cancelBtn.disabled = false;
    confirmBtn.innerHTML = `${TRASH_SVG} <span data-pf-confirm-label>DELETE FOREVER</span>`;
    if (errorBox) errorBox.hidden = true;
    syncConfirmState();
  };

  const closeModal = () => {
    if (isDeleting) return;
    if (dialog.open) dialog.close();
    if (opener && opener.isConnected) opener.focus();
    opener = null;
  };

  openBtn.addEventListener('click', () => {
    opener = openBtn;
    resetDialog();
    dialog.showModal();
    window.requestAnimationFrame(() => input.focus());
  });

  cancelBtn.addEventListener('click', closeModal);

  dialog.addEventListener('cancel', (event) => {
    if (isDeleting) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    closeModal();
  });

  dialog.addEventListener('mousedown', (event) => {
    if (isDeleting) return;
    if (card && !card.contains(event.target)) {
      closeModal();
    }
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusables = getFocusableInside(dialog);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  input.addEventListener('input', syncConfirmState);

  const runDelete = async () => {
    if (isDeleting || !isConfirmed()) return;
    isDeleting = true;
    if (errorBox) errorBox.hidden = true;

    input.disabled = true;
    input.readOnly = true;
    cancelBtn.disabled = true;
    setButtonLoading(confirmBtn, 'DELETING');

    const res = await deleteAccount();
    if (res.ok || res.status === 401) {
      try {
        sessionStorage.setItem('ak_flash', 'account_deleted');
      } catch {
        // Ignore storage errors
      }
      window.location.replace('./');
      return;
    }

    isDeleting = false;
    clearButtonLoading(confirmBtn);
    confirmBtn.innerHTML = `${TRASH_SVG} <span data-pf-confirm-label>TRY AGAIN</span>`;
    input.disabled = false;
    input.readOnly = false;
    cancelBtn.disabled = false;
    syncConfirmState();
    if (errorBox) errorBox.hidden = false;
    input.focus();
  };

  confirmBtn.addEventListener('click', () => {
    void runDelete();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && isConfirmed()) {
      event.preventDefault();
      void runDelete();
    }
  });
}

function populateReadyProfile(root, state) {
  const { user, profile } = state;

  const avatarEl = root.querySelector('[data-pf-avatar]');
  if (avatarEl) {
    if (avatarEl.dataset.fallbackBound !== 'true') {
      avatarEl.dataset.fallbackBound = 'true';
      avatarEl.addEventListener('error', () => {
        if (!avatarEl.src.endsWith('avatar_face.png')) {
          avatarEl.src = DEFAULT_AVATAR;
        }
      });
    }
    avatarEl.src = user.avatarUrl || DEFAULT_AVATAR;
  }

  const firstEl = root.querySelector('[data-pf-firstname]');
  if (firstEl) firstEl.textContent = firstWordUpper(profile, user);

  const fullEl = root.querySelector('[data-pf-fullname]');
  if (fullEl) fullEl.textContent = profile.fullName || '';

  const emailEl = root.querySelector('[data-pf-email]');
  if (emailEl) emailEl.textContent = user.email || '';

  const sinceEl = root.querySelector('[data-pf-since]');
  if (sinceEl) sinceEl.textContent = formatMemberSince(profile.createdAt);
}

function bindQuickActions(root) {
  const signOutBtn = root.querySelector('[data-pf-signout]');
  if (signOutBtn && signOutBtn.dataset.bound !== 'true') {
    signOutBtn.dataset.bound = 'true';
    signOutBtn.addEventListener('click', async () => {
      signOutBtn.disabled = true;
      await signOut();
      window.location.replace('./');
    });
  }
}

export function startProfileLoading() {
  const root = document.querySelector('[data-profile-page]');
  if (!root) return;
  clearLoadingTimer();
  setActiveView(root, 'none');
  loadingTimer = window.setTimeout(() => {
    loadingTimer = null;
    setActiveView(root, 'loading');
  }, 250);
}

export function renderProfilePage(state) {
  const root = document.querySelector('[data-profile-page]');
  if (!root) return;
  clearLoadingTimer();

  const retryBtn = root.querySelector('[data-pf-retry]');
  if (retryBtn && retryBtn.dataset.bound !== 'true') {
    retryBtn.dataset.bound = 'true';
    retryBtn.addEventListener('click', async () => {
      startProfileLoading();
      const next = await refreshAuthState();
      if (!next.authError && (!next.user || !next.profile)) {
        window.location.replace('./');
        return;
      }
      renderProfilePage(next);
    });
  }

  if (state.authError) {
    setActiveView(root, 'error');
    return;
  }

  if (!state.user || !state.profile) {
    setActiveView(root, 'none');
    return;
  }

  populateReadyProfile(root, state);
  bindQuickActions(root);
  setupDeleteDialog(root);
  setActiveView(root, 'ready');

  if (root.dataset.authWatched !== 'true') {
    root.dataset.authWatched = 'true';
    onAuthChange((next) => {
      if (!next.authError && !next.user && !root.querySelector('[data-profile-view="ready"]').hidden) {
        window.location.replace('./');
      }
    });
  }
}
