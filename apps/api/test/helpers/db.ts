import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../src/lib/prisma.js';

const MIGRATIONS = [
  '0001_init',
  '0002_pricing_rules',
  '0003_backoffice_admin',
  '0004_help_handoff'
];

const TABLES = [
  'HandoffRequest',
  'TenantHelpConfig',
  'FormAnswer',
  'AIUsageLog',
  'PricingRule',
  'AuditLog',
  'TenantUser',
  'Campaign',
  'Survey',
  'FormSession'
];

export async function resetAndMigrate() {
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}";`);
  }

  for (const name of MIGRATIONS) {
    const sql = await fs.readFile(path.resolve(process.cwd(), `prisma/migrations/${name}/migration.sql`), 'utf8');
    const statements = sql
      .split(';')
      .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean);
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(`${statement};`);
    }
  }
}
