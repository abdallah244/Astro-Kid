/* About page interactive modules: data-driven Technology Tree & off-screen CTA pause */

const STATE_LABELS = {
  done: 'DONE',
  level1: 'LEVEL 1',
  open: 'OPEN',
  next: 'NEXT MISSION',
  locked: 'LOCKED',
};

const TECH_TREE_BRANCHES = [
  {
    id: 'tools',
    label: 'TOOLS',
    pill: './assets/level01/tree_ui/pill_tools.png',
    nodes: [
      { name: 'Basic Material Processing', icon: './assets/level01/tree_ui/n_factory.png', state: 'level1' },
      { name: 'Basic Mining', icon: './assets/level01/tree_ui/n_pickaxe_done.png', state: 'done' },
      { name: 'Improved Pickaxe', icon: './assets/level01/tree_ui/n_lock0.png', state: 'locked' },
      { name: 'Advanced Drill', icon: './assets/level01/tree_ui/n_lock0.png', state: 'locked' },
      { name: 'Repair Equipment', icon: './assets/level01/tree_ui/n_lock0.png', state: 'locked' },
    ],
  },
  {
    id: 'life',
    label: 'LIFE SUPPORT',
    pill: './assets/level01/tree_ui/pill_life.png',
    nodes: [
      { name: 'System Inspection', icon: './assets/level01/tree_ui/n_o2.png', state: 'open' },
      { name: 'Basic Filtration Research', icon: './assets/level01/tree_ui/n_lock0.png', state: 'locked' },
      { name: 'Oxygen Recovery', icon: './assets/level01/tree_ui/n_lock0.png', state: 'next' },
      { name: 'Advanced Life Support', icon: './assets/level01/tree_ui/n_lock0.png', state: 'locked' },
    ],
  },
  {
    id: 'power',
    label: 'POWER',
    pill: './assets/level01/tree_ui/pill_power.png',
    nodes: [
      { name: 'Battery Inspection', icon: './assets/level01/tree_ui/n_battery.png', state: 'open' },
      { name: 'Basic Solar Systems', icon: './assets/level01/tree_ui/n_lock0.png', state: 'next' },
      { name: 'Energy Storage', icon: './assets/level01/tree_ui/n_lock0.png', state: 'locked' },
      { name: 'Advanced Power Management', icon: './assets/level01/tree_ui/n_lock0.png', state: 'locked' },
    ],
  },
  {
    id: 'agri',
    label: 'AGRICULTURE',
    pill: './assets/level01/tree_ui/pill_agri.png',
    nodes: [
      { name: 'Basic Plant Research', icon: './assets/level01/tree_ui/n_lock0.png', state: 'locked' },
      { name: 'Hydroponics', icon: './assets/level01/tree_ui/n_lock0.png', state: 'locked' },
      { name: 'Food Production', icon: './assets/level01/tree_ui/n_lock0.png', state: 'locked' },
    ],
  },
  {
    id: 'build',
    label: 'CONSTRUCTION',
    pill: './assets/level01/tree_ui/pill_build.png',
    nodes: [
      { name: 'Basic Habitat Repair', icon: './assets/level01/tree_ui/n_cubes.png', state: 'open' },
      { name: 'Storage Expansion', icon: './assets/level01/tree_ui/n_lock0.png', state: 'locked' },
      { name: 'Habitat Expansion', icon: './assets/level01/tree_ui/n_lock0.png', state: 'locked' },
    ],
  },
  {
    id: 'explore',
    label: 'EXPLORATION',
    pill: './assets/level01/tree_ui/pill_explore.png',
    nodes: [
      { name: 'Surface Survey', icon: './assets/level01/tree_ui/n_dish.png', state: 'open' },
      { name: 'Advanced Scanner', icon: './assets/level01/tree_ui/n_lock0.png', state: 'locked' },
      { name: 'Deep Exploration', icon: './assets/level01/tree_ui/n_lock0.png', state: 'locked' },
    ],
  },
];

function buildTechNode(node) {
  const state = STATE_LABELS[node.state] ? node.state : 'locked';

  const li = document.createElement('li');
  li.className = `tech-node tech-node--${state}`;

  const icon = document.createElement('img');
  icon.className = 'tech-node__icon pixelated';
  icon.src = node.icon;
  icon.alt = '';
  icon.width = 44;
  icon.height = 46;
  icon.loading = 'lazy';
  icon.decoding = 'async';

  const body = document.createElement('span');
  body.className = 'tech-node__body';

  const title = document.createElement('span');
  title.className = 'tech-node__name';
  title.textContent = node.name;

  const tag = document.createElement('span');
  tag.className = `notch about-outpost__tag about-outpost__tag--${state} tech-node__tag`;
  tag.textContent = STATE_LABELS[state];

  body.append(title, tag);
  li.append(icon, body);
  return li;
}

function renderTechTree(root) {
  if (!root) return;
  const frag = document.createDocumentFragment();

  TECH_TREE_BRANCHES.forEach((branch) => {
    const branchEl = document.createElement('li');
    branchEl.className = 'tech-branch';

    const pill = document.createElement('div');
    pill.className = 'tech-branch__pill';

    const pillImg = document.createElement('img');
    pillImg.className = 'tech-branch__pill-img pixelated';
    pillImg.src = branch.pill;
    pillImg.alt = '';
    pillImg.width = 240;
    pillImg.height = 76;
    pillImg.loading = 'lazy';
    pillImg.decoding = 'async';

    const pillLabel = document.createElement('span');
    pillLabel.className = 'tech-branch__pill-label';
    pillLabel.textContent = branch.label;

    pill.append(pillImg, pillLabel);

    const nodesList = document.createElement('ul');
    nodesList.className = 'tech-branch__nodes';
    nodesList.setAttribute('aria-label', `${branch.label} research branch`);
    branch.nodes.forEach((node) => {
      nodesList.appendChild(buildTechNode(node));
    });

    branchEl.append(pill, nodesList);
    frag.appendChild(branchEl);
  });

  root.replaceChildren(frag);
}

function initLiveSceneObserver(scene) {
  if (!scene) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  if (!('IntersectionObserver' in window)) {
    scene.classList.add('is-live');
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        scene.classList.toggle('is-live', entry.isIntersecting);
      });
    },
    { rootMargin: '80px 0px', threshold: 0.01 }
  );

  observer.observe(scene);
}

export function initAboutPage() {
  renderTechTree(document.querySelector('[data-tech-tree]'));
  initLiveSceneObserver(document.querySelector('[data-live-scene]'));
}
