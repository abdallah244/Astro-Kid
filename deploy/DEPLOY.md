# Astro Kid — VPS Deployment Guide (Ubuntu 22.04 / 24.04)

> **Note:** Hosting runs directly on the owner's Linux VPS using **nginx + Node.js (Fastify) + PostgreSQL**. No third-party backend service is used.

---

## 1. Install system packages (Node 20 LTS, PostgreSQL, nginx, Certbot)

```bash
sudo apt-get update
sudo apt-get install -y curl git nginx certbot python3-certbot-nginx postgresql postgresql-contrib

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
```

---

## 2. Create PostgreSQL database and locked-down app role

Run as `postgres`:

```bash
sudo -u postgres psql <<'SQL'
-- Replace CHANGE_ME_STRONG_DB_PASS with a strong random password
CREATE ROLE astrokid_app WITH LOGIN PASSWORD 'CHANGE_ME_STRONG_DB_PASS' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE astrokid OWNER postgres;
SQL
```

Create the schema first using a superuser connection or once as `postgres`, then grant **least-privilege** rights (`SELECT, INSERT, DELETE` only — **no `UPDATE`** anywhere on `profiles` or `users.email`) to `astrokid_app`:

```bash
sudo -u postgres psql -d astrokid <<'SQL'
GRANT USAGE ON SCHEMA public TO astrokid_app;
GRANT SELECT, INSERT, DELETE ON TABLE users, profiles, sessions TO astrokid_app;
-- Prevent any UPDATE even by accident
REVOKE UPDATE ON TABLE users, profiles, sessions FROM astrokid_app;
SQL
```

*(Run the `GRANT`/`REVOKE` block right after step 4 runs `0001_init.sql`.)*

---

## 3. Create system user & clone repository

```bash
sudo useradd --system --home /var/www/astro-kid --shell /usr/sbin/nologin astrokid || true
sudo mkdir -p /var/www/astro-kid/dist /var/www/astro-kid/releases
sudo chown -R "$USER":"$USER" /var/www/astro-kid

git clone https://github.com/abdallah244/Astro-Kid.git /var/www/astro-kid/repo
```

---

## 4. Build front end and configure back end

```bash
# Build static site -> copy to /var/www/astro-kid/dist
cd /var/www/astro-kid/repo/game
npm ci
npm run build
sudo rsync -a --delete dist/ /var/www/astro-kid/dist/

# Configure Node API
cd /var/www/astro-kid/repo/server
npm ci --omit=dev
cp .env.example .env
chmod 600 .env
nano .env
```

Set in `server/.env`:
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://astrokid_app:CHANGE_ME_STRONG_DB_PASS@127.0.0.1:5432/astrokid
SITE_ORIGIN=https://<your-domain>
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_REDIRECT_URI=https://<your-domain>/api/auth/google/callback
RELEASES_DIR=/var/www/astro-kid/releases
SESSION_DAYS=30
```

Run migrations (use postgres superuser URL for the initial DDL migration, then apply the `GRANT`/`REVOKE` from step 2):

```bash
sudo -u postgres env DATABASE_URL="postgres:///astrokid?host=/var/run/postgresql" node scripts/migrate.js
```

Now apply the `GRANT`/`REVOKE` permissions from step 2 so `astrokid_app` has `SELECT, INSERT, DELETE` only.

---

## 5. Enable systemd service & nginx + HTTPS

```bash
sudo chown -R astrokid:astrokid /var/www/astro-kid/repo/server /var/www/astro-kid/releases
sudo cp /var/www/astro-kid/repo/deploy/astro-kid-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now astrokid-api
sudo systemctl status astrokid-api
```

Install nginx config (replace `<your-domain>` first) and issue TLS certificate:

```bash
sudo sed 's/<your-domain>/yourdomain.com/g' /var/www/astro-kid/repo/deploy/nginx.conf \
  | sudo tee /etc/nginx/sites-available/astro-kid >/dev/null
sudo ln -sf /etc/nginx/sites-available/astro-kid /etc/nginx/sites-enabled/astro-kid
sudo nginx -t
sudo systemctl reload nginx

# Point DNS A record to your VPS IP before running certbot:
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 6. Nightly PostgreSQL backup cron (30-day retention)

```bash
sudo install -m 750 /var/www/astro-kid/repo/deploy/backup.sh /usr/local/bin/astro-kid-backup.sh
sudo crontab -u postgres -e
```

Add this cron line (runs daily at 03:15 UTC):

```cron
15 3 * * * /usr/local/bin/astro-kid-backup.sh >> /var/log/astro-kid-backup.log 2>&1
```

---

## 7. Publish a desktop release (`AstroKid-Setup.exe` + `release.json`)

The download page reads public metadata from `GET /api/release`, which inspects `RELEASES_DIR/release.json` and the real file size of `RELEASES_DIR/AstroKid-Setup.exe`. If either file is missing, `/api/release` returns `{ "published": false }` cleanly so the page shows a "Coming soon" panel.

Follow these 3 steps each time you publish or update the Windows installer:

1. **Copy `AstroKid-Setup.exe` to `/var/www/astro-kid/releases/`**:

```bash
scp AstroKid-Setup.exe youruser@your-vps-ip:/tmp/AstroKid-Setup.exe
ssh youruser@your-vps-ip "sudo mv /tmp/AstroKid-Setup.exe /var/www/astro-kid/releases/AstroKid-Setup.exe && sudo chown astrokid:astrokid /var/www/astro-kid/releases/AstroKid-Setup.exe && sudo chmod 640 /var/www/astro-kid/releases/AstroKid-Setup.exe"
```

2. **Compute its SHA-256 checksum**:

On the VPS (or with `Get-FileHash .\AstroKid-Setup.exe` in Windows PowerShell before uploading):

```bash
sha256sum /var/www/astro-kid/releases/AstroKid-Setup.exe
```

3. **Write `/var/www/astro-kid/releases/release.json`** (see `server/releases/release.example.json`):

```bash
sudo tee /var/www/astro-kid/releases/release.json >/dev/null <<'EOF'
{
  "version": "1.0.0",
  "releasedAt": "2026-11-16",
  "sha256": "PASTE_64_CHAR_SHA256_HERE",
  "platform": "Windows 10 / 11 (64-bit)"
}
EOF
sudo chown astrokid:astrokid /var/www/astro-kid/releases/release.json
sudo chmod 640 /var/www/astro-kid/releases/release.json
```

No server restart is required — updates appear within the 60-second `Cache-Control` window.

---

## 8. Exporting Marketing Emails (CSV)

Run read-only on the VPS whenever needed:

```bash
cd /var/www/astro-kid/repo/server
node scripts/export-marketing.js > list.csv
```

---

## 9. Deploying updates later

```bash
cd /var/www/astro-kid/repo
git pull origin main
cd game && npm ci && npm run build
sudo rsync -a --delete dist/ /var/www/astro-kid/dist/
cd ../server && npm ci --omit=dev
sudo -u postgres env DATABASE_URL="postgres:///astrokid?host=/var/run/postgresql" node scripts/migrate.js
sudo systemctl restart astrokid-api
```

---

## Marketing list

When the Developer's company launches an external email service / mailing list (Account Deletion Policy section 6):

1. Open `server/src/lib/marketing.js` and replace the no-op log in `removeFromMarketingList(email, logger)` with an API call that unsubscribes/deletes `email` from the mailing list.
2. Add the email provider's API credentials to `server/.env` and validate them in `server/src/config.js` as optional keys when configured.
3. Treat "contact not found / already unsubscribed" as success so repeated deletions remain idempotent.
4. Never log `email` in plain text (keep logging only the hashed `emailHash` or opaque status).
5. Restart `astrokid-api` and verify `DELETE /api/account` continues returning `204` even if the external API times out or errors.

---

## How the browser demo works (`/play.html`)

- **No account required**: every "Play the Free Demo" link across the site points directly to `/play.html` in the same tab. The demo page loads zero site auth scripts, never reads sessions, and never calls `/api/*`. Progress stays only in the browser (`localStorage`).
- **Pre-play notice & HUD badge (`game/public/demo-shell.js`, `game/public/demo-shell.css`)**:
  - Skipped completely inside the desktop Electron app (`Electron/` user agent or `?app=desktop`).
  - Gates touch-only / narrow viewports (`< 900px` or coarse pointer without fine mouse/trackpad) with `COMPUTER NEEDED` (`BACK TO WEBSITE` / `TRY ANYWAY`), and shows `THE DEMO COULD NOT START` if canvas creation fails or `<canvas>` fails to mount within `30s`.
  - Shows the `EARLY DEMO` notice once per tab session (`sessionStorage.ak_demo_notice_seen`). `Esc` does not close it; pressing `START DEMO` focuses the game `<canvas>` and remembers the session flag.
  - Renders the subtle bottom-right `#demo-badge` (`DEMO · EARLY VERSION`, `i` info button to reopen notice with `KEEP PLAYING`, `REPORT A PROBLEM`, and `GET THE FULL GAME` -> `/download.html`) in the empty pocket above the Backpack and Hotbar (`bottom: clamp(146px, 21vh, 224px); right: 14px`) with `pointer-events: none` on the wrapper so gameplay clicks never stall. Keyboard players reach it by pressing `Tab` after `#game` and return to `<canvas>` with `Esc`.
- **Retiring or pinning build metadata**:
  - `game/vite.config.js` injects `<meta name="ak-build">` (from `BUILD_DATE`, defaulting to UTC `YYYY-MM-DD`) and `<meta name="ak-demo-notice">` (from `DEMO_NOTICE`, defaulting to `true`).
  - To build the demo without the automatic pre-play notice, run `DEMO_NOTICE=false npm run build` inside `game/`.
