import { describe, expect, it } from 'vitest';
import {
  createDefaultCommProfile,
  describeProfileForPrompt,
  updateCommProfile
} from '../src/comm-profile.js';

describe('createDefaultCommProfile', () => {
  it('arranca con valores neutros y es-AR', () => {
    expect(createDefaultCommProfile()).toEqual({
      inputMode: 'text',
      outputMode: 'text',
      verbosity: 'normal',
      language: 'es-AR',
      speechRate: 'normal',
      repeatConfirmations: false
    });
  });

  it('permite elegir idioma', () => {
    expect(createDefaultCommProfile('pt-BR').language).toBe('pt-BR');
  });
});

describe('updateCommProfile', () => {
  const base = createDefaultCommProfile();

  it('no cambia nada sin senales', () => {
    expect(updateCommProfile(base, {})).toEqual(base);
  });

  it('no muta el perfil original', () => {
    const frozen = Object.freeze({ ...base });
    const result = updateCommProfile(frozen, { failedAttempts: 3 });
    expect(result).not.toBe(frozen);
    expect(frozen.verbosity).toBe('normal');
  });

  it('1 intento fallido no cambia la verbosidad', () => {
    expect(updateCommProfile(base, { failedAttempts: 1 }).verbosity).toBe('normal');
  });

  it('2 o mas intentos fallidos pasan a verbosidad corta', () => {
    const result = updateCommProfile(base, { failedAttempts: 2 });
    expect(result.verbosity).toBe('short');
    expect(result.repeatConfirmations).toBe(false);
  });

  it('3 o mas intentos fallidos ademas repiten confirmaciones', () => {
    const result = updateCommProfile(base, { failedAttempts: 3 });
    expect(result.verbosity).toBe('short');
    expect(result.repeatConfirmations).toBe(true);
  });

  it('un silencio largo pasa a voz y habla lenta', () => {
    const result = updateCommProfile(base, { longSilenceMs: 12000 });
    expect(result.inputMode).toBe('voice');
    expect(result.outputMode).toBe('voice');
    expect(result.speechRate).toBe('slow');
  });

  it('un silencio corto no cambia nada', () => {
    expect(updateCommProfile(base, { longSilenceMs: 3000 })).toEqual(base);
  });

  it('pedir voz pasa a voz y habla lenta', () => {
    const result = updateCommProfile(base, { userAskedForVoice: true });
    expect(result.inputMode).toBe('voice');
    expect(result.outputMode).toBe('voice');
    expect(result.speechRate).toBe('slow');
  });

  it('escribir poco pasa a botones como entrada', () => {
    const result = updateCommProfile(base, { userTypedLittle: true });
    expect(result.inputMode).toBe('buttons');
    expect(result.outputMode).toBe('text');
  });

  it('escribir poco no pisa una preferencia de voz', () => {
    const voice = updateCommProfile(base, { userAskedForVoice: true });
    expect(updateCommProfile(voice, { userTypedLittle: true }).inputMode).toBe('voice');
  });

  it('salirse de tema acorta las respuestas', () => {
    expect(updateCommProfile(base, { offTopic: true }).verbosity).toBe('short');
  });

  it('pedir ir mas despacio baja la velocidad y suma voz si solo habia texto', () => {
    const result = updateCommProfile(base, { userAskedToSlowDown: true });
    expect(result.speechRate).toBe('slow');
    expect(result.outputMode).toBe('both');
  });

  it('pedir ir mas despacio no cambia la salida si ya era voz', () => {
    const voice = updateCommProfile(base, { userAskedForVoice: true });
    expect(updateCommProfile(voice, { userAskedToSlowDown: true }).outputMode).toBe('voice');
  });

  it('es monotono: senales vacias posteriores no revierten ajustes', () => {
    const adjusted = updateCommProfile(base, { failedAttempts: 3, userAskedForVoice: true });
    expect(updateCommProfile(adjusted, { failedAttempts: 0 })).toEqual(adjusted);
  });

  it('combina varias senales de forma determinista', () => {
    const signals = { failedAttempts: 2, longSilenceMs: 15000, offTopic: true };
    expect(updateCommProfile(base, signals)).toEqual(updateCommProfile(base, signals));
    expect(updateCommProfile(base, signals)).toMatchObject({
      verbosity: 'short',
      inputMode: 'voice',
      speechRate: 'slow'
    });
  });

  it('permite fijar el idioma por senal', () => {
    expect(updateCommProfile(base, { language: 'en-US' }).language).toBe('en-US');
  });
});

describe('describeProfileForPrompt', () => {
  it('describe el perfil por defecto', () => {
    const text = describeProfileForPrompt(createDefaultCommProfile());
    expect(text).toContain('input=text');
    expect(text).toContain('output=text');
    expect(text).toContain('verbosity=normal');
    expect(text).toContain('language=es-AR');
    expect(text).toContain('speech rate=normal');
    expect(text).not.toContain('Repeat');
  });

  it('agrega instrucciones concretas cuando hay ajustes', () => {
    const profile = updateCommProfile(createDefaultCommProfile(), {
      failedAttempts: 3,
      userAskedForVoice: true
    });
    const text = describeProfileForPrompt(profile);
    expect(text).toContain('very short sentences');
    expect(text).toContain('slowly');
    expect(text).toContain('Repeat');
  });
});
