# SPEC 06 — Deposit, Technology Tree, research, crafting, install, objectives 07 to 10, Level Complete

Audience: Gemini. Code only. Start from the working result of SPEC 05. Every number, string, key and file is given. Do not measure, inspect or redraw images. Do not generate images or audio.

## RULES FOR YOU (read first)
1. Never end your turn until `game/DONE-SPEC-06.md` is written.
2. Never write a status message without a tool call in the same step. Do not summarize plans in chat. Edit files.
3. Run commands in the FOREGROUND with a timeout. Never in the background.
4. Do not edit `game/public/assets/` or `game/public/audio/`.
5. English UI text only. No NASA logo or claims about NASA. Keep every `window.__astro` hook.

## 1. Goal
The player brings the 15 samples back, stores them, researches Basic Material Processing in a full-screen Technology Tree, crafts the Basic Material Processor, installs it in the outpost, checks life support and the next research, and sees the Level Complete screen. Objectives 07, 08, 09 and 10 work. Mission 2 unlocks.

## 2. New and changed files
```
game/src/scenes/TechTreeScene.js      // new, full-screen overlay scene (section 4)
game/src/scenes/LevelCompleteScene.js // new (section 7)
game/src/data/tech.js                 // tech tree data (section 3)
game/src/core/state.js                // extended (section 5)
game/src/scenes/InteriorScene.js      // storage deposit, workstation opens the tree, install spot, life support check
game/src/scenes/LevelScene.js         // playtime counter only
game/src/main.js                      // register the two new scenes
game/src/core/actions.js              // technology action (C) opens the tree from the interior
```

## 3. Tech data (`src/data/tech.js`, exact)
```
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
]
export const NODE_TEXT = {   // detail panel text for the nodes that are not the research of this level
  basic_mining: 'You already know how to mine rocks with the pickaxe.',
  system_inspection: 'You checked the life support unit. More life support research opens later.',
  battery_inspection: 'Batteries power the flashlight. Better power systems open later.',
  basic_habitat_repair: 'You can keep the outpost in shape. Bigger buildings open later.',
  surface_survey: 'You can explore the area around the outpost. Farther areas open later.',
  oxygen_recovery: 'Next mission: make oxygen from lunar materials so the outpost can breathe for longer. Locked for now.',
  basic_solar_systems: 'Next mission: solar panels give the outpost power. Locked for now.'
}
export const LOCKED_TEXT = 'This research is locked. Finish more missions to open it.'
```

## 4. TechTreeScene (`src/scenes/TechTreeScene.js`)
A full-screen scene (key `TechTreeScene`) launched ON TOP of the paused calling scene with `scene.launch('TechTreeScene', { from: sceneKey })` and `scene.pause(sceneKey)`; closing resumes it (`scene.stop(); scene.resume(from)`). Fixed camera 1280x720. Depth rules inside the scene are free. Opens from the Workstation interactable (SPEC 03: after the info card, only on the second and later inspections; the first inspection still shows the info card only; but when the current objective is 08 or later open the tree directly instead of the card) and from the `technology` action (C) while in the interior. SFX `Workstation_On` and `Menu_Open` on open; `Menu_Close` on close; ESC or the X button closes it.

### 4.1 Assets (load in `LevelScene.preload()` and `InteriorScene.preload()` with these keys; files in `game/public/assets/level01/tree_ui/`)
`tree_pill_tools` = `pill_tools.png`, `tree_pill_life` = `pill_life.png`, `tree_pill_power` = `pill_power.png`, `tree_pill_agri` = `pill_agri.png`, `tree_pill_build` = `pill_build.png`, `tree_pill_explore` = `pill_explore.png`, `tree_n_factory` = `n_factory.png`, `tree_n_pickaxe_done` = `n_pickaxe_done.png`, `tree_n_pickaxe_selected` = `n_pickaxe_selected.png`, `tree_n_lock0` = `n_lock0.png`, `tree_n_lock1` = `n_lock1.png`, `tree_n_lock2` = `n_lock2.png`, `tree_n_o2` = `n_o2.png`, `tree_n_battery` = `n_battery.png`, `tree_n_plant` = `n_plant.png`, `tree_n_cubes` = `n_cubes.png`, `tree_n_dish` = `n_dish.png`, `tree_res_regolith` = `res_regolith.png`, `tree_res_ironrock` = `res_ironrock.png`, `tree_res_silicate` = `res_silicate.png`, `tree_res_gear` = `res_gear.png`. Also `lc_bg` = `ui/level_complete_bg.webp` (for section 7). All with LINEAR filter. Sizes: pills about 326x103, node icons about 105x110, resource icons about 135x108.

### 4.2 Layout (1280x720), colors in neon blue like the design
- Background: vertical gradient `0x12275c` (top) to `0x070d24` (bottom). Main panel: `uiPanel`-like rounded rect (radius 10) at (24, 20) size 1232x680, fill gradient `0x0b1d45 -> 0x081230`, border 3 px `0x2f7fd6`, inner line 2 px `0x0a2a66`, outer glow 0.45 alpha `0x2f7fd6`.
- Title bar: text `Technology Tree` (Chakra Petch 700 30px white) at (82, 40); right side `Research Points: {rp}` (Chakra Petch 600 17px `#8fd0ff`) ending at x = 1180; red square close button 40x40 at (1196, 36) with `X`.
- Branch list (left): the six branch pills stacked at x = 36, y = 100 + i*74 (i = 0..5), each pill displayed 250 px wide (aspect kept, about 79 high). The selected branch pill has a gold `0xffb02e` outline; others alpha 0.8. Clicking a pill selects the branch.
- Tree canvas (center): panel at (290, 100) size 600x590 (same panel style). Title `{branch name} Research Tree` (Chakra Petch 700 22px `#3fd2ff`) at (310, 112). Nodes of the selected branch are laid out in a row in this order at y = 220: x = 330, 480, 630, 780 (the 5-node Tools branch uses 330, 450, 570, 690, 810 with the last two nodes at y = 400 below the first: see 4.3), node icon displayed 96x96 centered on the x, name text under it (Chakra Petch 600 14px `#dbe8ff`, wrap 120, centered). Connect consecutive nodes with a 3 px line `0x26a8ff` (glow alpha 0.4) between their icons. Node look by state: `done` (researched): icon with a green `0x99e105` 3 px ring; `new` (Level 1 research): gold ring pulse (alpha 0.5 to 1, 700 ms) and a `NEW` tag (`0xffd94d` fill, `#1a1a2e` 12px 700); `available`: cyan ring `0x3fd2ff`; locked: the lock icon at alpha 1 with no ring. Hovered node scales to 1.08.
- 4.3 Tools branch layout: `basic_mining` (done) at (330, 220), `improved_pickaxe` (450, 220), `advanced_drill` (570, 220), `repair_equipment` (690, 220), and `basic_material_processing` hangs under `basic_mining`: at (330, 400), with a vertical connector from (330, 270) to (330, 350). Every other branch lays its nodes at y = 220, x = 330 + i*150.
- Detail panel (right): same panel style at (906, 100) size 330x590. Content by selection (4.4).
- Legend (bottom of the tree canvas, y = 620): four dots with labels `Researched`, `New research`, `Available`, `Locked` (Chakra Petch 600 14px).

### 4.4 Detail panel content
- A node click selects it (SFX `Item_Select`). Initial selection: `basic_material_processing` if objective index <= 8 (08 or 09 pending), otherwise the first node of the first branch.
- For `basic_material_processing`:
  - Before the research (`state.tech.processing_researched` false): title `Basic Material Processing` (Chakra Petch 700 26px white), line `New research` (gold dot), text `Scan your lunar samples to learn how to process them.`, label `Requires` (cyan 18px 700), three requirement rows (icon 44x44 from `tree_res_*`, name, `n / 5` in green when the STORED count `state.storage[...] >= 5`, white otherwise), note `The scan records data from the samples. Your samples are not used up.`, and a gold button `Research` at the bottom (294x60). The button is disabled (alpha 0.45, SFX `Not_Enough_Resources` on click) unless all three stored counts are at least 5.
  - After the research and before crafting: title `Basic Material Processor`, line `Researched` (green dot), text `A simple machine that crushes and sorts lunar samples.`, label `Ingredients`, four rows: 5 Lunar Regolith, 5 Iron-bearing Rock, 5 Silicate Rock (stored counts) and 1 Spare Parts Kit (`inventory.count('spare_parts_kit')` from the bag plus the stored kit count; see 5), label `Result` with the processor icon row (`tree_res_gear`) `Basic Material Processor x1`, note `After crafting, install it in the outpost with E.`, and a gold button `Craft` (disabled like Research when an ingredient is missing).
  - After crafting: button `Crafted` disabled and the note `Go and install it in the outpost with E.`
- For every other node: its name as title, a state line, and `NODE_TEXT[id]` (or `LOCKED_TEXT`). If the node is `next:true` (Oxygen Recovery, Basic Solar Systems) selecting it for the first time sets the flag `viewed_<id>`; when both flags exist and the objective index is 9, `state.set('next_research_reviewed')`.
### 4.5 Research and craft progress
Pressing `Research` or `Craft`: disable the button, play SFX `Research_Start` / `Crafting_Start`, loop `SFX_Research_Loop` / `SFX_Crafting_Loop` (gain 0.5) while a progress bar (294x16, gold fill, at the button position, 3.5 seconds) fills; at the end stop the loop, play `Research_Complete` / `Crafting_Complete`, show the floating text `Research complete!` / `Processor crafted!` and update the state:
- Research: `state.tech.processing_researched = true`, `state.addScore(100, 'research')`, `state.set('basic_material_processing_researched')`. Samples are NOT consumed.
- Craft: remove 5/5/5 samples from `state.storage` and 1 spare parts kit (from the stored kit count first, then from the bag), `state.tech.processor_crafted = true`, `state.addScore(100, 'craft')`, `state.set('processor_crafted')`.
Dialogue: after the research completes, `obj08_nova2`, `obj08_astronaut2` are played by the calling scene when the tree closes (flag `talked_obj08b`), and after crafting `obj09_nova`, `obj09_astronaut`, `obj09_nova2` (flag `talked_obj09`). The first time the tree opens while objective 08 is current: `obj08_nova`, `obj08_astronaut` (flag `talked_obj08a`) are played after it closes.

## 5. State changes (`src/core/state.js`)
Add persisted fields with defaults for old saves:
```
storage: { lunar_regolith_sample:0, ilmenite_bearing_basalt_sample:0, silicate_rich_rock_sample:0, spare_parts_kit:0 }
tech: { processing_researched:false, processor_crafted:false, processor_installed:false }
rewards: { researchPoints:0, exp:0 }
playSeconds: 0
scoreParts: { objectives:0, samples:0, discovery:0, research:0, craft:0 }
```
`state.addScore(n, reason)` also adds `n` to `scoreParts[reason]` when the reason is one of `objective`, `sample`, `discovery`, `research`, `craft` (store them under `objectives` for `objective`). Add `SCORE_EVENTS.research = 100` in `objectives.js`. When an objective completes the +100 is counted under `objective`.
`playSeconds` is increased by the frame delta in `LevelScene` and `InteriorScene` update (only while no TechTreeScene or LevelCompleteScene is active).

## 6. Interior changes (`InteriorScene`)
### 6.1 Storage (objective 07)
The `storage` interactable (SPEC 03/04 info card) gets: when the current objective index is 6 (objective 07) and the bag has at least one sample, interacting deposits ALL samples instead of the info card: move every sample stack from the bag to `state.storage`, play `Storage_Open`, after 400 ms `Storage_Close` and `Objective_Updated`, show floating text `Samples stored: {n}` and call `state.set('samples_deposited')` when all three counts in `state.storage` are at least 5. Then play `obj07_nova2` (flag `talked_obj07b`). The prompt label while this is possible is `Store samples`.
The spare parts kit stays in the bag until crafting (the Craft step reads both places).
### 6.2 Returning with the samples (objective 07)
When `InteriorScene` starts with objective index 6, play `obj07_nova`, `obj07_astronaut` once (flag `talked_obj07`) after the fade in.
### 6.3 Workstation (objective 08 and 09)
Per section 4: opens the tree.
### 6.4 Install spot (objective 09)
The ghost processor sprite (`i_processor`, alpha 0.28 gray in SPEC 03) gets an interactable `id 'processor'`, `x = 1031, y = 600`, range 130, label `Install Processor`, enabled only when `state.tech.processor_crafted && !state.tech.processor_installed`. On interact: SFX `Processor_Start`; the sprite becomes full color (`clearTint`, alpha 1) with a scale pop (1.12 to 1, 250 ms); loop `SFX_Processor_Grind_Loop` (gain 0.3) for 3 seconds then `Processor_Complete`; floating text `Processor installed!`; `state.tech.processor_installed = true`; `state.set('processor_installed')`. After install the sprite stays full color; the interactable now has label `Inspect Processor` and shows an InfoCard: title `Basic Material Processor`, body `It crushes and sorts lunar rock samples. This is a simple game version, not a real factory.`.
When returning to the interior later the sprite is drawn full color if `processor_installed`.
### 6.5 Life support check (objective 10)
When objective index is 9 and `processor_installed`, interacting with the life support unit shows its normal InfoCard but with a different body: `Reserve is stable, but limited. Oxygen comes from supplies sent from Earth, so the outpost needs a permanent solution.` On close: `state.set('life_support_checked')`, then dialogue `obj10_dr1`, `obj10_astronaut`, `obj10_dr2`, `obj10_nova` (flag `talked_obj10a`). The objective 10 hint line `Open the Workstation to see what to research next.` is shown by NOVA (3 s) 20 s after `life_support_checked` if the tree is not opened.
### 6.6 Objective 10 completion
When objective 10 completes (both conditions), play dialogue `obj10_astronaut2`, `obj10_nova2` (flag `talked_obj10b`), then `ending_astronaut`, `ending_nova`, `ending_astronaut2`, `ending_nova2` (flag `talked_ending`), then start `LevelCompleteScene` with a 1000 ms fade out. SFX tag `LEVEL_COMPLETE_STING` of `ending_astronaut` is already handled by the dialogue system.

## 7. LevelCompleteScene (`src/scenes/LevelCompleteScene.js`)
Scene key `LevelCompleteScene`. Fixed camera 1280x720. This screen must look like the image the user supplied: the art is a ready background image with empty panels; draw the live text over it.
- Background: `lc_bg` displayed 1280x715 at (0, 0), LINEAR.
- Text (Chakra Petch 700 unless noted; origin and positions are exact; the default text color is `#eaf6ff`):
  - Title `LEVEL COMPLETE`: center x 640, center y 95, size 44px, white, letter spacing 3 px, glow shadow `#2ad4ff` (blur 14).
  - Sub-title `LEVEL 01 - FIRST LANDING`: center (640, 142), 18px 700, white.
  - `SCORE`: center (528, 183), 24px, white.
  - Score number: center (526, 241), 66px, color `#ffc928`, shadow `0 4px 0 #8a4f0a`. It counts up from 0 to the total in 1800 ms with SFX `Score_Tick` every 50 ms, then SFX `Score_Total`.
  - Breakdown rows at x = 760 (label, left aligned) and x = 1012 (value, right aligned, color `#ffd23f`), y = 188, 215, 242, 269, font 16px 600, small icons (22x22 drawn by code: a cube, a rock, a flask, a clock; colors as in the design) at x = 738:
    `Objectives` `+{scoreParts.objectives}`, `Resources` `+{scoreParts.samples}`, `Research` `+{scoreParts.research + scoreParts.craft}`, `Time Bonus ({mm:ss})` `+{timeBonus}`.
  - Time bonus: `max(0, 1500 - floor(playSeconds / 2))`; `{mm:ss}` is `playSeconds` formatted.
  - Total score = `state.score + timeBonus`. Add the time bonus to `state.score` once (flag `timeBonusGiven`).
  - `Completed objectives` rows: left aligned at x = 350, y = 330, 356, 382, 408, 434, font 16px 600, each with a green check box 16x16 (border 2 px `0x4cff6b`, fill `0x07310f`, white-green check) at x = 350 and the text at x = 376. Labels exactly: `Establish Communication`, `Explore the Lunar Outpost`, `Inspect Base Systems`, `Collect Required Resources`, `Research & Build Material Processor` (the last one at font 15px).
  - `Resources collected` rows at x = 724, y = 345, 387, 429 (row height 36 boxes at y-6): rock icons (`icon_regolith`, `icon_ironrock`, `icon_silicate`, loaded as in SPEC 05, displayed 34x26) at x = 724, the names `Lunar Regolith`, `Iron-bearing Rock`, `Silicate Rock` at x = 766 and the counts `5/5` right aligned at x = 1008 in green `#4cff6b`, 16px 700. A dark rounded box (fill `0x050e28` alpha 0.8, border 1 px `0x1b4a8c`, 296x36) is drawn behind each row at x = 718, y = row y - 6.
  - `REWARDS` title: center (655, 481), 20px 700, `#ffd23f`.
  - Reward items (centers at x = 405, 548, 690, 832, 974; icon center y = 515; labels below, 14px 600 center aligned, line height 15): 1 `tree_res_gear` icon (display 56x44) + `Material Processor` + `(Unlocked)` green; 2 `tree_n_factory` (44x44) + `Basic Processing` + `(Research)` green; 3 a cyan hexagon icon (44x44, drawn by code) + `+250` (17px 700) + `Research Points`; 4 a gray gear icon (44x44, code) + `+3` + `Spare Parts`; 5 a blue shield icon with `XP` (44x44, code) + `+500` + `EXP`. Grant the rewards once: `state.rewards.researchPoints += 250`, `state.rewards.exp += 500`, `inventory.add('spare_parts_kit', 3)` (flag `rewardsGiven`).
  - Buttons (their art is in the background image; place invisible interactive rectangles over them): `RETURN TO BASE` rectangle at (316, 617) size 316x68 with the label centered (Chakra Petch 700 26px white, with a house icon 34x31 drawn by code at its left); `NEXT LEVEL` rectangle at (667, 617) size 303x68 with label (same style, with a double chevron icon 40x29 at its left, shadow `#7a3a05`). Hover: the label moves up 2 px and SFX `Button_Hover`; click: SFX `Button_Click`.
- Sounds at the start: music `MUS_Level_Complete_Sting` (play once, volume 0.8; stop the other music), SFX `Level_Complete`, `Victory_Cheer` after 200 ms and `NOVA_Excited` after 600 ms.
- `NEXT LEVEL`: `SaveManager.completeMission(1)` (unlocks mission 2), then `MissionsScene` (fade 300 ms). `RETURN TO BASE`: start `LevelScene` with `{ mission:1, from:'interior' }`.
- Persist: when the scene starts set `state.flags.level1_complete = true`.
- After Level 1 is complete, mission 1 on the Missions screen starts the level normally; the cutscene is not repeated.

## 8. Controls and misc
- `technology` (C) toggles the tree only inside the outpost interior and only while no dialogue is playing.
- Backpack, dialogue and tree are mutually exclusive: ignore a new open while one is open.
- ESC order: TechTree, BackpackPanel, InfoCard first; otherwise old behavior.
- `window.__astro` additionally exposes: `openTech()`, `deposit()` (deposit all samples), `giveSamples()` (puts 5 of each sample in the bag), `completeLevel()` (starts `LevelCompleteScene`), `tech` (the state tech object).

## 9. Done when (Claude runs these, you do not)
- `cd game && npm run build` has no errors.
- With 15 samples in the bag at objective 07, E at the Supply Storage deposits them (counts 5/5/5 in storage), the objective completes (+100).
- The Workstation opens the full-screen Technology Tree. `Basic Material Processing` is highlighted; `Research` is enabled with 5/5/5 stored; after 3.5 s the research completes (score +100, objective 08 done).
- `Craft` works with the spare parts kit (the bag still has it); the samples are consumed from storage; objective 09 needs the install at the ghost processor spot, which turns full color.
- Life support check and viewing both `Oxygen Recovery` and `Basic Solar Systems` complete objective 10; the ending dialogue plays and the Level Complete screen appears with the exact layout described, a counting score, and working buttons.
- NEXT LEVEL unlocks mission 2 on the Missions screen.
- Reloading mid-way keeps storage, research, crafting and install states.
- Write `game/DONE-SPEC-06.md` and stop.
