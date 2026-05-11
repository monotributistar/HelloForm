import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/lib/prisma.js';
import { buildApp } from '../src/server.js';
import { pricingRepo } from '../src/lib/pricing-repo.js';

const migrationPath1 = path.resolve(
  process.cwd(),
  'prisma/migrations/0001_init/migration.sql'
);
const migrationPath2 = path.resolve(
  process.cwd(),
  'prisma/migrations/0002_pricing_rules/migration.sql'
);
const migrationPath3 = path.resolve(
  process.cwd(),
  'prisma/migrations/0003_backoffice_admin/migration.sql'
);

async function applySqlMigration(filePath: string) {
  const sql = await fs.readFile(filePath, 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(`${statement};`);
  }
}

async function resetSchema() {
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "FormAnswer";');
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "AIUsageLog";');
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "PricingRule";');
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "AuditLog";');
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "TenantUser";');
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "Campaign";');
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "Survey";');
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "FormSession";');
}

describe('API metrics, pricing, and admin guards', () => {
  const app = buildApp();

  beforeAll(async () => {
    await resetSchema();
    await applySqlMigration(migrationPath1);
    await applySqlMigration(migrationPath2);
    await applySqlMigration(migrationPath3);
    await pricingRepo.seedDefaults();
  });

  beforeEach(async () => {
    await prisma.formAnswer.deleteMany();
    await prisma.formSession.deleteMany();
    await prisma.aIUsageLog.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.tenantUser.deleteMany();
    await prisma.campaign.deleteMany();
    await prisma.survey.deleteMany();
    await prisma.pricingRule.deleteMany({ where: { tenantId: { not: '__default__' } } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('auto calculates estimatedCostUsd when omitted', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/ai/usage-logs',
      payload: {
        tenantId: 'tenant-a',
        surveyId: 'survey-a',
        provider: 'huggingface',
        model: 'distilbert-base-uncased',
        operation: 'generate_text',
        units: 1000
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { estimatedCostUsd: number };
    expect(body.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('uses tenant pricing override when configured', async () => {
    const pricingResponse = await app.inject({
      method: 'POST',
      url: '/pricing-rules',
      headers: {
        'x-user-role': 'tenant_admin',
        'x-tenant-id': 'tenant-a'
      },
      payload: {
        tenantId: 'tenant-a',
        provider: 'huggingface',
        model: 'distilbert-base-uncased',
        operation: 'generate_text',
        usdPer1kUnits: 0.01
      }
    });
    expect(pricingResponse.statusCode).toBe(200);

    const response = await app.inject({
      method: 'POST',
      url: '/ai/usage-logs',
      payload: {
        tenantId: 'tenant-a',
        surveyId: 'survey-a',
        provider: 'huggingface',
        model: 'distilbert-base-uncased',
        operation: 'generate_text',
        units: 2000
      }
    });

    const body = response.json() as { estimatedCostUsd: number };
    expect(body.estimatedCostUsd).toBe(0.02);
  });

  it('returns daily metrics grouped by day', async () => {
    await app.inject({
      method: 'POST',
      url: '/ai/usage-logs',
      payload: {
        tenantId: 'tenant-a',
        surveyId: 'survey-a',
        provider: 'huggingface',
        model: 'distilbert-base-uncased',
        operation: 'extract_structured',
        units: 300
      }
    });

    await app.inject({
      method: 'POST',
      url: '/ai/usage-logs',
      payload: {
        tenantId: 'tenant-a',
        surveyId: 'survey-a',
        provider: 'huggingface',
        model: 'openai/whisper-small',
        operation: 'transcribe_audio',
        units: 1200
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/metrics/tenant/tenant-a/daily?surveyId=survey-a&days=7'
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ logs: number; costUsd: number; byOperation: Record<string, number> }>;
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]?.logs).toBeGreaterThanOrEqual(2);
    expect(body[0]?.costUsd).toBeGreaterThan(0);
    expect(Object.keys(body[0]?.byOperation ?? {}).length).toBeGreaterThan(0);
  });

  it('returns field friction and completion edge values', async () => {
    await app.inject({
      method: 'POST',
      url: '/form-sessions',
      payload: {
        sessionId: 's1',
        tenantId: 'tenant-a',
        surveyId: 'survey-a',
        totalSteps: 2
      }
    });

    await app.inject({
      method: 'POST',
      url: '/form-sessions/s1/fields/full_name',
      payload: { value: 'Ana', mode: 'manual', confirmed: true }
    });

    await app.inject({
      method: 'POST',
      url: '/form-sessions/s1/fields/full_name',
      payload: { value: 'Ana Maria', mode: 'chat', confirmed: true }
    });

    await app.inject({ method: 'POST', url: '/form-sessions/s1/next' });
    await app.inject({ method: 'POST', url: '/form-sessions/s1/next' });

    const frictionResp = await app.inject({
      method: 'GET',
      url: '/metrics/tenant/tenant-a/survey/survey-a/fields'
    });

    expect(frictionResp.statusCode).toBe(200);
    const friction = frictionResp.json() as Array<{ fieldId: string; avgAttempts: number; confirmationRate: number }>;
    expect(friction[0]?.fieldId).toBe('full_name');
    expect(friction[0]?.avgAttempts).toBe(2);
    expect(friction[0]?.confirmationRate).toBe(1);

    const aggResp = await app.inject({
      method: 'GET',
      url: '/metrics/tenant/tenant-a?surveyId=survey-a'
    });

    const agg = aggResp.json() as { completionRate: number };
    expect(agg.completionRate).toBe(1);

    const emptyAggResp = await app.inject({
      method: 'GET',
      url: '/metrics/tenant/tenant-b?surveyId=survey-x'
    });

    const emptyAgg = emptyAggResp.json() as { completionRate: number };
    expect(emptyAgg.completionRate).toBe(0);
  });

  it('returns 403 for non-admin role on mutating admin endpoints', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/campaigns',
      headers: {
        'x-user-role': 'viewer',
        'x-tenant-id': 'tenant-a'
      },
      payload: {
        tenantId: 'tenant-a',
        name: 'Forbidden Campaign'
      }
    });

    expect(response.statusCode).toBe(403);
  });

  it('returns 403 for tenant scope mismatch when not platform_admin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/surveys',
      headers: {
        'x-user-role': 'tenant_admin',
        'x-tenant-id': 'tenant-a'
      },
      payload: {
        tenantId: 'tenant-b',
        name: 'Wrong Tenant Survey'
      }
    });

    expect(response.statusCode).toBe(403);
  });

  it('returns 409 on stale expectedUpdatedAt optimistic concurrency check', async () => {
    const createResp = await app.inject({
      method: 'POST',
      url: '/campaigns',
      headers: {
        'x-user-role': 'tenant_admin',
        'x-tenant-id': 'tenant-a'
      },
      payload: {
        tenantId: 'tenant-a',
        name: 'Campaign A',
        status: 'active'
      }
    });

    expect(createResp.statusCode).toBe(200);
    const created = createResp.json() as { id: string; updatedAt: string };

    const firstUpdate = await app.inject({
      method: 'PATCH',
      url: `/campaigns/${created.id}`,
      headers: {
        'x-user-role': 'tenant_admin',
        'x-tenant-id': 'tenant-a'
      },
      payload: {
        tenantId: 'tenant-a',
        status: 'paused',
        expectedUpdatedAt: created.updatedAt
      }
    });

    expect(firstUpdate.statusCode).toBe(200);

    const staleUpdate = await app.inject({
      method: 'PATCH',
      url: `/campaigns/${created.id}`,
      headers: {
        'x-user-role': 'tenant_admin',
        'x-tenant-id': 'tenant-a'
      },
      payload: {
        tenantId: 'tenant-a',
        status: 'active',
        expectedUpdatedAt: created.updatedAt
      }
    });

    expect(staleUpdate.statusCode).toBe(409);
  });
});
