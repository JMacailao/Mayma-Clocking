#!/bin/sh
# Builds avilonx-update.sql: every re-runnable setup file in the right order,
# so a club only has to run one file in the Supabase SQL Editor.
# Run from the repository root after changing any of the files below.
set -e
FILES="multi-club account-credentials public-results sticker-barcodes race-release-time race-schedule-dates nfc-tags rfid-devices entry-remarks bird-bonding show-up rfid-tag-in-use bird-ring-only race-tag-expiry club-settings account-devices telegram race-point-recalc clock-videos race-day"
OUT=avilonx-update.sql
{
  echo "-- AvilonX Clocking: ALL updates in one file."
  echo "--"
  echo "-- Run this one file in the Supabase SQL Editor after schema.sql and"
  echo "-- supabase-auth.sql (those two are only for a brand-new database)."
  echo "-- It is safe to run again: run it after every AvilonX update."
  echo "--"
  echo "-- Built by tools/build-update-sql.sh from:"
  for f in $FILES; do echo "--   $f.sql"; done
  for f in $FILES; do
    echo ""
    echo "-- ============================================================================"
    echo "-- $f.sql"
    echo "-- ============================================================================"
    cat "$f.sql"
    echo ""
  done
} > "$OUT"
echo "Wrote $OUT"
