export interface HFServiceConfig {
  token: string;
  chatUrl: string;
  sttUrl: string;
  ttsUrl: string;
}

export const hfConfigFromEnv = (): HFServiceConfig => ({
  token: process.env.HF_TOKEN ?? process.env.HF_API_KEY ?? '',
  chatUrl: process.env.HF_CHAT_URL ?? 'https://monotributistar-gemma-chat.hf.space/api/predict',
  sttUrl: process.env.HF_STT_URL ?? 'https://monotributistar-whisper-stt.hf.space/api/predict',
  ttsUrl: process.env.HF_TTS_URL ?? 'https://monotributistar-f5-tts-spanish.hf.space/api/predict'
});

export interface AgentLLMRequest {
  message: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  enableThinking?: boolean;
}

export const callHFChat = async (fetchFn: typeof fetch, cfg: HFServiceConfig, req: AgentLLMRequest) => {
  const response = await fetchFn(cfg.chatUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      data: [
        req.message,
        [],
        req.systemPrompt,
        req.temperature ?? 0.3,
        req.maxTokens ?? 512,
        req.topP ?? 0.9,
        req.topK ?? 50,
        req.enableThinking ?? false
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`HF chat failed with status ${response.status}`);
  }

  return response.json() as Promise<{ data?: unknown[] }>;
};

export const callHFStt = async (
  fetchFn: typeof fetch,
  cfg: HFServiceConfig,
  audioBase64: string,
  language = 'es',
  task = 'transcribe'
) => {
  const response = await fetchFn(cfg.sttUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      data: [audioBase64, language, task, 5, true]
    })
  });

  if (!response.ok) {
    throw new Error(`HF stt failed with status ${response.status}`);
  }

  return response.json() as Promise<{ data?: unknown[] }>;
};

export const callHFTts = async (
  fetchFn: typeof fetch,
  cfg: HFServiceConfig,
  refAudioBase64: string,
  text: string,
  refText = ''
) => {
  const response = await fetchFn(cfg.ttsUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      data: [refAudioBase64, refText, text, 1.0, 2.0, 32, true]
    })
  });

  if (!response.ok) {
    throw new Error(`HF tts failed with status ${response.status}`);
  }

  return response.json() as Promise<{ data?: unknown[] }>;
};
