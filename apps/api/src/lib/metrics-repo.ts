import { prisma } from './prisma.js';

export const metricsRepo = {
  async dailyUsage(tenantId: string, surveyId?: string, days = 7) {
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - days);

    const logs = await prisma.aIUsageLog.findMany({
      where: {
        tenantId,
        surveyId,
        createdAt: { gte: from }
      },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        estimatedCostUsd: true,
        operation: true,
        units: true
      }
    });

    const byDay = new Map<string, { logs: number; costUsd: number; units: number; byOperation: Record<string, number> }>();

    for (const item of logs) {
      const day = item.createdAt.toISOString().slice(0, 10);
      const current = byDay.get(day) ?? { logs: 0, costUsd: 0, units: 0, byOperation: {} };
      current.logs += 1;
      current.costUsd += item.estimatedCostUsd;
      current.units += item.units;
      current.byOperation[item.operation] = (current.byOperation[item.operation] ?? 0) + 1;
      byDay.set(day, current);
    }

    return [...byDay.entries()].map(([day, value]) => ({
      day,
      logs: value.logs,
      costUsd: Number(value.costUsd.toFixed(8)),
      units: value.units,
      byOperation: value.byOperation
    }));
  }
};
