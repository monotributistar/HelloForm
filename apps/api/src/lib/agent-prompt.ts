import {
  decideHandoff,
  describeProfileForPrompt,
  type CommProfile,
  type HumanHelpConfig
} from '@helloform/domain';

export interface AgentFieldContext {
  fieldId: string;
  fieldLabel: string;
  fieldType: string;
  required: boolean;
  fieldHints?: string[];
  fieldRules?: string[];
  fieldExamples?: string[];
  /** Why the data is asked and what happens next. */
  fieldExplanations?: string[];
  /** Where to find the data (e.g. on a document). */
  fieldExampleHelp?: string[];
  /** Contracts, signatures and similar: eligible for human handoff. */
  sensitive?: boolean;
}

export interface AgentSurveyContext {
  surveyName: string;
  surveyGoal?: string;
  surveyHints?: string[];
  groupName?: string;
  groupHints?: string[];
  surveyExplanations?: string[];
  groupExplanations?: string[];
}

export interface AgentPromptInput {
  locale?: string;
  userMessage: string;
  attempts: number;
  frustrationScore: number;
  survey: AgentSurveyContext;
  field: AgentFieldContext;
  commProfile?: CommProfile;
  humanHelp?: HumanHelpConfig;
  userAskedForPerson?: boolean;
  /** Clock override for tests. */
  now?: Date;
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
  const decision = decideHandoff(
    {
      attempts: input.attempts,
      frustrationScore: input.frustrationScore,
      userAskedForPerson: input.userAskedForPerson,
      fieldSensitive: input.field.sensitive
    },
    input.humanHelp,
    input.now
  );
  const join = (items: string[] | undefined) => (items ?? []).join(' | ') || 'None';
  const handoffLine =
    decision.strategy === 'handoff_to_human' && decision.handoffChannel
      ? `Offer to connect the person with a human via ${decision.handoffChannel}${
          input.humanHelp?.contactLabel ? ` (${input.humanHelp.contactLabel})` : ''
        }. Keep what was already answered; do not ask again.`
      : undefined;

  return [
    'You are a form completion assistant inside a guided wizard.',
    'Primary objective: maximize completion, accuracy, and accessibility.',
    'Never invent values. If uncertain, ask a clarifying question.',
    'Ask one question at a time and keep messages brief.',
    'Explain why the data is needed and what happens next, and say where to find it when you know. Do not only ask.',
    'Always support commands: next, back, repeat, help, correct.',
    'When handling sensitive fields, confirm value before save.',
    `Locale: ${input.commProfile?.language ?? input.locale ?? 'es-AR'}.`,
    ...(input.commProfile ? [describeProfileForPrompt(input.commProfile)] : []),
    `Strategy: ${decision.strategy}.`,
    ...(handoffLine ? [handoffLine] : []),
    toneGuide(input.attempts, input.frustrationScore),
    `Survey: ${input.survey.surveyName}. Goal: ${input.survey.surveyGoal ?? 'Collect required data correctly.'}`,
    `Survey explanations: ${join(input.survey.surveyExplanations)}.`,
    `Group: ${input.survey.groupName ?? 'General'}.`,
    `Group explanations: ${join(input.survey.groupExplanations)}.`,
    `Field: ${input.field.fieldLabel} (${input.field.fieldType}), required=${String(input.field.required)}.`,
    `Field rules: ${(input.field.fieldRules ?? []).join(' | ') || 'None'}.`,
    `Field hints: ${(input.field.fieldHints ?? []).join(' | ') || 'None'}.`,
    `Field examples: ${(input.field.fieldExamples ?? []).join(' | ') || 'None'}.`,
    `Field explanations: ${join(input.field.fieldExplanations)}.`,
    `Where to find it: ${join(input.field.fieldExampleHelp)}.`,
    'Output MUST be JSON with keys: assistant_message, intent, confidence, should_save, normalized_value, requires_confirmation.'
  ].join('\n');
};
