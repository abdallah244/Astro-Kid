export const VIEW_W = 1280;
export const VIEW_H = 720;

export const WORLD_W = 7680;
export const WORLD_H = 2880;

export const WALK_SPEED = 220;
export const RUN_SPEED = 340;
export const ACCEL = 2600;
export const FRICTION = 3200;
export const TURN_ACCEL = 5200;

export const PLAYER_SCALE = 0.8;
export const PLAYER_START = { x: 1500, y: 1700 };

export const BASE = { x: 1800, y: 1500, w: 760 };
export const DOOR = { x: 1744, y: 1510, range: 120 };
export const PLAYABLE = { x1: 600, y1: 720, x2: 7000, y2: 2280 };

export const REGIONS = [
  { id: 'lunar_base', name: 'Lunar Base', x1: 1000, y1: 1000, x2: 2800, y2: 2000, state: 'open' },
  { id: 'lunar_plains', name: 'Lunar Plains', x1: 2800, y1: 700, x2: 7000, y2: 2300, state: 'open' },
  { id: 'iron_field', name: 'Iron Field', x1: 200, y1: 100, x2: 1600, y2: 700, state: 'fogged' },
  { id: 'silicon_flats', name: 'Silicate Flats', x1: 2000, y1: 2300, x2: 4400, y2: 2800, state: 'fogged' },
  { id: 'highland_ridge', name: 'Highland Ridge', x1: 5200, y1: 100, x2: 7600, y2: 650, state: 'locked' },
  { id: 'shadowed_crater', name: 'Shadowed Crater', x1: 7000, y1: 700, x2: 7680, y2: 1500, state: 'locked' },
  { id: 'ice_deposit', name: 'Ice Deposit', x1: 7000, y1: 1600, x2: 7680, y2: 2700, state: 'locked' },
];

export const ROCK_NODES = [
  ['regolith', 3200, 1500],
  ['regolith', 3700, 1050],
  ['regolith', 4300, 1800],
  ['regolith', 5500, 2000],
  ['regolith', 6200, 1100],
  ['regolith', 4900, 1200],
];

export const CAVES = [
  {
    id: 'iron_cave',
    name: 'Iron Cave',
    x: 4500,
    y: 1000,
    sample: 'ironrich',
    door: { x: 4500, y: 1060 },
  },
  {
    id: 'crystal_cave',
    name: 'Crystal Cave',
    x: 6000,
    y: 1900,
    sample: 'silicate',
    door: { x: 6000, y: 1960 },
  },
];

export const depthOf = (y) => Math.round((y / 30) * 100) / 100;
