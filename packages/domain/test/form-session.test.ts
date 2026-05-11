import { describe, expect, it } from 'vitest';
import {
  correctFieldValue,
  createFormSession,
  nextStep,
  previousStep,
  saveFieldValue
} from '../src/form-session.js';

describe('form-session domain', () => {
  it('crea una sesion inicial', () => {
    const state = createFormSession('s1', 'survey-a', 4);
    expect(state.currentStep).toBe(0);
    expect(state.completed).toBe(false);
  });

  it('avanza y marca completado al final', () => {
    let state = createFormSession('s1', 'survey-a', 2);
    state = nextStep(state);
    expect(state.currentStep).toBe(1);
    state = nextStep(state);
    expect(state.completed).toBe(true);
  });

  it('retrocede sin ir debajo de cero', () => {
    const state = previousStep(createFormSession('s1', 'survey-a', 3));
    expect(state.currentStep).toBe(0);
  });

  it('guarda un campo e incrementa intentos en correccion', () => {
    let state = createFormSession('s1', 'survey-a', 3);
    state = saveFieldValue(state, {
      fieldId: 'full_name',
      value: 'Ana',
      mode: 'chat',
      confirmed: true
    });

    state = correctFieldValue(state, {
      fieldId: 'full_name',
      value: 'Ana Maria',
      mode: 'manual',
      confirmed: true
    });

    expect(state.fields.full_name.value).toBe('Ana Maria');
    expect(state.fields.full_name.attempts).toBe(2);
  });
});
