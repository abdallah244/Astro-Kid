# Astro Kid Desktop (Windows x64)

Standalone offline Windows wrapper for Astro Kid built with Electron 33 and bundled via `electron-builder`. Launches directly into the game's start screen using the custom `app://astrokid/play.html?app=desktop` protocol with bundled offline fonts and zero website/network dependencies.

## Directory layout

- `main.js` — Single-instance Electron main process, window lifecycle, CLI flags (`--dev`, `--smoke`, `--version`, `--quit`, `--reset-window`), crash/GPU recovery, and graceful shutdown.
- `preload.js` — Minimal frozen `contextBridge` API (`window.astroKidDesktop`) inside a sandboxed renderer.
- `src/protocol.js` — `app://astrokid/<path>` static handler with traversal guards, MIME map, cache control, and HTTP `Range` byte streaming for audio.
- `src/security.js` — Strict `DESKTOP_CSP`, outbound network cancellation, permission denials, navigation/popup lockdown, and DevTools disablement in packaged builds.
- `src/window-state.js` — Bounds validation across connected monitors (`userData/window-state.json`).
- `src/logger.js` — Rotating plain-text logger under `%APPDATA%\Astro Kid\logs\main.log` (3 × 512 KB, emails redacted).
- `src/config.js` — App constants and allowlisted `shell.openExternal` key resolver (`website`, `privacy`, `terms`, `support`).
- `scripts/prepare-game.mjs` — Builds `../game`, strips website pages & `demo-shell.*`, bundles offline `@fontsource` fonts into `game-dist/fonts/`, and validates every HTML reference.
- `scripts/make-icons.mjs` — Generates `build/icon.png` (512 px) and `build/icon.ico` (16–256 px) from `../game/public/favicon-512.png`.
- `scripts/smoke.mjs` — Runs two sequential hidden `--smoke` launches and verifies canvas render, loaded offline fonts, zero console errors/blocked requests, sandbox isolation, and `localStorage` persistence across restarts.

## Game persistence & shutdown notes

`game/src/save.js` saves progress immediately whenever a setting, cutscene flag, or mission completion changes (`window.localStorage.setItem('astrokid.v1', JSON.stringify(state))` inside partition `persist:astrokid`). It does **not** flush periodic in-level state during gameplay until a mission completes or settings change. On normal window close (or `--quit`), `main.js` dispatches `pagehide` and `visibilitychange`, waits up to 300 ms, and flushes session storage before destroying the window. Killing `Astro Kid.exe` abruptly mid-write (e.g., power loss or Task Manager kill) can discard uncommitted Chromium LevelDB writes from the last second or any in-mission state not yet committed by `SaveManager`.

## Commands

Run from `desktop/` (or via `npm --prefix desktop run <cmd>`):

```bash
npm run prepare:game   # Build ../game and populate desktop/game-dist (offline fonts included)
npm run make:icons     # Regenerate build/icon.png and build/icon.ico (leaves BMPs intact)
npm start              # Prepare game and launch Electron
npm run dev            # Prepare game and launch Electron with DevTools enabled
npm test               # Run pure unit tests (node --test test/*.test.js)
npm run smoke          # Run double-launch headless Electron smoke & persistence check
npm run dist:dir       # Produce unpacked Windows build at desktop/dist/win-unpacked/Astro Kid.exe
npm run dist:nsis      # Optional Plan-B assisted NSIS installer using build/installer*.bmp
```

Set `DESKTOP_DEV_URL=http://localhost:5173/play.html?app=desktop` with `npm run dev` to load from Vite dev server during local development.
Set `ASTROKID_WEBSITE_URL=https://...` if testing allowlisted external website/policy links in `preload.js`.

## Code signing hook

Signing is disabled by default so unsigned local builds succeed out of the box. When a Windows code-signing certificate is ready, pass `CSC_LINK` (path or base64 `.pfx`) and `CSC_KEY_PASSWORD` in the build environment before running `dist:dir` or `dist:nsis`.

## Open questions for the owner

1. **Quick sign-in inside the game.** The Privacy Policy says that after downloading, the player can sign in quickly in the game with the Google account details and the name entered on the website. **This is not built and not designed.** `window.astroKidDesktop` is ready for it; before building it later, decide:
   - OAuth flow for desktop: localhost loopback redirect (`http://127.0.0.1:<port>`) vs. OAuth Device Authorization Grant / custom protocol callback.
   - What the game itself uses the website profile name for (e.g., Commander display badge vs. save slot metadata) once retrieved.
   - Offline behaviour when launched without internet after signing in (cached session token / read-only display name vs. skipping account prompt silently).
2. **Code signing certificate (SmartScreen).** Without an EV or trusted OV Authenticode certificate, Windows SmartScreen will display an unrecognized-publisher warning on downloaded builds.
3. **Auto-update.** A custom installer (Prompt 11) does not provide background auto-updates on its own; choose between instructing players to re-download new installers from the website vs. adding an explicit opt-in version check that opens the website download page.
