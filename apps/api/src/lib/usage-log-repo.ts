import { prisma } from './prisma.js';

export interface UsageLogInput {
  tenantId: string;
  sessionId?: string;
  campaignId?: string;
  surveyId?: string;
  provider: 'openai' | 'huggingface';
  model: string;
  operation: 'generate_text' | 'extract_structured' | 'transcribe_audio';
  units: number;
  estimatedCostUsd: number;
  latencyMs?: number;
}

export const usageLogRepo = {
  create(input: UsageLogInput) {
    return prisma.aIUsageLog.create({ data: input });
  },

  list(filters: { tenantId?: string; sessionId?: string; limit?: number }) {
    return prisma.aIUsageLog.findMany({
      where: {
        tenantId: filters.tenantId,
        sessionId: filters.sessionId
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 100
    });
  },

  async aggregate(tenantId: string, surveyId?: string) {
    const where = { tenantId, surveyId };
    const [totalLogs, totalCost, operations, avgLatency] = await Promise.all([
      prisma.aIUsageLog.count({ where }),
      prisma.aIUsageLog.aggregate({ where, _sum: { estimatedCostUsd: true } }),
      prisma.aIUsageLog.groupBy({ by: ['operation'], where, _count: { operation: true } }),
      prisma.aIUsageLog.aggregate({ where, _avg: { latencyMs: true } })
    ]);

    const completedSessions = await prisma.formSession.count({ where: { tenantId, completed: true, surveyId } });
    const totalSessions = await prisma.formSession.count({ where: { tenantId, surveyId } });

    return {
      tenantId,
      surveyId,
      totalLogs,
      totalCostUsd: totalCost._sum.estimatedCostUsd ?? 0,
      avgLatencyMs: avgLatency._avg.latencyMs ?? 0,
      completionRate: totalSessions === 0 ? 0 : completedSessions / totalSessions,
      operations: operations.map((item) => ({ operation: item.operation, count: item._count.operation }))
    };
  },

  async fieldFriction(tenantId: string, surveyId: string) {
    const sessions = await prisma.formSession.findMany({
      where: { tenantId, surveyId },
      select: { id: true }
    });

    const sessionIds = sessions.map((s) => s.id);
    if (sessionIds.length === 0) return [];

    const answers = await prisma.formAnswer.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { fieldId: true, attempts: true, confirmed: true }
    });

    const grouped = new Map<string, { totalAttempts: number; total: number; confirmed: number }>();

    for (const answer of answers) {
      const current = grouped.get(answer.fieldId) ?? { totalAttempts: 0, total: 0, confirmed: 0 };
      current.totalAttempts += answer.attempts;
      current.total += 1;
      current.confirmed += answer.confirmed ? 1 : 0;
      grouped.set(answer.fieldId, current);
    }

    return [...grouped.entries()].map(([fieldId, data]) => ({
      fieldId,
      avgAttempts: data.total === 0 ? 0 : data.totalAttempts / data.total,
      confirmationRate: data.total === 0 ? 0 : data.confirmed / data.total,
      samples: data.total
    }));
  }
};
