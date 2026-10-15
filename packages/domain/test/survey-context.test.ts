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

  it('normaliza explicaciones y ayuda de ejemplos por nivel', () => {
    const result = normalizeSurveyContext({
      surveyContext: { explanations: ['Es para armar tu contrato'] },
      groupContext: { explanations: [42, 'Lo usamos para contactarte'] },
      fieldContext: {
        explanations: ['Lo pedimos para identificarte', '  '],
        exampleHelp: ['El CUIL esta en tu DNI, debajo del numero', null]
      }
    });

    expect(result.survey.explanations).toEqual(['Es para armar tu contrato']);
    expect(result.group.explanations).toEqual(['Lo usamos para contactarte']);
    expect(result.field.explanations).toEqual(['Lo pedimos para identificarte']);
    expect(result.field.exampleHelp).toEqual(['El CUIL esta en tu DNI, debajo del numero']);
    expect(result.survey.exampleHelp).toEqual([]);
  });

  it('retorna arreglos vacios de explicaciones cuando no hay contexto', () => {
    const result = normalizeSurveyContext({});

    expect(result.field.explanations).toEqual([]);
    expect(result.field.exampleHelp).toEqual([]);
  });
});
