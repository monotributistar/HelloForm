export type ContextLevel = 'survey' | 'group' | 'field';

export interface ContextBlock {
  level: ContextLevel;
  hints: string[];
  rules: string[];
  examples: string[];
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
  examples: asStringArray(source?.examples)
});

export const normalizeSurveyContext = (input: SurveyContextInput): NormalizedSurveyContext => {
  return {
    survey: createBlock('survey', input.surveyContext),
    group: createBlock('group', input.groupContext),
    field: createBlock('field', input.fieldContext)
  };
};
