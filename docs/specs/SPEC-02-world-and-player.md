# SPEC 02 — Level 1 world, player movement, input actions, audio manager

Audience: Gemini. Code only. Every number, key and file name is given. Do not measure, inspect or redraw any image. Do not generate images.

## RULES FOR YOU (read first)
1. Never end your turn until `game/DONE-SPEC-02.md` is written.
2. Never write a status message without a tool call in the same step. Do not summarize plans in chat. Edit files.
3. Run commands in the FOREGROUND with a timeout. Never in the background.
4. Do not edit anything in `game/public/assets/` or `game/public/audio/`. They are final.
5. English UI text only. No NASA logo or claims about NASA. Keep the existing Spec 1 files working; change them only where this spec says so.

## 1. Goal
Mission 1 from the Missions screen opens a real side-scrolling level: the astronaut stands in a wide moon world, walks, runs, jumps with low gravity, the camera follows, footsteps and ambience play, and the player can reach the right edge. No HUD, no objectives, no interactions yet (later specs).

## 2. New and changed files
```
game/src/core/actions.js        // input actions + rebinding storage
game/src/core/audio.js          // AudioManager v2 (replaces src/audio.js; keep the old exports click() and denied() working, same names)
game/src/core/constants.js      // world + physics constants (section 4)
game/src/entities/Player.js
game/src/scenes/LevelScene.js
game/src/scenes/MissionsScene.js   // change: clicking mission 1 starts LevelScene instead of MissionStubScene (missions 2-6 still go to the stub)
game/src/main.js                // register LevelScene
game/src/save.js                // add settings.keys and settings.voice (section 5)
```
Update every import that used `src/audio.js` to `src/core/audio.js`, then delete `src/audio.js`.

## 3. Assets (already in `game/public/assets/`)
Load in `LevelScene.preload()` with these keys:
| key | file | type |
|---|---|---|
| `bg_plain` | `backgrounds/moon_background.webp` (already loaded in Boot, reuse the key `moon_background`; do not load twice) | image |
| `bg_base` | `backgrounds/lunar_base_starter.png` | image 1774x887, set LINEAR filter |
| `ground_tile` | `level01/world/ground_tile.png` | image 1597x126, NEAREST |
| `astro_idle` `astro_walk` | already loaded in Loading scene (125x169 frames: idle 2, walk 4) | reuse |
| `astro_jump` | `sprites/astro_jump.png` | spritesheet frameWidth 125 frameHeight 169, 3 frames |
| `astro_interact` | `sprites/astro_interact.png` | spritesheet 125x169, 3 frames |
| `rock_regolith` | `level01/world/rock_regolith.png` | spritesheet frameWidth 91 frameHeight 79, 4 frames |
| `rock_ironrich` | `level01/world/rock_ironrich.png` | spritesheet 91x82, 4 frames |
| `rock_silicate` | `level01/world/rock_silicate.png` | spritesheet 91x82, 4 frames |
Audio (loaded through AudioManager, section 7).

Animations (create once, global, if they do not exist): `astro_idle` frames 0-1 frameRate 1.8 repeat -1; `astro_walk` frames 0-3 frameRate 8 repeat -1; `astro_jump` frames 0-2 frameRate 6 repeat 0; `astro_interact` frames 0-2 frameRate 8 repeat 0.
The 4 frames of each rock sheet are four looks of the same rock type, not damage steps. Pick one frame per rock (see 6.5).

## 4. Constants (`src/core/constants.js`, export exactly these)
```
VIEW_W = 1280, VIEW_H = 720
WORLD_W = 3600
GROUND_Y = 600            // y of the top surface the player stands on
GROUND_H = 126            // height of the visible ground band (y 594..720)
GRAVITY = 650             // px/s^2 (moon feel)
JUMP_V = -520             // px/s -> apex 208 px, air time about 1.6 s
WALK_SPEED = 220
RUN_SPEED = 340
ACCEL = 1400              // px/s^2 horizontal
FRICTION = 1800
PLAYER_SCALE = 0.85       // sprite display scale
PLAYER_START_X = 300
ZONES = { landing:[0,600], outside:[600,1500], plains:[1500,3600] }
AIRLOCK_X = 1400
ROCK_CLUSTERS_X = [2000, 2450, 2900, 3350]
```

## 5. Save changes (`src/save.js`)
Add to the default settings: `voice: 80`, `keys: DEFAULT_KEYS` where
```
DEFAULT_KEYS = {
  left:      ['A','LEFT'],
  right:     ['D','RIGHT'],
  jump:      ['SPACE','W'],
  run:       ['SHIFT', null],
  interact:  ['E', null],
  useTool:   ['J', null],       // also left mouse button, hard coded
  flashlight:['F', null],
  backpack:  ['I', null],
  technology:['C', null],
  map:       ['M', null],
  objectives:['O', null]
}
```
Missing keys in an older save must be filled from the defaults. Pause is always `ESC` and quick slots are always `1`-`9`; neither is stored.

## 6. LevelScene (`src/scenes/LevelScene.js`)
Scene key `LevelScene`. Receives `{ mission: 1 }`. Camera 1280x720.

### 6.1 Layers (bottom to top, exact depth values)
| depth | object | details |
|---|---|---|
| 0 | `bg_plain` | image, origin (0,0), displayed 1440x720 (setDisplaySize), x=0, y=0, scrollFactor `0.069` |
| 1 | `bg_base` | same size, origin and scrollFactor as depth 0, alpha controlled by 6.2 |
| 5 | rocks | see 6.5 |
| 10 | player | see section 8 |
| 20 | ground band | `tileSprite(0, 594, 3600, 126, 'ground_tile')` origin (0,0), scrollFactor 1 |
Set `this.cameras.main.setBounds(0, 0, 3600, 720)` and `this.physics.world.setBounds(0, 0, 3600, 720)`.

### 6.2 Backdrop crossfade
Each frame compute `cx = camera.scrollX + 640`.
- `bg_base.alpha = 1` when `cx <= 1700`; linearly to 0 when `cx` goes from 1700 to 2000; `0` after.
- `bg_plain.alpha = 1` always (it sits below).
This shows the outpost picture while the player is in the landing and outside zones, and fades to the plain moon on the plains.

### 6.3 Ground
Static physics body: add an invisible `this.add.rectangle(1800, 660, 3600, 120)` with `this.physics.add.existing(rect, true)`; the player collides with it. Its top edge must be at y = 600.

### 6.4 Camera
`cameras.main.startFollow(player, true, 0.1, 0.1)`, `setFollowOffset(0, 0)`, `setDeadzone(80, 0)`. Round camera scroll to integers (`roundPixels: true` is already on).

### 6.5 Rocks (decor only in this spec)
For each x in ROCK_CLUSTERS_X create 3 rocks, one of each type, at x offsets -70, 0 and +70 from the cluster x: regolith at -70, ironrich at 0, silicate at +70. Use frame `(clusterIndex + typeIndex) % 4`. Origin (0.5, 1), y = 606 (slightly sunk into the ground band), display scale 1.15. No collision.

### 6.6 Debug overlay
If the page URL has `?debug`: draw the text `x:<int> y:<int> vx:<int> state:<state>` at the top left (fixed to camera, `PIXEL` font 14px white, depth 100), draw the player body outline, and draw vertical lines at x = 600, 1500, 1400 (airlock) in the world. Without `?debug` none of this exists.

### 6.7 Test hook
Set `window.__astro = { scene: this, player: this.player, audio: audio }` in `create()`. Remove nothing; it stays in all builds.

### 6.8 Exit
`ESC` returns to `MissionsScene` (fade 200 ms). Stop all sounds on shutdown.

## 7. AudioManager v2 (`src/core/audio.js`)
Single instance exported as `audio`. Uses Phaser's sound system (`scene.sound`), not raw WebAudio.
Buses and their save settings: `music` (settings.music), `sfx` (settings.sfx), `voice` (settings.voice), `amb` (follows `sfx`). Volume = `bus/100` times the sound's own gain.
API (all methods must exist now even if later specs use them):
```
audio.init(game)                          // call once in main.js after the game is created
audio.preload(scene, ids)                 // adds scene.load.audio for each id (see file map below)
audio.play(id, {gain=1, rate=1, detune=0})   // one-shot sfx
audio.playVariant(baseId, count, opts)    // picks a random one of baseId_01..baseId_0N, never the same one twice in a row
audio.loop(id, {gain=1, bus})  / audio.stop(id, fadeMs=300)
audio.music(id, {fadeMs=800})             // crossfades the current music to id; same id = no-op
audio.duck(amount=0.35, ms=250) / audio.unduck(ms=400)   // temporarily lowers music + amb (used while dialogue plays)
audio.setVolumes(music, sfx, voice)       // 0..100
audio.click()  audio.denied()             // keep the old names working: play SFX Button_Click and Error
audio.stopAll()
```
File map (ids are file names without folder and extension):
- sfx: `game/public/audio/sfx/SFX_<Id>.ogg` where `<Id>` is the asset id, for example `Footstep_Regolith_01`, `Jump_Takeoff`, `Button_Click`, `Error`.
- ambience: `game/public/audio/amb/AMB_<Id>.ogg`, for example `Lunar_Surface`.
- music: `game/public/audio/mus/MUS_<Id>.ogg`, for example `Lunar_Exploration`.
- voice: `game/public/audio/voice/<dialogueId>.ogg` (used in a later spec).
Every `<Id>` is identified in code by one string with its prefix: `'SFX_Footstep_Regolith_01'`, `'AMB_Lunar_Surface'`, `'MUS_Lunar_Exploration'`, `'VOICE_obj01_dr1'`. `audio.play('SFX_Jump_Takeoff')` etc.
The Phaser cache key is exactly that string. Browsers block sound until a first click: AudioManager must queue `audio.loop` and `audio.music` calls made before the first user input and start them after it (listen for the first pointerdown or keydown).
Settings scene: changing the Music, SFX volume sliders must call `audio.setVolumes(...)` live. Add a third slider `VOICE` between SOUND FX and MENTOR TIPS using the same style and the same row pitch; the panel height grows by 96 px (panel height 504) and the toggle rows shift down by 96 px. Default 80.

## 8. Player (`src/entities/Player.js`)
Class `Player extends Phaser.Physics.Arcade.Sprite`. Texture `astro_idle`, origin (0.5, 1), scale PLAYER_SCALE, position (PLAYER_START_X, GROUND_Y).
- Body: `setSize(60, 150)`, `setOffset(32, 15)` (frame is 125x169, so the body is horizontally centered and its bottom sits 4 px above the frame bottom), `setCollideWorldBounds(true)`, `setMaxVelocity(400, 900)`, gravity `GRAVITY` via `body.setGravityY(GRAVITY)` (world gravity stays 0).
- Facing: `setFlipX(facingLeft)`. Sprites face right by default.
- Input read from actions (section 9). Every frame:
  1. `dir = (right?1:0) - (left?1:0)`; `target = dir * (runHeld ? RUN_SPEED : WALK_SPEED)`.
  2. If `dir != 0` accelerate `vx` toward `target` by `ACCEL * dt`; else decelerate toward 0 by `FRICTION * dt`. Facing follows `dir`.
  3. Jump: when the jump action goes down and `body.blocked.down` (or touching down) and not already in a jump, set `vy = JUMP_V`, play `astro_jump`, play SFX `Jump_Takeoff`. Releasing jump while moving up cuts `vy` to `vy * 0.5` once (variable height).
  4. State machine: `idle` (on ground, |vx| < 10), `walk` (on ground, |vx| >= 10; animation `astro_walk`, `anims.timeScale = runHeld ? 1.5 : 1`), `air` (not on ground). Play `astro_idle` in idle. In air hold the `astro_jump` frame: frame 0 while rising, frame 1 near the apex (|vy| < 80), frame 2 while falling.
  5. Landing: when it becomes grounded after being in the air for more than 0.15 s, play SFX `Land_Regolith`.
  6. Footsteps: while `walk`, play `audio.playVariant('SFX_Footstep_Regolith', 3, {gain:0.7})` each time the walk animation reaches frame 0 or frame 2, but never more often than every 180 ms.
  7. Expose `player.state`, `player.canMove` (default true; later specs set it false during dialogue and menus), and `player.facing` (1 or -1). When `canMove` is false, ignore input and decelerate to 0.
- Shadow: a dark ellipse `this.add.ellipse(0,0,70,12,0x000000,0.35)` that follows the player x at y = GROUND_Y + 4 (or at the ground below if in the air: always at ground y), depth 9, scale shrinks to 0.7 when the player is more than 150 px above the ground.

## 9. Actions (`src/core/actions.js`)
```
actions.init(scene)           // call in every scene that needs input; (re)binds from save.settings.keys
actions.isDown(name)          // true while held
actions.justDown(name)        // true on the frame it went down (consume-once)
actions.justUp(name)
actions.rebind(name, slot, keyName)   // slot 0 or 1; keyName is a Phaser key name like 'A', 'LEFT', 'SPACE', 'SHIFT'; saves to settings.keys; if the key is already used by another action in either slot, return {conflict:'<otherAction>'} and do not change anything
actions.swap(a, slotA, b, slotB)
actions.reset()               // restore DEFAULT_KEYS and save
actions.useTool: also true while the left mouse button is down (hard coded, not rebindable)
```
Use `scene.input.keyboard.addKey(keyName)` objects, rebuilt when `rebind` or `reset` runs. Do not use the `cursors` helper.

## 10. Missions scene change
In `MissionsScene`, when an unlocked mission slot with n = 1 is activated, call `audio.click()`, fade out 250 ms and start `LevelScene` with `{ mission: 1 }`. Missions 2 to 6 keep going to `MissionStubScene`. Keep the existing focus and hover behavior.
`LevelScene` calls `audio.music('MUS_Lunar_Exploration')` and `audio.loop('AMB_Lunar_Surface', {gain:0.6})` in `create()`. The Start, Settings and Missions scenes call `audio.music('MUS_Main_Menu')` (same id means no restart when moving between them).

## 11. Done when (Claude runs these, you do not)
- `cd game && npm run build` has no errors.
- Starting from the Missions screen, mission 1 opens a level with the base picture behind a ground band. The astronaut stands at x = 300 on the ground.
- Holding D moves right, camera scrolls, running with Shift is faster, Space jumps about 200 px high and takes about 1.6 s, and the footsteps play only while walking.
- At world x > 2000 the backdrop is plain moon and four rock clusters are visible near x = 2000, 2450, 2900, 3350.
- ESC returns to Missions. Music and ambience stop on return and the main menu music plays.
- Write `game/DONE-SPEC-02.md` and stop.
