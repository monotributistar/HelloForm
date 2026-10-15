export interface AgentTurnState {
  attempts: number;
  frustrationScore: number;
}

export type AgentStrategy =
  | 'normal_guidance'
  | 'concise_rephrase'
  | 'offer_manual_fallback'
  | 'handoff_human_or_save_partial'
  | 'handoff_to_human';

export type HelpChannel = 'chat' | 'phone' | 'in_person';
export type HandoffReason = 'user_requested' | 'high_friction' | 'sensitive_field';

export interface AgentDecision {
  strategy: AgentStrategy;
  maxNextAttempts: number;
  shouldEscalate: boolean;
  /** Only set when strategy is 'handoff_to_human'. */
  handoffChannel?: HelpChannel;
  /** Why a handoff was triggered (also set when no human is available and the partial is saved). */
  handoffReason?: HandoffReason;
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

// --- Human help (per tenant) -------------------------------------------------

export interface HumanHelpHours {
  /** 0 = Sunday ... 6 = Saturday. */
  days: number[];
  /** 'HH:MM', inclusive. */
  from: string;
  /** 'HH:MM', exclusive. Must be later than `from` (no overnight ranges). */
  to: string;
  /** IANA timezone. Defaults to America/Argentina/Buenos_Aires. */
  timezone?: string;
}

export interface HumanHelpConfig {
  enabled: boolean;
  channels: HelpChannel[];
  hours?: HumanHelpHours;
  contactLabel?: string;
}

export const DEFAULT_HELP_TIMEZONE = 'America/Argentina/Buenos_Aires';
const HELP_CHANNELS: HelpChannel[] = ['chat', 'phone', 'in_person'];
const CHANNEL_PRIORITY: HelpChannel[] = ['chat', 'phone', 'in_person'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const toMinutes = (hhmm: string): number | null => {
  const match = TIME_RE.exec(hhmm);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const localDayAndMinutes = (now: Date, timezone: string): { day: number; minutes: number } | null => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const day = WEEKDAYS.indexOf(get('weekday'));
    if (day < 0) return null;
    return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
  } catch {
    return null;
  }
};

export const isHumanHelpAvailable = (config: HumanHelpConfig | undefined, now: Date = new Date()): boolean => {
  if (!config || !config.enabled || config.channels.length === 0) return false;
  if (!config.hours) return true;

  const from = toMinutes(config.hours.from);
  const to = toMinutes(config.hours.to);
  if (from === null || to === null || from >= to) return false;

  const local = localDayAndMinutes(now, config.hours.timezone ?? DEFAULT_HELP_TIMEZONE);
  if (!local) return false;

  return config.hours.days.includes(local.day) && local.minutes >= from && local.minutes < to;
};

export type ParsedHumanHelpConfig = { ok: true; value: HumanHelpConfig } | { ok: false; error: string };

/** Validates untrusted input (e.g. an API body) and returns a normalized config. */
export const parseHumanHelpConfig = (input: unknown): ParsedHumanHelpConfig => {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'Config must be an object' };
  const raw = input as Record<string, unknown>;

  if (typeof raw.enabled !== 'boolean') return { ok: false, error: 'enabled must be a boolean' };
  if (!Array.isArray(raw.channels)) return { ok: false, error: 'channels must be an array' };

  const channels: HelpChannel[] = [];
  for (const channel of raw.channels) {
    if (!HELP_CHANNELS.includes(channel as HelpChannel)) return { ok: false, error: `Invalid channel: ${String(channel)}` };
    if (!channels.includes(channel as HelpChannel)) channels.push(channel as HelpChannel);
  }

  const value: HumanHelpConfig = { enabled: raw.enabled, channels };

  if (raw.hours !== undefined && raw.hours !== null) {
    const hours = raw.hours as Record<string, unknown>;
    const days = hours.days;
    if (!Array.isArray(days) || !days.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)) {
      return { ok: false, error: 'hours.days must be integers between 0 and 6' };
    }
    const from = typeof hours.from === 'string' ? toMinutes(hours.from) : null;
    const to = typeof hours.to === 'string' ? toMinutes(hours.to) : null;
    if (from === null || to === null) return { ok: false, error: 'hours.from and hours.to must be HH:MM' };
    if (from >= to) return { ok: false, error: 'hours.to must be later than hours.from' };
    if (hours.timezone !== undefined && (typeof hours.timezone !== 'string' || !localDayAndMinutes(new Date(0), hours.timezone))) {
      return { ok: false, error: 'hours.timezone must be a valid IANA timezone' };
    }

    value.hours = {
      days: [...new Set(days as number[])].sort((a, b) => a - b),
      from: hours.from as string,
      to: hours.to as string,
      ...(typeof hours.timezone === 'string' ? { timezone: hours.timezone } : {})
    };
  }

  if (typeof raw.contactLabel === 'string' && raw.contactLabel.trim().length > 0) {
    value.contactLabel = raw.contactLabel.trim();
  }

  return { ok: true, value };
};

// --- Handoff decision ---------------------------------------------------------

export interface HandoffTurnState extends AgentTurnState {
  userAskedForPerson?: boolean;
  /** The current field is flagged sensitive (contracts, signatures). */
  fieldSensitive?: boolean;
  preferredChannel?: HelpChannel;
}

const pickChannel = (config: HumanHelpConfig, preferred?: HelpChannel): HelpChannel | undefined => {
  if (preferred && config.channels.includes(preferred)) return preferred;
  return CHANNEL_PRIORITY.find((channel) => config.channels.includes(channel));
};

/**
 * Extends decideNextStep with human help. Triggers: the person asked for someone,
 * the existing friction thresholds (shouldEscalate), or a sensitive field.
 * With help available now -> 'handoff_to_human' with a channel. Without it, a request
 * or threshold keeps 'handoff_human_or_save_partial'; a sensitive field alone keeps the base decision.
 */
export const decideHandoff = (
  state: HandoffTurnState,
  config?: HumanHelpConfig,
  now: Date = new Date()
): AgentDecision => {
  const base = decideNextStep(state);

  const reason: HandoffReason | undefined = state.userAskedForPerson
    ? 'user_requested'
    : base.shouldEscalate
      ? 'high_friction'
      : state.fieldSensitive
        ? 'sensitive_field'
        : undefined;

  if (!reason) return base;

  const channel = config && isHumanHelpAvailable(config, now) ? pickChannel(config, state.preferredChannel) : undefined;
  if (channel) {
    return {
      strategy: 'handoff_to_human',
      maxNextAttempts: state.attempts,
      shouldEscalate: true,
      handoffChannel: channel,
      handoffReason: reason
    };
  }

  if (reason === 'sensitive_field') return base;

  return {
    strategy: 'handoff_human_or_save_partial',
    maxNextAttempts: state.attempts,
    shouldEscalate: true,
    handoffReason: reason
  };
};
