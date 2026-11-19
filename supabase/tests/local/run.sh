#!/usr/bin/env bash
# Runs all migrations + seed + tests against a throw-away local PostgreSQL 16
# database (no Docker / Supabase CLI needed).
#   PGHOST/PGPORT/PGUSER must point at a local server where you are superuser.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-rishta_test}
PSQL="psql -X -q -v ON_ERROR_STOP=1"
dropdb --if-exists "$DB" >/dev/null 2>&1 || true
createdb "$DB"
$PSQL -d "$DB" -f tests/local/supabase_shim.sql >/dev/null
for f in migrations/*.sql; do
  echo "migrate  $(basename "$f")"
  $PSQL -d "$DB" -f "$f" >/dev/null
done
if [ "${SKIP_SEED:-0}" != "1" ]; then
  echo "seed     seed.sql"
  $PSQL -d "$DB" -f seed.sql >/dev/null
fi
for f in tests/local/test_*.sql; do
  [ -e "$f" ] || continue
  echo "test     $(basename "$f")"
  $PSQL -d "$DB" -f "$f"
done
echo "ALL OK"
