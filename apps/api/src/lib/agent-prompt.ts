import { decideNextStep } from '@helloform/domain';

export interface AgentFieldContext {
  fieldId: string;
  fieldLabel: string;
  fieldType: string;
  required: boolean;
  fieldHints?: string[];
  fieldRules?: string[];
  fieldExamples?: string[];
}

export interface AgentSurveyContext {
  surveyName: string;
  surveyGoal?: string;
  surveyHints?: string[];
  groupName?: string;
  groupHints?: string[];
}

export interface AgentPromptInput {
  locale?: string;
  userMessage: string;
  attempts: number;
  frustrationScore: number;
  survey: AgentSurveyContext;
  field: AgentFieldContext;
}

const toneGuide = (attempts: number, frustrationScore: number): string => {
  if (attempts >= 3 || frustrationScore >= 0.7) {
    return 'Use very short, calm, non-judgmental sentences. Offer one simple alternative path.';
  }

  if (attempts >= 2 || frustrationScore >= 0.4) {
    return 'Use concise supportive tone. Rephrase with one concrete example.';
  }

  return 'Use clear, friendly, professional tone. Keep response short.';
};

export const buildSystemPrompt = (input: AgentPromptInput): string => {
  const decision = decideNextStep({ attempts: input.attempts, frustrationScore: input.frustrationScore });

  return [
    'You are a form completion assistant inside a guided wizard.',
    'Primary objective: maximize completion, accuracy, and accessibility.',
    'Never invent values. If uncertain, ask a clarifying question.',
    'Ask one question at a time and keep messages brief.',
    'Always support commands: next, back, repeat, help, correct.',
    'When handling sensitive fields, confirm value before save.',
    `Locale: ${input.locale ?? 'es-AR'}.`,
    `Strategy: ${decision.strategy}.`,
    toneGuide(input.attempts, input.frustrationScore),
    `Survey: ${input.survey.surveyName}. Goal: ${input.survey.surveyGoal ?? 'Collect required data correctly.'}`,
    `Group: ${input.survey.groupName ?? 'General'}.`,
    `Field: ${input.field.fieldLabel} (${input.field.fieldType}), required=${String(input.field.required)}.`,
    `Field rules: ${(input.field.fieldRules ?? []).join(' | ') || 'None'}.`,
    `Field hints: ${(input.field.fieldHints ?? []).join(' | ') || 'None'}.`,
    `Field examples: ${(input.field.fieldExamples ?? []).join(' | ') || 'None'}.`,
    'Output MUST be JSON with keys: assistant_message, intent, confidence, should_save, normalized_value, requires_confirmation.'
  ].join('\n');
};
