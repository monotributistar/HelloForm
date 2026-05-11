#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  cp .env.example .env
fi

DB_PATH="./dev.db"
rm -f "$DB_PATH"

for SQL_FILE in ./prisma/migrations/0001_init/migration.sql ./prisma/migrations/0002_pricing_rules/migration.sql ./prisma/migrations/0003_backoffice_admin/migration.sql; do
  cat "$SQL_FILE" | npx prisma db execute --stdin --url "file:./dev.db"
done

npx prisma generate

echo "Dev DB initialized at apps/api/dev.db"
