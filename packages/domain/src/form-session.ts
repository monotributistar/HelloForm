export type InputMode = 'manual' | 'chat' | 'voice';

export interface FormSessionFieldState {
  fieldId: string;
  value?: unknown;
  mode?: InputMode;
  attempts: number;
  confirmed: boolean;
}

export interface FormSessionState {
  sessionId: string;
  surveyId: string;
  currentStep: number;
  totalSteps: number;
  completed: boolean;
  fields: Record<string, FormSessionFieldState>;
}

export interface SaveFieldInput {
  fieldId: string;
  value: unknown;
  mode: InputMode;
  confirmed: boolean;
}

export const createFormSession = (
  sessionId: string,
  surveyId: string,
  totalSteps: number
): FormSessionState => ({
  sessionId,
  surveyId,
  totalSteps,
  currentStep: 0,
  completed: false,
  fields: {}
});

export const nextStep = (state: FormSessionState): FormSessionState => {
  if (state.currentStep >= state.totalSteps - 1) {
    return {
      ...state,
      currentStep: state.totalSteps - 1,
      completed: true
    };
  }

  return {
    ...state,
    currentStep: state.currentStep + 1
  };
};

export const previousStep = (state: FormSessionState): FormSessionState => ({
  ...state,
  currentStep: Math.max(0, state.currentStep - 1),
  completed: false
});

export const saveFieldValue = (state: FormSessionState, input: SaveFieldInput): FormSessionState => {
  const previous = state.fields[input.fieldId];
  const attempts = (previous?.attempts ?? 0) + 1;

  return {
    ...state,
    fields: {
      ...state.fields,
      [input.fieldId]: {
        fieldId: input.fieldId,
        value: input.value,
        mode: input.mode,
        attempts,
        confirmed: input.confirmed
      }
    }
  };
};

export const correctFieldValue = (state: FormSessionState, input: SaveFieldInput): FormSessionState => {
  return saveFieldValue(state, input);
};
