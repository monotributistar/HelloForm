import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { normalizeSurveyContext, type InputMode } from '@helloform/domain';
import { HuggingFaceProvider } from '@helloform/ai-gateway';
import { prisma } from './lib/prisma.js';
import { sessionRepo } from './lib/session-repo.js';
import { usageLogRepo } from './lib/usage-log-repo.js';
import { estimateCostUsdWithUnitPrice, type OperationType } from './lib/costs.js';
import { metricsRepo } from './lib/metrics-repo.js';
import { pricingRepo } from './lib/pricing-repo.js';
import { runAgentTurn } from './lib/agent-orchestrator.js';
import { callHFStt, callHFTts, hfConfigFromEnv } from './lib/hf-services.js';

export function buildApp() {
  const app = Fastify({ logger: true });

  const audit = (tenantId: string, actorEmail: string, action: string, resource: string, resourceId: string, payload: unknown) =>
    prisma.auditLog.create({
      data: { tenantId, actorEmail, action, resource, resourceId, payload: JSON.stringify(payload) }
    });

  const authContext = (request: FastifyRequest) => {
    const role = String(request.headers['x-user-role'] ?? 'tenant_admin');
    const actorEmail = String(request.headers['x-actor-email'] ?? 'backoffice@system');
    const tenantHeader = String(request.headers['x-tenant-id'] ?? '');
    return { role, actorEmail, tenantHeader };
  };

  const requireAdmin = (
    request: FastifyRequest,
    reply: FastifyReply,
    tenantId: string
  ): { actorEmail: string } | null => {
    const { role, actorEmail, tenantHeader } = authContext(request);
    if (!['platform_admin', 'tenant_admin'].includes(role)) {
      reply.status(403).send({ error: 'Admin role required' });
      return null;
    }

    if (role !== 'platform_admin' && tenantHeader && tenantHeader !== tenantId) {
      reply.status(403).send({ error: 'Tenant scope mismatch' });
      return null;
    }

    return { actorEmail };
  };

  const listParams = (query: { page?: string; pageSize?: string }) => {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const skip = (page - 1) * pageSize;
    return { page, pageSize, skip };
  };

  app.get('/health', async () => ({ ok: true }));

  app.post('/agent/next-turn', async (request) => {
    const body = request.body as {
      locale?: string;
      userMessage: string;
      attempts: number;
      frustrationScore: number;
      survey: {
        surveyName: string;
        surveyGoal?: string;
        surveyHints?: string[];
        groupName?: string;
        groupHints?: string[];
      };
      field: {
        fieldId: string;
        fieldLabel: string;
        fieldType: string;
        required: boolean;
        fieldHints?: string[];
        fieldRules?: string[];
        fieldExamples?: string[];
      };
    };

    return runAgentTurn(fetch, body);
  });

  app.post('/agent/stt', async (request) => {
    const body = request.body as {
      audioBase64: string;
      language?: string;
      task?: string;
    };
    const cfg = hfConfigFromEnv();
    const response = await callHFStt(fetch, cfg, body.audioBase64, body.language ?? 'es', body.task ?? 'transcribe');
    return {
      transcript: String(response.data?.[0] ?? ''),
      details: response.data?.[1] ?? null
    };
  });

  app.post('/agent/tts', async (request) => {
    const body = request.body as {
      refAudioBase64: string;
      text: string;
      refText?: string;
    };
    const cfg = hfConfigFromEnv();
    const response = await callHFTts(fetch, cfg, body.refAudioBase64, body.text, body.refText ?? '');
    return {
      audio: response.data?.[0] ?? null
    };
  });

  app.post('/survey-context/normalize', async (request) => {
    const body = request.body as {
      surveyContext?: Record<string, unknown>;
      groupContext?: Record<string, unknown>;
      fieldContext?: Record<string, unknown>;
    };

    return normalizeSurveyContext(body);
  });

  app.post('/tenant-users', async (request, reply) => {
    const body = request.body as { tenantId: string; email: string; name: string; role: string };
    const auth = requireAdmin(request, reply, body.tenantId);
    if (!auth) return;

    const created = await prisma.tenantUser.upsert({
      where: { tenantId_email: { tenantId: body.tenantId, email: body.email } },
      create: { tenantId: body.tenantId, email: body.email, name: body.name, role: body.role },
      update: { name: body.name, role: body.role, active: true }
    });

    await audit(body.tenantId, auth.actorEmail, 'tenant_user.upsert', 'tenant_user', created.id, body);
    return created;
  });

  app.patch('/tenant-users/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = request.body as {
      tenantId: string;
      name?: string;
      role?: string;
      active?: boolean;
      expectedUpdatedAt?: string;
    };

    const auth = requireAdmin(request, reply, body.tenantId);
    if (!auth) return;

    const existing = await prisma.tenantUser.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Tenant user not found' });

    if (body.expectedUpdatedAt && existing.updatedAt.toISOString() !== body.expectedUpdatedAt) {
      return reply.status(409).send({ error: 'Conflict: stale tenant user update' });
    }

    const updated = await prisma.tenantUser.update({
      where: { id },
      data: {
        name: body.name,
        role: body.role,
        active: body.active
      }
    });

    await audit(body.tenantId, auth.actorEmail, 'tenant_user.update', 'tenant_user', id, body);
    return updated;
  });

  app.get('/tenant-users', async (request) => {
    const query = request.query as { tenantId: string; page?: string; pageSize?: string; q?: string };
    const { page, pageSize, skip } = listParams(query);

    const where = {
      tenantId: query.tenantId,
      OR: query.q
        ? [
            { email: { contains: query.q } },
            { name: { contains: query.q } },
            { role: { contains: query.q } }
          ]
        : undefined
    };

    const [items, total] = await Promise.all([
      prisma.tenantUser.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
      prisma.tenantUser.count({ where })
    ]);

    return { items, total, page, pageSize };
  });

  app.post('/campaigns', async (request, reply) => {
    const body = request.body as { tenantId: string; name: string; status?: string };
    const auth = requireAdmin(request, reply, body.tenantId);
    if (!auth) return;

    const created = await prisma.campaign.create({
      data: { tenantId: body.tenantId, name: body.name, status: body.status ?? 'draft' }
    });
    await audit(body.tenantId, auth.actorEmail, 'campaign.create', 'campaign', created.id, body);
    return created;
  });

  app.patch('/campaigns/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = request.body as { tenantId: string; name?: string; status?: string; expectedUpdatedAt?: string };
    const auth = requireAdmin(request, reply, body.tenantId);
    if (!auth) return;

    const existing = await prisma.campaign.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Campaign not found' });

    if (body.expectedUpdatedAt && existing.updatedAt.toISOString() !== body.expectedUpdatedAt) {
      return reply.status(409).send({ error: 'Conflict: stale campaign update' });
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: { name: body.name, status: body.status }
    });

    await audit(body.tenantId, auth.actorEmail, 'campaign.update', 'campaign', id, body);
    return updated;
  });

  app.get('/campaigns', async (request) => {
    const query = request.query as { tenantId: string; page?: string; pageSize?: string; q?: string };
    const { page, pageSize, skip } = listParams(query);

    const where = {
      tenantId: query.tenantId,
      OR: query.q
        ? [
            { name: { contains: query.q } },
            { status: { contains: query.q } }
          ]
        : undefined
    };

    const [items, total] = await Promise.all([
      prisma.campaign.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
      prisma.campaign.count({ where })
    ]);

    return { items, total, page, pageSize };
  });

  app.post('/surveys', async (request, reply) => {
    const body = request.body as {
      tenantId: string;
      campaignId?: string;
      name: string;
      status?: string;
    };

    const auth = requireAdmin(request, reply, body.tenantId);
    if (!auth) return;

    const created = await prisma.survey.create({
      data: {
        tenantId: body.tenantId,
        campaignId: body.campaignId,
        name: body.name,
        status: body.status ?? 'draft'
      }
    });

    await audit(body.tenantId, auth.actorEmail, 'survey.create', 'survey', created.id, body);
    return created;
  });

  app.patch('/surveys/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = request.body as {
      tenantId: string;
      campaignId?: string | null;
      name?: string;
      status?: string;
      expectedUpdatedAt?: string;
    };

    const auth = requireAdmin(request, reply, body.tenantId);
    if (!auth) return;

    const existing = await prisma.survey.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Survey not found' });

    if (body.expectedUpdatedAt && existing.updatedAt.toISOString() !== body.expectedUpdatedAt) {
      return reply.status(409).send({ error: 'Conflict: stale survey update' });
    }

    const updated = await prisma.survey.update({
      where: { id },
      data: {
        campaignId: body.campaignId,
        name: body.name,
        status: body.status
      }
    });

    await audit(body.tenantId, auth.actorEmail, 'survey.update', 'survey', id, body);
    return updated;
  });

  app.get('/surveys', async (request) => {
    const query = request.query as {
      tenantId: string;
      campaignId?: string;
      page?: string;
      pageSize?: string;
      q?: string;
    };

    const { page, pageSize, skip } = listParams(query);

    const where = {
      tenantId: query.tenantId,
      campaignId: query.campaignId,
      OR: query.q
        ? [
            { name: { contains: query.q } },
            { status: { contains: query.q } }
          ]
        : undefined
    };

    const [items, total] = await Promise.all([
      prisma.survey.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
      prisma.survey.count({ where })
    ]);

    return { items, total, page, pageSize };
  });

  app.get('/audit-logs', async (request) => {
    const query = request.query as { tenantId: string; action?: string; q?: string; page?: string; pageSize?: string };
    const { page, pageSize, skip } = listParams(query);

    const where = {
      tenantId: query.tenantId,
      action: query.action,
      OR: query.q
        ? [
            { actorEmail: { contains: query.q } },
            { action: { contains: query.q } },
            { resource: { contains: query.q } },
            { resourceId: { contains: query.q } }
          ]
        : undefined
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
      prisma.auditLog.count({ where })
    ]);

    return { items, total, page, pageSize };
  });

  app.post('/form-sessions', async (request) => {
    const body = request.body as {
      sessionId: string;
      tenantId: string;
      surveyId: string;
      totalSteps: number;
    };

    return sessionRepo.create(body.sessionId, body.tenantId, body.surveyId, body.totalSteps);
  });

  app.get('/form-sessions/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const current = await sessionRepo.get(id);
    if (!current) return reply.status(404).send({ error: 'Session not found' });
    return current;
  });

  app.post('/form-sessions/:id/next', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const updated = await sessionRepo.next(id);
    if (!updated) return reply.status(404).send({ error: 'Session not found' });
    return updated;
  });

  app.post('/form-sessions/:id/back', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const updated = await sessionRepo.back(id);
    if (!updated) return reply.status(404).send({ error: 'Session not found' });
    return updated;
  });

  app.post('/form-sessions/:id/fields/:fieldId', async (request, reply) => {
    const { id, fieldId } = request.params as { id: string; fieldId: string };
    const body = request.body as { value: unknown; mode: InputMode; confirmed: boolean };
    const updated = await sessionRepo.saveField(id, fieldId, body.value, body.mode, body.confirmed);

    if (!updated) return reply.status(404).send({ error: 'Session not found' });
    return updated;
  });

  app.post('/pricing-rules', async (request, reply) => {
    const body = request.body as {
      tenantId: string;
      provider: 'openai' | 'huggingface';
      model: string;
      operation: OperationType;
      usdPer1kUnits: number;
    };

    const auth = requireAdmin(request, reply, body.tenantId);
    if (!auth) return;

    const upserted = await pricingRepo.upsertTenantRule(body);
    await audit(body.tenantId, auth.actorEmail, 'pricing_rule.upsert', 'pricing_rule', upserted.id, body);
    return upserted;
  });

  app.post('/ai/usage-logs', async (request) => {
    const body = request.body as {
      tenantId: string;
      sessionId?: string;
      campaignId?: string;
      surveyId?: string;
      provider: 'openai' | 'huggingface';
      model: string;
      operation: OperationType;
      units: number;
      estimatedCostUsd?: number;
      latencyMs?: number;
    };

    const unitPrice = await pricingRepo.resolvePrice({
      tenantId: body.tenantId,
      provider: body.provider,
      model: body.model,
      operation: body.operation
    });

    const estimatedCostUsd =
      body.estimatedCostUsd ?? estimateCostUsdWithUnitPrice(body.units, unitPrice);

    return usageLogRepo.create({ ...body, estimatedCostUsd });
  });

  app.get('/ai/usage-logs', async (request) => {
    const query = request.query as { tenantId?: string; sessionId?: string; limit?: string };
    return usageLogRepo.list({
      tenantId: query.tenantId,
      sessionId: query.sessionId,
      limit: Number(query.limit ?? 100)
    });
  });

  app.get('/metrics/tenant/:tenantId', async (request) => {
    const { tenantId } = request.params as { tenantId: string };
    const query = request.query as { surveyId?: string };
    return usageLogRepo.aggregate(tenantId, query.surveyId);
  });

  app.get('/metrics/tenant/:tenantId/daily', async (request) => {
    const { tenantId } = request.params as { tenantId: string };
    const query = request.query as { surveyId?: string; days?: string };
    return metricsRepo.dailyUsage(tenantId, query.surveyId, Number(query.days ?? 7));
  });

  app.get('/metrics/tenant/:tenantId/survey/:surveyId/fields', async (request) => {
    const { tenantId, surveyId } = request.params as { tenantId: string; surveyId: string };
    return usageLogRepo.fieldFriction(tenantId, surveyId);
  });

  app.post('/ai/providers/hf/generate', async (request) => {
    const body = request.body as {
      tenantId: string;
      sessionId?: string;
      campaignId?: string;
      surveyId?: string;
      input: string;
      modelRef?: string;
    };

    const model = body.modelRef ?? 'distilbert-base-uncased';
    const provider = new HuggingFaceProvider({
      apiKey: process.env.HF_API_KEY ?? 'placeholder',
      modelRef: model
    });

    const start = Date.now();
    const output = await provider.generateText(body.input);
    const latencyMs = Date.now() - start;
    const unitPrice = await pricingRepo.resolvePrice({
      tenantId: body.tenantId,
      provider: 'huggingface',
      model,
      operation: 'generate_text'
    });

    await usageLogRepo.create({
      tenantId: body.tenantId,
      sessionId: body.sessionId,
      campaignId: body.campaignId,
      surveyId: body.surveyId,
      provider: 'huggingface',
      model,
      operation: 'generate_text',
      units: body.input.length,
      estimatedCostUsd: estimateCostUsdWithUnitPrice(body.input.length, unitPrice),
      latencyMs
    });

    return { output, latencyMs };
  });

  app.post('/ai/providers/hf/transcribe', async (request) => {
    const body = request.body as {
      tenantId: string;
      sessionId?: string;
      campaignId?: string;
      surveyId?: string;
      audioBase64: string;
      modelRef?: string;
    };

    const model = body.modelRef ?? 'openai/whisper-small';
    const provider = new HuggingFaceProvider({
      apiKey: process.env.HF_API_KEY ?? 'placeholder',
      modelRef: model
    });

    const start = Date.now();
    const nodeBuffer = Buffer.from(body.audioBase64, 'base64');
    const buffer = nodeBuffer.buffer.slice(
      nodeBuffer.byteOffset,
      nodeBuffer.byteOffset + nodeBuffer.byteLength
    ) as ArrayBuffer;

    const output = await provider.transcribeAudio(buffer, { model });
    const latencyMs = Date.now() - start;
    const unitPrice = await pricingRepo.resolvePrice({
      tenantId: body.tenantId,
      provider: 'huggingface',
      model,
      operation: 'transcribe_audio'
    });

    await usageLogRepo.create({
      tenantId: body.tenantId,
      sessionId: body.sessionId,
      campaignId: body.campaignId,
      surveyId: body.surveyId,
      provider: 'huggingface',
      model,
      operation: 'transcribe_audio',
      units: body.audioBase64.length,
      estimatedCostUsd: estimateCostUsdWithUnitPrice(body.audioBase64.length, unitPrice),
      latencyMs
    });

    return { output, latencyMs };
  });

  app.get('/ai/providers/hf/capabilities', async () => {
    const provider = new HuggingFaceProvider({
      apiKey: 'placeholder',
      modelRef: 'distilbert-base-uncased'
    });
    return provider.capabilities();
  });

  return app;
}

const app = buildApp();

const start = async () => {
  try {
    await pricingRepo.seedDefaults();
    await app.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') {
  void start();
}

const shutdown = async () => {
  await prisma.$disconnect();
};

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});

export { app };
