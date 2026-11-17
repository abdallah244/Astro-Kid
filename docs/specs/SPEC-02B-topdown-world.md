# SPEC 02B — Top-down world (replaces the side-view world and the jump)

Audience: Gemini. Code only. Start from the working code (SPEC 01 to 04 done or in progress). This spec REPLACES the side-scrolling world, gravity and jumping of SPEC 02. Everything else (UI, audio, objectives, dialogue, cutscene, interior stations) stays. Every number, key and file is given. Do not measure, inspect or redraw images. Do not generate images or audio.

## RULES FOR YOU (read first)
1. Never end your turn until `game/DONE-SPEC-02B.md` is written.
2. Never write a status message without a tool call in the same step. Do not summarize plans in chat. Edit files.
3. Run commands in the FOREGROUND with a timeout. Never in the background.
4. Do not edit `game/public/assets/` or `game/public/audio/`.
5. English UI text only. No NASA logo or claims about NASA. Keep every `window.__astro` test hook.

## 1. Goal
Level 1 becomes a TOP-DOWN 2D exploration level on a large map (7680 x 2880 px). The astronaut walks freely up, down, left and right (8 directions), no gravity and no jump. The camera follows. The ground is a repeating moon texture with craters and pebbles; the outpost stands in the west, the Lunar Plains with 18 rock nodes in the east; other map regions are covered by fog. Walking into a new region shows its name and gives a first-discovery bonus. The interior (SPEC 03) keeps working with the new movement.

## 2. Assets (already in `game/public/assets/`; load in `LevelScene.preload()`; all NEAREST unless noted)
| key | file | notes |
|---|---|---|
| `ground_a` | `level01/world/ground_a.png` | 512x512 seamless tile |
| `ground_b` | `level01/world/ground_b.png` | 512x512 seamless tile |
| `decal_crater_s` | `level01/world/decal_crater_s.png` | 378x367 |
| `decal_crater_m` | `level01/world/decal_crater_m.png` | 493x481 |
| `decal_crater_l` | `level01/world/decal_crater_l.png` | 701x689 |
| `decal_pebbles` | `level01/world/decal_pebbles.png` | 869x755 |
| `decal_dust_dark` | `level01/world/decal_dust_dark.png` | 870x755 |
| `decal_dust_light` | `level01/world/decal_dust_light.png` | 869x755 |
| `cliff_1` | `level01/world/cliff_1.png` | 1996x430 |
| `cliff_2` | `level01/world/cliff_2.png` | 1983x448 |
| `base_ext` | `level01/world/base_exterior.png` | 1725x1093 |
| `rock_regolith` `rock_ironrich` `rock_silicate` | `level01/world/rock_*.png` | spritesheets 4 frames: 91x79, 91x82, 91x82 |
| `astro_down` | `sprites/astro_down.png` | spritesheet frameWidth 125 frameHeight 169, 4 frames |
| `astro_up` | `sprites/astro_up.png` | spritesheet 125x169, 4 frames |
| `astro_walk` | already loaded (side view, faces RIGHT, 4 frames) | reuse |
| `astro_idle` | already loaded (front view, 2 frames) | reuse |
`bg_base`, `bg_plain`, `ground_tile`, `astro_jump` are no longer used by the level: do not load them in `LevelScene`. (`moon_background` stays loaded for the menus.)
Animations (create once, global): `walk_down` (`astro_down` frames 0-3, frameRate 8, repeat -1), `walk_up` (`astro_up` 0-3, 8, -1), `walk_side` (`astro_walk` 0-3, 8, -1), `idle_down` (`astro_idle` 0-1, frameRate 1.8, repeat -1). Keep `astro_interact` as it is.

## 3. Constants (`src/core/constants.js`)
Remove `GRAVITY`, `JUMP_V`, `GROUND_Y`, `GROUND_H`, `ZONES`, `AIRLOCK_X`, `ROCK_CLUSTERS_X`, and every use of them. Keep `VIEW_W/H`, `WALK_SPEED`, `RUN_SPEED`, `PLAYER_SCALE`. Set and add exactly:
```
WORLD_W = 7680, WORLD_H = 2880
WALK_SPEED = 220, RUN_SPEED = 340, ACCEL = 1800, FRICTION = 2200
PLAYER_SCALE = 0.8
PLAYER_START = { x:1500, y:1700 }
BASE = { x:1800, y:1500, w:760 }          // sprite bottom-center and display width; display height = 760*1093/1725
DOOR = { x:1744, y:1510, range:130 }      // the airlock interaction point (in front of the glowing door)
PLAYABLE = { x1:600, y1:720, x2:7000, y2:2280 }   // the player's feet can only be inside this rectangle
REGIONS = [
  { id:'lunar_base',      name:'Lunar Base',      x1:1000, y1:1000, x2:2800, y2:2000, state:'open'   },
  { id:'lunar_plains',    name:'Lunar Plains',    x1:2800, y1:700,  x2:7000, y2:2300, state:'open'   },
  { id:'iron_field',      name:'Iron Field',      x1:200,  y1:100,  x2:1600, y2:700,  state:'fogged' },
  { id:'silicon_flats',   name:'Silicate Flats',  x1:2000, y1:2300, x2:4400, y2:2800, state:'fogged' },
  { id:'highland_ridge',  name:'Highland Ridge',  x1:5200, y1:100,  x2:7600, y2:650,  state:'locked' },
  { id:'shadowed_crater', name:'Shadowed Crater', x1:7000, y1:700,  x2:7680, y2:1500, state:'locked' },
  { id:'ice_deposit',     name:'Ice Deposit',     x1:7000, y1:1600, x2:7680, y2:2700, state:'locked' }
]
ROCK_NODES = [  // type, x, y (feet position, origin bottom-center)
  ['regolith',3200,1500],['regolith',3700,1050],['regolith',4300,1800],['regolith',4900,1200],['regolith',5500,2000],['regolith',6200,1100],
  ['ironrich',3500,1900],['ironrich',4100,1300],['ironrich',4700,2050],['ironrich',5300,950],['ironrich',5900,1500],['ironrich',6500,1900],
  ['silicate',3900,2100],['silicate',4500,900],['silicate',5100,1650],['silicate',5700,1000],['silicate',6100,1700],['silicate',6700,1300]
]
depthOf = (y) => y / 30       // depth of any object standing at feet y (0..96)
```
UI keeps using the existing depths (100, 120, 150). World objects must stay below 100, so ALWAYS use `depthOf(y)` for world objects.

## 4. Input and actions
In `DEFAULT_KEYS` (SPEC 02, `save.js`): remove `jump`, remove `left` and `right` as they are, and add/replace so the movement keys are:
```
left:  ['A','LEFT'],  right: ['D','RIGHT'],  up: ['W','UP'],  down: ['S','DOWN'],
run: ['SHIFT', null], interact: ['E', null], useTool: ['J', null], flashlight: ['F', null],
backpack: ['I', null], technology: ['C', null], map: ['M', null], objectives: ['O', null]
```
Migrate old saves: if `keys.jump` exists, delete it; add missing `up` and `down`.

## 5. Player (`src/entities/Player.js`, rewrite)
- Class `Player extends Phaser.Physics.Arcade.Sprite`, texture `astro_idle`, origin (0.5, 1), scale `PLAYER_SCALE`, position given by the constructor `(scene, x, y)` where `y` is the FEET position.
- Body = a foot box: `setSize(50, 30)` (frame pixels), `setOffset(37, 135)` so the box sits at the feet (frame is 125x169), `setCollideWorldBounds(false)`. Gravity 0. `setMaxVelocity(WALK_SPEED*1.6)`.
- Movement every frame: `dx = right - left`, `dy = down - up` from actions. If both are non-zero the vector is normalized. `speed = run ? RUN_SPEED : WALK_SPEED`. Velocity moves toward `dir * speed` by `ACCEL * dt`; with no input it moves toward 0 by `FRICTION * dt`.
- Movement bounds: `player.setBounds(x1, y1, x2, y2)` keeps the FEET (`player.x`, `player.y`) inside that rectangle: clamp position each frame and zero the velocity component that hits the edge. `LevelScene` sets it to `PLAYABLE`; `InteriorScene` sets it to `{x1:60, y1:572, x2:1220, y2:650}`.
- Facing and animation: `facing` is one of `'down'`, `'up'`, `'left'`, `'right'`, updated from the input direction using the larger axis (ties: keep the previous). Moving: `down` plays `walk_down`; `up` plays `walk_up`; `left`/`right` play `walk_side` with `setFlipX(facing === 'left')`. Run doubles nothing but sets `anims.timeScale = 1.5`. Idle: facing `down` plays `idle_down`; `up` shows `astro_up` frame 0; `left`/`right` show `astro_walk` frame 0 (flipX for left). `player.facingX` is `1` or `-1` (horizontal sign of the last horizontal facing), used by NOVA and the Interactions system.
- `player.state` is `'idle'` or `'walk'`. `player.canMove` and `player.surface` keep working as in SPEC 02/03.
- Footsteps: while `walk`, play `audio.playVariant('SFX_Footstep_Regolith', 3, {gain:0.7})` (or the metal list when `surface == 'metal'`) every 280 ms (every 190 ms when running).
- Shadow ellipse under the feet: `ellipse(0,0,70,14,0x000000,0.35)` at the feet, depth `depthOf(y) - 0.01`.
- Depth: every frame `setDepth(depthOf(this.y))`.
- Remove all jump code, the `astro_jump` animation use and the landing sounds.

## 6. LevelScene (`src/scenes/LevelScene.js`, rewrite the world part; keep the HUD, NOVA, Interactions, Dialogue and objective triggers from SPEC 03/04)
Camera: `cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)`, `startFollow(player, true, 0.1, 0.1)`, `setDeadzone(60, 40)`. Physics world bounds `0,0,WORLD_W,WORLD_H`.

### 6.1 Ground (depth -10)
`this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'ground_a').setOrigin(0,0).setDepth(-10)`. Then 40 patches (depth -9): `tileSprite(px, py, 640, 420, 'ground_b')`, alpha 0.55, origin (0.5, 0.5), positions from the seeded generator (6.2) inside PLAYABLE. Set `tilePositionX/Y` of each patch to a random multiple of 8.

### 6.2 Seeded random
Use this exact generator for everything random in the world so the map is the same every time:
```
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rnd = mulberry32(20261114)
```
Call `rnd()` in a fixed order: ground patches first (40 x 2 values), then decals (6.3).

### 6.3 Decals (depth -5, no collision)
Placement rule: random point `(x,y)` inside PLAYABLE, rejected (and redrawn) when it is closer than 380 px to the base `(BASE.x, BASE.y)`, closer than 160 px to the player start, or closer than 130 px to any ROCK_NODES point. Counts and display scales (origin 0.5, 0.5, random flipX with `rnd()<0.5`):
- `decal_crater_s` x 14, scale 0.40; `decal_crater_m` x 12, scale 0.45; `decal_crater_l` x 6, scale 0.50 (alpha 0.95)
- `decal_pebbles` x 60, scale 0.18; `decal_dust_dark` x 22, scale 0.30, alpha 0.7; `decal_dust_light` x 22, scale 0.30, alpha 0.7
Craters are decoration only: the player walks over them.

### 6.4 Outpost
`base_ext` image, origin (0.5, 1), at `(BASE.x, BASE.y)`, display width `BASE.w`, display height `BASE.w*1093/1725`, depth `depthOf(BASE.y)`. Collision: a static invisible rectangle `Rectangle(BASE.x, BASE.y - 24, 640, 48)` (center x, center y) so the player cannot walk into the dome but can walk around and below it. A small gold marker is not needed.
Door interactable (SPEC 03): `id 'airlock'`, `x = DOOR.x`, `y = DOOR.y`, `range = DOOR.range`, label `Enter Outpost`, `promptY = DOOR.y - 330` (world y of the prompt panel center). The interaction rule uses the 2D distance between the player's feet and `(x, y)` (see section 8).
Player start: `PLAYER_START`. When returning from the interior, place the player at `(DOOR.x + 60, DOOR.y + 70)`, facing down.

### 6.5 Rock nodes (decoration for now, mining comes in a later spec)
For each entry of ROCK_NODES `[type, x, y]` at index `i`: sprite from `rock_<type>`, frame `i % 4`, origin (0.5, 1), scale 1.15, depth `depthOf(y)`, plus a static invisible collider `Rectangle(x, y - 12, 70, 24)`. Store them in `scene.rocks` as objects `{type, x, y, sprite, collider}` for later specs.

### 6.6 Boundaries
- Top ridge: along y = 700, place `cliff_1` and `cliff_2` alternating, origin (0.5, 1), display scale 0.33 (about 660 px wide), spaced 600 px apart, from x = 300 to x = 7380, depth `depthOf(700)`. Bottom ridge: the same at y = 2480.
- The PLAYABLE rectangle already keeps the player inside; also add the fog below.

### 6.7 Fog and region markers
For every REGION with `state` other than `'open'` draw a fog rectangle: fill `0x0a1030`, alpha 0.62, depth 97, with `x1,y1,x2,y2` (fogged) or alpha 0.8 (locked). Outside PLAYABLE on the left (x < 600) and right (x > 7000) and the bands above y = 700 and below y = 2300, add the same fog (alpha 0.62) so the map edge is dark. On each fogged region draw a `?` (Chakra Petch 700 80px, color `#8fb4ff`, alpha 0.8) at its center; on each locked region draw a padlock made with rects (the same 8x9 padlock grid as the Missions screen, cell size 10) in white alpha 0.8 at its center. These markers are depth 98.
Open regions have no fog.

### 6.8 Region discovery
`RegionManager` (inside `LevelScene` or `src/systems/Regions.js`): each frame find the open region that contains the player's feet (`lunar_base` has priority where regions overlap: none overlap). When it changes: emit `bus 'region:enter' (id)`; show a toast (`uiPanel` 360x56 at (460, 96), depth 125, scrollFactor 0, slides down from y = -60, stays 1800 ms, fades out) with the region name (Chakra Petch 700 24px gold) and plays SFX `Notification`. The first time a region is entered (flag `discovered_<id>`): `state.addScore(25, 'discovery')` and the toast shows `New area discovered!` in a second line (Chakra Petch 600 14px white). Entering `lunar_plains` also calls `state.set('lunar_plains_entered')`. Save discovered regions in `state.flags` so the world map (later spec) can use them. Start with `lunar_base` discovered silently (no toast, no score).

### 6.9 Debug overlay (`?debug`)
Text `x y vx vy facing state region` (top left, Press Start 2P 12px white, depth 200), the foot box outline, the PLAYABLE rectangle (cyan), the region rectangles (yellow, each with its id), the door point (red dot), and all ROCK_NODES points (small green dots). Nothing without `?debug`.

### 6.10 Audio
Unchanged from SPEC 02: `audio.music('MUS_Lunar_Exploration')`, `audio.loop('AMB_Lunar_Surface', {gain:0.6})`; no jump or land sounds.

## 7. InteriorScene changes
- Keep everything from SPEC 03, but replace the ground collider and gravity by the new Player: spawn at `(190, 600)` facing right, `player.setBounds(60, 572, 1220, 650)`, `player.surface = 'metal'`. The player can now also move up and down inside that band.
- Station sprites keep their x and bottom y = 596; the player's depth uses `depthOf(y)` (player at y 572..650 is drawn in front of the stations when `y > 596`, behind them when `y < 596`: set each station's depth to `depthOf(596)`).
- Station interactables get `y: 600` and use 2D distance; ranges as before (the door at (99,600) range 90, workstation (351,600) range 130, storage (604,600) range 100, life support (817,600) range 110, bed (1180,600) range 100). Increase every range by 20 px to account for the vertical offset.
- Remove the invisible ground rectangle and every jump/land reference.

## 8. Interactions system change (`src/systems/Interactions.js`)
Interactables now have `y` (default: the player's feet y at registration). An interactable is in range when `Phaser.Math.Distance.Between(player.x, player.y, it.x, it.y) <= it.range`. The nearest one in range wins. Prompt position: `(it.x, it.promptY)`.

## 9. NOVA change (`src/entities/Nova.js`)
Target = `(player.x - player.facingX * 85, player.y - 150)` (above and behind the player). Remove the air-lag rule. Everything else as in SPEC 03.

## 10. Controls screen note
The `Controls` design (later) lists Move Left/Right/Up/Down, Run, Interact, Use Tool, Flashlight, Backpack, Technology, Map, Objectives. No Jump.

## 11. Test hooks
`window.__astro` keeps `scene`, `player`, `audio`, `state`, `bus`, `dialogue`, and adds `regions: REGIONS`, `rocks: scene.rocks`, `teleport(x, y)` (sets `player.x/y`, zero velocity).

## 12. Done when (Claude runs these, you do not)
- `cd game && npm run build` has no errors.
- Mission 1 opens the top-down level: the astronaut stands at (1500, 1700) with the outpost dome to the north-east; WASD and the arrow keys move in 8 directions at the same speed diagonally; Shift runs; no jump.
- The walk animation plays facing down, up, left, right (left is the mirrored right).
- The player cannot walk into the dome or the rocks, and stops at the PLAYABLE edge.
- Walking east to x > 2800 shows the toast `Lunar Plains` with `New area discovered!` and the score rises by 25.
- At the door `E Enter Outpost` appears; the interior works with free vertical movement inside its floor band.
- The fogged regions show `?`, the locked ones a padlock.
- Write `game/DONE-SPEC-02B.md` and stop.
