export type ProviderName = 'openai' | 'huggingface';

export interface ModelRef {
  model: string;
  revision?: string;
  endpointUrl?: string;
}

export interface AudioTranscriptionResult {
  text: string;
  durationMs?: number;
}

export interface AIProvider {
  readonly name: ProviderName;
  capabilities(): string[];
  generateText(input: string, modelRef?: ModelRef): Promise<string>;
  extractStructured<T extends Record<string, unknown>>(
    input: string,
    schemaName: string,
    modelRef?: ModelRef
  ): Promise<T>;
  transcribeAudio(audio: Blob | ArrayBuffer, modelRef?: ModelRef): Promise<AudioTranscriptionResult>;
}

export interface HuggingFaceProviderConfig {
  apiKey: string;
  modelRef: string;
  endpointUrl?: string;
  fetchFn?: typeof fetch;
}

export class HuggingFaceProvider implements AIProvider {
  readonly name: ProviderName = 'huggingface';
  private readonly fetchFn: typeof fetch;

  constructor(private readonly config: HuggingFaceProviderConfig) {
    this.fetchFn = config.fetchFn ?? fetch;
  }

  capabilities(): string[] {
    return [
      'text-generation',
      'structured-extraction',
      'asr',
      this.config.endpointUrl ? 'dedicated-endpoint' : 'serverless-inference'
    ];
  }

  async generateText(input: string, modelRef?: ModelRef): Promise<string> {
    const model = modelRef?.model ?? this.config.modelRef;
    const url = this.resolveUrl(modelRef, model);
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: input,
        parameters: {
          return_full_text: false,
          revision: modelRef?.revision
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HuggingFace request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as Array<{ generated_text?: string }>;
    return payload[0]?.generated_text ?? '';
  }

  async extractStructured<T extends Record<string, unknown>>(
    input: string,
    schemaName: string,
    modelRef?: ModelRef
  ): Promise<T> {
    const model = modelRef?.model ?? this.config.modelRef;
    const url = this.resolveUrl(modelRef, model);
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: `${schemaName}: ${input}`,
        parameters: {
          revision: modelRef?.revision
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HuggingFace request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  }

  async transcribeAudio(
    audio: Blob | ArrayBuffer,
    modelRef?: ModelRef
  ): Promise<AudioTranscriptionResult> {
    const model = modelRef?.model ?? this.config.modelRef;
    const url = this.resolveUrl(modelRef, model);

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/octet-stream'
      },
      body: audio instanceof Blob ? audio : new Uint8Array(audio)
    });

    if (!response.ok) {
      throw new Error(`HuggingFace ASR request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as { text?: string; duration_ms?: number };
    return {
      text: payload.text ?? '',
      durationMs: payload.duration_ms
    };
  }

  private resolveUrl(modelRef: ModelRef | undefined, model: string): string {
    if (modelRef?.endpointUrl) return modelRef.endpointUrl;
    if (this.config.endpointUrl) return this.config.endpointUrl;
    return `https://api-inference.huggingface.co/models/${model}`;
  }
}
