# HelloForm POC - Plan de Implementacion (TDD + Hugging Face)

## Objetivo
Validar un flujo de formulario asistido (manual + chat + voz) con enfoque en completitud, accesibilidad y control de costos por tenant.

## Alcance del POC
- Wizard de formulario para usuario final.
- Asistente por chat para guiar carga de campos y confirmar datos.
- Base para modo voz (STT/TTS) con confirmacion antes de persistir.
- Backoffice minimo (siguientes iteraciones) para tenants, usuarios, campanas, encuestas y auditoria.
- Multi-tenant con RBAC inicial.
- Integracion de proveedores AI desacoplada con soporte para Hugging Face.

## Arquitectura inicial del repositorio
- `apps/api`: Fastify API ligera.
- `packages/domain`: Reglas de dominio puras (testeables con TDD).
- `packages/ai-gateway`: Contratos e implementaciones de proveedores (`openai`/`huggingface`).

## TDD (norma de trabajo)
1. Crear test que falle (Rojo).
2. Implementar minimo para pasar (Verde).
3. Refactor con pruebas verdes.
4. No mergear si `test`, `lint` o `build` fallan.

## Historias iniciales sugeridas
1. Contexto de encuesta (nivel encuesta, grupo, campo).
2. Politica de reintentos y temperatura conversacional.
3. Sesion de formulario con avance/retroceso y guardado parcial.
4. Confirmacion explicita antes de persistir respuesta asistida.
5. Modo explicar, perfil de comunicacion adaptativo y derivacion a una persona (ver `docs/COMM_AND_HANDOFF.md`).

## Hugging Face - Integracion prevista
- Soporte de `modelRef` por tenant: `org/model`, `revision`, `endpointUrl` opcional.
- Modo serverless inference o endpoint dedicado.
- Capacidades esperadas del provider:
  - `generateText`
  - `extractStructured`
  - `transcribeAudio` (iteracion de voz)
- Telemetria por llamado: proveedor, modelo, latencia, errores, costo estimado.

## Costos y control
- Medicion por `tenant_id`, `campaign_id`, `survey_id`, `session_id`.
- Umbrales de presupuesto y alertas (fase siguiente).
- Fallback entre proveedores por disponibilidad y costo.

## KPIs del POC
- Tasa de completitud.
- Tiempo medio de finalizacion.
- Reintentos por campo.
- Abandono por paso.
- Costo AI por formulario completado.

## Comandos
- `npm test`
- `npm run lint`
- `npm run build`

