export type PreferredInputMode = 'text' | 'voice' | 'buttons';
export type PreferredOutputMode = 'text' | 'voice' | 'both';
export type Verbosity = 'short' | 'normal';
export type SpeechRate = 'slow' | 'normal';

export interface CommProfile {
  inputMode: PreferredInputMode;
  outputMode: PreferredOutputMode;
  verbosity: Verbosity;
  language: string;
  speechRate: SpeechRate;
  repeatConfirmations: boolean;
}

export interface CommSignals {
  /** Failed attempts on the current field. */
  failedAttempts?: number;
  /** Longest recent silence while the person was expected to answer. */
  longSilenceMs?: number;
  offTopic?: boolean;
  userAskedForVoice?: boolean;
  /** Replies are very short or empty even though the field needs more. */
  userTypedLittle?: boolean;
  userAskedToSlowDown?: boolean;
  language?: string;
}

export const LONG_SILENCE_MS = 10_000;
export const SHORT_VERBOSITY_FAILED_ATTEMPTS = 2;
export const REPEAT_CONFIRMATION_FAILED_ATTEMPTS = 3;

export const createDefaultCommProfile = (language = 'es-AR'): CommProfile => ({
  inputMode: 'text',
  outputMode: 'text',
  verbosity: 'normal',
  language,
  speechRate: 'normal',
  repeatConfirmations: false
});

/**
 * Deterministic and monotonic: signals only move the profile toward more
 * support (voice, slower, shorter, more confirmation). Absence of a signal never
 * reverts a previous adjustment. Returns a new object.
 */
export const updateCommProfile = (profile: CommProfile, signals: CommSignals): CommProfile => {
  const next: CommProfile = { ...profile };

  if (signals.language) next.language = signals.language;

  const failed = signals.failedAttempts ?? 0;
  if (failed >= SHORT_VERBOSITY_FAILED_ATTEMPTS) next.verbosity = 'short';
  if (failed >= REPEAT_CONFIRMATION_FAILED_ATTEMPTS) next.repeatConfirmations = true;

  if (signals.offTopic) next.verbosity = 'short';

  if (signals.userTypedLittle && next.inputMode === 'text') next.inputMode = 'buttons';

  if ((signals.longSilenceMs ?? 0) >= LONG_SILENCE_MS || signals.userAskedForVoice) {
    next.inputMode = 'voice';
    next.outputMode = 'voice';
    next.speechRate = 'slow';
  }

  if (signals.userAskedToSlowDown) {
    next.speechRate = 'slow';
    if (next.outputMode === 'text') next.outputMode = 'both';
  }

  return next;
};

export const describeProfileForPrompt = (profile: CommProfile): string => {
  const parts = [
    `Communication profile: input=${profile.inputMode}, output=${profile.outputMode}, verbosity=${profile.verbosity}, language=${profile.language}, speech rate=${profile.speechRate}.`
  ];

  if (profile.verbosity === 'short') parts.push('Use very short sentences, one idea each.');
  if (profile.speechRate === 'slow') parts.push('Write so it can be read aloud slowly.');
  if (profile.inputMode === 'buttons') parts.push('Prefer offering buttons or fixed options over free text.');
  if (profile.inputMode === 'voice') parts.push('The person prefers to answer by voice.');
  if (profile.repeatConfirmations) parts.push('Repeat confirmations: read back the understood value and ask for a clear yes/no.');

  return parts.join(' ');
};
