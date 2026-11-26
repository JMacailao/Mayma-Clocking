# Database backups

`.github/workflows/backup.yml` backs up the Supabase database every day at
02:17 Philippine time. Each backup is encrypted and kept for 30 days under
**GitHub → Actions → Database backup → (a run) → Artifacts**.

## Setup (once)

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
| --- | --- |
| `SUPABASE_DB_URL` | Supabase → **Connect** → **Session pooler** connection string, with your database password filled in |
| `BACKUP_PASSPHRASE` | A long password you make up. Keep it safe: without it a backup cannot be opened. |

Then **Actions → Database backup → Run workflow** to make the first backup.

## What is in it

* `public.dump`: all AvilonX tables, functions and data (clubs, members, birds,
  races, entries, clockings…).
* `auth.dump`: the sign-in accounts (`auth.users`, `auth.identities`), data only.

Photos, videos and logos in Supabase Storage are not included.

## Restore

```bash
gpg --decrypt avilonx-backup-YYYY-MM-DD_HHMM.tar.gz.gpg | tar -xzf -
pg_restore --no-owner --no-privileges --clean --if-exists -d "$DB_URL" public.dump
pg_restore --no-owner --data-only -d "$DB_URL" auth.dump   # only into an empty project
```

Restore into a new Supabase project when possible, check it, then switch the
website's address in `assets/js/config.js`.

# Uptime check and error reports

* `.github/workflows/uptime.yml` checks www.avilonx.site and the database every
  30 minutes. When one is down it opens a GitHub issue labelled `uptime`
  (GitHub emails you); when both are back it comments and closes the issue.
  Nothing to set up.
* Errors that break a page on someone's phone or computer are sent to the
  database (`error-log.sql`). The Super Admin sees them on **Club accounts →
  App errors**.
