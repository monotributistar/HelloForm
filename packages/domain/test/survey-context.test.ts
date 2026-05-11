import { describe, expect, it } from 'vitest';
import { normalizeSurveyContext } from '../src/survey-context.js';

describe('normalizeSurveyContext', () => {
  it('normaliza bloques por nivel y limpia valores invalidos', () => {
    const result = normalizeSurveyContext({
      surveyContext: {
        hints: ['Explicar objetivo'],
        rules: ['Siempre confirmar'],
        examples: ['Ejemplo general']
      },
      groupContext: {
        hints: ['Pedir direccion con referencias'],
        rules: [123, 'Validar CP'],
        examples: ['Calle 123']
      },
      fieldContext: {
        hints: ['Formato DD/MM/AAAA'],
        rules: ['No fecha futura'],
        examples: [null, '01/12/1990']
      }
    });

    expect(result.survey.level).toBe('survey');
    expect(result.group.rules).toEqual(['Validar CP']);
    expect(result.field.examples).toEqual(['01/12/1990']);
  });

  it('retorna arreglos vacios cuando no hay contexto', () => {
    const result = normalizeSurveyContext({});

    expect(result.survey.hints).toEqual([]);
    expect(result.group.rules).toEqual([]);
    expect(result.field.examples).toEqual([]);
  });
});
