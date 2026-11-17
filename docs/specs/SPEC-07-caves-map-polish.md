# SPEC 07 — Movement polish, interaction prompts at the door, caves with valuable resources, minimap, map, collapsible objectives

Audience: Gemini. Code only. Start from the working result of SPEC 06. Every number, string, key and file is given. Do not measure, inspect or redraw images. Do not generate images or audio.

## RULES FOR YOU (read first)
1. Never end your turn until `game/DONE-SPEC-07.md` is written.
2. Never write a status message without a tool call in the same step. Do not summarize plans in chat. Edit files.
3. Run commands in the FOREGROUND with a timeout. Never in the background.
4. Do not edit `game/public/assets/` or `game/public/audio/`.
5. English UI text only. No NASA logo or claims about NASA. Keep every `window.__astro` hook.

## 1. Movement polish (do this first; the walking feels stiff and jittery)
Apply all of these in `Player.js`, `LevelScene.js`, `InteriorScene.js`, `main.js`:
1. Physics step: in the Phaser config set `physics: { default:'arcade', arcade:{ gravity:{y:0}, fps:120 } }`. The player is moved only by body velocity (never by setting x/y, except teleport and clamping).
2. Acceleration model: `ACCEL = 2600`, `FRICTION = 3200`. When the new input direction is opposite to the current velocity (dot product below 0) use `TURN_ACCEL = 5200` so reversing is instant. Speeds stay `WALK_SPEED 220`, `RUN_SPEED 340`. Diagonal input is normalized. Below 12 px/s the velocity snaps to 0.
3. Camera: `startFollow(player, true, 0.12, 0.12)`, remove the dead zone, keep `roundPixels: true`. After each camera update round the scroll to integers (`cam.scrollX = Math.round(cam.scrollX)`, same for y) in `scene.events.on('postupdate')`.
4. Sprite position rounding: the player's visual position is drawn at `Math.round(x)`, `Math.round(y)` (set `player.setRoundPixels?` or override `preUpdate` to snap the displayed position; the physics body keeps the float position). NOVA and shadows are rounded the same way.
5. Animation: never restart a running animation (`play(key, true)`); the walk `frameRate` is `8 * (speed / WALK_SPEED)` clamped to 6..12; the state changes from `walk` to `idle` only after the velocity stayed below 20 px/s for 80 ms (prevents flicker when stopping). Facing changes only when the input direction changes (not from velocity).
6. Collision comfort: the player's foot body is `40 x 24` (frame pixels), offset `(42, 141)`. Rock colliders are `56 x 22` (was 70 x 24) so the player slides around them instead of sticking. When a diagonal move hits an obstacle, keep the free axis moving (Arcade does this when both axes are separate; do not zero both velocity components).
7. Depth sorting uses the feet y (`depthOf(y)`), rounded to 2 decimals to avoid flicker.
8. Hotbar, backpack and dialogue lock: pressing movement keys while a menu is open must not queue movement (clear the keys on close).

## 2. Interaction prompts (all scenes)
The `E` prompt (`InteractPrompt`) must appear close to the action, never above the building.
- Anchor: `(player.x, player.y - 175)` (just above the astronaut's head, in world coordinates; use the screen position through the camera). It follows the player while the interactable is in range.
- Remove every `promptY` use. Keep the label text. For the airlock the label is `Enter Outpost`, for the cave entrances `Enter Cave`, for the cave exit `Leave Cave`.
- The "Mine rock" prompt uses the same anchor.
- Show the prompt only when the player is closer than the interactable's `range`; range for doors and cave entrances is 120.

## 3. Caves (valuable resources are inside caves)
Design: common regolith lies on the surface. The valuable samples (iron-bearing rock and silicate rock) are found only inside two caves, which are dark. The player needs the flashlight inside.

### 3.1 Assets (load in `LevelScene.preload()` and `CaveScene.preload()`; NEAREST unless noted)
| key | file | note |
|---|---|---|
| `cave_entrance` | `level01/world/cave_entrance.png` | 1000 x 558, LINEAR |
| `cave_wall` | `level01/world/cave_wall.png` | 1800 x 655, LINEAR |
| `cave_floor` | `level01/world/cave_floor.png` | 512 x 512 seamless tile, NEAREST |
| `rock_ironrich`, `rock_silicate`, `rock_ore_extra`, `rock_regolith` | already loaded in SPEC 02B | 4 frames each (`rock_ore_extra` frame 96 x 82) |
| `decal_dust_dark`, `decal_pebbles` | already loaded | reuse inside the cave |
Generated textures (create in code, once, in `BootScene` or `CaveScene.create`): `light_radial` = a 512 x 512 canvas texture, radial gradient from white alpha 1 at the center to alpha 0 at the edge (stops: 0 -> 1.0, 0.55 -> 0.7, 1 -> 0); `light_cone` = a 512 x 512 canvas texture: a triangle fan from the left-middle point (0, 256) opening to the right edge with 56 degrees total angle, white alpha 0.95 near the apex fading to 0 at the far edge (use a linear gradient along x), apex at the left.

### 3.2 Surface changes (`LevelScene`, `constants.js`)
- Replace `ROCK_NODES` by 6 regolith rocks only:
  `['regolith',3200,1500],['regolith',3700,1050],['regolith',4300,1800],['regolith',5500,2000],['regolith',6200,1100],['regolith',4900,1200]`.
- Add `CAVES = [ { id:'iron_cave', name:'Iron Cave', x:4500, y:1000, sample:'ironrich', door:{x:4500,y:1060} }, { id:'crystal_cave', name:'Crystal Cave', x:6000, y:1900, sample:'silicate', door:{x:6000,y:1960} } ]`.
- Draw each cave entrance: `cave_entrance` origin (0.5, 1), at `(x, y)`, display width 520 (height 520 * 558 / 1000), depth `depthOf(y)`. Collider: two static invisible rectangles that leave the middle open: left `Rectangle(x - 190, y - 14, 140, 28)` and right `Rectangle(x + 190, y - 14, 140, 28)` (centers). The area between them is walkable up to y.
- Interactable per cave: `id` = cave id, `x = door.x, y = door.y`, `range 120`, label `Enter Cave`. On interact: lock the player, SFX `Airlock_Open` at gain 0.5 (cave rumble substitute), fade 500 ms, `scene.start('CaveScene', { cave: id })`. Returning from a cave places the player at `(door.x, door.y + 70)` facing down.
- Add the two caves to the map markers (section 5) and the debug overlay.
- Objective 06 hints: when the first cave entrance comes within 700 px for the first time while objective 06 is current, NOVA says `Valuable rock hides in caves. It is dark inside, so turn on your flashlight.` (text only, 4 s, flag `hint_caves`). The ObjectivePanel description for objective 06 becomes `Collect 5 samples of each rock type. Regolith lies outside; iron-bearing rock and silicate rock are in the caves.`

### 3.3 CaveScene (`src/scenes/CaveScene.js`, register in `main.js`)
Scene key `CaveScene`, data `{ cave:'iron_cave' | 'crystal_cave' }`. World size 2560 x 1440. Camera bounds equal the world, follow the player (same settings as section 1). Player: top-down `Player`, start `(1280, 1240)` facing up, bounds `{x1:240, y1:420, x2:2320, y2:1330}`, `surface = 'cave'` (footsteps use `SFX_Footstep_Regolith_*` with gain 0.5 and a delay-free echo: also play the same sound again 140 ms later at gain 0.18).
Layers:
- depth -10: `tileSprite(0, 0, 2560, 1440, 'cave_floor')` origin (0,0), tint `0x7f8aa8`.
- depth -5: dust decals: 18 `decal_dust_dark` (scale 0.30, alpha 0.5) and 40 `decal_pebbles` (scale 0.16), positions from `mulberry32(777)`, inside the player bounds.
- Walls: `cave_wall` images, origin (0.5, 1), depth `depthOf(380)`: top wall two images side by side at y = 400, x = 700 and x = 1900, display width 1500 (scale 1500/1800); the left and right boundaries: dark rectangles `0x04060f` alpha 1 for x < 240 and x > 2320 (full height), the bottom: a dark rectangle for y > 1380, plus 6 big boulders (`rock_regolith` frame 0, scale 2.2, origin (0.5,1), tint `0x556070`) along the left and right edges at y = 700, 1000, 1300 (x = 300 and x = 2260).
- Exit: a glowing rectangle (an arch made with Graphics: 220 x 40 at `(1280, 1360)`, fill `0x3fd2ff` alpha 0.25) and an interactable `id 'cave_exit'`, `x = 1280, y = 1300`, `range 120`, label `Leave Cave`. On interact: lock, fade 500 ms, `scene.start('LevelScene', { mission:1, from:'cave', cave: <id> })`.
- Deposits: for `iron_cave` 8 rocks of type `ironrich` and 2 decorative `rock_ore_extra` (not mineable, frame 0..1) at these positions; for `crystal_cave` 8 `silicate` rocks and 4 decorative crystal glows. Rock positions (feet): iron cave `[600,700],[900,1100],[1200,640],[1500,1000],[1750,720],[2000,1150],[2200,820],[1000,860]`; crystal cave `[540,820],[860,640],[1100,1150],[1420,760],[1680,1180],[1900,700],[2150,1000],[1300,980]`. Each is a `Rock` (SPEC 05) with `hitsLeft 3` and persists its hits in `state.rockHits` with ids `<cave id>_<index>`. Scale 1.3, collider `56 x 22`. Decorative ore: `[1400,540],[400,1100]` (iron cave).
- Darkness (the key effect), depth 90, scroll factor 0: a `RenderTexture(0, 0, 1280, 720)` (`darkness`). Every frame: `darkness.clear(); darkness.fill(0x02040c, 0.94);` then erase light shapes at screen positions (world position minus the camera scroll):
  - A tiny always-on glow so the player is never blind: `light_radial` scaled to 150 px diameter (scale 150/512) centered on the player (erase alpha 0.9).
  - If `state.flashlight.on`: `light_cone` at the player's chest `(player.x, player.y - 70)`, origin (0, 0.5), scaled to 460 x 460, rotated to the facing (right 0, down 90 deg, left 180, up 270), erase alpha 1.0; plus `light_radial` scaled to 260 px centered on the player (erase alpha 0.55). When the charge is at or below 25 percent the flashlight erase alpha blinks between 1 and 0.4 every 300 ms.
  - Crystal glow: around every `silicate` rock and decorative crystal erase a `light_radial` of 120 px diameter at alpha 0.5 so they can be spotted from afar. Iron cave deposits glow 90 px at alpha 0.35 (orange tint is not possible with erase: skip the tint).
  - NOVA: erase `light_radial` 110 px at alpha 0.35 around NOVA.
  Use `darkness.erase(gameObject, x, y)` with the image's `setOrigin`/`setScale`/`setRotation` set before each call (reuse two Image objects that are not added to the display list: `scene.make.image({key}, false)`).
- The world objects drawn in the cave (rocks, player, NOVA, walls) stay under the darkness layer (they are only visible where light is erased).
- Hint: when the scene starts and the flashlight is off, NOVA says `It is very dark here. Press F to turn on your flashlight.` (text only, 4 s, flag `hint_cave_dark`).
- The BottomHud, ObjectivePanel, ScorePanel, BackpackPanel, Dialogue, Mining, Tools, Interactions, NOVA are all added to CaveScene exactly as in LevelScene (same classes; the vitals and hotbar are visible). Mining works with the same rules (objective index >= 4; costs 2 durability for ironrich and silicate).
- Audio: music `MUS_Lunar_Exploration` stays at gain 0.4 (duck it, no new track); loop `AMB_Shadowed_Area` at gain 0.6 and stop `AMB_Lunar_Surface`; on leaving restore them.
- Region toast: entering the scene shows the toast (SPEC 02B style) with the cave name and, the first time, `New area discovered!` (+25 score, flag `discovered_<cave id>`).
- Persistence: reloading while inside a cave restarts the scene at the entrance position (the saved scene is not required).

## 4. Minimap (all gameplay scenes except the interior)
- Top right: a circular minimap, diameter 180, center `(1176, 106)` (so it spans x 1086..1266, y 16..196).
- Implementation: a second camera `scene.cameras.add(1086, 16, 180, 180)`, `setZoom(0.06)` for the surface (`0.1` in caves), `startFollow(player, true, 0.2, 0.2)`, `setBounds` as the main camera, `roundPixels`, and a circular geometry mask (a `Graphics` circle at (1176, 106) radius 90, `createGeometryMask()`, applied with `cam.setMask(mask)`). The main camera must ignore nothing extra; the minimap camera must IGNORE every UI object (all depth >= 90 objects, the BottomHud, panels, prompts, toasts, the darkness texture in caves): keep a list `scene.uiObjects` and call `miniCam.ignore(list)`; every UI class adds its objects to that list through a helper `registerUi(scene, obj)` in `ui/theme.js`.
- Ring: a `Graphics` circle outline: radius 92, 6 px `0x1a1a2e`, then 4 px `0x8e9af0`, then an inner 2 px `0x1c2366` at radius 88; four gold `0xffb02e` ticks at north, east, south, west, and the letter `N` (Chakra Petch 700 14px white) above the north tick. Depth 110, scroll factor 0 (also ignored by the minimap camera).
- On top: a white arrow `Graphics` triangle (8 px) at the minimap center showing the player's facing, and a house icon (12x12, drawn by code, white with a dark outline) that points to the outpost when it is outside the minimap: an arrow at the ring edge in the direction of the base. Use `Phaser.Math.Angle.Between`.
- Hide the minimap while the BackpackPanel, TechTreeScene, MapPanel, InfoCard or a dialogue is open.

## 5. Map (key `M`, `map` action; also a small `M` button under the minimap)
- A modal panel `MapPanel` (depth 150), available in `LevelScene` and `CaveScene` (in the interior pressing M shows the floating text `The map works outside the outpost`).
- Layout: dim backdrop (black 0.55). Panel `uiPanel` at (100, 50) size 1080 x 620. Title `Map` (Chakra Petch 700 26px gold) at (132, 62) and a red X button 36 x 36 at (1126, 62).
- Map picture: two textures `map_fog` = `ui/map/lunar_map_fog_of_war.webp` and `map_full` = `ui/map/lunar_map_discovered.webp`, both 1672 x 941, LINEAR. Use the same crop on both: crop rectangle `(163, 89, 1352, 825)` of the original, displayed at `(160, 108)` with size 960 x 586 (scale 0.71). Draw `map_fog` first; then draw `map_full` on top with a geometry mask made of one soft ellipse per DISCOVERED region (the mask is rebuilt when a region is discovered), so only discovered regions show full detail and the rest stays fogged.
- Region ellipses (display coordinates, center x, center y, radius x, radius y) and marker positions:
```
lunar_base      (610, 416) rx 200 ry 120   marker: white house pin
lunar_plains    (833, 458) rx 230 ry 140   marker: pickaxe icon
iron_field      (295, 407) rx 190 ry 130   marker: fog '?' (hidden until discovered)
silicon_flats   (721, 573) rx 190 ry 100   marker: fog '?'
highland_ridge  (397, 221) rx 230 ry 130   marker: padlock
shadowed_crater (907, 309) rx 200 ry 110   marker: padlock
ice_deposit     (1055, 244) rx 140 ry 100  marker: padlock
```
  `lunar_base` and `lunar_plains` are discovered when `flags.discovered_<id>` is true. Markers: icons drawn by code (the same pixel padlock and `?` as SPEC 02B, white or `#8fb4ff`, size 44).
- Caves: when discovered, a small cave icon (cave entrance silhouette 28 x 20, dark with cyan rim) appears at their map position inside the plains: `iron_cave` at map `(790, 380)` and `crystal_cave` at `(940, 520)`.
- Player pin: a yellow `0xffd23f` map pin (16 x 22 drawn by code) positioned by interpolation inside the region the player stands in: for `lunar_base` the world rect `(1000..2800, 1000..2000)` maps to the display box `(527..703, 369..462)`; for `lunar_plains` the world rect `(2800..7000, 700..2300)` maps to `(731..962, 360..527)`; elsewhere hide the pin. Clamp inside the box. The pin bobs 4 px up and down (700 ms yoyo). Inside a cave the pin sits on that cave's icon.
- Legend panel (`uiPanel`) at (1000, 120) width 160: `Base` (house), `You` (pin), `Cave` (cave icon), `Fog` (a gray square), `Locked` (padlock): rows of 28 px with icon and label (Chakra Petch 600 14px).
- Opening: SFX `Menu_Open`; closing (`M`, ESC or X): `Menu_Close`. While open `player.canMove = false`.

## 6. Collapsible objectives panel
- The ObjectivePanel (and the sample counters panel of SPEC 05) gets a small tab so it does not take screen space: a `uiPanel` tab 28 x 84 attached to the right edge of the panel at `(panel.x + panel.width, 26)`, with a chevron drawn by code (pointing left when expanded, right when collapsed; 10 px, white 3 px strokes) and a small clipboard icon above the chevron only when collapsed.
- Clicking the tab or pressing `O` toggles: expanded <-> collapsed. Collapsed: the panel and the counters panel slide left until only the tab is visible at `x = 0` (tween 250 ms `Cubic.easeInOut`, SFX `Tab_Switch`); expanded: slide back.
- The state is saved in `localStorage` key `astrokid.ui.v1` as `{ objCollapsed: true|false }` and restored. Default expanded.
- While collapsed, when a new condition or objective changes, the tab flashes gold for 1.2 s (and a tiny `!` dot) so the player notices. A new objective starting expands the panel automatically for 4 seconds and then collapses it again only if it was collapsed before.
- The score panel stays visible.

## 7. Test hooks
`window.__astro` additionally exposes: `caves: CAVES`, `enterCave(id)`, `openMap()`, `toggleObjectives()`.

## 8. Done when (Claude runs these, you do not)
- `cd game && npm run build` has no errors.
- Walking feels smooth: no visible shaking of the player or the ground while moving, stopping and reversing are immediate, diagonal speed equals straight speed.
- Prompts appear just above the astronaut's head, close to the door, never above the building.
- On the plains there are 6 regolith rocks and two cave entrances; walking in front of an entrance shows `E Enter Cave`; entering fades into a dark cave; without the flashlight only a small glow is visible; with the flashlight (F) a cone of light shows the rocks; the 8 rocks of the cave can be mined; leaving returns to the surface at the entrance.
- 5 regolith + 5 iron-bearing + 5 silicate collected completes objective 06 exactly as before.
- A circular minimap at the top right follows the player; `M` opens the map with the fog and the player pin; discovered regions are shown without fog.
- The objectives panel has a tab that collapses it to a thin tab and restores it; the state survives a reload.
- Write `game/DONE-SPEC-07.md` and stop.
