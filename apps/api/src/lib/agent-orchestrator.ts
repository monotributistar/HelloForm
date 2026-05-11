import { buildSystemPrompt, type AgentPromptInput } from './agent-prompt.js';
import { callHFChat, hfConfigFromEnv } from './hf-services.js';

export interface AgentTurnResult {
  assistant_message: string;
  intent: 'ask' | 'confirm' | 'save' | 'correct' | 'next' | 'back' | 'fallback';
  confidence: number;
  should_save: boolean;
  normalized_value: unknown;
  requires_confirmation: boolean;
  raw?: unknown;
}

const fallbackMessage = (fieldLabel: string): AgentTurnResult => ({
  assistant_message: `Vamos paso a paso. Indícame ${fieldLabel} con el formato esperado y te confirmo antes de guardar.`,
  intent: 'ask',
  confidence: 0.35,
  should_save: false,
  normalized_value: null,
  requires_confirmation: true
});

export const runAgentTurn = async (
  fetchFn: typeof fetch,
  promptInput: AgentPromptInput
): Promise<AgentTurnResult> => {
  const cfg = hfConfigFromEnv();
  const systemPrompt = buildSystemPrompt(promptInput);

  try {
    const response = await callHFChat(fetchFn, cfg, {
      message: promptInput.userMessage,
      systemPrompt,
      temperature: 0.2,
      maxTokens: 700,
      topP: 0.9,
      topK: 40,
      enableThinking: false
    });

    const text = String(response.data?.[0] ?? '').trim();
    const parsed = JSON.parse(text) as Partial<AgentTurnResult>;

    return {
      assistant_message: parsed.assistant_message ?? fallbackMessage(promptInput.field.fieldLabel).assistant_message,
      intent: parsed.intent ?? 'ask',
      confidence: Number(parsed.confidence ?? 0.5),
      should_save: Boolean(parsed.should_save ?? false),
      normalized_value: parsed.normalized_value ?? null,
      requires_confirmation: Boolean(parsed.requires_confirmation ?? true),
      raw: response
    };
  } catch {
    return fallbackMessage(promptInput.field.fieldLabel);
  }
};
