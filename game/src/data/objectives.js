export const OBJECTIVES = [
  {
    id: '01',
    title: 'Establish Communication',
    desc: 'Receive the Mission Control transmission.',
    conds: [{ id: 'radio_message_received', label: 'Radio message received' }],
    score: 100,
  },
  {
    id: '02',
    title: 'Explore the Lunar Outpost',
    desc: 'Walk to the airlock and enter the outpost.',
    conds: [{ id: 'airlock_entered', label: 'Enter the outpost' }],
    score: 100,
  },
  {
    id: '03',
    title: 'Inspect the Interior',
    desc: 'Inspect the four systems inside the outpost.',
    conds: [
      { id: 'workstation_inspected', label: 'Workstation' },
      { id: 'storage_inspected', label: 'Supply Storage' },
      { id: 'life_support_inspected', label: 'Life Support Unit' },
      { id: 'sleeping_area_inspected', label: 'Sleeping Area' },
    ],
    score: 100,
  },
  {
    id: '04',
    title: 'Prepare for Exploration',
    desc: 'Equip the flashlight and the pickaxe, then check the pickaxe durability.',
    conds: [
      { id: 'flashlight_equipped', label: 'Equip the flashlight' },
      { id: 'pickaxe_equipped', label: 'Equip the pickaxe' },
      { id: 'durability_viewed', label: 'Check pickaxe durability' },
    ],
    score: 100,
  },
  {
    id: '05',
    title: 'Explore the Lunar Plains',
    desc: 'Leave the outpost and walk into the Lunar Plains.',
    conds: [{ id: 'lunar_plains_entered', label: 'Enter the Lunar Plains' }],
    score: 100,
  },
  {
    id: '06',
    title: 'Collect Lunar Resources',
    desc: 'Collect 5 samples of each rock type. Regolith lies outside; iron-bearing rock and silicate rock are in the caves.',
    conds: [
      { id: 'regolith_samples_5', label: 'Lunar Regolith 5' },
      { id: 'ilmenite_samples_5', label: 'Iron-bearing Rock 5' },
      { id: 'silicate_samples_5', label: 'Silicate Rock 5' },
    ],
    score: 100,
  },
  {
    id: '07',
    title: 'Return to the Outpost',
    desc: 'Bring all 15 samples back and store them.',
    conds: [{ id: 'samples_deposited', label: 'Samples stored' }],
    score: 100,
  },
  {
    id: '08',
    title: 'Research Basic Material Processing',
    desc: 'Use the Workstation to research the new technology.',
    conds: [
      {
        id: 'basic_material_processing_researched',
        label: 'Research completed',
      },
    ],
    score: 100,
  },
  {
    id: '09',
    title: 'Build Your First Material Processor',
    desc: 'Craft the Basic Material Processor and install it.',
    conds: [
      { id: 'processor_crafted', label: 'Processor crafted' },
      { id: 'processor_installed', label: 'Processor installed' },
    ],
    score: 100,
  },
  {
    id: '10',
    title: 'Stabilize the Outpost',
    desc: 'Check Life Support, then open the Workstation (or press C) to inspect Oxygen Recovery and Basic Solar Systems.',
    conds: [
      { id: 'life_support_checked', label: 'Check life support' },
      { id: 'next_research_reviewed', label: 'Review the next research' },
    ],
    score: 100,
  },
];

export const SCORE_EVENTS = {
  sample: 10,
  firstDiscovery: 25,
  research: 100,
  craft: 100,
};

export default OBJECTIVES;
