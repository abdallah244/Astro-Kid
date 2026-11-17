# Deploy Astro Kid with Docker (recommended)

Everything runs in its own Docker Compose project called `astro-kid`, isolated from anything else on the VPS:

| Container | What it does | Reachable from |
|---|---|---|
| `db` | PostgreSQL 16, data in the `astro-kid_db-data` volume | the private network only |
| `api` | Fastify API; applies database migrations on every start | the private network only |
| `web` | nginx with the built website and browser game; proxies `/api` and serves protected downloads | `127.0.0.1:${WEB_PORT}` only |
| `backup` | nightly `pg_dump` into `./backups`, files older than 30 days are deleted | the private network only |

No port is opened to the internet by these containers. The reverse proxy that already runs on the VPS (nginx, Caddy, Traefik...) handles HTTPS and forwards the domain to `127.0.0.1:${WEB_PORT}`.

## 1. First install

```bash
git clone https://github.com/abdallah244/Astro-Kid.git /opt/astro-kid
cd /opt/astro-kid
cp .env.docker.example .env
nano .env                      # SITE_URL, WEB_PORT, POSTGRES_PASSWORD, COOKIE_SECRET, GOOGLE_*
chmod 600 .env
docker compose up -d --build
docker compose ps              # all four containers "running", api and web "healthy"
curl -s http://127.0.0.1:8090/api/health    # {"ok":true}   (use your WEB_PORT)
```

Generate the secrets with `openssl rand -base64 32` (password) and `openssl rand -hex 32` (cookie secret).

## 2. Google sign-in

Google Cloud Console → APIs & Services:

1. **OAuth consent screen:** External, app name *Astro Kid*, support email, the domain, links to `${SITE_URL}/policies.html#privacy` and `#terms`. Scopes: `openid`, `email`, `profile` only.
2. **Credentials → Create OAuth client ID → Web application.**
   - Authorized JavaScript origin: `${SITE_URL}`
   - Authorized redirect URI: `${SITE_URL}/api/auth/google/callback`
3. Put the client ID and secret in `.env`, then `docker compose up -d api`.

## 3. HTTPS on the VPS reverse proxy

Point the domain's DNS `A` record to the VPS. Then add a site to the proxy that already runs there. With **nginx** on the host:

```nginx
server {
  listen 80;
  server_name your-domain.com;
  location / {
    proxy_pass http://127.0.0.1:8090;          # WEB_PORT
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 1m;
  }
}
```

then `sudo certbot --nginx -d your-domain.com` and add `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;` to the HTTPS server block it creates.

With **Caddy**: `your-domain.com { reverse_proxy 127.0.0.1:8090 }` (HTTPS is automatic).

## 4. Who signed up?

```bash
docker compose exec api npm run signups          # totals + the latest 20 (name, email, date)
docker compose exec api npm run signups -- 100   # the latest 100
docker compose exec api node scripts/export-marketing.js > signups.csv   # CSV of everyone
```

These print personal data: keep the output on the server.

**Optional ping on every new sign-up:** create a Telegram bot with @BotFather, send it a message, read your chat id from
`https://api.telegram.org/bot<TOKEN>/getUpdates`, then set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env` and run
`docker compose up -d api`. The message only says that someone signed up and the new total; no name or email leaves the server.

## 5. Publish the Windows installer

Build it on Windows (`npm --prefix desktop run dist:nsis` → `desktop/dist/AstroKid-Setup.exe`), then:

```bash
# on your PC
scp desktop/dist/AstroKid-Setup.exe user@vps:/opt/astro-kid/releases/
# on the VPS
cd /opt/astro-kid/releases
sha256sum AstroKid-Setup.exe
cat > release.json <<'JSON'
{ "version": "0.1.0", "releasedAt": "2026-11-17", "sha256": "<paste the hash>" }
JSON
```

No restart is needed: the download page reads `/api/release` and the button starts working for signed-in players.
Until both files exist, the page shows "Coming soon" and offers the free demo.

## 6. Everyday commands

```bash
docker compose logs -f api web              # live logs
git pull && docker compose up -d --build    # update to the latest code
docker compose restart api                  # after editing .env
docker compose down                         # stop (data is kept)
```

## 7. Backups and restore

Dumps are written every night at 03:00 UTC to `/opt/astro-kid/backups` and kept for 30 days. Copy them off the server from
time to time. To restore one:

```bash
docker compose stop api web
gunzip -c backups/astrokid-<date>.sql.gz | docker compose exec -T db psql -U astrokid -d astrokid
docker compose start api web
```

Never delete the `astro-kid_db-data` volume (`docker compose down -v`) unless you mean to erase every account.
