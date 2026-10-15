# Comunicacion adaptativa y ayuda humana

Objetivo: que el agente no solo pida datos, sino que **explique** y encuentre la mejor forma de comunicarse con cada persona (adultos mayores, baja alfabetizacion), y que pueda **derivar a una persona** del negocio o entidad cuando haga falta.

## 1. Modo explicar (`packages/domain/src/survey-context.ts`)

Cada bloque de contexto (encuesta, grupo, campo) acepta dos listas nuevas, normalizadas igual que `hints`/`rules`/`examples`:

- `explanations`: por que se pide el dato y que pasa despues.
- `exampleHelp`: donde encontrar el dato (ej. "El CUIL esta en tu DNI, debajo del numero").

`apps/api/src/lib/agent-prompt.ts` las incluye en el prompt (`Survey/Group/Field explanations`, `Where to find it`) e instruye al agente a explicar, no solo preguntar.

## 2. Perfil de comunicacion (`packages/domain/src/comm-profile.ts`)

`CommProfile`: `inputMode` (text|voice|buttons), `outputMode` (text|voice|both), `verbosity` (short|normal), `language`, `speechRate` (slow|normal), `repeatConfirmations`.

`updateCommProfile(profile, signals)` es pura, determinista y **monotona** (las senales solo suman apoyo; no revierte ajustes):

| Senal | Efecto |
| --- | --- |
| `failedAttempts >= 2` | `verbosity = short` |
| `failedAttempts >= 3` | ademas `repeatConfirmations = true` |
| `offTopic` | `verbosity = short` |
| `userTypedLittle` | `inputMode = buttons` (si estaba en texto) |
| `longSilenceMs >= 10000` o `userAskedForVoice` | `inputMode = voice`, `outputMode = voice`, `speechRate = slow` |
| `userAskedToSlowDown` | `speechRate = slow`; `outputMode = both` si era solo texto |
| `language` | fija el idioma |

`FormSessionState.commProfile` es opcional (sesiones previas siguen validas); `applyCommSignals(state, signals)` lo actualiza. `describeProfileForPrompt` lo traduce a instrucciones para el prompt. `POST /agent/next-turn` acepta `commProfile`.

Pendiente (no incluido): persistir el perfil entre tramites. Debe ser opt-in y borrable por la persona.

## 3. Derivacion a una persona (`packages/domain/src/agent-policy.ts`)

Config por tenant, `HumanHelpConfig`: `enabled`, `channels` (`chat` | `phone` | `in_person`), `hours?` (`days` 0=domingo..6, `from` inclusive, `to` exclusivo, `timezone?`, default `America/Argentina/Buenos_Aires`) y `contactLabel?`.

`decideHandoff(state, config, now)` extiende `decideNextStep`. Disparadores, en orden de prioridad:

1. La persona pidio una persona (`userAskedForPerson`) -> `user_requested`.
2. Umbrales de intentos/frustracion existentes (`shouldEscalate`) -> `high_friction`.
3. Campo marcado `sensitive` (contratos, firmas) -> `sensitive_field`.

Resultado:

- Hay ayuda disponible ahora -> `handoff_to_human` con `handoffChannel` (canal preferido si el tenant lo ofrece; si no, prioridad chat > phone > in_person).
- No hay ayuda ahora -> `handoff_human_or_save_partial` (guardar parcial y dejar el pedido) para los casos 1 y 2. Un campo sensible solo no fuerza escalamiento si no hay ayuda: queda la decision base (el agente ya confirma los campos sensibles).

Sin disparadores el comportamiento es identico a `decideNextStep`.

## 4. API y base de datos

Migracion `0004_help_handoff` (tambien en `scripts-db-dev-init.sh`):

- `TenantHelpConfig`: `tenantId` unico, `enabled`, `channelsJson`, `hoursJson`, `contactLabel`.
- `HandoffRequest`: `tenantId`, `sessionId`, `channel`, `reason`, `status` (default `open`), `summaryJson` (respuestas hasta el momento), `createdAt`.

Endpoints (`apps/api/src/server.ts`):

| Metodo y ruta | Quien | Descripcion |
| --- | --- | --- |
| `GET /tenants/:tenantId/help-config` | publico | Config + `availableNow`. Sin config: `enabled=false`. |
| `PUT /tenants/:tenantId/help-config` | admin | Valida y guarda; deja registro de auditoria. |
| `POST /sessions/:sessionId/handoff` | usuario final | Crea un `HandoffRequest` con el resumen de respuestas. 404 sin sesion, 409 si el tenant no tiene ayuda habilitada, 400 si canal/motivo invalidos. Una sola solicitud abierta por sesion. |
| `GET /tenants/:tenantId/handoffs` | admin | Solicitudes abiertas, mas nuevas primero, paginadas. |

`POST /agent/next-turn` acepta `tenantId` (usa la config guardada), `humanHelp`, `userAskedForPerson` y `field.sensitive`.

## Fuera de alcance de esta iteracion

- UI en frontend/backoffice (pantalla de configuracion de ayuda, bandeja de solicitudes, chat humano en vivo).
- Cerrar/resolver solicitudes (hoy `status` solo nace `open`).
- Notificar al ayudante, autenticacion real del endpoint de handoff.
- El resumen incluye valores de respuestas: tratarlo como dato personal (retencion, acceso por rol).
