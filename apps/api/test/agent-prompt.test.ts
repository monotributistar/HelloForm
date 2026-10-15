import { describe, expect, it } from 'vitest';
import { updateCommProfile, createDefaultCommProfile } from '@helloform/domain';
import { buildSystemPrompt, type AgentPromptInput } from '../src/lib/agent-prompt.js';

const baseInput: AgentPromptInput = {
  userMessage: 'no entiendo',
  attempts: 1,
  frustrationScore: 0.1,
  survey: { surveyName: 'Registro', surveyGoal: 'Completar datos personales' },
  field: { fieldId: 'cuil', fieldLabel: 'CUIL', fieldType: 'text', required: true }
};

describe('buildSystemPrompt', () => {
  it('instruye al agente a explicar y no solo preguntar', () => {
    const prompt = buildSystemPrompt(baseInput);
    expect(prompt).toContain('Explain why the data is needed');
  });

  it('muestra None cuando no hay explicaciones ni ayuda de ejemplos', () => {
    const prompt = buildSystemPrompt(baseInput);
    expect(prompt).toContain('Field explanations: None.');
    expect(prompt).toContain('Where to find it: None.');
  });

  it('incluye explicaciones de encuesta, grupo y campo, y ayuda de ejemplos', () => {
    const prompt = buildSystemPrompt({
      ...baseInput,
      survey: { ...baseInput.survey, surveyExplanations: ['Es para armar tu contrato'] },
      field: {
        ...baseInput.field,
        fieldExplanations: ['Lo pedimos para identificarte', 'Despues revisamos todo juntos'],
        fieldExampleHelp: ['El CUIL esta en tu DNI, debajo del numero']
      }
    });

    expect(prompt).toContain('Survey explanations: Es para armar tu contrato.');
    expect(prompt).toContain('Field explanations: Lo pedimos para identificarte | Despues revisamos todo juntos.');
    expect(prompt).toContain('Where to find it: El CUIL esta en tu DNI, debajo del numero.');
  });

  it('incluye explicaciones del grupo', () => {
    const prompt = buildSystemPrompt({
      ...baseInput,
      survey: { ...baseInput.survey, groupName: 'Datos personales', groupExplanations: ['Para contactarte'] }
    });
    expect(prompt).toContain('Group explanations: Para contactarte.');
  });

  it('sin perfil de comunicacion usa el locale y no agrega linea de perfil', () => {
    const prompt = buildSystemPrompt({ ...baseInput, locale: 'es-UY' });
    expect(prompt).toContain('Locale: es-UY.');
    expect(prompt).not.toContain('Communication profile');
  });

  it('agrega el perfil de comunicacion y usa su idioma', () => {
    const commProfile = updateCommProfile(createDefaultCommProfile('es-AR'), {
      failedAttempts: 3,
      userAskedForVoice: true
    });
    const prompt = buildSystemPrompt({ ...baseInput, commProfile, locale: 'en-US' });
    expect(prompt).toContain('Communication profile: input=voice, output=voice, verbosity=short');
    expect(prompt).toContain('Locale: es-AR.');
  });

  it('con ayuda humana disponible ofrece derivar por el canal elegido', () => {
    const prompt = buildSystemPrompt({
      ...baseInput,
      userAskedForPerson: true,
      humanHelp: { enabled: true, channels: ['phone'], contactLabel: 'Mesa de ayuda' },
      now: new Date('2026-10-14T18:00:00Z')
    });
    expect(prompt).toContain('Strategy: handoff_to_human.');
    expect(prompt).toContain('Offer to connect the person with a human via phone (Mesa de ayuda)');
  });

  it('con campo sensible y ayuda disponible tambien ofrece derivar', () => {
    const prompt = buildSystemPrompt({
      ...baseInput,
      field: { ...baseInput.field, sensitive: true },
      humanHelp: { enabled: true, channels: ['chat'] }
    });
    expect(prompt).toContain('Strategy: handoff_to_human.');
  });

  it('sin ayuda humana mantiene la estrategia existente y no ofrece derivar', () => {
    const prompt = buildSystemPrompt({ ...baseInput, attempts: 5 });
    expect(prompt).toContain('Strategy: handoff_human_or_save_partial.');
    expect(prompt).not.toContain('Offer to connect the person with a human');
  });
});
