# Prisma migrations

DentaCore now uses `prisma migrate` (not `prisma db push`) for schema
changes. Every schema edit must ship with a migration file.

## Daily developer workflow

After editing `prisma/schema.prisma`:

```bash
# Creates a new timestamped migration in this folder + applies it to
# your local DB. Prisma will prompt for a short name.
npx prisma migrate dev --name describe_your_change

# If you're starting fresh and your local DB needs to catch up:
npm run db:setup
```

Commit the new migration directory along with the schema change.

## Production deploy

GitHub Actions runs:

```bash
npx prisma migrate resolve --applied 20260514000000_baseline  # idempotent
npx prisma migrate deploy
```

The first command marks the original baseline as already-applied (since
the live database was provisioned via `db push` before we switched to
migrate). It's a no-op after the first deploy. From then on,
`migrate deploy` applies any new files committed under
`prisma/migrations/`.

## The baseline

`20260514000000_baseline/migration.sql` was generated from the schema
state at the time we switched off `db push`. It IS the entire schema —
running it against an empty database produces the same shape that was
live in production. We never re-apply this file on existing databases
(the `resolve --applied` step ensures that).
