import { describe, expect, it, vi } from 'vitest';
import { runAgentTurn } from '../src/lib/agent-orchestrator.js';

const baseInput = {
  userMessage: 'mi nombre es Juan Perez',
  attempts: 1,
  frustrationScore: 0.1,
  survey: {
    surveyName: 'Registro',
    surveyGoal: 'Completar datos personales'
  },
  field: {
    fieldId: 'full_name',
    fieldLabel: 'nombre completo',
    fieldType: 'text',
    required: true
  }
};

describe('runAgentTurn', () => {
  it('parses JSON response from chat model', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          JSON.stringify({
            assistant_message: 'Perfecto, confirmo nombre completo: Juan Perez',
            intent: 'confirm',
            confidence: 0.92,
            should_save: true,
            normalized_value: 'Juan Perez',
            requires_confirmation: true
          })
        ]
      })
    }));

    const result = await runAgentTurn(fetchMock as unknown as typeof fetch, baseInput);
    expect(result.intent).toBe('confirm');
    expect(result.should_save).toBe(true);
    expect(result.normalized_value).toBe('Juan Perez');
  });

  it('falls back gracefully when model output is invalid', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: ['not-json'] })
    }));

    const result = await runAgentTurn(fetchMock as unknown as typeof fetch, baseInput);
    expect(result.intent).toBe('ask');
    expect(result.should_save).toBe(false);
  });
});
