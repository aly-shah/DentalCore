# DentaCore — VPS Deployment + CI/CD Plan

A pragmatic, production-ready deployment for a Next.js 15 + Prisma + SQLite/Postgres app on a single VPS (Ubuntu 22.04/24.04, 2 vCPU / 4 GB RAM minimum). Scales horizontally later by swapping SQLite → Postgres on a managed DB and adding more app nodes behind a load balancer.

---

## 1. Architecture overview

```
  (Internet / Users)
          │
          ▼
   [ Cloudflare DNS / proxy ]   ← optional; free TLS + DDoS
          │  443
          ▼
   ┌─────────────────────────────────┐
   │ VPS (Ubuntu + UFW)              │
   │                                 │
   │  nginx  ──►  Next.js (PM2)      │
   │    :443        :3000            │
   │                                 │
   │  Postgres (local or managed)    │
   │  /var/www/dentacore/uploads     │
   │                                 │
   │  deploy user (SSH, no sudo pwd) │
   └─────────────────────────────────┘
```

- **nginx** — TLS termination (Let's Encrypt), gzip/brotli, static caching, reverse proxy to Next.
- **PM2** — process manager; auto-restart, cluster mode, log rotation.
- **Postgres** — switch from SQLite to Postgres for production. Prisma migration is a one-line URL change.
- **Uploads** — persistent mount at `/var/www/dentacore/uploads`, mapped into `public/uploads`.
- **Backups** — nightly `pg_dump` to a second disk / S3.

---

## 2. One-time VPS setup

Run as root the first time.

```bash
# --- base ---
apt update && apt upgrade -y
apt install -y nginx ufw fail2ban postgresql postgresql-contrib \
               certbot python3-certbot-nginx git curl build-essential

# --- Node 20 LTS ---
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm i -g pm2@latest

# --- firewall ---
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable

# --- deploy user (non-root for the app) ---
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
# paste your SSH public key into /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys

# --- app directory ---
mkdir -p /var/www/dentacore /var/www/dentacore/uploads
chown -R deploy:deploy /var/www/dentacore

# --- postgres ---
# Generate a strong password and keep it ONLY in the server .env — never commit it.
#   DB_PASS="$(openssl rand -base64 24 | tr -d '/+=')"
sudo -u postgres psql <<SQL
CREATE USER dentacore WITH PASSWORD '__SET_A_STRONG_PASSWORD__';
CREATE DATABASE dentacore OWNER dentacore;
SQL
```

> **Secrets never live in this repo.** The real DB password, `AUTH_SECRET`,
> `OPENAI_API_KEY`, etc. live only in the VPS `.env`. The value above is a
> placeholder — substitute it at setup time and store it in `.env`.

### nginx config `/etc/nginx/sites-available/dentacore`

```nginx
upstream dentacore_app { server 127.0.0.1:3000; keepalive 64; }

server {
  listen 80;
  server_name clinic.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name clinic.example.com;

  # Certbot will fill these in:
  # ssl_certificate      /etc/letsencrypt/live/clinic.example.com/fullchain.pem;
  # ssl_certificate_key  /etc/letsencrypt/live/clinic.example.com/privkey.pem;

  client_max_body_size 25m;   # patient uploads
  gzip on; gzip_types text/css application/javascript application/json image/svg+xml;

  # Long-cache Next static assets
  location /_next/static/ {
    proxy_pass http://dentacore_app;
    proxy_cache_valid 200 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  location /uploads/ {
    alias /var/www/dentacore/uploads/;
    add_header Cache-Control "public, max-age=604800";
  }

  location / {
    proxy_pass http://dentacore_app;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
}
```

```bash
ln -s /etc/nginx/sites-available/dentacore /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d clinic.example.com  # TLS in one command
```

---

## 3. App deploy (manual, first time)

As the `deploy` user:

```bash
cd /var/www/dentacore
git clone git@github.com:YOURORG/dentacore.git current
cd current

cat > .env <<EOF
NODE_ENV=production
DATABASE_URL=postgresql://dentacore:CHANGE_ME_STRONG@localhost:5432/dentacore
AUTH_SECRET=$(openssl rand -hex 48)
PORT=3000
EOF

npm ci --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy           # applies committed migrations
npx tsx prisma/seed.ts              # optional — only for a fresh clinic

npm run build
pm2 start ecosystem.config.cjs      # see below
pm2 save
pm2 startup systemd                 # make it survive reboots (run printed cmd)
```

### `ecosystem.config.cjs`

Committed at the repo root:

```javascript
module.exports = {
  apps: [{
    name: "dentacore",
    script: "node_modules/next/dist/bin/next",
    args: "start -p 3000",
    instances: "max",
    exec_mode: "cluster",
    max_memory_restart: "1G",
    env: { NODE_ENV: "production" },
    error_file: "/var/log/dentacore/err.log",
    out_file:   "/var/log/dentacore/out.log",
    merge_logs: true,
    time: true,
  }],
};
```

### Switch schema datasource to Postgres

`prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"   // was: sqlite
  url      = env("DATABASE_URL")
}
```

Then run `npx prisma migrate dev --name switch_to_postgres` **locally** once, commit the migration file, and deploy. Never `migrate reset` in production.

---

## 4. CI/CD — GitHub Actions

Two workflows, both committed to `.github/workflows/`:

### `ci.yml` — runs on PRs into `main` and on pushes to feature branches

- Spins up a disposable Postgres service, generates the Prisma client, syncs
  the schema with `prisma db push`, then runs typecheck (`tsc --noEmit`),
  the test suite (`vitest`), and `next build`.
- Lint is not run yet — ESLint isn't installed in the project; add it and a
  `next lint`/ESLint-CLI step here when ready.

### `deploy.yml` — runs on push to `main`

- SSH into the VPS, `git reset --hard origin/main`, install deps, run
  migrations, build, `pm2 reload` (zero-downtime).
- **`deploy.yml` does not automatically wait for `ci.yml`.** They have
  separate triggers (deploy on `main` push, CI on PRs/feature branches). To
  actually gate production on CI, make the **`verify` job a required status
  check** in Settings → Branches → branch-protection for `main`, and merge
  via PR rather than pushing straight to `main`.

Both files are in `.github/workflows/` in this repo.

### Required GitHub secrets

In **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `SSH_HOST` | VPS IP or hostname |
| `SSH_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | Contents of a private key whose public side is in `~deploy/.ssh/authorized_keys` |
| `SSH_PORT` | `22` (or whatever you set) |
| `DATABASE_URL_TEST` | `postgresql://postgres:postgres@localhost:5432/dentacore_test` (used by CI service) |

`AUTH_SECRET`, production `DATABASE_URL`, etc. live in the VPS's `.env` file — never in Actions secrets unless truly needed.

### Deployment safety

- Migrations run **before** `pm2 reload`; if a migration fails, the old process keeps serving.
- `pm2 reload` is zero-downtime (cluster mode rolling restart).
- Keep the last 3 releases on disk (`/var/www/dentacore/releases/`) with a `current` symlink — one-command rollback (`ln -sfn releases/prev current && pm2 reload dentacore`).

---

## 5. Backups + monitoring (minimum viable)

```bash
# /etc/cron.d/dentacore-backup  — nightly DB dump, 30 days retained
0 2 * * * deploy pg_dump -Fc dentacore | gzip > /var/backups/dentacore/db-$(date +\%F).sql.gz
5 2 * * * deploy find /var/backups/dentacore -mtime +30 -delete
```

- Logs: `pm2 logs dentacore` and `/var/log/nginx/`. Pipe into Grafana Cloud / Axiom / Better Stack (free tiers) for alerts.
- Uptime: UptimeRobot on `https://clinic.example.com/api/health`.
- **Restore drill**: quarterly, restore a dump into a scratch Postgres and verify patient row counts match.

---

## 6. Before going live — security checklist

- [ ] `AUTH_SECRET` is 64+ random bytes, unique per environment.
- [ ] Postgres password rotated; `listen_addresses = 'localhost'` in `postgresql.conf`.
- [ ] `ufw status` shows only 22, 80, 443 open.
- [ ] `fail2ban` jail enabled for SSH + nginx auth.
- [ ] `/api/cron/reminders` protected by a shared secret header (not publicly invokable).
- [ ] Capacitor Android build signs with a release keystore stored **outside** the repo.
- [ ] A real privacy policy + consent flow is wired (patient PII is regulated).
- [ ] Legal: review data residency / HIPAA / GDPR rules for your jurisdiction — this plan is a starting point, not compliance advice.

---

## 7. Cost ballpark

| Piece | Provider | Monthly |
|---|---|---|
| VPS 2 vCPU / 4 GB / 80 GB SSD | Hetzner CX22 / DigitalOcean / Vultr | $5–$10 |
| Domain + DNS | Cloudflare (free) / Namecheap | ~$1 |
| Backups bucket | Backblaze B2 / S3 | <$1 for clinic-size data |
| Monitoring | UptimeRobot + Better Stack free | $0 |
| **Total** | | **~$10/month** for a single-clinic deployment |
