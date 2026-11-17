# SPEC 04 — Dialogue system, radio, opening cutscene, objective triggers 01 to 04 (talk part)

Audience: Gemini. Code only. Start from the working result of SPEC 03. Every number, string, key and file is given. Do not measure, inspect or redraw images. Do not generate images or audio.

## RULES FOR YOU (read first)
1. Never end your turn until `game/DONE-SPEC-04.md` is written.
2. Never write a status message without a tool call in the same step. Do not summarize plans in chat. Edit files.
3. Run commands in the FOREGROUND with a timeout. Never in the background.
4. Do not edit `game/public/assets/` or `game/public/audio/`.
5. English UI text only. No NASA logo or claims about NASA. Keep every `window.__astro` hook.

## 1. Goal
(a) Every spoken line of Level 1 plays with its voice, subtitle, portrait and radio sounds, through one DialogueSystem. (b) The first time Mission 1 starts, the 7 panel manga opening cutscene plays (skippable). (c) The level uses the dialogue at the right moments for objectives 01, 02, 03 and the first part of 04. Objective 01 now completes when its radio call ends (the temporary 3 s timer from SPEC 03 is removed).

## 2. Files
```
game/src/data/dialogues.json            // already copied here, the full dialogue file of 67 lines; do not edit
game/src/data/sfxmap.js                 // dialogue sfx tag -> sound id (section 4)
game/src/systems/Dialogue.js
game/src/ui/DialogueBox.js
game/src/scenes/CutsceneScene.js        // new, register in main.js
game/src/scenes/LevelScene.js           // change (section 7)
game/src/scenes/InteriorScene.js        // change (section 7)
game/src/scenes/MissionsScene.js        // change (section 8)
game/src/save.js                        // add progress.cutsceneSeen (section 8)
```

## 3. Assets (already in `game/public/assets/`)
| key | file |
|---|---|
| `dlg_karim` | `level01/interior/dr_karim.webp` (512x512) |
| `dlg_nova` | `level01/interior/nova_portrait.png` (512x512) |
| `dlg_astro` | `ui/avatar_frame.png` (537x505) |
| `cut1` .. `cut7` | `level01/cutscene/cutscene_panel1.png` .. `cutscene_panel7.png` (1080 wide; heights 468, 432, 336, 390, 282, 300, 540) |
| `cut8` | `level01/cutscene/cutscene_panel8.webp` (1600 x 893) |
| `cut9` | `level01/cutscene/cutscene_panel9.webp` (1600 x 893) |
Set LINEAR filter on `dlg_*` and `cut*`. Voices: `game/public/audio/voice/<id>.ogg`, loaded as `VOICE_<id>` through `audio.preload(scene, ids)` (extend AudioManager so `VOICE_` ids map to `audio/voice/<id>.ogg` on the `voice` bus). New SFX files exist and are loaded as before: `SFX_Countdown_Beep`, `SFX_Engine_Ignition`, `SFX_Rocket_Thrust`, `SFX_Metal_Vibration`, `SFX_Navigation_Beep`, `SFX_System_Online`, `SFX_System_Confirmed`, `SFX_Landing_Impact`, `SFX_Engine_Shutdown`, `SFX_Thrust_Activated`, `SFX_Warning_Beep`.

## 4. Sound tag map (`src/data/sfxmap.js`)
`dialogues.json` has an `sfx` array of tags per line. Export `SFX_MAP` exactly:
```
RADIO_STATIC:'Radio_Static', RADIO_CONNECT:'Radio_Open', RADIO_BEEP:'Radio_Beep',
COUNTDOWN_BEEP:'Countdown_Beep', COUNTDOWN:'Countdown_Beep', ENGINE_IGNITION:'Engine_Ignition', ROCKET_THRUST:'Rocket_Thrust',
CAMERA_SHAKE:'Metal_Vibration', METAL_VIBRATION:'Metal_Vibration', SYSTEM_ONLINE:'System_Online', NAVIGATION_BEEP:'Navigation_Beep',
WARNING_BEEP:'Warning_Beep', THRUST_ACTIVATED:'Thrust_Activated', LANDING_IMPACT:'Landing_Impact', ENGINE_SHUTDOWN:'Engine_Shutdown',
SYSTEM_CONFIRMED:'System_Confirmed', NOVA_HOVER:'NOVA_Happy_Beep', AIRLOCK_HISS:'Pressure_Seal', DOOR_OPEN:'Airlock_Open',
EQUIPMENT_READY:'Objective_Updated', OBJECTIVE_TRACKER_ON:'Objective_Updated', OBJECTIVE_COMPLETE:'Objective_Complete',
BASE_PROXIMITY_BEEP:'NOVA_Alert', STORAGE_CONFIRM:'Storage_Close', WORKSTATION_ON:'Workstation_On', CRAFT_COMPLETE:'Crafting_Complete',
LEVEL_COMPLETE_STING:'Level_Complete'
```
Tags not in the map (`WIND`, `ENGINE_HUM`, `LUNAR_FOOTSTEPS`, `LUNAR_AMBIENCE`) are ignored: no wind or hum is played. Played as SFX (`SFX_` + value) when the line starts, in array order, 120 ms apart.

## 5. DialogueSystem (`src/systems/Dialogue.js`) and DialogueBox (`src/ui/DialogueBox.js`)

### 5.1 API
```
const dialogue = new Dialogue(scene)
dialogue.play(ids, { onDone, lockPlayer=true, player })   // ids: array of line ids from dialogues.json, played in order
dialogue.isPlaying
dialogue.skipAll()                                           // finishes at once (used by ESC)
```
A line object is `{id, speaker, line, sfx}`; speaker is one of `MISSION_CONTROL`, `DR. KARIM`, `NOVA`, `ASTRONAUT`.
Playing a sequence:
1. If `lockPlayer`, set `player.canMove = false` (restore the previous value at the end).
2. `audio.duck(0.35, 250)` at the start, `audio.unduck(400)` at the end.
3. Radio lines: when the first line of the sequence is by `DR. KARIM` or `MISSION_CONTROL`, play SFX `Radio_Open` before it (wait 250 ms), `Radio_Beep` after every Karim line (before the next one), and `Radio_Close` at the end of the sequence if the last line was radio. Skip `Radio_Open` when the line's own sfx already contains `RADIO_CONNECT`.
4. For each line: show it in the DialogueBox (5.2), play its sfx tags, play `VOICE_<id>`. The text types out at 32 characters per second but never slower than the voice (if the voice is shorter than the typing time, reveal the rest instantly when the voice ends). The line stays until BOTH the voice has ended AND the text is fully shown; then wait 500 ms and go to the next line. Pressing `interact` (E) or clicking: if the text is still typing, reveal it fully; otherwise skip to the next line at once (stop the current voice with a 120 ms fade).
5. ESC calls `skipAll()`.
6. After the last line the box slides out (200 ms) and `onDone` runs.
If a line's voice file is missing, fall back to reading time: `max(1500, 55 ms per character)`.

### 5.2 DialogueBox (depth 120, scroll factor 0, bottom of the screen)
Container at (250, 446), 780 wide.
- Text panel: rounded rect (radius 12) at (0, 10) size 780x118, fill white, border 4 px `0xffb02e`, plus a 3 px inner outline `0x1c2366` inset 4 px. Text: Chakra Petch 600 25px, color `#141a42`, word wrap width 590, position (150, 24).
- Portrait: rounded rect (radius 14) at (0, -58) size 132x132, border 4 px `0xffb02e`, background `0x0b0f21`, the portrait texture scaled to 124x124 inside (masked to the rounded rect). Textures: `DR. KARIM` and `MISSION_CONTROL` use `dlg_karim`, `NOVA` uses `dlg_nova`, `ASTRONAUT` uses `dlg_astro`.
- Name tab: at (146, -22), height 32, width = text width + 50, fill gradient `0x38429a` to `0x2a337c`, border 3 px `0xffb02e` (no bottom border), top corners radius 10. Text Chakra Petch 700 18px white. Names: `Dr. Karim`, `Mission Control`, `NOVA`, `Astronaut`. For the radio speakers (`DR. KARIM`, `MISSION_CONTROL`) append ` · Radio` in Chakra Petch 500 18px `#c9d1ff` and draw a 10x10 red dot (`0xff4b4b`) at the left of the name that blinks (alpha 1 / 0.3, 500 ms steps).
- Next hint: `E ▶` Chakra Petch 700 14px color `#b36a10` at bottom right (x 750, y 112, origin (1,1)), blinking, shown only when the line is complete.
- Slide in: from y = +200 to 0 in 220 ms (`Cubic.easeOut`) when a sequence starts; slide out in 200 ms.
- The box must not hide the HUD parts it overlaps: it is above the hotbar position (the hotbar is added in a later spec at y = 592).

## 6. CutsceneScene (`src/scenes/CutsceneScene.js`)
Scene key `CutsceneScene`. Fixed camera 1280x720, background color `0x05060f`.
Layout:
- Title text `LEVEL 1 · FIRST LANDING` at (60, 40), Chakra Petch 700 22px gold `#ffc83d`.
- `SKIP` button at top right: 120x44 at (1100, 30), same look as the other blue buttons in `ui.js` (`pixelButton` with fill `COLORS.blue`), label font Press Start 2P 12px white. Click or ESC skips.
- Panel frame: for panels `cut1` to `cut7`, the image is fitted inside a box 1160 wide x 480 high at (60, 108), keeping the aspect ratio, centered in the box (`scale = min(1160/w, 480/h)`). Draw a 6 px border `0x1a1a2e` and an outer 4 px line `0x3a4a94` around the displayed image rectangle. Panels `cut8` and `cut9` are fitted the same way (they are 16:9, so they come out 853x480).
- Progress: 7 small rects (26x12) at (60, 640) with 12 px gaps: gold `0xffd23f` for the current panel, `0x243372` for the others. Text `Panel n of 7` Chakra Petch 600 14px `#aab3cc` after them.
- Hint `E  NEXT` Chakra Petch 700 15px gold, bottom right (1220, 650), blinking.
Panel change: crossfade 350 ms (the new panel fades in over the old one).
Speech bubble text: for panels with bubbles, the line text is typed into the empty white bubble that is already drawn in the art. Bubble rectangles are given in percent of the displayed image: `[x%, y%, w%, h%]`:
```
cut1: [[66.7, 6.0, 28.9, 38.0]]
cut4: [[62.3, 67.2, 19.1, 25.6]]
cut5: [[71.6, 4.6, 24.7, 47.2]]
cut6: [[61.8, 4.3, 24.7, 46.7]]
cut7: [[69.8, 4.1, 27.3, 24.6], [55.6, 73.5, 29.2, 24.1]]
```
Text: Chakra Petch 700, color `#1a1a2e`, centered in the rectangle, word wrap width = rectangle width minus 16, font size chosen as the largest of 24, 22, 20, 18, 16 that fits the rectangle height. Under the bubble area, show a small gold tag with the speaker name (Chakra Petch 700 14px `#1a1a2e` on `0xffd23f`, radius 6, padding 8x4) just below the rectangle.
Panels `cut8` and `cut9` have no bubble: show a subtitle bar at the bottom of the displayed image: `uiPanel` 800x72 centered at (240, 604)... (use x = 240, y = 604), the line text in Chakra Petch 600 22px white wrapped at 760, speaker name in gold before the text as `NOVA:` / `Astronaut:`.
For `cut7` the first line (astronaut) uses the first rectangle and the second line (NOVA) uses the second.

### 6.1 Sequence (use `Dialogue`-style playback, but with bubble text instead of the DialogueBox: reuse the typing, voice and sfx logic; write it as a shared helper in `Dialogue.js` so the logic is not duplicated: `Dialogue.playLines(scene, lines, renderFn, opts)`)
| step | panel | line ids | extra |
|---|---|---|---|
| 1 | `cut1` | `cutscene_01_launch`, `cutscene_01_reply` | |
| 2 | `cut4` | `cutscene_02_control`, `cutscene_02_reply` | during the first line: play `Countdown_Beep` at 0 ms, 700 ms, 1400 ms, then `Engine_Ignition`, `Rocket_Thrust` (gain 0.5) and shake the camera (`cameras.main.shake(900, 0.004)`) |
| 3 | `cut5` | `cutscene_03_nova`, `cutscene_03_astronaut`, `cutscene_03_nova2` | |
| 4 | `cut6` | `cutscene_04_nova`, `cutscene_04_astronaut`, `cutscene_04_nova2` | |
| 5 | `cut8` | `cutscene_05_nova`, `cutscene_05_astronaut`, `cutscene_05_nova2` | camera shake 600 ms, 0.003 at the start |
| 6 | `cut9` | `cutscene_06_nova`, `cutscene_06_astronaut` | camera shake 500 ms, 0.006 at the start (landing) |
| 7 | `cut7` | `cutscene_07_astronaut`, `cutscene_07_nova` | start music `MUS_Lunar_Exploration` (volume ramps in over 2 s) |
Panels 2 and 3 of the original board are NOT used (they have no dialogue). After the last line wait 1200 ms, fade the camera to black over 600 ms and go to `LevelScene` with `{mission:1}`. The cutscene must not play any music before step 7; stop the `MUS_Main_Menu` music with a 600 ms fade when the scene starts. Use 7 progress dots (one per table step) and the text `Panel n of 7`.
`ESC`, `SKIP` and `skipAll` jump straight to the fade out and `LevelScene`. Stop all running voices and sfx on shutdown.

## 7. Level triggers (use `Dialogue`)
Add `dialogue = new Dialogue(scene)` to both `LevelScene` and `InteriorScene`. Use state flags (`state.flags`) to play each sequence only once (`talked_<key>`).

| trigger | scene | when | line ids | on done |
|---|---|---|---|---|
| `obj01` | LevelScene | 1500 ms after the scene starts, only if objective 01 is not done and `talked_obj01` is false | `obj01_dr1`, `obj01_astronaut`, `obj01_dr2`, `obj01_astronaut2`, `obj01_dr3`, `obj01_dr4` | `state.set('radio_message_received')`. REMOVE the TEMP 3000 ms block from SPEC 03. |
| `obj02` | LevelScene | the first time `|player.x - AIRLOCK_X| < 450` while objective index is 1 | `obj02_nova`, `obj02_astronaut` | none |
| `obj03` | InteriorScene | 1200 ms after the scene starts (after the fade in) when objective index is 2 and `talked_obj03` is false | `obj03_nova1`, `obj03_astronaut`, `obj03_nova2`, `obj03_astronaut2`, `obj03_nova3` | none |
| `obj04a` | InteriorScene | right after the four inspect conditions are all done (the objective 03 completion; wait for the +100 popup 1600 ms) and `talked_obj04a` is false | `obj04_dr1`, `obj04_dr2`, `obj04_astronaut`, `obj04_dr3`, `obj04_nova` | none |
The rest of the dialogue lines (`obj04_nova2`, `obj04_astronaut2` and all lines from `obj05` to `ending`) are used in later specs; the Dialogue system must already play any id on request. Expose `window.__astro.dialogue = dialogue` and `window.__astro.playDialogue(ids)`.
While a dialogue plays, interactions are disabled (`player.canMove == false` covers it; also make the `Interactions` system ignore input while `dialogue.isPlaying`). NOVA lines show NOVA's portrait; NOVA also does a small hop (tween y -14 and back, 250 ms) when each of its lines starts.
Music ducking: `audio.duck(0.35)` while a dialogue plays.

## 8. Opening cutscene wiring
`save.js`: add `progress: { cutsceneSeen: false }` to the save (backfill when missing) with `SaveManager.markCutsceneSeen()`.
`MissionsScene`: when mission 1 is activated: if `progress.cutsceneSeen` is false, start `CutsceneScene` (fade out 250 ms) and set it seen when the cutscene ends; otherwise start `LevelScene` as before.
Settings scene: nothing. A debug key `F10` anywhere starts `CutsceneScene`.
`CutsceneScene` registers in `main.js` after `MissionsScene`.

## 9. Test hooks
`window.__astro` additionally exposes: `dialogue`, `playDialogue(ids)`, `startCutscene()`.

## 10. Done when (Claude runs these, you do not)
- `cd game && npm run build` has no errors.
- Mission 1 on a fresh save plays the cutscene: 7 steps with voices, subtitles in the bubbles, the liftoff shakes the camera, SKIP works. After it the level starts.
- In the level, 1.5 s after the start Dr. Karim's call plays with portrait, radio beeps, and ducked music; when it ends objective 01 completes (+100). It does not repeat after a reload.
- Walking toward the airlock triggers NOVA and the astronaut lines. Inside the outpost the NOVA lines play. After the fourth inspection the Dr. Karim lines play.
- Pressing E skips lines; ESC skips the sequence.
- Write `game/DONE-SPEC-04.md` and stop.
