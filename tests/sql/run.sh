#!/usr/bin/env bash
# Database tests: builds a fresh database like Supabase, runs the setup files
# (avilonx-update.sql twice, to prove it is safe to run again) and checks the
# rules in checks.sql. Needs psql and an empty PostgreSQL database; set the
# usual PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE variables.
set -euo pipefail
cd "$(dirname "$0")/../.."
sh tools/build-update-sql.sh >/dev/null
if ! git diff --quiet -- avilonx-update.sql 2>/dev/null; then
  echo "avilonx-update.sql was out of date: rebuilt it. Commit the new version." >&2
fi
run() { echo "-- $1"; psql -X -q -v ON_ERROR_STOP=1 -f "$1" >/dev/null; }
run tests/sql/supabase-stub.sql
run schema.sql
run supabase-auth.sql
run avilonx-update.sql
run avilonx-update.sql
psql -X -q -v ON_ERROR_STOP=1 -f tests/sql/checks.sql
