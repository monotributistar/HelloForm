# HelloForm

HelloForm is a multi-tenant form platform POC with:
- User-facing wizard frontend (`apps/frontend`)
- Separate operations backoffice (`apps/backoffice`)
- API/control plane (`apps/api`)
- Agent-assisted form completion (chat + STT + TTS via Hugging Face Spaces)
- Adaptive communication profile, explain mode and human handoff per tenant (see `docs/COMM_AND_HANDOFF.md`)

## Monorepo Structure

- `apps/api` Fastify + Prisma backend
- `apps/frontend` user wizard UI
- `apps/backoffice` admin operations UI
- `packages/domain` domain rules and policies
- `packages/ai-gateway` AI provider abstractions
- `docs` implementation and setup notes

## Requirements

- Node.js 22+
- npm 10+

## Quickstart

```bash
npm install
npm run -w @helloform/api db:dev:init
npm test
npm run lint
npm run build
```

## Run apps locally

Terminal 1 (API):
```bash
npm run -w @helloform/api build
node apps/api/dist/server.js
```

Terminal 2 (Frontend):
```bash
npm run -w @helloform/frontend dev
```

Terminal 3 (Backoffice):
```bash
npm run -w @helloform/backoffice dev
```

## Environment Variables

Create `apps/api/.env`:

```env
DATABASE_URL="file:./dev.db"
HF_TOKEN=""
HF_CHAT_URL="https://monotributistar-gemma-chat.hf.space/api/predict"
HF_STT_URL="https://monotributistar-whisper-stt.hf.space/api/predict"
HF_TTS_URL="https://monotributistar-f5-tts-spanish.hf.space/api/predict"
```

## CI

CI runs:
- install
- db init
- tests
- lint
- build

See `.github/workflows/ci.yml`.

## License

MIT (see `LICENSE`).
