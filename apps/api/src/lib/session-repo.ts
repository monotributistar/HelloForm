import type { InputMode } from '@helloform/domain';
import { prisma } from './prisma.js';

export interface SessionView {
  sessionId: string;
  tenantId: string;
  surveyId: string;
  currentStep: number;
  totalSteps: number;
  completed: boolean;
  fields: Record<string, { value?: unknown; mode?: InputMode; attempts: number; confirmed: boolean }>;
}

const toView = async (sessionId: string): Promise<SessionView | null> => {
  const session = await prisma.formSession.findUnique({
    where: { id: sessionId },
    include: { answers: true }
  });
  if (!session) return null;

  const fields: SessionView['fields'] = {};
  for (const answer of session.answers) {
    fields[answer.fieldId] = {
      value: JSON.parse(answer.valueJson),
      mode: answer.mode as InputMode,
      attempts: answer.attempts,
      confirmed: answer.confirmed
    };
  }

  return {
    sessionId: session.id,
    tenantId: session.tenantId,
    surveyId: session.surveyId,
    currentStep: session.currentStep,
    totalSteps: session.totalSteps,
    completed: session.completed,
    fields
  };
};

export const sessionRepo = {
  async create(sessionId: string, tenantId: string, surveyId: string, totalSteps: number): Promise<SessionView> {
    await prisma.formSession.upsert({
      where: { id: sessionId },
      create: { id: sessionId, tenantId, surveyId, totalSteps },
      update: {}
    });
    return (await toView(sessionId)) as SessionView;
  },

  async get(sessionId: string): Promise<SessionView | null> {
    return toView(sessionId);
  },

  async next(sessionId: string): Promise<SessionView | null> {
    const current = await prisma.formSession.findUnique({ where: { id: sessionId } });
    if (!current) return null;
    const nextStep = Math.min(current.currentStep + 1, current.totalSteps - 1);
    await prisma.formSession.update({
      where: { id: sessionId },
      data: {
        currentStep: nextStep,
        completed: nextStep === current.totalSteps - 1
      }
    });
    return toView(sessionId);
  },

  async back(sessionId: string): Promise<SessionView | null> {
    const current = await prisma.formSession.findUnique({ where: { id: sessionId } });
    if (!current) return null;
    const prev = Math.max(0, current.currentStep - 1);
    await prisma.formSession.update({
      where: { id: sessionId },
      data: {
        currentStep: prev,
        completed: false
      }
    });
    return toView(sessionId);
  },

  async saveField(
    sessionId: string,
    fieldId: string,
    value: unknown,
    mode: InputMode,
    confirmed: boolean
  ): Promise<SessionView | null> {
    const existing = await prisma.formAnswer.findUnique({
      where: { sessionId_fieldId: { sessionId, fieldId } }
    });

    await prisma.formAnswer.upsert({
      where: { sessionId_fieldId: { sessionId, fieldId } },
      create: {
        sessionId,
        fieldId,
        valueJson: JSON.stringify(value),
        mode,
        confirmed,
        attempts: 1
      },
      update: {
        valueJson: JSON.stringify(value),
        mode,
        confirmed,
        attempts: (existing?.attempts ?? 0) + 1
      }
    });

    return toView(sessionId);
  }
};
