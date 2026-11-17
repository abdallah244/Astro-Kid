/* First-visit opening animation (home page only, once per browser).
   The gate script (/intro-gate.js) decides whether it runs and hides the page
   with html.intro-pending. This module builds the overlay, plays the timeline,
   then reveals the page. Skippable with the button, Esc, Enter, Space or a click. */

const SEEN_KEY = 'ak_intro_seen_v1';

const TIMELINE = {
  idleAt: 1250, // astronaut arrives and stops walking
  leaveAt: 2900, // wipe starts (page becomes visible underneath)
  doneAt: 2900 + 1200, // overlay removed
};

const TITLE = ['ASTRO', 'KID'];
const BAND_COUNT = 10;

function starShadows(count, seedOffset) {
  // deterministic pseudo-random so the sky is identical on every visit
  let seed = 1337 + seedOffset;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const colors = ['#ffffff', '#a4aed9', '#ffd23f', '#ffffff'];
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const x = Math.round(rnd() * 98);
    const y = Math.round(rnd() * 74);
    parts.push(`${x}vw ${y}vh 0 ${rnd() > 0.85 ? 2 : 0}px ${colors[i % colors.length]}`);
  }
  return parts.join(',');
}

function buildTitle() {
  const h1 = document.createElement('p');
  h1.className = 'intro__title';
  h1.setAttribute('aria-hidden', 'true');
  let index = 0;
  TITLE.forEach((word, w) => {
    const holder = w === 1 ? Object.assign(document.createElement('span'), { className: 'accent' }) : h1;
    [...word].forEach((char) => {
      const span = document.createElement('span');
      span.className = 'intro__letter';
      span.style.setProperty('--i', String(index));
      span.textContent = char;
      holder.appendChild(span);
      index += 1;
    });
    if (w === 0) {
      const gap = document.createElement('span');
      gap.className = 'intro__letter sp';
      gap.style.setProperty('--i', String(index));
      h1.appendChild(gap);
      index += 1;
    } else {
      h1.appendChild(holder);
    }
  });
  return h1;
}

function buildOverlay() {
  const root = document.createElement('div');
  root.id = 'intro';
  root.className = 'intro';

  const bands = document.createElement('div');
  bands.className = 'intro__bands';
  bands.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < BAND_COUNT; i += 1) {
    const col = document.createElement('i');
    col.style.setProperty('--i', String(i));
    bands.appendChild(col);
  }

  const scene = document.createElement('div');
  scene.className = 'intro__scene';
  scene.setAttribute('aria-hidden', 'true');

  const starsA = document.createElement('div');
  starsA.className = 'intro__stars';
  starsA.style.boxShadow = starShadows(34, 0);
  const starsB = document.createElement('div');
  starsB.className = 'intro__stars intro__stars--b';
  starsB.style.boxShadow = starShadows(26, 99);

  const earth = document.createElement('img');
  earth.className = 'intro__earth';
  earth.src = '/assets/landing/earth.png';
  earth.alt = '';
  earth.width = 235;
  earth.height = 235;

  const ground = document.createElement('div');
  ground.className = 'intro__ground';

  const astro = document.createElement('div');
  astro.className = 'intro__astro';

  const tagline = document.createElement('p');
  tagline.className = 'intro__tagline';
  tagline.textContent = 'LEARN SPACE SCIENCE BY PLAYING';

  scene.append(starsA, starsB, earth, ground, astro, buildTitle(), tagline);

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'intro__skip';
  skip.textContent = 'SKIP';

  root.append(bands, scene, skip);
  return { root, astro, skip };
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* storage blocked: the gate will not show it next time either */
  }
}

async function waitForFont() {
  if (!document.fonts || !document.fonts.load) return;
  const timeout = new Promise((resolve) => window.setTimeout(resolve, 1200));
  try {
    await Promise.race([document.fonts.load("28px 'Press Start 2P'"), timeout]);
  } catch {
    /* fall back to the system monospace for the intro */
  }
}

export async function initIntro() {
  const html = document.documentElement;
  if (!html.classList.contains('intro-pending')) return;

  markSeen(); // first visit only, even if the visitor skips or reloads mid-way
  await waitForFont();

  const { root, astro, skip } = buildOverlay();
  document.body.appendChild(root);

  const timers = [];
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    timers.forEach((t) => window.clearTimeout(t));
    document.removeEventListener('keydown', onKey);
    root.remove();
    html.classList.remove('intro-pending');
    window.scrollTo(0, 0);
  };

  const leave = () => {
    if (root.classList.contains('intro--leaving')) return;
    root.classList.add('intro--leaving');
    html.classList.remove('intro-pending'); // page appears underneath the wipe
    timers.push(window.setTimeout(finish, TIMELINE.doneAt - TIMELINE.leaveAt));
  };

  const skipNow = () => {
    if (root.classList.contains('intro--leaving')) {
      finish();
      return;
    }
    leave();
  };

  function onKey(event) {
    if (['Escape', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      skipNow();
    }
  }

  timers.push(window.setTimeout(() => astro.classList.add('is-idle'), TIMELINE.idleAt));
  timers.push(window.setTimeout(leave, TIMELINE.leaveAt));
  document.addEventListener('keydown', onKey);
  skip.addEventListener('click', (event) => {
    event.stopPropagation();
    skipNow();
  });
  root.addEventListener('click', skipNow);
  skip.focus({ preventScroll: true });
}
