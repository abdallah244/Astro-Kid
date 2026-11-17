import { getReleaseInfo } from './api.js';
import { getAuthState, handleEntryIntent, onAuthChange, refreshAuthState } from './auth.js';
import { showToast, startDownload } from './download.js';
import {
  DOWNLOAD_FAQS,
  SYSTEM_REQUIREMENTS,
  VERIFY_COMMAND,
  formatPlatformShort,
  formatReleaseDate,
  formatReleaseSize,
  formatShortSha256,
} from './download-data.js';

const SVG_PLUS =
  '<svg class="dl-faq__icon" aria-hidden="true" width="14" height="14" viewBox="0 0 7 7" shape-rendering="crispEdges">' +
  '<path fill="currentColor" d="M3 0h1v7H3zM0 3h7v1H0z"/>' +
  '</svg>';

const SVG_MINUS =
  '<svg class="dl-faq__icon" aria-hidden="true" width="14" height="14" viewBox="0 0 7 7" shape-rendering="crispEdges">' +
  '<path fill="currentColor" d="M0 3h7v1H0z"/>' +
  '</svg>';

async function writeClipboardText(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below when Clipboard API is restricted
    }
  }

  const probe = document.createElement('textarea');
  probe.value = text;
  probe.setAttribute('readonly', '');
  probe.className = 'sr-only';
  document.body.appendChild(probe);
  probe.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  probe.remove();
  return ok;
}

function attachCopyHandler(btn, getText, liveEl, announcement) {
  if (!btn) return;
  let resetTimer = null;
  const defaultLabel = btn.textContent || 'COPY';

  btn.addEventListener('click', async () => {
    const value = getText();
    if (!value) return;
    const copied = await writeClipboardText(value);
    if (!copied) {
      showToast('Copy failed. Please select and copy manually.', {
        kind: 'error',
        isError: true,
      });
      return;
    }

    if (resetTimer !== null) window.clearTimeout(resetTimer);
    btn.textContent = 'COPIED';
    btn.classList.add('is-copied');
    if (liveEl) liveEl.textContent = announcement;

    resetTimer = window.setTimeout(() => {
      btn.textContent = defaultLabel;
      btn.classList.remove('is-copied');
      if (liveEl) liveEl.textContent = '';
      resetTimer = null;
    }, 2000);
  });
}

function renderRequirementsTable(tbody) {
  if (!tbody) return;
  const fragment = document.createDocumentFragment();

  for (const row of SYSTEM_REQUIREMENTS) {
    const tr = document.createElement('tr');

    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = row.spec;

    const tdMin = document.createElement('td');
    tdMin.textContent = row.minimum;

    const tdRec = document.createElement('td');
    tdRec.className = 'dl-req-table__rec';
    tdRec.textContent = row.recommended;

    tr.append(th, tdMin, tdRec);
    fragment.appendChild(tr);
  }

  tbody.replaceChildren(fragment);
}

function renderFaqAccordion(container) {
  if (!container) return;
  const fragment = document.createDocumentFragment();

  for (const item of DOWNLOAD_FAQS) {
    const article = document.createElement('article');
    article.className = item.defaultOpen ? 'dl-faq__item is-open' : 'dl-faq__item';

    const h3 = document.createElement('h3');
    h3.className = 'dl-faq__heading';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = `${item.id}-btn`;
    btn.className = 'dl-faq__btn';
    btn.setAttribute('aria-expanded', item.defaultOpen ? 'true' : 'false');
    btn.setAttribute('aria-controls', `${item.id}-panel`);

    const iconSlot = document.createElement('span');
    iconSlot.className = 'dl-faq__toggle-box';
    iconSlot.setAttribute('aria-hidden', 'true');
    iconSlot.innerHTML = item.defaultOpen ? SVG_MINUS : SVG_PLUS;

    const label = document.createElement('span');
    label.textContent = item.question;

    btn.append(iconSlot, label);
    h3.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = `${item.id}-panel`;
    panel.className = 'dl-faq__ans';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-labelledby', btn.id);
    if (!item.defaultOpen) panel.hidden = true;

    const p = document.createElement('p');
    p.textContent = item.answer;
    panel.appendChild(p);

    btn.addEventListener('click', () => {
      const nextOpen = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
      panel.hidden = !nextOpen;
      article.classList.toggle('is-open', nextOpen);
      iconSlot.innerHTML = nextOpen ? SVG_MINUS : SVG_PLUS;
    });

    article.append(h3, panel);
    fragment.appendChild(article);
  }

  container.replaceChildren(fragment);
}

function initHeroSceneObserver(heroEl) {
  if (!heroEl) return;
  if (
    !('IntersectionObserver' in window) ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    heroEl.classList.add('is-live');
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.target === heroEl) {
          heroEl.classList.toggle('is-live', entry.isIntersecting);
        }
      }
    },
    { threshold: 0.05 }
  );
  observer.observe(heroEl);
}

export function initDownloadPage(openers) {
  const root = document.querySelector('[data-dl-page]');
  if (!root) return;

  initHeroSceneObserver(root.querySelector('#top'));
  renderRequirementsTable(root.querySelector('[data-dl-reqs]'));
  renderFaqAccordion(root.querySelector('[data-dl-faq]'));

  const panel = root.querySelector('[data-dl-panel]');
  if (!panel) return;

  const fileNameEl = panel.querySelector('[data-dl-filename]');
  const fileSubEl = panel.querySelector('[data-dl-filesub]');
  const acctNameEl = panel.querySelector('[data-dl-acct-name]');
  const versionEl = panel.querySelector('[data-dl-meta="version"]');
  const sizeEl = panel.querySelector('[data-dl-meta="size"]');
  const platformEl = panel.querySelector('[data-dl-meta="platform"]');
  const releasedEl = panel.querySelector('[data-dl-meta="released"]');
  const shaRow = panel.querySelector('[data-dl-sha-row]');
  const shaShortEl = panel.querySelector('[data-dl-sha-short]');
  const shaFullEl = panel.querySelector('[data-dl-sha-full]');
  const shaCopyBtn = panel.querySelector('[data-dl-copy-sha]');
  const cmdCopyBtn = root.querySelector('[data-dl-copy-cmd]');
  const liveEl = root.querySelector('[data-dl-live]');

  const stateEls = new Map();
  panel.querySelectorAll('[data-dl-state]').forEach((el) => {
    stateEls.set(el.getAttribute('data-dl-state'), el);
  });

  let releaseState = { loading: true, ok: false, data: null };
  let flowState = 'idle'; // 'idle' | 'starting' | 'done' | 'unpublished' | 'error'
  let authState = getAuthState();
  let pendingDoneTimer = null;
  let activeDownloadToken = 0;

  const setMetaSkeleton = (isLoading) => {
    [versionEl, sizeEl, platformEl, releasedEl].forEach((el) => {
      if (!el) return;
      el.classList.toggle('skeleton', isLoading);
      el.classList.toggle('is-loading', isLoading);
    });
  };

  const renderReleaseMeta = () => {
    if (releaseState.loading) {
      setMetaSkeleton(true);
      if (fileSubEl) fileSubEl.textContent = 'CHECKING LATEST BUILD...';
      if (shaRow) shaRow.hidden = true;
      return;
    }

    setMetaSkeleton(false);

    if (!releaseState.ok) {
      if (fileSubEl) fileSubEl.textContent = 'COULD NOT CHECK BUILD';
      if (versionEl) versionEl.textContent = '—';
      if (sizeEl) sizeEl.textContent = '—';
      if (platformEl) platformEl.textContent = 'FREE';
      if (releasedEl) releasedEl.textContent = '—';
      if (shaRow) shaRow.hidden = true;
      return;
    }

    const rel = releaseState.data;
    if (!rel || !rel.published) {
      if (fileNameEl) fileNameEl.textContent = 'AstroKid-Setup.exe';
      if (fileSubEl) fileSubEl.textContent = 'WINDOWS 64-BIT · RELEASE PENDING';
      if (versionEl) versionEl.textContent = '—';
      if (sizeEl) sizeEl.textContent = '—';
      if (platformEl) platformEl.textContent = 'FREE';
      if (releasedEl) releasedEl.textContent = 'SOON';
      if (shaRow) shaRow.hidden = true;
      return;
    }

    const sizeLabel = formatReleaseSize(rel.sizeBytes);
    if (fileNameEl) fileNameEl.textContent = rel.filename || 'AstroKid-Setup.exe';
    if (fileSubEl) fileSubEl.textContent = `v${rel.version} · WINDOWS · ${sizeLabel}`;
    if (versionEl) versionEl.textContent = rel.version;
    if (sizeEl) sizeEl.textContent = sizeLabel;
    if (platformEl) platformEl.textContent = 'FREE';
    if (releasedEl) releasedEl.textContent = formatReleaseDate(rel.releasedAt);

    if (shaRow && shaShortEl && rel.sha256) {
      shaShortEl.textContent = formatShortSha256(rel.sha256);
      shaShortEl.title = rel.sha256;
      if (shaFullEl) shaFullEl.textContent = rel.sha256;
      shaRow.hidden = false;
    } else if (shaRow) {
      shaRow.hidden = true;
    }
  };

  const resolveActivePanelState = () => {
    if (flowState === 'starting') return 'starting';
    if (flowState === 'done') return 'done';
    if (flowState === 'error') return 'error';
    if (flowState === 'unpublished') return 'unpublished';

    if (!releaseState.loading) {
      if (!releaseState.ok) return 'error';
      if (!releaseState.data?.published) return 'unpublished';
    }

    if (authState.user && authState.profile) return 'ready';
    return 'signedout';
  };

  const renderPanel = () => {
    renderReleaseMeta();

    if (acctNameEl && authState.user) {
      acctNameEl.textContent = (authState.profile?.fullName?.trim().split(/\s+/)[0] || authState.user.email?.split('@')[0] || '').toUpperCase().slice(0, 12);
    }

    const active = resolveActivePanelState();
    panel.setAttribute('data-active-state', active);
    for (const [key, el] of stateEls.entries()) {
      el.hidden = key !== active;
    }
  };

  const loadReleaseInfo = async () => {
    releaseState = { loading: true, ok: false, data: null };
    renderPanel();
    const res = await getReleaseInfo();
    releaseState = res.ok
      ? { loading: false, ok: true, data: res.data }
      : { loading: false, ok: false, data: null };
    renderPanel();
    return res;
  };

  const clearPendingDone = () => {
    if (pendingDoneTimer !== null) {
      window.clearTimeout(pendingDoneTimer);
      pendingDoneTimer = null;
    }
  };

  const runPanelDownload = async () => {
    clearPendingDone();
    activeDownloadToken += 1;

    if (!releaseState.ok) {
      const retryRelease = await loadReleaseInfo();
      if (!retryRelease.ok) {
        flowState = 'error';
        renderPanel();
        showToast('Could not reach the server. Please check your connection.', {
          kind: 'error',
          isError: true,
        });
        return;
      }
      flowState = 'idle';
      if (!retryRelease.data?.published) {
        renderPanel();
        return;
      }
    }

    if (!authState.user || !authState.profile) {
      handleEntryIntent('download', openers);
      return;
    }

    await startDownload({ inline: true });
  };

  document.addEventListener('ak:download-phase', (event) => {
    const { phase } = event.detail || {};
    clearPendingDone();

    if (phase === 'starting') {
      activeDownloadToken += 1;
      flowState = 'starting';
      renderPanel();
      return;
    }

    if (phase === 'done') {
      const token = activeDownloadToken;
      // Hold State 3 briefly so the user sees "YOUR DOWNLOAD IS STARTING" before transitioning to "DOWNLOAD STARTED".
      pendingDoneTimer = window.setTimeout(() => {
        if (token !== activeDownloadToken) return;
        flowState = 'done';
        renderPanel();
      }, 900);
      return;
    }

    if (phase === 'unpublished') {
      flowState = 'unpublished';
      renderPanel();
      return;
    }

    if (phase === 'auth_required') {
      flowState = 'idle';
      void refreshAuthState();
      handleEntryIntent('download', openers);
      return;
    }

    flowState = 'error';
    renderPanel();
  });

  panel.addEventListener('click', (event) => {
    const startBtn = event.target.closest('[data-dl-start]');
    if (startBtn) {
      void runPanelDownload();
      return;
    }

    const retryBtn = event.target.closest('[data-dl-retry]');
    if (retryBtn) {
      void runPanelDownload();
    }
  });

  attachCopyHandler(
    shaCopyBtn,
    () => releaseState.data?.sha256 || '',
    liveEl,
    'SHA-256 checksum copied to clipboard.'
  );
  attachCopyHandler(
    cmdCopyBtn,
    () => VERIFY_COMMAND,
    liveEl,
    'PowerShell verification command copied to clipboard.'
  );

  onAuthChange((nextAuth) => {
    authState = nextAuth;
    if (!nextAuth.user || !nextAuth.profile) {
      clearPendingDone();
      if (flowState === 'done' || flowState === 'starting') {
        flowState = 'idle';
      }
    }
    renderPanel();
  });

  void loadReleaseInfo();
}
