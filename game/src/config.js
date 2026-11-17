export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const STORAGE_KEY = 'astrokid.v1';

export const PIXEL = "'Press Start 2P'";
export const SILK = "'Silkscreen'";

export const COLORS = {
  ink: '#1a1a2e',
  space: '#060920',
  panel: '#141c4d',
  panelBorderLight: '#3a4a94',
  yellow: '#ffd23f',
  yellowShade: '#f5a524',
  orange: '#c2410c',
  blue: '#243372',
  blueButton: '#243372',
  blueShade: '#172052',
  track: '#0d1236',
  green: '#3fbf5f',
  greenShade: '#1d7a36',
  toggleOffShade: '#27336b',
  sliderInner: '#070a22',
  astroShadow: '#1f3f9a',
  tipBlue: '#dbe8ff',
  white: '#ffffff',
};

export const HEX = {
  ink: 0x1a1a2e,
  space: 0x060920,
  panel: 0x141c4d,
  panelBorderLight: 0x3a4a94,
  yellow: 0xffd23f,
  yellowShade: 0xf5a524,
  orange: 0xc2410c,
  blue: 0x243372,
  blueButton: 0x243372,
  blueShade: 0x172052,
  track: 0x0d1236,
  green: 0x3fbf5f,
  greenShade: 0x1d7a36,
  toggleOffShade: 0x27336b,
  sliderInner: 0x070a22,
  lockedTint: 0x4a4a5a,
  white: 0xffffff,
};

export const MISSIONS = [
  { id: 1, title: 'First Landing', file: 'missions/01_first_landing.webp' },
  { id: 2, title: 'Power Crisis', file: 'missions/02_power_crisis.webp' },
  { id: 3, title: 'Radiation Alert', file: 'missions/03_radiation_alert.webp' },
  { id: 4, title: 'Food Production', file: 'missions/04_food_production.webp' },
  { id: 5, title: 'Water Recycling', file: 'missions/05_water_recycling.webp' },
  { id: 6, title: 'Survival Mission', file: 'missions/06_survival_mission.webp' },
];

export function toColorNum(color) {
  if (typeof color === 'number') return color;
  if (typeof color === 'string' && color.startsWith('#')) {
    return parseInt(color.slice(1), 16);
  }
  return 0x000000;
}
