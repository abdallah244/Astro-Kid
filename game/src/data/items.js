export const ITEMS = {
  flashlight:  { name:'Flashlight', icon:'icon_flashlight', kind:'tool',     stack:1,  desc:'Lights dark places. Uses battery power.' },
  basic_pickaxe:{ name:'Basic Pickaxe', icon:'icon_pickaxe', kind:'tool',    stack:1,  desc:'Breaks rocks to collect samples. It wears out.' },
  lunar_regolith_sample:        { name:'Lunar Regolith',         icon:'icon_regolith', kind:'sample', stack:20, desc:'Loose lunar dust and small rock pieces.' },
  ilmenite_bearing_basalt_sample:{ name:'Iron-bearing Rock',     icon:'icon_ironrock', kind:'sample', stack:10, desc:'Dark rock that can contain iron and titanium minerals.' },
  silicate_rich_rock_sample:    { name:'Silicate Rock',          icon:'icon_silicate', kind:'sample', stack:10, desc:'Pale rock with silicate minerals. It is not pure silicon.' },
  oxygen_canister: { name:'Oxygen Canister', icon:'icon_oxygen', kind:'use', stack:5, desc:'Emergency oxygen. Use it to breathe easier.', use:{ oxygen:40 } },
  canned_food:     { name:'Canned Food',     icon:'icon_food',   kind:'use', stack:10, desc:'A meal from Earth. Use it when you are hungry.', use:{ hunger:30 } },
  battery_cell:    { name:'Battery Cell',    icon:'icon_battery',kind:'use', stack:10, desc:'Recharges the flashlight to full.', use:{ flashlight:100 } },
  spare_parts_kit: { name:'Spare Parts Kit', icon:'icon_kit',    kind:'part',stack:5,  desc:'Used to build machines.' }
};

export const SAMPLE_TYPES = [
  'lunar_regolith_sample',
  'ilmenite_bearing_basalt_sample',
  'silicate_rich_rock_sample',
];

export const ITEM_ICON_ENTRIES = [
  ['icon_oxygen', 'assets/level01/icons/icon_oxygen.png'],
  ['icon_food', 'assets/level01/icons/icon_food.png'],
  ['icon_battery', 'assets/level01/icons/icon_battery.png'],
  ['icon_kit', 'assets/level01/icons/icon_kit.png'],
  ['icon_flashlight', 'assets/level01/icons/icon_flashlight.png'],
  ['icon_pickaxe', 'assets/level01/icons/icon_pickaxe.png'],
  ['icon_regolith', 'assets/level01/icons/icon_regolith.png'],
  ['icon_ironrock', 'assets/level01/icons/icon_ironrock.png'],
  ['icon_silicate', 'assets/level01/icons/icon_silicate.png'],
];

export default ITEMS;
