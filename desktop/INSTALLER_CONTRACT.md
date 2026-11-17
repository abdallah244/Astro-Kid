# Astro Kid Desktop — Installer Contract

This file documents the fixed runtime contract that the Windows installer (`desktop/installer`) depends on.

- **Product name**: `Astro Kid`
- **Publisher / Author**: `Abdallah Hany`
- **AppUserModelID (`appId`)**: `com.abdallahhany.astrokid`
- **Packaged executable**: `Astro Kid.exe`
- **Unpacked output folder (`npm run dist:dir`)**: `desktop/dist/win-unpacked/` (entry binary: `desktop/dist/win-unpacked/Astro Kid.exe`)
- **`--version` CLI behaviour**: Running `"Astro Kid.exe" --version` prints `Astro Kid <version>` to `stdout` (e.g., `Astro Kid 0.1.0`) and exits immediately with status code `0` without opening a window, lock, or GPU process (completes in well under 2 seconds).
- **Polite shutdown CLI (`--quit`)**: Running `"Astro Kid.exe" --quit` signals any running instance via Electron's single-instance `second-instance` handler to flush storage and call `app.quit()` gracefully (if no instance is running, `--quit` exits immediately with status `0` without launching the game).
- **Registry-free design**: The desktop application writes zero custom Windows Registry keys or files outside the install folder and its `userData` folder.
- **Persistent user-data folder**: `%APPDATA%\Astro Kid` (`app.setPath('userData', path.join(app.getPath('appData'), 'Astro Kid'))` is set before `app` ready):
  - `logs/main.log` (plus rotated `main.log.1`, `main.log.2`, up to 3 × 512 KB)
  - `window-state.json` (last window width, height, position, maximized, fullscreen)
  - `Partitions/persist-astrokid/` (Chromium persistent storage for `app://astrokid`, including game save `localStorage` key `astrokid.v1`)
  - `disable-hw-accel.flag` (written only if the GPU process terminates abnormally twice in a row)
- **Offline `app://` protocol**: Serves bundled game assets, JS/CSS bundles, audio (with HTTP `Range` support), and bundled `.woff2` fonts (`Press Start 2P`, `Silkscreen`, `Chakra Petch`) exclusively from `game-dist/` inside the app archive (`app.asar`), with every external `http://` and `https://` request blocked by session lockdown and CSP. Zero network access is required or permitted.
