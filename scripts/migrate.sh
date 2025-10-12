#!/usr/bin/env bash
set -euo pipefail
: "${PGDATABASE:?Set PG* envs or use psql service}"
for f in $(ls -1 db/migrations/*.sql | sort); do
  echo "[+] applying $f"
  psql -v ON_ERROR_STOP=1 -f "$f"
done
echo "[✓] migrations applied"
