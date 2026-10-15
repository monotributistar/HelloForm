import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { buildApp } from '../src/server.js';
import { resetAndMigrate } from './helpers/db.js';

const adminHeaders = { 'x-user-role': 'tenant_admin', 'x-tenant-id': 'tenant-a' };

const officeConfig = {
  enabled: true,
  channels: ['chat', 'phone'],
  hours: { days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '23:59' },
  contactLabel: 'Mesa de ayuda'
};

describe('tenant help config and human handoff', () => {
  const app = buildApp();

  beforeAll(async () => {
    await resetAndMigrate();
  });

  beforeEach(async () => {
    await prisma.handoffRequest.deleteMany();
    await prisma.tenantHelpConfig.deleteMany();
    await prisma.formAnswer.deleteMany();
    await prisma.formSession.deleteMany();
    await prisma.auditLog.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const putConfig = (tenantId: string, payload: unknown, headers: Record<string, string> = adminHeaders) =>
    app.inject({ method: 'PUT', url: `/tenants/${tenantId}/help-config`, headers, payload: payload as object });

  const createSession = async (sessionId = 's1', tenantId = 'tenant-a') => {
    await app.inject({
      method: 'POST',
      url: '/form-sessions',
      payload: { sessionId, tenantId, surveyId: 'survey-a', totalSteps: 3 }
    });
    await app.inject({
      method: 'POST',
      url: `/form-sessions/${sessionId}/fields/full_name`,
      payload: { value: 'Ana Perez', mode: 'voice', confirmed: true }
    });
  };

  describe('help config', () => {
    it('returns a disabled default when the tenant has no config', async () => {
      const response = await app.inject({ method: 'GET', url: '/tenants/tenant-a/help-config' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ enabled: false, channels: [], availableNow: false });
    });

    it('stores, updates and returns the config with availability', async () => {
      const created = await putConfig('tenant-a', officeConfig);
      expect(created.statusCode).toBe(200);

      const updated = await putConfig('tenant-a', { ...officeConfig, channels: ['in_person'], contactLabel: 'Local centro' });
      expect(updated.statusCode).toBe(200);

      const response = await app.inject({ method: 'GET', url: '/tenants/tenant-a/help-config' });
      expect(response.json()).toEqual({
        enabled: true,
        channels: ['in_person'],
        hours: officeConfig.hours,
        contactLabel: 'Local centro',
        availableNow: true
      });
      expect(await prisma.tenantHelpConfig.count({ where: { tenantId: 'tenant-a' } })).toBe(1);
    });

    it('clears hours and label when omitted on update', async () => {
      await putConfig('tenant-a', officeConfig);
      await putConfig('tenant-a', { enabled: true, channels: ['chat'] });
      const body = (await app.inject({ method: 'GET', url: '/tenants/tenant-a/help-config' })).json();
      expect(body).toEqual({ enabled: true, channels: ['chat'], availableNow: true });
    });

    it('rejects invalid config with 400', async () => {
      const response = await putConfig('tenant-a', { enabled: true, channels: ['fax'] });
      expect(response.statusCode).toBe(400);
    });

    it('requires admin role and tenant scope on PUT', async () => {
      const viewer = await putConfig('tenant-a', officeConfig, { 'x-user-role': 'viewer' });
      expect(viewer.statusCode).toBe(403);
      const wrongTenant = await putConfig('tenant-b', officeConfig, adminHeaders);
      expect(wrongTenant.statusCode).toBe(403);
    });

    it('writes an audit log entry on PUT', async () => {
      await putConfig('tenant-a', officeConfig);
      const logs = await prisma.auditLog.findMany({ where: { tenantId: 'tenant-a', action: 'help_config.upsert' } });
      expect(logs).toHaveLength(1);
    });
  });

  describe('handoff requests', () => {
    it('creates a request with the answers so far', async () => {
      await putConfig('tenant-a', officeConfig);
      await createSession();

      const response = await app.inject({
        method: 'POST',
        url: '/sessions/s1/handoff',
        payload: { channel: 'chat', reason: 'user_requested' }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        id: string;
        tenantId: string;
        sessionId: string;
        channel: string;
        reason: string;
        status: string;
        summary: { surveyId: string; currentStep: number; totalSteps: number; answers: Record<string, { value: unknown; confirmed: boolean }> };
      };
      expect(body).toMatchObject({ tenantId: 'tenant-a', sessionId: 's1', channel: 'chat', reason: 'user_requested', status: 'open' });
      expect(body.summary).toMatchObject({ surveyId: 'survey-a', currentStep: 0, totalSteps: 3 });
      expect(body.summary.answers.full_name).toMatchObject({ value: 'Ana Perez', confirmed: true });
    });

    it('returns 404 for an unknown session', async () => {
      await putConfig('tenant-a', officeConfig);
      const response = await app.inject({
        method: 'POST',
        url: '/sessions/nope/handoff',
        payload: { channel: 'chat', reason: 'user_requested' }
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 409 when the tenant has no human help enabled', async () => {
      await createSession();
      const response = await app.inject({
        method: 'POST',
        url: '/sessions/s1/handoff',
        payload: { channel: 'chat', reason: 'user_requested' }
      });
      expect(response.statusCode).toBe(409);
    });

    it('returns 400 for a channel the tenant does not offer or an invalid reason', async () => {
      await putConfig('tenant-a', officeConfig);
      await createSession();
      const badChannel = await app.inject({
        method: 'POST',
        url: '/sessions/s1/handoff',
        payload: { channel: 'in_person', reason: 'user_requested' }
      });
      expect(badChannel.statusCode).toBe(400);
      const badReason = await app.inject({
        method: 'POST',
        url: '/sessions/s1/handoff',
        payload: { channel: 'chat', reason: 'because' }
      });
      expect(badReason.statusCode).toBe(400);
    });

    it('does not duplicate: a second request for the same session while open returns the existing one', async () => {
      await putConfig('tenant-a', officeConfig);
      await createSession();
      const first = await app.inject({ method: 'POST', url: '/sessions/s1/handoff', payload: { channel: 'chat', reason: 'user_requested' } });
      const second = await app.inject({ method: 'POST', url: '/sessions/s1/handoff', payload: { channel: 'phone', reason: 'high_friction' } });
      expect((second.json() as { id: string }).id).toBe((first.json() as { id: string }).id);
      expect(await prisma.handoffRequest.count()).toBe(1);
    });

    it('lists only open handoffs for the tenant, newest first, and requires admin', async () => {
      await putConfig('tenant-a', officeConfig);
      await putConfig('tenant-b', officeConfig, { 'x-user-role': 'platform_admin' });
      await createSession('s1', 'tenant-a');
      await createSession('s2', 'tenant-a');
      await createSession('s3', 'tenant-b');

      await app.inject({ method: 'POST', url: '/sessions/s1/handoff', payload: { channel: 'chat', reason: 'user_requested' } });
      await app.inject({ method: 'POST', url: '/sessions/s2/handoff', payload: { channel: 'phone', reason: 'sensitive_field' } });
      await app.inject({ method: 'POST', url: '/sessions/s3/handoff', payload: { channel: 'chat', reason: 'high_friction' } });
      await prisma.handoffRequest.updateMany({ where: { sessionId: 's1' }, data: { status: 'resolved' } });

      const response = await app.inject({ method: 'GET', url: '/tenants/tenant-a/handoffs', headers: adminHeaders });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: Array<{ sessionId: string; summary: { answers: object } }>; total: number };
      expect(body.total).toBe(1);
      expect(body.items.map((i) => i.sessionId)).toEqual(['s2']);
      expect(body.items[0]?.summary.answers).toHaveProperty('full_name');

      const forbidden = await app.inject({ method: 'GET', url: '/tenants/tenant-a/handoffs', headers: { 'x-user-role': 'viewer' } });
      expect(forbidden.statusCode).toBe(403);
      const wrongTenant = await app.inject({ method: 'GET', url: '/tenants/tenant-b/handoffs', headers: adminHeaders });
      expect(wrongTenant.statusCode).toBe(403);
    });
  });
});
