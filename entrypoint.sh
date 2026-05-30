#!/bin/sh
set -e

echo "[entrypoint] 1/3 aplicando migrations…"
node scripts/migrate-prod.js || {
  echo "[entrypoint] FALHA nas migrations. Abortando."
  exit 1
}

echo "[entrypoint] 2/3 garantindo feature flags base (idempotente)…"
node scripts/feature_flags.js || echo "[entrypoint] aviso: seed feature_flags falhou (não bloqueante)"

echo "[entrypoint] 3/3 garantindo templates de mensagem (idempotente)…"
node scripts/seed-templates.js || echo "[entrypoint] aviso: seed templates falhou (não bloqueante)"

echo "[entrypoint] ✓ seeds OK. Iniciando server…"
exec node server.js
