'use strict';

(function () {
  var TIPS = [
    'Keep an eye on your oxygen.',
    'Solar panels sleep at night.',
    'Earth cannot answer instantly.',
  ];

  var api = window.astroKidInstaller;
  var viewWelcome = document.getElementById('view-welcome');
  var viewInstalling = document.getElementById('view-installing');
  var specVersion = document.getElementById('spec-version');
  var specPlatform = document.getElementById('spec-platform');
  var specSize = document.getElementById('spec-size');
  var altBadge = document.getElementById('alt-badge');
  var altValue = document.getElementById('alt-value');
  var crate = document.getElementById('inst-crate');
  var progTrack = document.getElementById('prog-track');
  var progFill = document.getElementById('prog-fill');
  var progStatus = document.getElementById('prog-status');
  var progPct = document.getElementById('prog-pct');
  var installingTitle = document.getElementById('installing-title');
  var installingCopy = document.getElementById('installing-copy');
  var novaTip = document.getElementById('nova-tip');
  var btnPrimaryWrap = document.getElementById('btn-primary-wrap');
  var btnPrimary = document.getElementById('btn-primary');
  var btnPrimaryLabel = document.getElementById('btn-primary-label');
  var btnCancelWrap = document.getElementById('btn-cancel-wrap');
  var btnCancel = document.getElementById('btn-cancel');
  var srStatus = document.getElementById('sr-status');
  var step1 = document.getElementById('step-1');
  var step2 = document.getElementById('step-2');
  var step3 = document.getElementById('step-3');
  var step4 = document.getElementById('step-4');

  var mode = 'welcome';
  var tipTimer = null;
  var tipIndex = 0;

  function formatMiB(bytes) {
    if (!bytes || bytes <= 0) return '~285 MB free space';
    return '~' + Math.ceil(bytes / (1024 * 1024)) + ' MB free space';
  }

  function updateProgressUI(percent, label) {
    var clamped = Math.max(0, Math.min(100, Math.round(percent)));
    var p = clamped / 100;
    progFill.style.width = clamped + '%';
    progTrack.setAttribute('aria-valuenow', String(clamped));
    progPct.textContent = clamped + '%';
    if (label) progStatus.textContent = label;
    crate.style.transform = 'translateY(' + Math.round(250 * p) + 'px)';
    var meters = Math.max(0, Math.round(1500 * (1 - p)));
    altValue.textContent = meters.toLocaleString('en-US') + ' M';
  }

  function enterInstallingView() {
    mode = 'installing';
    viewWelcome.hidden = true;
    viewInstalling.hidden = false;
    altBadge.hidden = false;
    btnPrimaryWrap.hidden = true;
    step1.className = 'is-done';
    step2.className = 'is-done';
    step3.className = 'is-done';
    step4.className = 'is-current';
    updateProgressUI(0, 'Preparing archive…');
    srStatus.textContent = 'Extracting game files.';

    tipIndex = 0;
    novaTip.textContent = TIPS[0];
    tipTimer = window.setInterval(function () {
      tipIndex = (tipIndex + 1) % TIPS.length;
      novaTip.textContent = TIPS[tipIndex];
    }, 6000);
  }

  function finishSpikeUI(result) {
    if (tipTimer) {
      window.clearInterval(tipTimer);
      tipTimer = null;
    }
    mode = 'done';
    step4.className = 'is-done';
    btnPrimaryWrap.hidden = false;
    btnCancelWrap.hidden = true;
    if (result && result.ok) {
      updateProgressUI(100, 'Extracted in ' + (result.extractMs / 1000).toFixed(2) + 's');
      installingTitle.textContent = 'LANDED IN TEMP';
      installingCopy.textContent = 'Extracted into ' + result.targetDir + '.';
      btnPrimaryLabel.textContent = 'CLOSE';
      srStatus.textContent = 'Spike extraction finished.';
    } else {
      installingTitle.textContent = 'EXTRACTION FAILED';
      installingCopy.textContent = (result && result.error) || 'Unknown extraction error.';
      progStatus.textContent = 'Rolled back.';
      btnPrimaryLabel.textContent = 'CLOSE';
      srStatus.textContent = 'Spike extraction failed.';
    }
  }

  document.getElementById('btn-min').addEventListener('click', function () {
    api.minimize();
  });
  document.getElementById('btn-close').addEventListener('click', function () {
    api.close();
  });
  btnCancel.addEventListener('click', function () {
    if (mode === 'installing') {
      api.cancelInstall();
    } else {
      api.close();
    }
  });

  btnPrimary.addEventListener('click', function () {
    if (mode === 'welcome') {
      enterInstallingView();
      api.startSpikeInstall().then(finishSpikeUI);
    } else if (mode === 'done') {
      api.close();
    }
  });

  api.onProgress(function (data) {
    if (!data) return;
    updateProgressUI(data.percent || 0, data.label || 'Extracting game files…');
  });

  api.getManifest().then(function (m) {
    specVersion.textContent = 'v' + (m.version || '0.1.0');
    specPlatform.textContent = m.platform || 'Windows 10 / 11 · 64-bit';
    specSize.textContent = formatMiB(m.unpackedBytes);
  });
})();
