import { describe, expect, it } from 'vitest';
import { decideNextStep } from '../src/agent-policy.js';

describe('decideNextStep', () => {
  it('mantiene estrategia normal en baja friccion', () => {
    const result = decideNextStep({ attempts: 1, frustrationScore: 0.2 });

    expect(result.strategy).toBe('normal_guidance');
    expect(result.shouldEscalate).toBe(false);
  });

  it('reformula cuando suben intentos o temperatura', () => {
    const result = decideNextStep({ attempts: 2, frustrationScore: 0.45 });

    expect(result.strategy).toBe('concise_rephrase');
    expect(result.maxNextAttempts).toBe(4);
  });

  it('ofrece fallback manual con friccion alta', () => {
    const result = decideNextStep({ attempts: 3, frustrationScore: 0.75 });

    expect(result.strategy).toBe('offer_manual_fallback');
    expect(result.shouldEscalate).toBe(false);
  });

  it('escala en umbral critico', () => {
    const result = decideNextStep({ attempts: 5, frustrationScore: 0.95 });

    expect(result.strategy).toBe('handoff_human_or_save_partial');
    expect(result.shouldEscalate).toBe(true);
  });
});
