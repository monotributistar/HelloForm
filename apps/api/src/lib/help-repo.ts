import {
  isHumanHelpAvailable,
  parseHumanHelpConfig,
  type HandoffReason,
  type HelpChannel,
  type HumanHelpConfig
} from '@helloform/domain';
import { prisma } from './prisma.js';
import { sessionRepo, type SessionView } from './session-repo.js';

export const HANDOFF_REASONS: HandoffReason[] = ['user_requested', 'high_friction', 'sensitive_field'];

export interface HelpConfigView extends HumanHelpConfig {
  availableNow: boolean;
}

export interface HandoffSummary {
  surveyId: string;
  currentStep: number;
  totalSteps: number;
  completed: boolean;
  answers: SessionView['fields'];
}

export interface HandoffView {
  id: string;
  tenantId: string;
  sessionId: string;
  channel: HelpChannel;
  reason: HandoffReason;
  status: string;
  summary: HandoffSummary;
  createdAt: Date;
}

const toConfig = (row: {
  enabled: boolean;
  channelsJson: string;
  hoursJson: string | null;
  contactLabel: string | null;
}): HumanHelpConfig => {
  const parsed = parseHumanHelpConfig({
    enabled: row.enabled,
    channels: JSON.parse(row.channelsJson),
    hours: row.hoursJson ? JSON.parse(row.hoursJson) : undefined,
    contactLabel: row.contactLabel ?? undefined
  });
  return parsed.ok ? parsed.value : { enabled: false, channels: [] };
};

const toHandoffView = (row: {
  id: string;
  tenantId: string;
  sessionId: string;
  channel: string;
  reason: string;
  status: string;
  summaryJson: string;
  createdAt: Date;
}): HandoffView => ({
  id: row.id,
  tenantId: row.tenantId,
  sessionId: row.sessionId,
  channel: row.channel as HelpChannel,
  reason: row.reason as HandoffReason,
  status: row.status,
  summary: JSON.parse(row.summaryJson) as HandoffSummary,
  createdAt: row.createdAt
});

export const helpConfigRepo = {
  async get(tenantId: string): Promise<HumanHelpConfig> {
    const row = await prisma.tenantHelpConfig.findUnique({ where: { tenantId } });
    return row ? toConfig(row) : { enabled: false, channels: [] };
  },

  async getView(tenantId: string, now: Date = new Date()): Promise<HelpConfigView> {
    const config = await helpConfigRepo.get(tenantId);
    return { ...config, availableNow: isHumanHelpAvailable(config, now) };
  },

  async upsert(tenantId: string, config: HumanHelpConfig): Promise<HelpConfigView> {
    const data = {
      enabled: config.enabled,
      channelsJson: JSON.stringify(config.channels),
      hoursJson: config.hours ? JSON.stringify(config.hours) : null,
      contactLabel: config.contactLabel ?? null
    };
    await prisma.tenantHelpConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data
    });
    return helpConfigRepo.getView(tenantId);
  }
};

export const handoffRepo = {
  /** One open request per session: a repeat call returns the existing one. */
  async create(session: SessionView, channel: HelpChannel, reason: HandoffReason): Promise<HandoffView> {
    const existing = await prisma.handoffRequest.findFirst({
      where: { sessionId: session.sessionId, status: 'open' }
    });
    if (existing) return toHandoffView(existing);

    const summary: HandoffSummary = {
      surveyId: session.surveyId,
      currentStep: session.currentStep,
      totalSteps: session.totalSteps,
      completed: session.completed,
      answers: session.fields
    };
    const created = await prisma.handoffRequest.create({
      data: {
        tenantId: session.tenantId,
        sessionId: session.sessionId,
        channel,
        reason,
        summaryJson: JSON.stringify(summary)
      }
    });
    return toHandoffView(created);
  },

  async listOpen(tenantId: string, skip: number, take: number): Promise<{ items: HandoffView[]; total: number }> {
    const where = { tenantId, status: 'open' };
    const [rows, total] = await Promise.all([
      prisma.handoffRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.handoffRequest.count({ where })
    ]);
    return { items: rows.map(toHandoffView), total };
  }
};
