# Third-party notices

Astro Kid is © 2026 Abdallah Hany and is released under the [Astro Kid License](LICENSE). That license covers the
Developer's own work only. The open-source components below are **not** covered by it: each one stays under its own
license, shown here. Copies of the full license texts ship inside each package (`node_modules/<package>/LICENSE`) and, for
the desktop app, in `LICENSE.electron.txt` and `LICENSES.chromium.html` next to `Astro Kid.exe`.

The lists are generated from the packages that are installed when this file was written (runtime dependencies and their
dependencies). Development tools (Vite, electron-builder, sharp and similar) are not shipped to players.

## Game (browser and desktop)

| Package | Version | License |
|---|---|---|
| `eventemitter3` | 5.0.4 | MIT |
| `phaser` | 3.80.1 | MIT |

Phaser is © Photon Storm Ltd. and the Phaser contributors (MIT, https://github.com/phaserjs/phaser).

## Desktop app and installer

| Component | Version | License |
|---|---|---|
| Electron (includes Chromium and Node.js) | 33.4.11 | MIT, plus the Chromium and Node.js component licenses in `LICENSES.chromium.html` |
| `7zip-bin` (installer only; 7-Zip `7za.exe`) | 5.2.0 | MIT for the package. 7-Zip is under the GNU LGPL, with the unRAR restriction for RAR code. It is used only to unpack the app payload. |

## Fonts (bundled with the desktop app, loaded from Google Fonts on the website)

| Font | Copyright | License |
|---|---|---|
| Press Start 2P | © 2012 The Press Start 2P Project Authors (cody@zone38.net) | SIL Open Font License 1.1 |
| Silkscreen | © 2001 The Silkscreen Project Authors (https://github.com/googlefonts/silkscreen) | SIL Open Font License 1.1 |
| Chakra Petch | © 2018 The Chakra Petch Project Authors (https://github.com/m4rc1e/Chakra-Petch.git) | SIL Open Font License 1.1 |

The SIL Open Font License 1.1 text is at https://openfontlicense.org. The fonts are used unmodified.

## Server (API)

The server runs only on the owner's machine and is not distributed to players.

| Package | Version | License |
|---|---|---|
| `@fastify/ajv-compiler` | 4.0.7 | MIT |
| `@fastify/cookie` | 11.1.5 | MIT |
| `@fastify/deepmerge` | 3.2.4 | MIT |
| `@fastify/error` | 4.2.1 | MIT |
| `@fastify/fast-json-stringify-compiler` | 5.2.0 | MIT |
| `@fastify/forwarded` | 3.1.2 | MIT |
| `@fastify/helmet` | 13.2.0 | MIT |
| `@fastify/merge-json-schemas` | 0.2.2 | MIT |
| `@fastify/proxy-addr` | 5.1.3 | MIT |
| `@fastify/rate-limit` | 10.3.0 | MIT |
| `@lukeed/ms` | 2.0.2 | MIT |
| `@pinojs/redact` | 0.4.0 | MIT |
| `abstract-logging` | 2.0.1 | MIT |
| `agent-base` | 7.1.4 | MIT |
| `ajv` | 8.20.0 | MIT |
| `ajv-formats` | 3.0.1 | MIT |
| `atomic-sleep` | 1.0.0 | MIT |
| `avvio` | 9.3.1 | MIT |
| `base64-js` | 1.5.1 | MIT |
| `bignumber.js` | 9.3.1 | MIT |
| `buffer-equal-constant-time` | 1.0.1 | BSD-3-Clause |
| `cookie` | 2.0.2 | MIT |
| `debug` | 4.4.3 | MIT |
| `dequal` | 2.0.3 | MIT |
| `dotenv` | 16.6.1 | BSD-2-Clause |
| `ecdsa-sig-formatter` | 1.0.11 | Apache-2.0 |
| `extend` | 3.0.2 | MIT |
| `fast-decode-uri-component` | 1.0.1 | MIT |
| `fast-deep-equal` | 3.1.3 | MIT |
| `fast-json-stringify` | 7.3.6 | MIT |
| `fast-querystring` | 1.1.2 | MIT |
| `fast-uri` | 4.2.3 | BSD-3-Clause |
| `fast-uri` | 3.1.9 | BSD-3-Clause |
| `fastify` | 5.12.8 | MIT |
| `fastify-plugin` | 5.1.0 | MIT |
| `fastify-plugin` | 6.0.1 | MIT |
| `fastq` | 1.20.3 | ISC |
| `find-my-way` | 9.10.1 | MIT |
| `gaxios` | 6.7.1 | Apache-2.0 |
| `gcp-metadata` | 6.1.1 | Apache-2.0 |
| `google-auth-library` | 9.15.1 | Apache-2.0 |
| `google-logging-utils` | 0.0.2 | Apache-2.0 |
| `gtoken` | 7.1.0 | MIT |
| `helmet` | 8.3.0 | MIT |
| `https-proxy-agent` | 7.0.6 | MIT |
| `ipaddr.js` | 2.5.0 | MIT |
| `is-stream` | 2.0.1 | MIT |
| `json-bigint` | 1.0.0 | MIT |
| `json-schema-ref-resolver` | 3.0.1 | MIT |
| `json-schema-traverse` | 1.0.0 | MIT |
| `jwa` | 2.0.1 | MIT |
| `jws` | 4.0.1 | MIT |
| `light-my-request` | 6.8.1 | BSD-3-Clause |
| `ms` | 2.1.3 | MIT |
| `node-fetch` | 2.7.0 | MIT |
| `on-exit-leak-free` | 2.1.2 | MIT |
| `pg` | 8.23.1 | MIT |
| `pg-connection-string` | 2.14.1 | MIT |
| `pg-int8` | 1.0.1 | ISC |
| `pg-pool` | 3.14.0 | MIT |
| `pg-protocol` | 1.16.1 | MIT |
| `pg-types` | 2.2.0 | MIT |
| `pgpass` | 1.0.5 | MIT |
| `pino` | 10.4.0 | MIT |
| `pino-abstract-transport` | 3.0.0 | MIT |
| `pino-std-serializers` | 7.1.0 | MIT |
| `postgres-array` | 2.0.0 | MIT |
| `postgres-bytea` | 1.0.1 | MIT |
| `postgres-date` | 1.0.7 | MIT |
| `postgres-interval` | 1.2.0 | MIT |
| `process-warning` | 5.1.1 | MIT |
| `quick-format-unescaped` | 4.0.4 | MIT |
| `real-require` | 1.0.0 | MIT |
| `require-from-string` | 2.0.2 | MIT |
| `ret` | 0.5.1 | MIT |
| `reusify` | 1.1.0 | MIT |
| `rfdc` | 1.4.1 | MIT |
| `safe-buffer` | 5.2.1 | MIT |
| `safe-regex2` | 5.1.2 | MIT |
| `safe-stable-stringify` | 2.5.0 | MIT |
| `secure-json-parse` | 4.1.1 | BSD-3-Clause |
| `semver` | 7.8.6 | ISC |
| `set-cookie-parser` | 3.2.2 | MIT |
| `sonic-boom` | 4.2.1 | MIT |
| `split2` | 4.2.0 | ISC |
| `thread-stream` | 4.2.1 | MIT |
| `toad-cache` | 3.7.4 | MIT |
| `tr46` | 0.0.3 | MIT |
| `uuid` | 9.0.1 | MIT |
| `webidl-conversions` | 3.0.1 | BSD-2-Clause |
| `whatwg-url` | 5.0.0 | MIT |
| `xtend` | 4.0.2 | MIT |
| `zod` | 3.25.76 | MIT |

## Services

Google Sign-In is provided by Google and is used only to identify the person who downloads the game, under the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including its
Limited Use requirements.

## Art, audio and voices

The pixel art, illustrations, characters, music, sound effects and voices in this repository are part of the Astro Kid
project and are covered by the [Astro Kid License](LICENSE). If you believe something in this repository infringes your
rights, write to abdallahhfares@gmail.com and it will be reviewed and fixed.
