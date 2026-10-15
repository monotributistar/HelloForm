export type ContextLevel = 'survey' | 'group' | 'field';

export interface ContextBlock {
  level: ContextLevel;
  hints: string[];
  rules: string[];
  examples: string[];
  /** Why the data is asked and what happens next; the agent explains instead of only asking. */
  explanations: string[];
  /** Where to find the data (e.g. on a document); concrete help for a specific field. */
  exampleHelp: string[];
}

export interface SurveyContextInput {
  surveyContext?: Record<string, unknown>;
  groupContext?: Record<string, unknown>;
  fieldContext?: Record<string, unknown>;
}

export interface NormalizedSurveyContext {
  survey: ContextBlock;
  group: ContextBlock;
  field: ContextBlock;
}

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const createBlock = (level: ContextLevel, source: Record<string, unknown> | undefined): ContextBlock => ({
  level,
  hints: asStringArray(source?.hints),
  rules: asStringArray(source?.rules),
  examples: asStringArray(source?.examples),
  explanations: asStringArray(source?.explanations),
  exampleHelp: asStringArray(source?.exampleHelp)
});

export const normalizeSurveyContext = (input: SurveyContextInput): NormalizedSurveyContext => {
  return {
    survey: createBlock('survey', input.surveyContext),
    group: createBlock('group', input.groupContext),
    field: createBlock('field', input.fieldContext)
  };
};
