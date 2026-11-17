# SPEC 05 — Base sprite fix, bottom HUD, inventory, hotbar, backpack, flashlight, pickaxe mining, objectives 04 to 06

Audience: Gemini. Code only. Start from the working result of SPEC 02B and SPEC 04. Every number, string, key and file is given. Do not measure, inspect or redraw images. Do not generate images or audio.

## RULES FOR YOU (read first)
1. Never end your turn until `game/DONE-SPEC-05.md` is written.
2. Never write a status message without a tool call in the same step. Do not summarize plans in chat. Edit files.
3. Run commands in the FOREGROUND with a timeout. Never in the background.
4. Do not edit `game/public/assets/` or `game/public/audio/`.
5. English UI text only. No NASA logo or claims about NASA. Keep every `window.__astro` hook.

## 1. Base sprite quality fix (do this first)
The outpost looked blurry because a large AI picture was scaled down with nearest-neighbor filtering.
- In `LevelScene.preload()` load `base_ext` from `level01/world/base_exterior_hd.png` (1520 x 963, replaces `base_exterior.png`), and after loading set `this.textures.get('base_ext').setFilter(Phaser.Textures.FilterMode.LINEAR)`.
- Display width stays `BASE.w = 760`; the scale is therefore `760 / 1520 = 0.5` (set with `setDisplaySize(760, 760 * 963 / 1520)`).
- The dome collider and the door position (`BASE`, `DOOR`) stay exactly as they are.
- Do the same for the rock textures? NO: rocks, decals and the astronaut stay NEAREST.

## 2. New and changed files
```
game/src/data/items.js            // item definitions (section 3)
game/src/core/inventory.js        // inventory logic (section 4)
game/src/ui/BottomHud.js          // portrait, bars, hearts, hotbar, backpack button (section 5)
game/src/ui/BackpackPanel.js      // the I screen (section 6)
game/src/systems/Tools.js         // equip, flashlight, pickaxe (sections 7, 8, 9)
game/src/systems/Mining.js        // mining rocks (section 9)
game/src/entities/Rock.js         // rock nodes wrapper (section 9)
game/src/core/state.js            // extended (section 4)
game/src/scenes/LevelScene.js     // wire everything
game/src/scenes/InteriorScene.js  // wire the bottom HUD, the Workstation repair, the flashlight
```

## 3. Items (`src/data/items.js`, exact)
```
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
}
export const SAMPLE_TYPES = ['lunar_regolith_sample','ilmenite_bearing_basalt_sample','silicate_rich_rock_sample']
```
Icons are 100x100 images in `game/public/assets/level01/icons/icon_<name>.png`; load them in `LevelScene` and `InteriorScene` preload with the keys `icon_oxygen`, `icon_food`, `icon_battery`, `icon_kit`, `icon_flashlight`, `icon_pickaxe`, `icon_regolith`, `icon_ironrock`, `icon_silicate` (file names `icon_oxygen.png` etc.).

## 4. Inventory logic (`src/core/inventory.js`) and state changes
`state` (SPEC 03) gets new persisted fields, with defaults for old saves:
```
bag:      array of 24 entries, each null or { id, n }          // backpack slots
hotbar:   array of 9 entries, each null or an item id (tools only: 'flashlight','basic_pickaxe') // references, not stacks
selected: 0                                                    // selected hotbar slot index 0..8
pickaxe:  { durability:30, max:30 }
flashlight:{ on:false, charge:100 }
vitals:   { oxygen:100, stamina:100, hunger:85 }
```
Initial values: `hotbar[0] = 'flashlight'`, `hotbar[1] = 'basic_pickaxe'`, others null. `bag` starts filled from the SPEC 03 initial inventory in this order: `oxygen_canister` x3, `canned_food` x5, `battery_cell` x4, `spare_parts_kit` x1 (one slot per item type). Migrate: if an old save has `inventory` counts, rebuild `bag` from them. Samples are stored in `bag` too.
The old `state.inventory` counts object stays as a read-only getter computed from `bag` (`state.inventory.lunar_regolith_sample` etc.) so existing code keeps working. `inventory.count(id)`.
API (`inventory.js`):
```
inventory.add(id, n)        // stacks into an existing stack up to ITEMS[id].stack, then uses the first empty slot; returns how many were added (0 when full)
inventory.remove(id, n)     // returns true if there were enough
inventory.count(id)
inventory.use(slotIndex)    // for kind 'use': applies the effect (section 4.1), removes 1, plays SFX, returns true
inventory.move(fromSlot, toSlot)   // swap or merge stacks
inventory.selectedItem()    // the item id in the selected hotbar slot or null
```
`add` and `remove` save the state and emit `bus 'inventory'`. When `add` returns less than requested, play SFX `Inventory_Full` and show a floating text `Backpack full`.
### 4.1 Use effects
`oxygen` and `hunger` add to `vitals` (clamped 0..100); `flashlight` sets `flashlight.charge = 100`. SFX: oxygen -> `Interact`, hunger -> `Resource_Pickup`, battery -> `Battery_Connect`. Show floating text `+40 Oxygen`, `+30 Hunger`, `Flashlight recharged`.
### 4.2 Vitals rules (simple; time and sleep come later)
- `stamina`: while the player runs and moves, it falls 12 per second; when idle or walking it rises 8 per second; at 0 the player cannot run until it reaches 15.
- `oxygen`: stays at its value (no drain yet). `hunger`: stays (no drain yet).
These are state values only; the HUD shows them.

## 5. BottomHud (`src/ui/BottomHud.js`, depth 100, scrollFactor 0, added to LevelScene and InteriorScene)
All UI is drawn with `uiPanel` and the UI font from SPEC 03. Positions are in screen pixels.
### 5.1 Left block
- Portrait: image `avatar_frame` (`ui/avatar_frame.png`, 537x505) displayed 126 px wide at (14, 560), origin (0,0).
- Vital bars panel: `uiPanel` at (144, 566) size 136x140. Top row (y = 576): labels `O2` (Chakra Petch 700 15px `#3fd2ff`) at x 172, a small stamina bolt icon at x 216 and a food icon at x 256, each icon 14x20 drawn with rects in `#ffc83d` and `#99e105`. Below them three vertical tubes (30x104, bottom at y = 692): tube x = 163, 207, 251. Each tube: outer rect fill `0x050914` with a 3 px border `0xc9d1ff`, radius 15; the fill rises from the bottom to `value%` of the tube height with a left-to-right gradient: oxygen `0x00b2e5 -> 0x4fe0ff`, stamina `0xf5a623 -> 0xffd24a`, hunger `0x7dc400 -> 0xb8f23a`. A value below 25 turns that fill red `0xff4b4b` and the tube border blinks (alpha 1 / 0.4, 400 ms).
- Hearts: 3 pixel hearts (each 9x8 grid, cell size 4 px = 36x32) at (14, 666), (56, 666), (98, 666). Full heart: red `0xe63946` with a white highlight cell and black outline; lost heart: gray `0x2b3566`. They use `state.lives`.
### 5.2 Hotbar (bottom center)
9 slots, each 64x64 with 6 px gap, total width 9*64 + 8*6 = 624, left x = 328, y = 628. Slot: rounded rect (radius 8) fill `0x0a0f2c`, border 3 px `0x3a4a94`; the selected slot has border 3 px `0xffc83d` and a gold glow (a second rect 4 px larger, alpha 0.35). Item icon (100x100 texture) displayed 50x50 centered; the key number (1 to 9) Chakra Petch 700 13px white at the top-left corner (x+6, y+3). Pickaxe slot shows a durability bar under the icon: 48x5 at (x+8, y+54), green > 50%, yellow > 25%, red below. Flashlight slot shows a charge bar the same way and a small `ON` tag (green) when on.
Keys `1`-`9` select the slot (`selected`), SFX `Tab_Switch`. Mouse wheel changes the slot by one with the same sound. Clicking a slot selects it.
### 5.3 Backpack button (bottom right)
Image `backpack_closed_icon` (`ui/backpack_closed_icon.png`, 213x230) displayed 100 px wide at (1166, 590), origin (0,0), with a key badge `I` (28x28 rounded square `0x05070f`, border 2 px `0xffc83d`, text white 17px) at its bottom right. Clicking it or pressing `backpack` toggles the BackpackPanel. A small dark badge with the number of used bag slots at its top right.
### 5.4 Layout rule
The DialogueBox (SPEC 04) must stay above the hotbar: its panel bottom is at y = 574 and the hotbar top at y = 628, so they never overlap. The InfoCard and BackpackPanel use depth 150 and hide the hotbar while open.

## 6. BackpackPanel (`src/ui/BackpackPanel.js`, depth 150)
Opens with `backpack` (I) or the button; closes with `backpack`, ESC or the X button. While open `player.canMove = false`; SFX `Menu_Open` / `Menu_Close`. A dim rect (black, alpha 0.5) behind it.
Layout: `uiPanel` at (140, 70) size 1000x580.
- Header bar: `uiPanel`-style strip 1000x56 at the top with the title `Backpack` (Chakra Petch 700 26px gold) at (172, 82) and a red X button 36x36 at (1090, 80) (rounded 8, gradient `0xff6b6b -> 0xd12f2f`, border 3 px `0xffd0d0`, `X` white 22px).
- Grid: 6 columns x 4 rows of 24 slots, slot 84x84, gap 10, top-left of the grid at (172, 150). Slot looks like the hotbar slot (fill `0x0a0f2c`, border `0x3a4a94`); the hovered slot border cyan `0x3fd2ff`; the selected slot gold. Each stack shows the icon 62x62 centered and, when `n > 1`, the number in the bottom right (Chakra Petch 700 15px white on a dark `0x1a1a2e` rounded tag).
- Detail panel: `uiPanel` at (770, 150) size 340x400: item icon 110x110 at (885, 170); name (Chakra Petch 700 22px white) at (790, 300); description (Chakra Petch 500 16px `#aeb7ea`, wrap 300) below. For the pickaxe: a durability line `Durability {d} / {max}` (Chakra Petch 600 17px white) and a bar 300x12, color rule as the hotbar. For the flashlight: `Battery {charge}%` with a bar. For `use` items a gold button `Use` (200x48, the gold button style from the HUD design: gradient `0xffd94d -> 0xf5a623`, border 3 px `0xfff2b0`, text `#2a1a05` 22px 700) at (840, 480); for tools a button `Equip` that puts the tool in the selected hotbar slot (if the tool is already in the hotbar the button says `Equipped` and is disabled).
- Click a slot to select it; drag and drop moves stacks with `inventory.move` (implement with pointer events: pick the stack on pointerdown, drop on pointerup over another slot).
- The tools Flashlight and Pickaxe are shown in the grid too: they are always the first two cells of the grid, drawn from `state.hotbar` / their fixed item ids even though they live in the hotbar (they appear in the grid as read-only cells with the label `In hotbar` when equipped).
- Footer text at (172, 620): `Backpack {used} / 24`.
Condition for the objective: when the backpack is open AND the pickaxe cell is selected, call `state.set('durability_viewed')`.

## 7. Equipping (`src/systems/Tools.js`)
- `tools.current()` returns `inventory.selectedItem()`.
- When the selected slot changes to `basic_pickaxe` call `state.set('pickaxe_equipped')` once and play SFX `Interact`; if objective index is 3 (objective 04) and `talked_obj04b` is false, play dialogue `obj04_nova2` then `obj04_astronaut2` (flag `talked_obj04b`).
- A held-item indicator: next to the player draw the icon of the held tool, 44x44, at `(player.x + player.facingX * 34, player.y - 70)` with depth `depthOf(player.y) + 0.01`, flipX with facing left. Nothing when the slot is empty.

## 8. Flashlight (`Tools.js`)
- Key `flashlight` (F) toggles it, but only if `charge > 0`; otherwise SFX `Error` and floating text `Battery empty`. Turning on: SFX `Flashlight_On`, `state.flashlight.on = true`, and `state.set('flashlight_equipped')` (first time). Turning off: SFX `Flashlight_Off`.
- Drain: while on, `charge` falls 1 point every 6 seconds. When `charge` crosses 25 the first time per charge cycle play SFX `Flashlight_Low_Battery` and NOVA says `Flashlight battery is low.` (3 s). At 0 it switches off with `Flashlight_Off`.
- Beam (when on): a `Graphics` object, depth `depthOf(player.y) + 0.02`, additive blend, that is redrawn each frame: a cone of angle 56 degrees and length 320 px starting at the player's chest `(player.x, player.y - 70)` pointing toward the facing (down = +90 deg, up = -90, right = 0, left = 180), drawn as 6 nested triangles with fill `0xfff2b0` and alphas 0.05 to 0.14, plus a soft circle radius 90 around the player (fill `0xfff2b0`, alpha 0.08). When the charge is at or below 25 the whole beam blinks (alpha factor 1 / 0.45, 300 ms).
- The flashlight works in both scenes; in the interior it is only the glow.

## 9. Rocks and mining
### 9.1 Rock data (`src/entities/Rock.js`)
Wrap each entry of `scene.rocks` (SPEC 02B) in a `Rock` with: `type` (`regolith`, `ironrich`, `silicate`), `sampleId` (`lunar_regolith_sample`, `ilmenite_bearing_basalt_sample`, `silicate_rich_rock_sample`), `hitsLeft = 3`, `cost` (1 for regolith, 2 for the others), `sprite`, `collider`.
### 9.2 Mining flow (`src/systems/Mining.js`)
Triggered when the `useTool` action goes down (key J or left mouse button) and `player.canMove` and the selected hotbar item is `basic_pickaxe` and no swing is running:
1. Find the nearest Rock with `hitsLeft > 0` whose distance from the player's feet `(player.x, player.y)` to the rock's feet is at most 140 px. If none: play SFX `Pickaxe_Swing` only (a miss) and do the swing animation.
2. If `pickaxe.durability <= 0`: play SFX `Tool_Break`, floating text `Pickaxe is broken`, stop.
3. Swing: lock the player 450 ms, face the rock (set `facing` by the larger axis), play `astro_interact` (frames 0-2 at 8 fps once) and SFX `Pickaxe_Swing`; draw a white arc effect: a 4-point crescent made with a Graphics stroke 4 px `0xffffff` alpha 0.8 in front of the player for 150 ms.
4. After 220 ms (the impact), if a rock was targeted:
   - `pickaxe.durability -= rock.cost` (never below 0), `rock.hitsLeft -= 1`, SFX by type: `Impact_Regolith` / `Impact_IronBearing_Rock` / `Impact_Silicate_Rock`.
   - Rock shake: tween x +-4 px, 3 repeats in 150 ms. Spawn 6 debris pixels (4x4 rects, rock colors: regolith `0xb9bfd6`, ironrich `0xb4562e`, silicate `0x5ec8ff`) flying outward and fading in 500 ms.
   - Collected sample: `inventory.add(rock.sampleId, 1)`; if it was added: SFX `Resource_Pickup` after 120 ms, floating text `+1 {name}` (gold, 22px, rising 50 px, 900 ms) above the rock, and `state.addScore(10, 'sample')` only while the player's count of that type is 5 or fewer (so repeated collecting past 5 gives no score).
   - When `hitsLeft` becomes 1: SFX `Rock_Crack` and tint the rock sprite `0xb0b0b0`. When it becomes 0: SFX `Rock_Break`, then `Debris_Fall` after 150 ms, the rock sprite scales to 0.3 and fades out in 300 ms, the collider is removed, 10 debris pixels fly out.
   - Durability warnings: when the durability crosses from above 10 to 10 or below, SFX `Tool_Durability_Low` and NOVA says `Your pickaxe is getting worn.` (3 s). At 0: SFX `Tool_Break`, text `Pickaxe is broken`, and NOVA says `Take it to the Workstation for a repair.`
5. Check conditions after every collection: `regolith_samples_5` when `inventory.count('lunar_regolith_sample') >= 5`, `ilmenite_samples_5`, `silicate_samples_5` likewise (use `state.set`).
6. A rock prompt: when the pickaxe is selected and a rock with hits left is within 140 px show the prompt (`InteractPrompt`, label `Mine rock`, key = the first binding of `useTool`) above it. Otherwise nothing.
### 9.3 Repair at the Workstation
In `InteriorScene`, the workstation interactable (SPEC 03) gets a second behavior: if `pickaxe.durability <= 12` when the player interacts, after the normal InfoCard closes NOVA repairs it: SFX `Crafting_Complete`, `pickaxe.durability = 30`, floating text `Pickaxe repaired` and NOVA says `All fixed. The pickaxe is like new.` (3 s). This can happen any number of times.
### 9.4 Inventory counters panel
While objective 06 is the current objective, show a small panel under the ObjectivePanel (at (14, objectivePanelBottom + 10), width 330): three rows (icon 28x28, name, `n / 5` in green when complete, white otherwise). Use `uiPanel`. It is hidden at other times.

## 10. Objectives and dialogue wiring
| objective | trigger | what happens |
|---|---|---|
| 04 | objective 04 starts (the `obj04a` dialogue of SPEC 04 plays first) | the player must: select the pickaxe (press 2), press F, open the backpack and select the pickaxe cell. NOVA hints appear if nothing is done 25 s after the dialogue ended: `Press 2 to equip your pickaxe, F for the flashlight and I for your backpack.` (once, flag `hint_obj04`) |
| 05 | `LevelScene` starts with objective index 4, or objective 05 starts while in `LevelScene` | dialogue `obj05_nova`, `obj05_astronaut`, `obj05_nova2` once (flag `talked_obj05`) 1500 ms after the scene starts or the objective starts. `lunar_plains_entered` is set by the region system (SPEC 02B): re-check the current objective right after an objective advances so conditions that were already done count at once |
| 06 | the player first enters the rock field: any feet position with `x >= 3000` while objective index is 5 | dialogue `obj06_dr1`, `obj06_astronaut`, `obj06_dr2`, `obj06_nova` (flag `talked_obj06`) and show the counters panel |
| 06 done | all three sample conditions set (objective completes) | dialogue `obj06_complete_nova`, `obj06_complete_astronaut`, `obj06_complete_nova2` once (flag `talked_obj06c`) |
Objective completion rule from SPEC 03 stays: when all conditions of the current objective are set the objective completes (+100, sound, popup) and the next starts 1500 ms later.
Starting from objective 04, the player may open the backpack and use the hotbar at any time (not only during 04); before objective 04 the hotbar and backpack are visible but the pickaxe cannot mine (mining requires objective index >= 4: before that pressing the use key with the pickaxe shows the floating text `Finish the first tasks first`).

## 11. Controls and misc
- `actions`: add `hotbar1`..`hotbar9` as fixed keys (not rebindable) and `wheel`. Key `O` still toggles the objective panel.
- ESC order: if BackpackPanel or InfoCard is open it closes; otherwise the old behavior (leave the scene).
- The BottomHud is also shown inside the interior.
- Floating texts use a shared helper `floatText(scene, x, y, text, color)` (Chakra Petch 700 22px with a 4 px dark stroke, depth 130).

## 12. Test hooks
`window.__astro` additionally exposes: `inventory`, `tools`, `mining`, `giveItem(id, n)`, `setDurability(n)`, `mineNearest()` (runs the swing and impact on the nearest rock, ignoring key input), `openBackpack()`.

## 13. Done when (Claude runs these, you do not)
- `cd game && npm run build` has no errors.
- The outpost looks clean and smooth (no blur or jagged edges).
- The bottom HUD shows the portrait, the three tubes, three hearts, 9 hotbar slots (flashlight in 1, pickaxe in 2), and the backpack button. Pressing 1 or 2 selects slots.
- Pressing I opens the backpack with the starting items (3 oxygen, 5 food, 4 batteries, 1 kit); selecting the pickaxe shows `Durability 30 / 30` and completes `durability_viewed` when objective 04 is current. `Use` on food adds hunger.
- F toggles a light cone; low battery blinks.
- At a rock with the pickaxe selected `E` is not used, `J` or click mines: swing, impact, debris, `+1 Lunar Regolith`, durability drops by 1 (2 for the other rocks); the 3rd hit breaks the rock.
- Collecting 5/5/5 completes objective 06 with the score +100 and the NOVA lines. The durability is 5 left after 15 samples (30 - 5*1 - 10*2 = 5).
- At the Workstation with durability 12 or lower the pickaxe is repaired.
- Reloading keeps the inventory, durability, hotbar and objective progress.
- Write `game/DONE-SPEC-05.md` and stop.
