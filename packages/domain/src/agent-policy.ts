export interface AgentTurnState {
  attempts: number;
  frustrationScore: number;
}

export type AgentStrategy =
  | 'normal_guidance'
  | 'concise_rephrase'
  | 'offer_manual_fallback'
  | 'handoff_human_or_save_partial';

export interface AgentDecision {
  strategy: AgentStrategy;
  maxNextAttempts: number;
  shouldEscalate: boolean;
}

export const decideNextStep = (state: AgentTurnState): AgentDecision => {
  if (state.attempts >= 5 || state.frustrationScore >= 0.9) {
    return {
      strategy: 'handoff_human_or_save_partial',
      maxNextAttempts: state.attempts,
      shouldEscalate: true
    };
  }

  if (state.attempts >= 3 || state.frustrationScore >= 0.7) {
    return {
      strategy: 'offer_manual_fallback',
      maxNextAttempts: 5,
      shouldEscalate: false
    };
  }

  if (state.attempts >= 2 || state.frustrationScore >= 0.4) {
    return {
      strategy: 'concise_rephrase',
      maxNextAttempts: 4,
      shouldEscalate: false
    };
  }

  return {
    strategy: 'normal_guidance',
    maxNextAttempts: 3,
    shouldEscalate: false
  };
};
