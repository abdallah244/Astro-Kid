# SPEC 01 — Project setup and menu flow (Astro Kid)

Audience: Gemini. You write code only. Every number, string and file you need is in this spec or in `game/public/assets/`. Do not measure, inspect images, or redesign anything. Do not generate images.

## RULES FOR YOU (read first)
1. Never end your turn until the file `game/DONE-SPEC-01.md` is written (what you built, how to run it, anything you could not do).
2. Never write a status or progress message without a tool call in the same step. Do not summarize plans in chat. Just edit files.
3. Run commands in the FOREGROUND with a timeout. Never run anything as a background task.
4. Do not touch `game/public/assets/`. It is final.
5. English text only. No NASA logo anywhere. Never write that the game is licensed or approved by NASA. The footer text of the page is not needed.

## 1. Stack and commands
- Vite + Phaser 3.80.1 (`npm i phaser@3.80.1`), plain JavaScript (ES modules), no TypeScript, no other libraries.
- Project folder: `game/` (already contains `public/assets`).
- `npm run dev` serves on port 5173. `npm run build` must succeed and produce `dist/` with `base: './'` in `vite.config.js` (so it works on GitHub Pages).
- `index.html`: `<title>Astro Kid</title>`, a `<div id="game"></div>`, body margin 0, background `#060920`. Load Google Fonts in `<head>`:
  `https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Silkscreen:wght@400;700&display=swap`.
  Before creating the Phaser game, wait for both fonts: `await Promise.all([document.fonts.load("28px 'Press Start 2P'"), document.fonts.load("700 20px 'Silkscreen'")])` (ignore failure after 3 s).

## 2. Game config (`src/main.js`)
```
type: Phaser.AUTO, width: 1280, height: 720, parent: 'game', backgroundColor: '#060920',
scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
pixelArt: true, roundPixels: true,
scene: [BootScene, LoadingScene, StartScene, SettingsScene, MissionsScene, MissionStubScene]
```
- Large photo-like backgrounds must stay smooth: after loading `moon_background` call `this.textures.get('moon_background').setFilter(Phaser.Textures.FilterMode.LINEAR)`. Same for the mission badges (`mission1`..`mission6`). All sprites stay NEAREST (default with pixelArt).
- Design colors (use exactly): ink `#1a1a2e`, space `#060920`, panel `#141c4d`, panel border light `#3a4a94`, yellow `#ffd23f`, yellow shade `#f5a524`, orange `#c2410c`, blue button `#243372`, blue shade `#172052`, track `#0d1236`, green `#3fbf5f`.
- Fonts: `PIXEL = "'Press Start 2P'"`, `SILK = "'Silkscreen'"` (bold = `fontStyle: 'bold'`).

## 3. Files to create
```
game/
  index.html  vite.config.js  package.json
  src/main.js
  src/config.js          // constants: colors, fonts, size, STORAGE_KEY
  src/save.js            // SaveManager
  src/audio.js           // AudioManager (WebAudio beeps)
  src/ui.js              // helpers: pixelButton(), pixelPanel(), starIcon not needed
  src/scenes/BootScene.js  LoadingScene.js  StartScene.js  SettingsScene.js  MissionsScene.js  MissionStubScene.js
```

## 4. Assets (already in `game/public/assets/`)
Load these with these keys in `LoadingScene` (the real loading, see 6):
| key | file | type |
|---|---|---|
| `moon_background` | `backgrounds/moon_background.webp` | image (1774x887) |
| `astro_idle` | `sprites/astro_idle.png` | spritesheet frameWidth 125, frameHeight 169, 2 frames |
| `astro_walk` | `sprites/astro_walk.png` | spritesheet 125x169, 4 frames |
| `mentor_idle` | `sprites/mentor_idle.png` | spritesheet frameWidth 155, frameHeight 175, 3 frames |
| `mission1`..`mission6` | `missions/01_first_landing.webp`, `02_power_crisis.webp`, `03_radiation_alert.webp`, `04_food_production.webp`, `05_water_recycling.webp`, `06_survival_mission.webp` | image |
`BootScene` only loads `moon_background`, `astro_walk` (needed by the loading screen), then starts `LoadingScene`.

Animations (create once in `LoadingScene` after loading, global): `astro_idle` frames 0-1 with frameRate 1.8 (one cycle takes 1.1 s), `astro_walk` frames 0-3 with frameRate 6.7 (one cycle takes 0.6 s), `mentor_idle` frames 0-2 with frameRate 2 (one cycle takes 1.5 s). All repeat -1.

## 5. Common helpers (`src/ui.js`)
- `pixelButton(scene, {x, y, w, h, label, fontSize, fill, shade, border, textColor, onClick, icon})`
  Draws, in this order, using Graphics + Text (origin top-left = x,y):
  1. drop shadow rect `x, y+depth, w, h` color ink (depth = 8 for the big button, 6 for small).
  2. border rect `x, y, w, h` color ink.
  3. fill rect inset by `border` px.
  4. shade strip: bottom `shade` px of the inner rect in the shade color.
  5. centered label. `icon` = optional play triangle (see 6 Start) drawn left of the label with a 22 px gap.
  Interactive hit area = the full rect. Hover: move everything up by 4 px. Pointer down: move down by 4 px, pointer up inside: call `onClick` and play `audio.click()`.
  Also support keyboard focus: Enter or Space on the focused button calls onClick (the first button on a scene is focused at start; Tab cycles).
- `pixelPanel(scene, {x, y, w, h, fill, border, inner, depth})`: drop shadow `y+depth` ink, border rect ink, fill, then an inner 4 px outline color `#3a4a94` inset by `border`.

## 6. Scenes with exact layout (canvas 1280x720, all coordinates are top-left in pixels)

### 6.1 LoadingScene
- Background image `moon_background` at x=-80, y=0, displayed size 1440x720 (setDisplaySize), origin 0,0. Over it a rect 0,0,1280,720 fill `#060920` alpha 0.5.
- Title text `ASTRO KID` at center x=640, top y=120, `PIXEL` 72px, line "ASTRO " white and "KID" yellow (two Text objects side by side, centered together), stroke ink 4px, shadow offset (0,6) color `#1f3f9a` for ASTRO and `#c2410c` for KID.
- Bar: outer rect x=240, y=532, w=800, h=44, border 6 ink, fill `#0d1236`. Inner fill rect starts at x=246, y=538, height 32, max width 788, color yellow, with a 8 px bottom strip `#f5a524`.
- Astro walking sprite `astro_walk`, display size 113x152, origin 0,0, position x = 246 + fillWidth - 56, y=380.
- Text `LOADING... {percent}%` centered x=640, y=604, `PIXEL` 20px white, stroke ink 4.
- Text `Tip: Keep an eye on your oxygen.` centered x=640, y=656, `SILK` bold 22px `#dbe8ff`, stroke ink 4.
- The displayed progress must be smooth: `shown = lerp(shown, real, 0.15)` per frame and the scene must stay at least 1200 ms. When shown reaches 100 and the minimum time has passed, fade to `StartScene` (camera fade 300 ms).

### 6.2 StartScene
- Background: `moon_background` at x=-80, y=0, size 1440x720.
- Title `ASTRO ` (white) and `KID` (yellow), `PIXEL` 84px, centered together at x=640, top y=56. Stroke ink 4. Shadow: ASTRO offset (0,6) color `#1f3f9a`; KID offset (0,6) color `#c2410c`.
- Tagline `Run your own base on the Moon.` center x=640, top y=176, `SILK` bold 26px white, stroke ink 4.
- Astro: sprite `astro_idle`, display size 175x237, origin 0,0 at (170, 337), plays `astro_idle`.
- Mentor: sprite `mentor_idle`, display size 225x254, origin 0,0 at (880, 320), plays `mentor_idle`.
- Speech bubble over the mentor: rect (830, 236, 300, 68) fill white, border 4 ink. Text `Ready for your mission?` `SILK` bold 20px ink, centered in the rect. Tail made of 4 stacked rects, each white with ink 4 px left and right edges: (985,304,32,8), (989,312,24,8), (993,320,16,8), then an ink rect (997,328,8,4).
- Button 1 `START TO PLAY`: x=380, y=400, w=520, h=80, border 6, fill yellow, shade 8 `#f5a524`, depth 8, `PIXEL` 26px ink, with the play triangle icon (20x35, made of rects: (0,0,5,35), (5,5,5,25), (10,10,5,15), (15,15,5,5) in ink) left of the label, gap 22. On click: go to `MissionsScene` (fade 200 ms).
- Button 2 `SETTINGS`: x=490, y=504, w=300, h=54, border 5, fill `#243372`, shade 6 `#172052`, depth 6, `PIXEL` 15px white. On click: go to `SettingsScene`.
- Music: none yet.

### 6.3 SettingsScene
- Background image as in Start, plus overlay rect fill `#060920` alpha 0.68.
- Title `SETTINGS`, `PIXEL` 54px yellow, centered x=640, top y=56, stroke ink 4, shadow (0,6) `#c2410c`.
- Panel: x=240, y=170, w=800, h=? (rows below, panel height = 28 + 4*64 + 3*(14+4+14) + 28 = 408), fill `#141c4d`, border 6 ink, inner outline 4 `#3a4a94`, depth 8.
- Rows start at x=280. Each row is 64 px tall. Between rows there is a divider 4 px tall, color `#0d1236`, from x=280 to x=1000, with 14 px of space above and below it. So the row tops are exactly y = 198, 294, 390, 486 (row top = 198 + i*96).
  1. `MUSIC` label at (280, rowTop+24) `PIXEL` 18px white. Slider and value, see below. Default 70.
  2. `SOUND FX` same. Default 80.
  3. `MENTOR TIPS` label, toggle at the right. Default ON.
  4. `FULLSCREEN` label, toggle at the right. Default OFF. ON calls `this.scale.startFullscreen()`, OFF calls `stopFullscreen()`. Keep the toggle in sync with the real fullscreen state (listen to `enterfullscreen` / `leavefullscreen`).
- Slider: track rect x=660, y=rowTop+14, w=300 (value area), h=36 border 4 ink, inner `#070a22`. Thumb 24x36 yellow with 4 px ink border and 6 px `#f5a524` bottom strip. Value 0-100 step 5. Draggable and clickable on the track. Keys Left/Right change by 5 when focused. Value text right-aligned at x=1000, `PIXEL` 18px yellow, width 64.
- Toggle: rect x=860, y=rowTop+8, w=140, h=48, border 5 ink. OFF: fill `#3a4a94`, shade `#27336b`, knob at left. ON: fill `#3fbf5f`, shade `#1d7a36`, knob at left+74. Knob 56x38, white, border 4 ink, text `ON` or `OFF` `PIXEL` 12px ink.
- Button `BACK`: x=48, y=636, w=180, h=52, border 5, fill `#243372`, shade 6, depth 6, `PIXEL` 15px white. Go to `StartScene`. Pressing Escape also goes back.
- Every change saves immediately through `SaveManager` and updates `AudioManager` volumes.

### 6.4 MissionsScene
- Background as in Start, plus overlay `#060920` alpha 0.6.
- Title `SELECT MISSION`, `PIXEL` 44px yellow, centered x=640, top y=44, stroke ink 4, shadow (0,5) `#c2410c`.
- Button `BACK` at x=48, y=44, w=150, h=48 (same style as Settings BACK, `PIXEL` 14px). Go to `StartScene`.
- 6 slots in a 3 x 2 grid. Slot box 300x250. Slot left x = 130 + col*360 (130, 490, 850). Slot top y = 136 + row*274 (136, 410). Index order: row-major (1,2,3 / 4,5,6).
- In each slot the image `mission{n}` is scaled to fit inside 300x250 keeping the aspect ratio (`scale = Math.min(300/w, 250/h)`), centered in the slot box.
- Missions: 1 First Landing, 2 Power Crisis, 3 Radiation Alert, 4 Food Production, 5 Water Recycling, 6 Survival Mission.
- Unlocked slots (n <= `save.unlocked`): normal color. Hover: slot moves up 6 px (instant, 2 steps). Click: go to `MissionStubScene` with data `{ mission: n }`. Keyboard: Left/Right/Up/Down move a focus outline (4 px yellow rect around the slot box), Enter opens.
- Locked slots: image tint `0x4a4a5a` (setTint), plus a padlock drawn with rects at the slot box center-top: top-left (118+slotLeft, 62+slotTop), size 64x72, built from an 8x9 grid with 8 px cells: shackle (2,0,4,1), (1,1,1,3), (6,1,1,3) in white; body (0,4,8,5) white; keyhole (3,5,2,3) ink. No hover, no click, a short `audio.denied()` blip on click.

### 6.5 MissionStubScene
Placeholder until the real mission scenes exist. Background as Start with overlay alpha 0.6. Center text `MISSION {n}` `PIXEL` 40px yellow at y=260 and text `Coming soon.` `SILK` bold 26px white at y=340. `BACK` button (48,44,150,48) back to `MissionsScene`. A debug-free button `COMPLETE (TEST)` at (490, 440, 300, 54) that calls `SaveManager.completeMission(n)` then returns to `MissionsScene`. Keep this button; it will be removed later.

## 7. Save (`src/save.js`)
- Storage key `astrokid.v1` in `localStorage`, wrapped in try/catch (private mode must not crash).
- Shape: `{ unlocked: 1, completed: [], settings: { music: 70, sfx: 80, tips: true } }`.
- API: `load()`, `get()`, `setSetting(key, value)`, `completeMission(n)` (adds n to `completed`, sets `unlocked = Math.max(unlocked, Math.min(6, n + 1))`), `reset()`.
- A mission unlocks only when the previous one is completed. Mission 1 is always unlocked.

## 8. Audio (`src/audio.js`)
No audio files yet. Use the browser WebAudio API only.
- `audio.click()`: square wave 880 Hz, 60 ms, gain 0.12 * sfx.
- `audio.denied()`: square wave 220 Hz, 120 ms, gain 0.12 * sfx.
- `audio.setVolumes(music, sfx)`: 0-100 values, stored; `music` is unused for now but must be kept so a later spec can play music with it.
- Create the AudioContext lazily on the first pointer or key event (browser autoplay rules).

## 9. Done when (Claude runs these, you do not)
- `cd game && npm install && npm run build` finishes with no errors.
- `npm run dev` shows: Loading screen, then Start screen, buttons work, Settings changes survive a page reload, Missions screen shows mission 1 open and 2-6 locked, `COMPLETE (TEST)` on mission 1 unlocks mission 2.
- Write `game/DONE-SPEC-01.md` and stop.
