#!/bin/sh
set -e

echo "[entrypoint] aplicando migrations…"
node scripts/migrate-prod.js || {
  echo "[entrypoint] FALHA nas migrations. Abortando."
  exit 1
}

echo "[entrypoint] migrations OK. Iniciando server…"
exec node server.js
