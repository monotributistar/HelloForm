import React from 'react';
import { createRoot } from 'react-dom/client';

type Mode = 'manual' | 'chat' | 'voice';

interface SessionState {
  sessionId: string;
  tenantId: string;
  surveyId: string;
  currentStep: number;
  totalSteps: number;
  completed: boolean;
  fields: Record<string, { value?: unknown; mode?: Mode; attempts: number; confirmed: boolean }>;
}

const API_BASE = 'http://localhost:3000';
const tenantId = 'tenant-poc';
const surveyId = 'survey-poc';
const campaignId = 'campaign-poc';

const steps = [
  { id: 'full_name', label: 'Nombre completo' },
  { id: 'address', label: 'Direccion' },
  { id: 'phone', label: 'Telefono' }
];

const sessionId = 'session-poc-001';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }

  return (await response.json()) as T;
}

async function track(operation: 'generate_text' | 'extract_structured' | 'transcribe_audio', payload: Record<string, unknown>) {
  await api('/ai/usage-logs', {
    method: 'POST',
    body: JSON.stringify({
      tenantId,
      sessionId,
      campaignId,
      surveyId,
      provider: 'huggingface',
      model: 'client_metric',
      operation,
      units: JSON.stringify(payload).length,
      latencyMs: 0
    })
  });
}

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

function App() {
  const [mode, setMode] = React.useState<Mode>('manual');
  const [state, setState] = React.useState<SessionState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isRecording, setIsRecording] = React.useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  React.useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      try {
        const created = await api<SessionState>('/form-sessions', {
          method: 'POST',
          body: JSON.stringify({
            sessionId,
            tenantId,
            surveyId,
            totalSteps: steps.length
          })
        });
        setState(created);
      } catch {
        const existing = await api<SessionState>(`/form-sessions/${sessionId}`);
        setState(existing);
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, []);

  if (loading || !state) return <main style={{ margin: 40 }}>Cargando sesion...</main>;

  const current = steps[state.currentStep];
  const currentValue = (state.fields[current.id]?.value as string | undefined) ?? '';

  const persistField = async (value: string) => {
    const updated = await api<SessionState>(`/form-sessions/${sessionId}/fields/${current.id}`, {
      method: 'POST',
      body: JSON.stringify({ value, mode, confirmed: true })
    });
    setState(updated);
  };

  const onChange = async (value: string) => {
    try {
      await persistField(value);
      await track('extract_structured', { event: 'field_changed', fieldId: current.id, mode, step: state.currentStep });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar campo');
    }
  };

  const onNext = async () => {
    try {
      const updated = await api<SessionState>(`/form-sessions/${sessionId}/next`, { method: 'POST' });
      setState(updated);
      await track('extract_structured', { event: 'step_next', step: state.currentStep, fieldId: current.id, mode });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al avanzar');
    }
  };

  const onBack = async () => {
    try {
      const updated = await api<SessionState>(`/form-sessions/${sessionId}/back`, { method: 'POST' });
      setState(updated);
      await track('extract_structured', { event: 'step_back', step: state.currentStep, fieldId: current.id, mode });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al retroceder');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const audioBase64 = await blobToBase64(audioBlob);
        const transcription = await api<{ output: { text: string } }>('/ai/providers/hf/transcribe', {
          method: 'POST',
          body: JSON.stringify({
            tenantId,
            sessionId,
            campaignId,
            surveyId,
            audioBase64,
            modelRef: 'openai/whisper-small'
          })
        });

        await persistField(transcription.output.text);
        await track('transcribe_audio', { fieldId: current.id, step: state.currentStep, mode: 'voice' });
        setMode('voice');
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar grabacion');
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    setIsRecording(false);
  };

  return (
    <main style={{ maxWidth: 640, margin: '40px auto', fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1>HelloForm POC Wizard</h1>
      <p>Paso {state.currentStep + 1} de {steps.length}</p>
      {state.completed ? <p>Formulario completado.</p> : null}
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      <label>
        Modo de carga:
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          <option value="manual">Manual</option>
          <option value="chat">Chat</option>
          <option value="voice">Voz</option>
        </select>
      </label>

      <section style={{ marginTop: 16 }}>
        <label htmlFor={current.id}>{current.label}</label>
        <input
          id={current.id}
          value={currentValue}
          onChange={(e) => {
            void onChange(e.target.value);
          }}
          placeholder={`Completar ${current.label.toLowerCase()}`}
          style={{ display: 'block', width: '100%', marginTop: 8, padding: 8 }}
        />
        <small>Intentos: {state.fields[current.id]?.attempts ?? 0}</small>
      </section>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button onClick={() => void onBack()}>Atras</button>
        <button onClick={() => void onNext()}>Siguiente</button>
        {!isRecording ? (
          <button onClick={() => void startRecording()} disabled={mode !== 'voice'}>
            Grabar voz
          </button>
        ) : (
          <button onClick={stopRecording}>Detener grabacion</button>
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
