# Spec: Telegram UX — Checklists nativos, polls de aprobación y efectos de mensaje

## Contexto

El canal Telegram de nanobot ya tiene rich messages, thinking blocks, reply
keyboards con cleanup, ephemeral y streaming. Para mejorar la experiencia del
usuario (flujo SDD en el chat), se agregan tres features de Bot API 10.2:

1. **Checklists nativos** (`sendChecklist`): todo lists interactivas — el usuario
   tilda items directamente en el mensaje y el bot recibe updates
   (`ChecklistTasksDone`). Ideal para trackear `tasks/todo.md` en el chat.
2. **Polls de aprobación** (`sendPoll`): decisiones con resultado visible
   (APROBAR/CAMBIOS/RECHAZAR como opciones de poll). El bot recibe `poll_answer`.
3. **Efectos de mensaje** (`message_effect_id`): animaciones (confeti 🎉) al
   celebrar aprobaciones o completar tareas.

## Investigación

### Checklists (Bot API 10.2)

- Método `sendChecklist(chat_id, checklist=InputChecklist(...))`.
- `InputChecklist`: `title` (1-255 chars tras parseo de entidades) + `tasks`
  (`InputChecklistTask`).
- El usuario tilda items en el mensaje; el bot recibe updates
  `ChecklistTasksDone` (checklist_id + tasks_done) y `ChecklistTasksAdded`.
- `python-telegram-bot` 22.8 **no** tiene tipos para checklists (mismo caso que
  rich messages, issue #5261) → payloads dict vía `do_api_request`.
- Límites de tasks: verificar en docs oficiales (el título 1-255 está confirmado
  por la doc de aiogram 3.30).

### Polls (Bot API clásica, sin versión)

- `sendPoll(chat_id, question, options, is_anonymous=False, ...)` — soportado
  nativamente por PTB 22.8 (`bot.send_poll`, tipos `Poll`, `PollAnswer`).
- El bot recibe `poll_answer` (poll_id + option_ids) cuando el usuario vota.
- Para aprobaciones en chat privado: poll de 1 usuario funciona (muestra su
  selección); en grupos muestra el resultado en vivo.

### Efectos de mensaje (Bot API 10.2)

- Parámetro `message_effect_id` en `sendMessage` (y otros send methods) y en
  `sendRichMessage`.
- IDs documentados en core.telegram.org (sección "Message effects"); ejemplos
  conocidos: confeti, fuegos artificiales, corazones, fuego, like.
- El efecto se aplica al mensaje enviado; el usuario lo ve animado una vez.
- Verificar: disponibilidad en grupos (los efectos están pensados para chats
  privados; en grupos puede fallar → best-effort sin latch).

## Estado actual en nanobot

- `TelegramChannel` envía rich vía `do_api_request` (payloads dict) — patrón
  reutilizable para `sendChecklist`.
- El tool `message` ya expone `rich`, `reply_keyboard`, `menu_commands`,
  `ephemeral` — se extiende con `checklist`, `poll` y `effect`.
- Los updates entrantes se manejan en `_on_message` / handlers de PTB
  (`CallbackQueryHandler`, `MessageHandler`) — se agregan handlers para
  `ChecklistTasksDone` y `PollAnswer`.
- `show_reasoning` / `rich_messages` ya controlan features por config.

## Objetivo

Que el agente pueda, desde el tool `message` (o un tool dedicado):

- Enviar una **checklist nativa** con las tareas del plan SDD; cuando el usuario
  tilda items, el bot recibe el update y el agente sincroniza el estado en
  `tasks/todo.md` (vía el tool `todos`).
- Enviar un **poll de aprobación** (APROBAR/CAMBIOS/RECHAZAR) con resultado
  visible; el `poll_answer` llega al agente como contexto del turno.
- Aplicar un **efecto de mensaje** (confeti por defecto) a mensajes de
  celebración (aprobación de spec, tarea completada).

**Usuario**: operador del gateway (Telegram). **Éxito**: el flujo SDD en el chat
usa checklists nativas para tareas, polls para decisiones, y efectos para
celebrar — todo sin salir de Telegram.

## Requisitos

| ID | Requisito |
|---|---|
| REQ-001 | El tool `message` acepta `checklist` (title + tasks) y envía `sendChecklist` vía `do_api_request` |
| REQ-002 | El canal recibe updates `ChecklistTasksDone` y los publica al agente como mensaje de contexto (con checklist_id y tasks_done) |
| REQ-003 | El tool `message` acepta `poll` (question + options) y envía `sendPoll` nativo |
| REQ-004 | El canal recibe `poll_answer` y lo publica al agente como contexto del turno |
| REQ-005 | El tool `message` acepta `effect` (id de efecto) y lo aplica al mensaje (sendMessage y sendRichMessage) |
| REQ-006 | Config `message_effect_id` por canal (default confeti) para celebración automática de aprobaciones |
| REQ-007 | Fallbacks best-effort: checklist/poll/effect no soportados → error claro sin romper el envío |
| REQ-008 | Tests de regresión: envío de checklist, poll, effect; handlers de updates entrantes |

## Decisiones de diseño

### D1: Checklist vía tool `message` (no tool dedicado)

- `checklist: {title: str, tasks: [str]}` en el tool `message` → `OutboundMessage`
  con campo `checklist`.
- `TelegramChannel.send()` detecta `msg.checklist` y llama `sendChecklist` con
  payload dict (patrón `_try_send_rich`).
- Alternativa descartada: tool dedicado `checklist` — más superficie de API para
  el mismo resultado; el tool `message` ya es el punto de envío.

### D2: Updates entrantes → contexto del turno

- `ChecklistTasksDone` y `PollAnswer` se convierten en `InboundMessage` con
  prefijo descriptivo (ej. "✅ El usuario marcó: T1.1, T1.2") y se encolan como
  un turno normal del agente (mismo session key del chat).
- El agente decide qué hacer (sincronizar `todos`, confirmar la decisión).
- No se responde automáticamente (evita spam); el agente responde si corresponde.

### D3: Efectos — config + param

- `message_effect_id` en `TelegramConfig` (default: confeti).
- El tool `message` acepta `effect: str | None` (override por mensaje).
- Se aplica en `send_message` y `sendRichMessage` (payload `message_effect_id`).
- Best-effort: BadRequest → reintento sin efecto (sin latch).

### D4: Polls — nativo PTB

- `sendPoll` con `is_anonymous=False` (decisiones visibles), `allows_multiple_answers=False`.
- El `poll_answer` se publica al agente con el texto de la opción elegida
  (resuelto vía el poll cacheado en el canal).

## Alcance

**Dentro**:
- `TelegramChannel`: `send_checklist`, handler `ChecklistTasksDone`, handler
  `PollAnswer`, `message_effect_id` en payloads
- `OutboundMessage` + `checklist`, `poll`, `effect`
- Tool `message` + `checklist`, `poll`, `effect` (validación)
- `TelegramConfig` + `message_effect_id`
- Tests de regresión

**Fuera**:
- Sincronización automática de `tasks/todo.md` (la decide el agente vía tool
  `todos` existente)
- Otros canales
- Mini App / WebUI

## Notas

- PTB 22.8 no tiene tipos para checklists → payloads dict (patrón existente).
- Los IDs de efectos están documentados en core.telegram.org; el default (confeti)
  se verifica contra la API real antes del release.
- Límite de tasks por checklist: verificar en docs oficiales durante
  implementación (T1).
