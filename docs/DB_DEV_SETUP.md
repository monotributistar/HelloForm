# Dev Database Setup (HelloForm API)

## Estado actual del diagnostico

Fecha: **2026-05-04**

En este entorno, `prisma db push` falla con:

- `Error: Schema engine error:` (sin detalle adicional)

Mientras tanto, los siguientes comandos funcionan correctamente:

- `prisma validate`
- `prisma migrate diff --from-empty --to-schema-datamodel ... --script`
- `prisma db execute --stdin --url file:./dev.db`
- `prisma generate`

## Conclusión

Hay una incompatibilidad/bug del flujo `db push` con el schema engine en este runtime, pero **no bloquea** el desarrollo.

## Flujo oficial para DB de desarrollo

Usar bootstrap SQL reproducible:

1. `npm run db:dev:init`
2. `npm run -w @helloform/api db:dev:check`

Esto:

- recrea `apps/api/dev.db`
- aplica `apps/api/prisma/migrations/0001_init/migration.sql`
- genera cliente Prisma

## Archivos involucrados

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/0001_init/migration.sql`
- `apps/api/scripts-db-dev-init.sh`
- `apps/api/prisma/sql/check.sql`

## Nota para PostgreSQL (cloud)

Para producción/staging recomendamos PostgreSQL y migraciones versionadas. En esta base POC dejamos SQLite para desarrollo local rápido, con esquema compatible para migrar luego a Postgres.
