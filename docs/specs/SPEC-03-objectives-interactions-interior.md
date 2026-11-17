# SPEC 03 — Objectives, interactions, NOVA, outpost interior (objectives 01 to 03)

Audience: Gemini. Code only. Start from the working result of SPEC 02. Every number, string, key and file is given. Do not measure, inspect or redraw images. Do not generate images.

## RULES FOR YOU (read first)
1. Never end your turn until `game/DONE-SPEC-03.md` is written.
2. Never write a status message without a tool call in the same step. Do not summarize plans in chat. Edit files.
3. Run commands in the FOREGROUND with a timeout. Never in the background.
4. Do not edit `game/public/assets/` or `game/public/audio/`.
5. English UI text only. No NASA logo or claims about NASA.
6. Keep every `window.__astro` test hook that SPEC 02 created and extend it as listed in section 11.

## 1. Goal
In Level 1 the player sees the Mission Objective panel and the score, NOVA floats beside the astronaut, the player walks to the airlock at x = 1400 and enters the outpost, walks inside, and inspects the four stations. Objectives 01, 02 and 03 complete with sounds and score. The player can leave through the same door. The framework is built for all 10 objectives, but only 01 to 03 can complete in this spec.

## 2. Files
```
game/src/core/events.js            // EventBus
game/src/core/state.js             // GameState
game/src/data/objectives.js        // the 10 objectives (section 5)
game/src/ui/theme.js               // UI tokens + panel helper
game/src/ui/ObjectivePanel.js
game/src/ui/ScorePanel.js
game/src/ui/InteractPrompt.js
game/src/ui/InfoCard.js
game/src/entities/Nova.js
game/src/systems/Interactions.js
game/src/scenes/LevelScene.js      // change
game/src/scenes/InteriorScene.js   // new, register in main.js
game/index.html                    // add the Chakra Petch font link (section 3)
```

## 3. UI font and theme
Add to `<head>` in `index.html`: `<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&display=swap" rel="stylesheet">` and wait for `document.fonts.load("600 18px 'Chakra Petch'")` next to the other font loads in `main.js` (same 3 s timeout).
`src/ui/theme.js` exports:
```
UI = { font:"'Chakra Petch'", navy:0x0a0f2c, navy2:0x171d48, border:0x8e9af0, inner:0x1c2366, shadow:0x070a1c,
       gold:'#ffc83d', white:'#ffffff', soft:'#aeb7ea', green:0x99e105, greenCss:'#99e105', cyan:'#3fd2ff', orange:0xffb02e, red:'#ff7b7b' }
uiPanel(scene, x, y, w, h)   // returns a Graphics (depth set by caller): fills a vertical gradient from navy2 (top) to navy (bottom) using 8 horizontal bands, a 3 px border color `border` with radius 10, an inner 2 px outline color `inner` inset 3 px, and a 2 px outer outline color `shadow`
```
This is the HUD look. Use it for every new panel in this spec.

## 4. EventBus and GameState
`events.js`: `export const bus = new Phaser.Events.EventEmitter()`.
`state.js` exports `state` (single object) with persistence in `localStorage` key `astrokid.l1.v1` (try/catch). Shape and API:
```
state = {
  objectiveIndex: 0,            // 0..9 current objective; 10 = all done
  done: { },                    // condition id -> true
  score: 0,
  inventory: { lunar_regolith_sample:0, ilmenite_bearing_basalt_sample:0, silicate_rich_rock_sample:0,
               oxygen_canister:3, canned_food:5, battery_cell:4, spare_parts_kit:1 },
  lives: 3,
  flags: { }                    // free flags, for example 'inspected_workstation'
}
state.set(conditionId)          // marks a condition done, saves, emits bus 'condition' (conditionId), then checks the current objective
state.has(conditionId)
state.addScore(n, reason)       // adds, saves, emits 'score' (total, n, reason)
state.reset()
```
Checking the current objective: if every `condition` id of the current objective is in `done`, then: emit `objective:complete` (index), add the objective's score (section 5), advance `objectiveIndex`, save, and after 1500 ms emit `objective:start` (new index). On scene start emit `objective:start` for the current index.
Add `state.reset()` on `ESC`-less cases: a debug key `F9` (any scene) calls `state.reset()` and reloads the page.

## 5. Objectives data (`src/data/objectives.js`, exact)
Export `OBJECTIVES` array of 10 objects `{ id, title, desc, conds:[{id,label}], score }`:
```
01 "Establish Communication"      desc "Receive the Mission Control transmission."            conds [{radio_message_received,"Radio message received"}]            score 100
02 "Explore the Lunar Outpost"    desc "Walk to the airlock and enter the outpost."           conds [{airlock_entered,"Enter the outpost"}]                       score 100
03 "Inspect the Interior"         desc "Inspect the four systems inside the outpost."         conds [{workstation_inspected,"Workstation"},{storage_inspected,"Supply Storage"},{life_support_inspected,"Life Support Unit"},{sleeping_area_inspected,"Sleeping Area"}] score 100
04 "Prepare for Exploration"      desc "Equip the flashlight and the pickaxe, then check the pickaxe durability." conds [{flashlight_equipped,"Equip the flashlight"},{pickaxe_equipped,"Equip the pickaxe"},{durability_viewed,"Check pickaxe durability"}] score 100
05 "Explore the Lunar Plains"     desc "Leave the outpost and walk into the Lunar Plains."    conds [{lunar_plains_entered,"Enter the Lunar Plains"}]             score 100
06 "Collect Lunar Resources"      desc "Collect 5 samples of each of the three rock types."   conds [{regolith_samples_5,"Lunar Regolith 5"},{ilmenite_samples_5,"Iron-bearing Rock 5"},{silicate_samples_5,"Silicate Rock 5"}] score 100
07 "Return to the Outpost"        desc "Bring all 15 samples back and store them."            conds [{samples_deposited,"Samples stored"}]                        score 100
08 "Research Basic Material Processing" desc "Use the Workstation to research the new technology." conds [{basic_material_processing_researched,"Research completed"}] score 100
09 "Build Your First Material Processor" desc "Craft the Basic Material Processor and install it." conds [{processor_crafted,"Processor crafted"},{processor_installed,"Processor installed"}] score 100
10 "Stabilize the Outpost"        desc "Check the life support, then review the next research."  conds [{life_support_checked,"Check life support"},{next_research_reviewed,"Review the next research"}] score 100
```
Also export `SCORE_EVENTS = { sample: 10, firstDiscovery: 25, craft: 100 }` for later specs.

## 6. UI components (all depth 100, `setScrollFactor(0)`; the interior scene has a fixed camera so they work there too)

### 6.1 ObjectivePanel (top left)
Position (14, 12), width 330, height computed: 10 + header 36 + title 28 + desc (wrapped to 300 px, line height 20) + conds (22 px each) + 26 footer. Use `uiPanel`.
- Header row: icon (a 24x24 clipboard drawn with 4 rects: white body 12x14 at (2,1), red top strip 12x2, three dark lines) at (28, 24), text `Mission Objective` at (60, 24) origin (0,0.5), font Chakra Petch 700 20px, color gold. A 2 px line color `0x2d377e` under the header, from x = 28 to 330.
- Title: Chakra Petch 700 17px white at (28, 56).
- Description: Chakra Petch 500 14px color soft, wordWrap width 300.
- Conditions: for each cond a 18x18 box (border 2 px, radius 3; empty = border `0xc9d1ff` fill `0x05070f`; done = border and fill green) then the label Chakra Petch 600 15px white. A check mark (white 2 px polyline) inside when done.
- Footer: `Objective {n} of 10` Chakra Petch 600 13px color `#8e9af0`.
Behavior: `bus 'objective:start'` (index) rebuilds the panel and slides it in from x = -340 to 14 in 300 ms (`Back.easeOut`). `bus 'condition'` updates the checkbox (green with a 200 ms scale pop 1.3 to 1) and plays SFX `Objective_Updated`. `bus 'objective:complete'` flashes the panel border to green for 600 ms, plays SFX `Objective_Complete`, and shows a floating text `+100` (gold, Chakra Petch 700 22px) rising 40 px and fading in 900 ms at the panel's bottom right. When `objectiveIndex` is 10 the panel shows `All objectives complete` with a green check.
Key `O` (action `objectives`) toggles the panel (slide out/in 200 ms); it starts visible.

### 6.2 ScorePanel (top center)
`uiPanel` at (514, 12) size 252x62. Gold star icon 34x34 (pixel star made of rects, color `#ffc83d`) at (540, 43). Text `Score` Chakra Petch 600 14px white at (586, 28) and the number Chakra Petch 700 30px gold at (586, 44) origin (0,0). On bus `'score'` the number counts up to the new total over 500 ms and plays SFX `Score_Tick` every 60 ms while counting.

### 6.3 InteractPrompt
Shown above the nearest interactable (section 7) when the player is within its range. A `uiPanel` height 40, width = text width + 70, centered over the interactable at `y = interactable.promptY`, with a 28x28 gold key square (rounded 6, gradient `0xffd94d` to `0xf5a623`) containing the key name from `actions` (first binding of `interact`) in Chakra Petch 700 16px dark `#0a0f2c`, then the label in Chakra Petch 700 17px white. Fade in 120 ms; the first time it appears for an interactable play SFX `Interaction_Prompt`. Hidden when the player is moving through an InfoCard or when `player.canMove` is false.

### 6.4 InfoCard
A centered modal (`uiPanel` 640x330 at (320, 195), depth 150, a black rect alpha 0.45 behind it). Contents: title (Chakra Petch 700 26px gold) at the top, a 2 px divider, a body text (Chakra Petch 500 18px white, wordWrap 580), and a `Close` hint `E  Close` bottom right (Chakra Petch 700 15px soft). While open `player.canMove = false`. Closes on `interact` or ESC (ESC closes the card, it does not leave the scene while a card is open). Plays SFX `Menu_Open` on open and `Menu_Close` on close. API: `InfoCard.show(scene, {title, body, onClose})`.

## 7. Interactions system (`src/systems/Interactions.js`)
```
const it = new Interactions(scene, player)
it.add({ id, x, range:90, label:'Inspect Workstation', promptY, enabled:()=>true, onInteract:()=>{} })
it.update()      // call every frame: finds the nearest enabled interactable with |player.x - x| <= range, shows/hides the prompt
```
When the `interact` action goes down (justDown) and an interactable is in range and `player.canMove`, call its `onInteract` once and play SFX `Interact`.

## 8. NOVA (`src/entities/Nova.js`)
Companion sprite, depth 11, texture `nova` = spritesheet `level01/victory/nova_victory.png` (96x126 frames, 12 frames; use only frame 0 plus the idle tween). Load it in both level scenes (key `nova`). Displayed scale 0.8, origin (0.5, 0.5). No border, no frame, no background.
Behavior: target position = `player.x - player.facing * 85`, `player.y - 190` (the player's feet are `player.y`). Every frame move toward the target with `lerp 0.06`. Flip to face the player's facing. Hover bob: `y += sin(time/300) * 6`. A soft cyan glow ellipse under it is NOT drawn. While `player.state == 'air'` NOVA lags (lerp 0.04). Loop SFX `NOVA_Idle_Hum` at gain 0.15 while NOVA exists in the scene (stop on shutdown). NOVA has `nova.say(text, ms)` (shows a small white rounded speech box above it, Chakra Petch 600 16px dark, max width 260) used by later specs; implement it now: the box fades in 150 ms, stays `ms` (default 3000), fades out 200 ms.

## 9. LevelScene changes
- Add ObjectivePanel, ScorePanel, Interactions, Nova.
- Objective 01 trigger (temporary, until the dialogue spec): 3000 ms after the scene starts, if `state.objectiveIndex == 0`, play SFX `Radio_Open`, `Radio_Beep`, then call `state.set('radio_message_received')`. Mark this block with the comment `// TEMP until SPEC 04: replaced by the Dr. Karim radio dialogue`.
- Interactable at the airlock: `id 'airlock'`, `x = AIRLOCK_X (1400)`, `range 110`, `label 'Enter Outpost'`, `promptY = GROUND_Y - 260`. On interact: `player.canMove = false`; play SFX `Airlock_Unlock`, after 300 ms `Airlock_Open`; fade the camera to black over 700 ms; then `state.set('airlock_entered')` and `scene.start('InteriorScene', { from:'level' })`.
- When returning from the interior (scene data `{from:'interior'}`), place the player at x = 1400 + 40, facing right, with a fade in 500 ms, and play `Airlock_Close`.
- Keep Spec 02 behavior. Ambience `AMB_Lunar_Surface` and music `MUS_Lunar_Exploration` as before.
- Draw a small door marker so the airlock is findable on the picture: none. (The door is part of the backdrop picture.)

## 10. InteriorScene (`src/scenes/InteriorScene.js`)
Scene key `InteriorScene`, fixed camera 1280x720, no scrolling. Receives `{from:'level'}`.
Assets to load in `preload()` (keys): `cabin` = `level01/interior/cabin_empty.webp` (LINEAR filter), `i_airlock` = `level01/base/airlock_door.png`, `i_workstation` = `level01/base/workstation.png`, `i_storage` = `level01/base/supply_storage.png`, `i_lifesupport` = `level01/base/life_support.png`, `i_processor` = `level01/base/material_processor.png`, `i_bed` = `level01/bed/bed_r0_c0.png`, plus the astronaut and rock assets from SPEC 02 (already global).
Layers: `cabin` displayed 1280x715 at (0,0), depth 0. Sprites with origin (0,1), y = 596, depth 5:
| key | x | display width | label | interactable id | x of interaction | range |
|---|---|---|---|---|---|---|
| `i_airlock` | 14 | 170 | Leave Outpost | `door` | 99 | 90 |
| `i_workstation` | 226 | 250 | Inspect Workstation | `workstation` | 351 | 130 |
| `i_storage` | 520 | 168 | Inspect Supply Storage | `storage` | 604 | 100 |
| `i_lifesupport` | 722 | 190 | Inspect Life Support | `lifesupport` | 817 | 110 |
| `i_processor` | 946 | 170 | (none yet) | | | |
| `i_bed` | 1090 | 180 | Inspect Sleeping Area | `bed` | 1180 | 100 |
`i_processor` is drawn with alpha 0.28 and a grayscale tint (`setTint(0x999999)`) as the install spot. Display height follows the aspect ratio (`setDisplaySize(w, w * texture.height / texture.width)`).
Player: spawn at x = 190, y = 600 (feet), facing right, same Player class. World bounds 0..1280 (physics bounds and `setCollideWorldBounds`). Ground: invisible static rectangle top at y = 600, 1280 wide. The player is displayed in front (depth 10). No camera follow.
Footsteps inside use SFX variants `Footstep_Metal` (count 3: `SFX_Footstep_Metal`, `SFX_Footstep_Metal_02`, `SFX_Footstep_Metal_03`; implement as a special case: AudioManager gets a `playFromList(ids, opts)` method) and landing uses `Land_Metal`. The Player class gets a property `surface` ('regolith' default, 'metal' inside) that picks these sounds.
Audio: music `MUS_Base_Interior`, loop `AMB_Base_Interior` gain 0.5, and `AMB_LifeSupport` is not needed. Also loop `SFX_LifeSupport_Hum` with gain 0.25 (it is a loop sound; AudioManager must be able to loop sfx ids).
Entering: fade in 500 ms; play `Airlock_Close` and `Pressure_Seal` (150 ms apart).
Leaving (interactable `door`): `player.canMove=false`, SFX `Airlock_Unlock` then `Airlock_Open`, fade out 600 ms, then `scene.start('LevelScene', { mission:1, from:'interior' })`.
Include the same ObjectivePanel, ScorePanel, Interactions and Nova (NOVA starts at x = 280). `AMB_Lunar_Surface` and the level music stop on entering (AudioManager crossfades music with `audio.music('MUS_Base_Interior')`).

### 10.1 Inspect interactions
Each station on interact: play its SFX, mark the flag, show an InfoCard, and when the card closes call `state.set('<condition id>')` (only the first time; later inspections still show the card but do not re-score). Texts (exact):
- `workstation` — SFX `Workstation_On`. Title `Workstation`. Body `Your research station. It opens the Technology Tree, where you learn new ways to use what you find on the Moon. Right now it is working, but only the basics are open.` Condition `workstation_inspected`.
- `storage` — SFX `Storage_Open`. Title `Supply Storage`. Body `Supplies from Earth: 3 oxygen canisters, 5 cans of food, 4 spare batteries and 1 spare parts kit. There is not enough here to last forever, so use it carefully.` Condition `storage_inspected`.
- `lifesupport` — SFX `Battery_Connect` first then, after 500 ms, `Oxygen_Warning` is NOT played; play `Interact` only. Title `Temporary Life Support`. Body `This machine keeps the air breathable. It has enough reserve for about 72 hours. That number is a game setting, not a real engineering number. When it runs low you will see warnings first.` Condition `life_support_inspected`.
- `bed` — SFX `Bed_Activate`. Title `Sleeping Area`. Body `A bed for resting. Sleeping brings your stamina back, but time keeps moving and the life support keeps running. Sleeping will be available later in the mission.` Condition `sleeping_area_inspected`.
For `lifesupport` and `storage` and `workstation` and `bed`, a small gold check mark (14x14, drawn with a polyline) appears above the station label position after inspection (a persistent marker at `(interaction x, 330)`, depth 12) so the player can see what is done. Use state flags `inspected_<id>` to redraw them when re-entering the scene.

## 11. Test hooks
`window.__astro` must additionally expose: `state`, `bus`, `objectives: OBJECTIVES`, `go(sceneKey, data)` (start a scene), and `inspectAll()` (for tests: sets the four inspect conditions through `state.set`).

## 12. Done when (Claude runs these, you do not)
- `cd game && npm run build` has no errors.
- Level 1 shows the objective panel (`Establish Communication`) and the score `0`. After 3 s objective 01 completes with the sound, `+100` appears, the score is 100 and the panel shows `Explore the Lunar Outpost`.
- At x = 1400 the prompt `E  Enter Outpost` appears. Pressing E fades into the outpost interior. The panel shows `Inspect the Interior`, objective 02 is done and the score is 200.
- Inside, the four stations show prompts and info cards; after all four the objective completes and the score is 300. NOVA floats beside the player with no frame.
- Leaving through the left door returns to the level at x = 1440.
- Reloading the page keeps the objective progress and the score.
- Write `game/DONE-SPEC-03.md` and stop.
