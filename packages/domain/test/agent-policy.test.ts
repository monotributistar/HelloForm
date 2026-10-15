import { describe, expect, it } from 'vitest';
import {
  decideHandoff,
  decideNextStep,
  isHumanHelpAvailable,
  parseHumanHelpConfig,
  type HumanHelpConfig
} from '../src/agent-policy.js';

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

// 2026-10-14 es miercoles (3). 15:00 en Buenos Aires (UTC-3) = 18:00Z.
const wednesday3pm = new Date('2026-10-14T18:00:00Z');
const wednesday9pm = new Date('2026-10-15T00:00:00Z');
const sunday3pm = new Date('2026-10-18T18:00:00Z');

const officeHours: HumanHelpConfig = {
  enabled: true,
  channels: ['chat', 'phone'],
  hours: { days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' },
  contactLabel: 'Mesa de ayuda'
};

describe('isHumanHelpAvailable', () => {
  it('false sin config o deshabilitada o sin canales', () => {
    expect(isHumanHelpAvailable(undefined, wednesday3pm)).toBe(false);
    expect(isHumanHelpAvailable({ ...officeHours, enabled: false }, wednesday3pm)).toBe(false);
    expect(isHumanHelpAvailable({ enabled: true, channels: [] }, wednesday3pm)).toBe(false);
  });

  it('siempre disponible si esta habilitada y no define horarios', () => {
    expect(isHumanHelpAvailable({ enabled: true, channels: ['chat'] }, sunday3pm)).toBe(true);
  });

  it('respeta dias y horas en la zona horaria del tenant (default Buenos Aires)', () => {
    expect(isHumanHelpAvailable(officeHours, wednesday3pm)).toBe(true);
    expect(isHumanHelpAvailable(officeHours, wednesday9pm)).toBe(false);
    expect(isHumanHelpAvailable(officeHours, sunday3pm)).toBe(false);
  });

  it('el limite inferior es inclusivo y el superior exclusivo', () => {
    expect(isHumanHelpAvailable(officeHours, new Date('2026-10-14T12:00:00Z'))).toBe(true); // 09:00
    expect(isHumanHelpAvailable(officeHours, new Date('2026-10-14T21:00:00Z'))).toBe(false); // 18:00
  });

  it('usa la zona horaria configurada', () => {
    const utc: HumanHelpConfig = {
      ...officeHours,
      hours: { days: [3], from: '17:00', to: '19:00', timezone: 'UTC' }
    };
    expect(isHumanHelpAvailable(utc, wednesday3pm)).toBe(true);
  });

  it('un rango invalido (desde >= hasta) no esta disponible', () => {
    const bad: HumanHelpConfig = { ...officeHours, hours: { days: [3], from: '18:00', to: '09:00' } };
    expect(isHumanHelpAvailable(bad, wednesday3pm)).toBe(false);
  });
});

describe('decideHandoff', () => {
  const calm = { attempts: 1, frustrationScore: 0.1 };

  it('sin disparadores se comporta igual que decideNextStep', () => {
    expect(decideHandoff(calm, officeHours, wednesday3pm)).toEqual(decideNextStep(calm));
    expect(decideHandoff({ attempts: 3, frustrationScore: 0.5 }, officeHours, wednesday3pm)).toEqual(
      decideNextStep({ attempts: 3, frustrationScore: 0.5 })
    );
  });

  it('sin config conserva el comportamiento existente en umbral critico', () => {
    const result = decideHandoff({ attempts: 5, frustrationScore: 0.95 });
    expect(result.strategy).toBe('handoff_human_or_save_partial');
    expect(result.shouldEscalate).toBe(true);
    expect(result.handoffChannel).toBeUndefined();
  });

  it('deriva a una persona si la pidio y hay ayuda disponible (prefiere chat)', () => {
    const result = decideHandoff({ ...calm, userAskedForPerson: true }, officeHours, wednesday3pm);
    expect(result.strategy).toBe('handoff_to_human');
    expect(result.shouldEscalate).toBe(true);
    expect(result.handoffChannel).toBe('chat');
    expect(result.handoffReason).toBe('user_requested');
  });

  it('respeta el canal preferido si el tenant lo ofrece', () => {
    const result = decideHandoff(
      { ...calm, userAskedForPerson: true, preferredChannel: 'phone' },
      officeHours,
      wednesday3pm
    );
    expect(result.handoffChannel).toBe('phone');
  });

  it('ignora el canal preferido si el tenant no lo ofrece', () => {
    const result = decideHandoff(
      { ...calm, userAskedForPerson: true, preferredChannel: 'in_person' },
      officeHours,
      wednesday3pm
    );
    expect(result.handoffChannel).toBe('chat');
  });

  it('sin chat elige telefono y luego presencial', () => {
    const phoneAndLocal: HumanHelpConfig = { enabled: true, channels: ['in_person', 'phone'] };
    expect(decideHandoff({ ...calm, userAskedForPerson: true }, phoneAndLocal, wednesday3pm).handoffChannel).toBe('phone');
    const local: HumanHelpConfig = { enabled: true, channels: ['in_person'] };
    expect(decideHandoff({ ...calm, userAskedForPerson: true }, local, wednesday3pm).handoffChannel).toBe('in_person');
  });

  it('si pidio una persona y no hay ayuda ahora, guarda parcial', () => {
    const result = decideHandoff({ ...calm, userAskedForPerson: true }, officeHours, wednesday9pm);
    expect(result.strategy).toBe('handoff_human_or_save_partial');
    expect(result.shouldEscalate).toBe(true);
    expect(result.handoffChannel).toBeUndefined();
    expect(result.handoffReason).toBe('user_requested');
  });

  it('si pidio una persona y el tenant no tiene ayuda humana, guarda parcial', () => {
    const result = decideHandoff({ ...calm, userAskedForPerson: true });
    expect(result.strategy).toBe('handoff_human_or_save_partial');
  });

  it('deriva por friccion alta si hay ayuda disponible', () => {
    const result = decideHandoff({ attempts: 5, frustrationScore: 0.5 }, officeHours, wednesday3pm);
    expect(result.strategy).toBe('handoff_to_human');
    expect(result.handoffReason).toBe('high_friction');
    expect(result.handoffChannel).toBe('chat');
  });

  it('friccion alta fuera de horario mantiene handoff_human_or_save_partial', () => {
    const result = decideHandoff({ attempts: 5, frustrationScore: 0.95 }, officeHours, wednesday9pm);
    expect(result.strategy).toBe('handoff_human_or_save_partial');
    expect(result.shouldEscalate).toBe(true);
  });

  it('deriva si el campo es sensible y hay ayuda disponible', () => {
    const result = decideHandoff({ ...calm, fieldSensitive: true }, officeHours, wednesday3pm);
    expect(result.strategy).toBe('handoff_to_human');
    expect(result.handoffReason).toBe('sensitive_field');
  });

  it('campo sensible sin ayuda disponible no fuerza escalamiento', () => {
    const result = decideHandoff({ ...calm, fieldSensitive: true }, officeHours, wednesday9pm);
    expect(result).toEqual(decideNextStep(calm));
  });

  it('el pedido explicito tiene prioridad sobre otros motivos', () => {
    const result = decideHandoff(
      { attempts: 5, frustrationScore: 0.95, fieldSensitive: true, userAskedForPerson: true },
      officeHours,
      wednesday3pm
    );
    expect(result.handoffReason).toBe('user_requested');
  });
});

describe('parseHumanHelpConfig', () => {
  it('acepta una config valida y la normaliza', () => {
    const parsed = parseHumanHelpConfig({
      enabled: true,
      channels: ['chat', 'phone', 'chat'],
      hours: { days: [1, 3], from: '09:00', to: '18:30' },
      contactLabel: ' Mesa de ayuda '
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        enabled: true,
        channels: ['chat', 'phone'],
        hours: { days: [1, 3], from: '09:00', to: '18:30' },
        contactLabel: 'Mesa de ayuda'
      }
    });
  });

  it('rechaza canales, dias u horas invalidos', () => {
    expect(parseHumanHelpConfig({ enabled: true, channels: ['fax'] }).ok).toBe(false);
    expect(parseHumanHelpConfig({ enabled: true, channels: ['chat'], hours: { days: [7], from: '09:00', to: '18:00' } }).ok).toBe(false);
    expect(parseHumanHelpConfig({ enabled: true, channels: ['chat'], hours: { days: [1], from: '9am', to: '18:00' } }).ok).toBe(false);
    expect(parseHumanHelpConfig({ enabled: true, channels: ['chat'], hours: { days: [1], from: '18:00', to: '09:00' } }).ok).toBe(false);
    expect(parseHumanHelpConfig({ enabled: 'yes', channels: [] }).ok).toBe(false);
    expect(parseHumanHelpConfig(null).ok).toBe(false);
  });

  it('omite hours y contactLabel cuando no vienen', () => {
    const parsed = parseHumanHelpConfig({ enabled: false, channels: [] });
    expect(parsed).toEqual({ ok: true, value: { enabled: false, channels: [] } });
  });
});
