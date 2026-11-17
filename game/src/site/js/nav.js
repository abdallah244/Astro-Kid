import { firstWordUpper, getAuthState, handleEntryIntent, onAuthChange, signOut } from './auth.js';

const CARET_SVG =
  '<svg aria-hidden="true" width="12" height="8" viewBox="0 0 5 3" shape-rendering="crispEdges">' +
  '<path fill="#ffd23f" d="M0 0h5v1H0zM1 1h3v1H1zM2 2h1v1H2z"/>' +
  '</svg>';

const LOCK_SVG =
  '<svg class="field__locked-icon" role="img" aria-label="Locked" width="16" height="16" viewBox="0 0 8 8" shape-rendering="crispEdges">' +
  '<path fill="currentColor" d="M2 0h4v1H2zM1 1h2v1H1zM5 1h2v1H5zM1 2h2v1H1zM5 2h2v1H5zM0 3h8v1H0zM0 4h8v1H0zM0 5h3v1H0zM5 5h3v1H5zM0 6h3v1H0zM5 6h3v1H5zM0 7h8v1H0z"/>' +
  '</svg>';

const GOOGLE_SM_SVG =
  '<svg width="12" height="12" viewBox="0 0 18 18">' +
  '<path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>' +
  '<path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>' +
  '<path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>' +
  '<path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>' +
  '</svg>';

const PLAY_TRI_SVG =
  '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 6 6" shape-rendering="crispEdges">' +
  '<path fill="#0d2a14" d="M0 0h2v6H0zM2 1h2v4H2zM4 2h2v2H4z"/>' +
  '</svg>';

const HAMBURGER_HTML =
  '<span class="nav-burger" aria-hidden="true">' +
  '<span class="nav-burger__bar"></span>' +
  '<span class="nav-burger__bar"></span>' +
  '<span class="nav-burger__bar"></span>' +
  '</span>';

const HAMBURGER_CLOSE_HTML =
  '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 5 5" shape-rendering="crispEdges">' +
  '<path fill="#ffd23f" d="M0 0h1v1H0zM4 0h1v1H4zM1 1h1v1H1zM3 1h1v1H3zM2 2h1v1H2zM1 3h1v1H1zM3 3h1v1H3zM0 4h1v1H0zM4 4h1v1H4z"/>' +
  '</svg>';

function buildAccountMenu(state, onCloseMenu, isProfilePage) {
  const menu = document.createElement('div');
  menu.className = 'panel account-menu';
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Your account');
  menu.setAttribute('data-account-menu', '');

  const top = document.createElement('div');
  top.className = 'account-menu__top';

  const avatar = document.createElement('img');
  avatar.className = 'account-menu__avatar pixelated';
  avatar.src = state.user.avatarUrl || './assets/ui/avatar_face.png';
  avatar.alt = '';
  avatar.width = 64;
  avatar.height = 64;
  avatar.addEventListener('error', () => {
    avatar.src = './assets/ui/avatar_face.png';
  });

  const info = document.createElement('div');
  info.className = 'account-menu__info';

  const heading = document.createElement('div');
  heading.className = 'account-menu__heading';
  heading.textContent = 'YOUR ACCOUNT';

  const googleLine = document.createElement('div');
  googleLine.className = 'account-menu__google';

  const gBadge = document.createElement('span');
  gBadge.className = 'account-menu__gbadge';
  gBadge.setAttribute('aria-hidden', 'true');
  gBadge.innerHTML = GOOGLE_SM_SVG;

  const gText = document.createElement('span');
  gText.className = 'account-menu__gtext';
  gText.textContent = 'SIGNED IN WITH GOOGLE';

  googleLine.append(gBadge, gText);
  info.append(heading, googleLine);
  top.append(avatar, info);

  const nameGroup = document.createElement('div');
  nameGroup.className = 'field account-menu__field';
  const nameLabel = document.createElement('div');
  nameLabel.className = 'field__label field__label--muted';
  nameLabel.textContent = 'FULL NAME';
  const nameValBox = document.createElement('div');
  nameValBox.className = 'field__locked';
  const nameValSpan = document.createElement('span');
  nameValSpan.textContent = state.profile?.fullName || 'Registration pending';
  const nameLock = document.createElement('span');
  nameLock.innerHTML = LOCK_SVG;
  nameValBox.append(nameValSpan, nameLock.firstElementChild);
  nameGroup.append(nameLabel, nameValBox);

  const emailGroup = document.createElement('div');
  emailGroup.className = 'field account-menu__field';
  const emailLabel = document.createElement('div');
  emailLabel.className = 'field__label field__label--muted';
  emailLabel.textContent = 'EMAIL';
  const emailValBox = document.createElement('div');
  emailValBox.className = 'field__locked';
  const emailValSpan = document.createElement('span');
  emailValSpan.textContent = state.user.email || '';
  const emailLock = document.createElement('span');
  emailLock.innerHTML = LOCK_SVG;
  emailValBox.append(emailValSpan, emailLock.firstElementChild);
  emailGroup.append(emailLabel, emailValBox);

  const note = document.createElement('p');
  note.className = 'account-menu__note';
  note.textContent =
    "These details are locked and can't be edited. You can manage or delete your account from your profile.";

  const actions = document.createElement('div');
  actions.className = 'account-menu__actions';

  const viewProfile = document.createElement('a');
  viewProfile.className = 'btn btn--nav btn--blue btn--block';
  viewProfile.href = './profile.html';
  viewProfile.textContent = 'VIEW PROFILE';
  if (isProfilePage) {
    viewProfile.setAttribute('aria-current', 'page');
  }

  const signOutBtn = document.createElement('button');
  signOutBtn.type = 'button';
  signOutBtn.className = 'account-menu__signout';
  signOutBtn.textContent = 'SIGN OUT';
  signOutBtn.addEventListener('click', async () => {
    signOutBtn.disabled = true;
    await signOut();
    onCloseMenu(false);
    if (document.body?.dataset.requiresAuth === 'true') {
      window.location.replace('./');
    }
  });

  actions.append(viewProfile, signOutBtn);
  menu.append(top, nameGroup, emailGroup, note, actions);
  return menu;
}

export function initNav({ openSignInModal } = {}) {
  const header = document.querySelector('[data-site-header]');
  if (!header) return;

  const isProfilePage = Boolean(document.querySelector('[data-profile-page]'));
  const desktopActions = header.querySelector('[data-nav-actions]');
  const mobileControls = header.querySelector('[data-nav-mobile-controls]');
  const toggleBtn = header.querySelector('[data-nav-toggle]');
  const drawer = header.querySelector('[data-nav-drawer]');

  let activeMenu = null;
  let activeMenuTrigger = null;

  const closeDrawer = ({ restoreFocus = false } = {}) => {
    if (!drawer || !toggleBtn) return;
    drawer.hidden = true;
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.setAttribute('aria-label', 'Open menu');
    toggleBtn.innerHTML = HAMBURGER_HTML;
    if (restoreFocus) toggleBtn.focus();
  };

  const closeAccountMenu = (restoreFocus = false) => {
    if (activeMenu && activeMenu.isConnected) {
      activeMenu.remove();
    }
    if (activeMenuTrigger) {
      activeMenuTrigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus) activeMenuTrigger.focus();
    }
    activeMenu = null;
    activeMenuTrigger = null;
  };

  const toggleAccountMenu = (triggerEl) => {
    const { user, profile } = getAuthState();
    if (!user) return;

    if (activeMenu && activeMenuTrigger === triggerEl) {
      closeAccountMenu(true);
      return;
    }

    closeDrawer();
    closeAccountMenu(false);

    const wrap = header.querySelector('.site-header__bar') || header;
    activeMenuTrigger = triggerEl;
    triggerEl.setAttribute('aria-expanded', 'true');
    activeMenu = buildAccountMenu({ user, profile }, closeAccountMenu, isProfilePage);
    wrap.appendChild(activeMenu);
  };

  if (toggleBtn && drawer) {
    toggleBtn.addEventListener('click', () => {
      closeAccountMenu(false);
      const isOpen = drawer.hidden;
      drawer.hidden = !isOpen;
      toggleBtn.setAttribute('aria-expanded', String(isOpen));
      toggleBtn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
      toggleBtn.innerHTML = isOpen ? HAMBURGER_CLOSE_HTML : HAMBURGER_HTML;
    });

    drawer.querySelectorAll('a, button').forEach((item) => {
      item.addEventListener('click', () => closeDrawer());
    });
  }

  document.addEventListener('click', (event) => {
    if (
      activeMenu &&
      !activeMenu.contains(event.target) &&
      activeMenuTrigger &&
      !activeMenuTrigger.contains(event.target)
    ) {
      closeAccountMenu(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (activeMenu) {
      closeAccountMenu(true);
      return;
    }
    if (drawer && !drawer.hidden) {
      closeDrawer({ restoreFocus: true });
    }
  });

  const makeDemoLink = (cls, contentHtml) => {
    const link = document.createElement('a');
    link.href = './play.html';
    link.className = cls;
    link.innerHTML = contentHtml;
    return link;
  };

  const makeEntryButton = (intent, cls, contentHtml) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls;
    btn.setAttribute('data-auth-trigger', intent);
    btn.innerHTML = contentHtml;
    btn.addEventListener('click', () => {
      handleEntryIntent(intent, openSignInModal);
    });
    return btn;
  };

  const renderSignedOut = () => {
    closeAccountMenu(false);
    if (desktopActions) {
      desktopActions.replaceChildren(
        makeDemoLink('btn btn--nav btn--green', `${PLAY_TRI_SVG} PLAY DEMO`),
        makeEntryButton('download', 'btn btn--nav btn--yellow', 'GET THE GAME')
      );
    }
    if (mobileControls) {
      mobileControls.querySelectorAll('[data-account-mobile-btn]').forEach((n) => n.remove());
    }
  };

  const renderSignedIn = ({ user, profile }) => {
    closeAccountMenu(false);
    const avatarUrl = user.avatarUrl || './assets/ui/avatar_face.png';

    if (desktopActions) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'btn account-chip';
      chip.setAttribute('aria-haspopup', 'true');
      chip.setAttribute('aria-expanded', 'false');
      chip.setAttribute('aria-label', 'Account menu');
      if (isProfilePage) {
        chip.setAttribute('aria-current', 'page');
      }

      const av = document.createElement('img');
      av.className = 'account-chip__avatar pixelated';
      av.src = avatarUrl;
      av.alt = '';
      av.width = 38;
      av.height = 38;
      av.addEventListener('error', () => {
        av.src = './assets/ui/avatar_face.png';
      });

      const nameSpan = document.createElement('span');
      nameSpan.textContent = firstWordUpper(profile, user);

      const caret = document.createElement('span');
      caret.innerHTML = CARET_SVG;

      chip.append(av, nameSpan, caret.firstElementChild);
      chip.addEventListener('click', () => toggleAccountMenu(chip));

      desktopActions.replaceChildren(
        makeDemoLink('btn btn--nav btn--green', `${PLAY_TRI_SVG} PLAY DEMO`),
        makeEntryButton('download', 'btn btn--nav btn--yellow', 'DOWNLOAD'),
        chip
      );
    }

    if (mobileControls && toggleBtn) {
      mobileControls.querySelectorAll('[data-account-mobile-btn]').forEach((n) => n.remove());
      const mBtn = document.createElement('button');
      mBtn.type = 'button';
      mBtn.className = 'btn account-mobile-btn';
      mBtn.setAttribute('data-account-mobile-btn', '');
      mBtn.setAttribute('aria-haspopup', 'true');
      mBtn.setAttribute('aria-expanded', 'false');
      mBtn.setAttribute('aria-label', 'Account menu');
      if (isProfilePage) {
        mBtn.setAttribute('aria-current', 'page');
      }

      const mAv = document.createElement('img');
      mAv.className = 'account-mobile-btn__avatar pixelated';
      mAv.src = avatarUrl;
      mAv.alt = '';
      mAv.width = 36;
      mAv.height = 36;
      mAv.addEventListener('error', () => {
        mAv.src = './assets/ui/avatar_face.png';
      });

      mBtn.appendChild(mAv);
      mBtn.addEventListener('click', () => toggleAccountMenu(mBtn));
      mobileControls.insertBefore(mBtn, toggleBtn);
    }
  };

  onAuthChange((state) => {
    if (state.user) {
      renderSignedIn(state);
    } else {
      renderSignedOut();
    }
  });
}
