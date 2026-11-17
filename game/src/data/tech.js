export const BRANCHES = [
  { id:'tools', name:'Tools', pill:'tree_pill_tools', nodes:[
     { id:'basic_material_processing', name:'Basic Material Processing', icon:'tree_n_factory', level1:true },
     { id:'basic_mining',        name:'Basic Mining',        icon:'tree_n_pickaxe_done', done:true },
     { id:'improved_pickaxe',    name:'Improved Pickaxe',    icon:'tree_n_lock0' },
     { id:'advanced_drill',      name:'Advanced Drill',      icon:'tree_n_lock1' },
     { id:'repair_equipment',    name:'Repair Equipment',    icon:'tree_n_lock2' } ] },
  { id:'life_support', name:'Life Support', pill:'tree_pill_life', nodes:[
     { id:'system_inspection', name:'System Inspection', icon:'tree_n_o2', available:true },
     { id:'basic_filtration',  name:'Basic Filtration Research', icon:'tree_n_lock0' },
     { id:'oxygen_recovery',   name:'Oxygen Recovery', icon:'tree_n_lock1', next:true },
     { id:'advanced_life_support', name:'Advanced Life Support', icon:'tree_n_lock2' } ] },
  { id:'power', name:'Power', pill:'tree_pill_power', nodes:[
     { id:'battery_inspection', name:'Battery Inspection', icon:'tree_n_battery', available:true },
     { id:'basic_solar_systems', name:'Basic Solar Systems', icon:'tree_n_lock0', next:true },
     { id:'energy_storage', name:'Energy Storage', icon:'tree_n_lock1' },
     { id:'advanced_power_management', name:'Advanced Power Management', icon:'tree_n_lock2' } ] },
  { id:'agriculture', name:'Agriculture', pill:'tree_pill_agri', nodes:[
     { id:'basic_plant_research', name:'Basic Plant Research', icon:'tree_n_lock0' },
     { id:'hydroponics', name:'Hydroponics', icon:'tree_n_lock1' },
     { id:'food_production', name:'Food Production', icon:'tree_n_lock2' } ] },
  { id:'construction', name:'Construction', pill:'tree_pill_build', nodes:[
     { id:'basic_habitat_repair', name:'Basic Habitat Repair', icon:'tree_n_cubes', available:true },
     { id:'storage_expansion', name:'Storage Expansion', icon:'tree_n_lock0' },
     { id:'habitat_expansion', name:'Habitat Expansion', icon:'tree_n_lock1' } ] },
  { id:'exploration', name:'Exploration', pill:'tree_pill_explore', nodes:[
     { id:'surface_survey', name:'Surface Survey', icon:'tree_n_dish', available:true },
     { id:'advanced_scanner', name:'Advanced Scanner', icon:'tree_n_lock1' },
     { id:'deep_exploration', name:'Deep Exploration', icon:'tree_n_lock2' } ] }
];

export const NODE_TEXT = {
  basic_mining: 'You already know how to mine rocks with the pickaxe.',
  system_inspection: 'You checked the life support unit. More life support research opens later.',
  battery_inspection: 'Batteries power the flashlight. Better power systems open later.',
  basic_habitat_repair: 'You can keep the outpost in shape. Bigger buildings open later.',
  surface_survey: 'You can explore the area around the outpost. Farther areas open later.',
  oxygen_recovery: 'Next mission: make oxygen from lunar materials so the outpost can breathe for longer. Locked for now.',
  basic_solar_systems: 'Next mission: solar panels give the outpost power. Locked for now.'
};

export const LOCKED_TEXT = 'This research is locked. Finish more missions to open it.';

export const TECH_TREE_ASSET_ENTRIES = [
  ['tree_pill_tools', 'assets/level01/tree_ui/pill_tools.png'],
  ['tree_pill_life', 'assets/level01/tree_ui/pill_life.png'],
  ['tree_pill_power', 'assets/level01/tree_ui/pill_power.png'],
  ['tree_pill_agri', 'assets/level01/tree_ui/pill_agri.png'],
  ['tree_pill_build', 'assets/level01/tree_ui/pill_build.png'],
  ['tree_pill_explore', 'assets/level01/tree_ui/pill_explore.png'],
  ['tree_n_factory', 'assets/level01/tree_ui/n_factory.png'],
  ['tree_n_pickaxe_done', 'assets/level01/tree_ui/n_pickaxe_done.png'],
  ['tree_n_pickaxe_selected', 'assets/level01/tree_ui/n_pickaxe_selected.png'],
  ['tree_n_lock0', 'assets/level01/tree_ui/n_lock0.png'],
  ['tree_n_lock1', 'assets/level01/tree_ui/n_lock1.png'],
  ['tree_n_lock2', 'assets/level01/tree_ui/n_lock2.png'],
  ['tree_n_o2', 'assets/level01/tree_ui/n_o2.png'],
  ['tree_n_battery', 'assets/level01/tree_ui/n_battery.png'],
  ['tree_n_plant', 'assets/level01/tree_ui/n_plant.png'],
  ['tree_n_cubes', 'assets/level01/tree_ui/n_cubes.png'],
  ['tree_n_dish', 'assets/level01/tree_ui/n_dish.png'],
  ['tree_res_regolith', 'assets/level01/tree_ui/res_regolith.png'],
  ['tree_res_ironrock', 'assets/level01/tree_ui/res_ironrock.png'],
  ['tree_res_silicate', 'assets/level01/tree_ui/res_silicate.png'],
  ['tree_res_gear', 'assets/level01/tree_ui/res_gear.png'],
  ['lc_bg', 'assets/ui/level_complete_bg.webp'],
];

export default BRANCHES;
