# DentaCore — Compromise Recovery & Clean Rebuild Runbook

**Incident (2026-06-08):** the production VPS (`dental.scalamedic.com`, 38.247.145.231)
was compromised. A cryptominer running as **root** (`syslog-ng-5366e949`, ~294% CPU,
2.4 GB, started ~10:05 UTC) with persistence artifacts (`/tmp/.ICEi-unix`,
`/dev/shm/duet`, both root/`000`) starved the box, OOM-killing deploys and taking the
app down (502). `next-server` was also running as **root** on :3000 (not `deploy` on
:9000). The box hosts **patient data (Postgres)** → treat as a **data breach** until
proven otherwise.

**Decision: rebuild clean. Do NOT trust the old box.**

---

## Phase 0 — Contain & preserve (provider console / root)
- [ ] Snapshot the old VM for forensics **before** changing anything.
- [ ] Take it off the public internet once data is extracted (close 80/443, or power off post-snapshot).
- [ ] Do not delete it until forensics + breach assessment are done.

## Phase 1 — Get patient data out safely (priority)
- [ ] Prefer a **known-good Postgres backup from before ~10:05 UTC 2026-06-08**.
      Check `/var/backups/dentacore/`, off-box/S3, or the provider's DB snapshots.
- [ ] If none: `pg_dump -Fc dentacore > dentacore-$(date +%F).dump` from the old box,
      and **spot-check integrity** (row counts for Patient/Appointment/Invoice; look for
      injected admin users, odd rows). Accept it may be tampered — losing patient data is worse.
- [ ] Copy patient media: `/var/www/dentacore/uploads/`.

## Phase 2 — Provision a clean box
- [ ] Fresh Ubuntu 24.04 VPS, ≥4 GB RAM, **with swap configured** (`/swapfile` 2–4 GB in `/etc/fstab`).
- [ ] New SSH keypair (do not reuse old keys). `ufw`: allow 22/80/443 only. `fail2ban` on.
- [ ] Node 20+, PM2, nginx, certbot, Postgres — per `DEPLOY.md` §2, plus the §6 security checklist.
- [ ] Postgres `listen_addresses='localhost'`; **do not** expose Postgres/Redis/Mongo publicly
      (the old box had `mongod`/`redis` running — verify they're not bound to 0.0.0.0).

## Phase 3 — Rotate EVERY secret (assume all old-box secrets are burned)
| Secret | Where to rotate |
|---|---|
| DB password (`DATABASE_URL`) | Postgres `ALTER USER` on new box (use generated value) |
| `AUTH_SECRET` | new box `.env` (generated) — invalidates all sessions |
| `CRON_SECRET` | new box `.env` (generated) |
| `OPENAI_API_KEY` | **revoke + reissue** in OpenAI dashboard |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **roll** in Stripe dashboard |
| `SMTP_PASS` (email) | reset mailbox/app password |
| `SMS_API_KEY` | reset with SMS provider |
| `WHATSAPP_API_TOKEN` + re-pair Baileys (`WHATSAPP_SESSION_DIR`) | session dir is a credential — re-pair fresh |
| `REDIS_URL` password | reset |
| `PAYMENT_LOCAL_API_KEY` / `PAYMENT_LOCAL_MERCHANT_ID` | rotate with provider |
| `OPS_ALERTS_SLACK_WEBHOOK` / `OPS_ALERTS_DISCORD_WEBHOOK` | regenerate webhooks |
| `SENTRY_DSN` | optional rotate |
| **SSH deploy key** → GitHub secret `SSH_PRIVATE_KEY_B64` + new box `authorized_keys` | new keypair |
| **GitHub Actions secrets** `SSH_HOST` (new IP), `SSH_USER`, `SSH_PORT` | update to new box |
| **GitHub access** | audit repo collaborators + deploy keys; revoke anything unrecognized |

## Phase 4 — Deploy the app (clean box) — *I can drive this*
```bash
sudo mkdir -p /var/www/dentacore && sudo chown -R deploy:deploy /var/www/dentacore
cd /var/www/dentacore && git clone <repo> current && cd current
# write .env (see template below) with the NEW secrets
npm ci --legacy-peer-deps --no-audit --no-fund
npx prisma migrate deploy
pg_restore -d dentacore --clean --if-exists dentacore-<date>.dump   # restore patient data
NODE_OPTIONS=--max-old-space-size=2048 npm run build
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup systemd
```

## Phase 5 — Cutover
- [ ] nginx vhost for `dental.scalamedic.com` → `127.0.0.1:9000`; `certbot --nginx`.
- [ ] Point DNS A record → new IP; verify `https://dental.scalamedic.com/api/health` → 200.
- [ ] Update GitHub deploy secrets so `main` pushes deploy to the **new** box.
- [ ] Merge PR #11 (deploy memory hardening) — safe once it targets the new box.

## Phase 6 — Post-incident
- [ ] Breach assessment + notification per HIPAA/GDPR (patient PII).
- [ ] Root-cause the entry vector (the `administrator` user, exposed services, SSH, app RCE).
- [ ] Decommission the old box after forensics.

---

## `.env` template for the new box (fill external-provider values)
```
NODE_ENV=production
PORT=9000
DATABASE_URL=postgresql://dentacore:<DB_PASSWORD>@localhost:5432/dentacore?schema=public
AUTH_SECRET=<AUTH_SECRET>
CRON_SECRET=<CRON_SECRET>
NEXT_PUBLIC_SITE_URL=https://dental.scalamedic.com
# external — reissue all of these:
OPENAI_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMS_API_URL=
SMS_API_KEY=
WHATSAPP_BAILEYS_ENABLED=
WHATSAPP_SESSION_DIR=
REDIS_URL=
SENTRY_DSN=
```
Fresh `AUTH_SECRET` / `DB_PASSWORD` / `CRON_SECRET` were generated out-of-band — keep them
only in this `.env` and the GitHub secrets store, never in git.
