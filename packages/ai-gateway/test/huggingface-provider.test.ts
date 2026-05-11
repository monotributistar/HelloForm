import { describe, expect, it, vi } from 'vitest';
import { HuggingFaceProvider } from '../src/providers.js';

describe('HuggingFaceProvider', () => {
  it('llama inferencia serverless por defecto', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [{ generated_text: 'respuesta hf' }]
    }));

    const provider = new HuggingFaceProvider({
      apiKey: 'hf_test',
      modelRef: 'distilbert-base-uncased',
      fetchFn: fetchMock as unknown as typeof fetch
    });

    const result = await provider.generateText('hola mundo');
    expect(result).toContain('respuesta hf');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('usa endpoint dedicado cuando viene en modelRef', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ summary_text: 'extraido' })
    }));

    const provider = new HuggingFaceProvider({
      apiKey: 'hf_test',
      modelRef: 'org/model',
      fetchFn: fetchMock as unknown as typeof fetch
    });

    const parsed = await provider.extractStructured<{ summary_text: string }>(
      'entrada',
      'summary',
      { model: 'org/model', endpointUrl: 'https://dedicated.example.com' }
    );

    expect(parsed.summary_text).toBe('extraido');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://dedicated.example.com');
  });

  it('transcribe audio usando octet-stream', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'hola desde audio', duration_ms: 1400 })
    }));

    const provider = new HuggingFaceProvider({
      apiKey: 'hf_test',
      modelRef: 'openai/whisper-small',
      fetchFn: fetchMock as unknown as typeof fetch
    });

    const result = await provider.transcribeAudio(new TextEncoder().encode('fake').buffer);

    expect(result.text).toBe('hola desde audio');
    expect(result.durationMs).toBe(1400);
    const req = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((req.headers as Record<string, string>)['Content-Type']).toBe('application/octet-stream');
  });
});
