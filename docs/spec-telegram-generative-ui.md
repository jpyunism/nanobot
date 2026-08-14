# Spec: Telegram Generative UI — Rich Messages + App Actions

## Objective

Mejorar el canal Telegram de nanobot para aprovechar **todas las capacidades de UI que
ofrece un bot de Telegram**, con foco en lo que Telegram llama **Generative UI**: que el
modelo (el agente) genere interfaces interactivas dinámicamente, no solo texto.

La base es **Bot API 10.1/10.2 (jun–jul 2026)**:

- **Rich Messages** (`sendRichMessage`): mensajes altamente estructurados — headings,
  tablas nativas, listas y todo-lists, blockquotes, `details` colapsables, fórmulas LaTeX,
  footnotes, mapas, collages, slideshows, media embebida — hasta 32.768 chars y 500
  bloques. Es el formato ideal para respuestas de IA (reportes, documentación, menús,
  resúmenes).
- **Streaming de Rich Messages** (`sendRichMessageDraft`): el bot muestra un borrador
  efímero (~30 s) que se anima con cada update del mismo `draft_id`; al terminar se
  "fija" con `sendRichMessage`. Reemplaza el patrón actual de "enviar mensaje y editarlo"
  con algo nativo, sin parpadeos y sin dejar mensajes intermedios.
- **App Actions** (Bot API 9.x, "generative UI" propiamente): el bot declara acciones
  (`setMyActions` / `setMyDefaultActions`) que Telegram sugiere contextualmente al
  usuario según el contenido del chat (p.ej. "Ver agenda de hoy", "Crear tarea",
  "Resumir conversación"). El usuario toca la acción → el bot recibe un
  `action_updated`/callback con payload → responde. Es UI generada por el agente: las
  acciones se definen en runtime según el estado del usuario.

**Usuario**: operador del gateway (Telegram/WebUI). **Éxito**: las respuestas del bot en
Telegram usan Rich Messages cuando aportan (tablas/estructura), el streaming usa drafts
nativos, y el bot ofrece acciones contextuales generadas por el agente.

## Assumptions

1. El canal Telegram ya tiene un fast-path `sendRichMessage` (config `rich_messages`,
   runtime.py:673-726) que envía markdown crudo vía `do_api_request` y hace latch-off si
   el servidor no lo soporta. Se mantiene y se extiende.
2. `python-telegram-bot` 22.8 **no** tiene tipos para Rich Messages (issue #5261 abierta
   upstream); el envío se hace vía `bot.do_api_request("sendRichMessage", ...)` con
   payloads dict — patrón ya usado en el repo.
3. El streaming actual (`send_delta`) usa el patrón "send + edit_message_text" con
   previews en texto plano. Los drafts nativos son superiores (efímeros, animados, sin
   parpadeo) y se integran en `send_delta` sin cambiar el contrato del bus.
4. App Actions requiere que el bot tenga `inline_keyboards`/acciones habilitadas y que el
   usuario tenga la versión de Telegram que las soporta; el fallback es no hacer nada
   (las acciones son sugerencias, no bloquean).
5. El agente genera las acciones: se agrega un parámetro `actions` al tool `message`
   (y al `OutboundMessage`), el canal las registra vía `setMyActions` con scope por chat.
6. Los mensajes rich se envían con `reply_parameters` (no `reply_to_message_id`) y
   soportan `reply_markup` (inline keyboards) — ya implementado en `_try_send_rich`.
7. El límite de 32.768 chars de Rich Messages es mayor que el de 4.096 de sendMessage;
   el split actual (4000/4096) se mantiene para el path legacy, y el path rich puede
   enviar chunks más grandes (se define en la spec: 30.000 chars por chunk rich).

## Tech Stack

- Python 3.11+, asyncio
- `python-telegram-bot` 22.8 (sin tipos rich; payloads dict vía `do_api_request`)
- pytest (tests de regresión), ruff (lint)

## Commands

```bash
# Tests nuevos + regresión
pytest tests/channels/telegram/test_telegram_channel.py -v
pytest tests/agent/test_message_tool.py -v  # si existe

# Lint
ruff check nanobot/channels/telegram/ nanobot/agent/tools/message.py

# Smoke general
pytest tests/ -v -x -q  # suite completa (excl. whatsapp/neonize si fallan por deps)
```

## Project Structure

- `nanobot/channels/telegram/runtime.py` → `TelegramChannel`:
  - `_try_send_rich()`: extiende para soportar `rich_message` payload completo
    (markdown + media + blocks) y chunks > 4096.
  - `send_delta()`: nuevo path de streaming con `sendRichMessageDraft` (draft_id por
    stream) + fix final con `sendRichMessage`.
  - `_on_action_updated()`: handler de updates `action_updated` → inyecta el payload
    como mensaje al bus (como callback query).
  - `_register_actions()`: `setMyActions` con scope por chat (Bot API 9.x).
- `nanobot/bus/events.py` → `OutboundMessage`: campo `actions: list[dict]` (opcional).
- `nanobot/agent/tools/message.py` → `MessageTool`: parámetro `actions` (lista de
  dicts: `{id, title, description?, icon?}`).
- `nanobot/channels/telegram/manifest.py` → `SETUP_SPEC`: campo `richMessages` y
  `appActions` (bool, default false) en el setup del canal.
- `webui/src/components/settings/channels/...` → campos de configuración del canal
  Telegram (richMessages, appActions).

## Behavior

### 1. Rich Messages (extensión del fast-path existente)

- `_try_send_rich()` ya envía `{rich_message: {markdown: content}}`. Se extiende:
  - Si `msg.actions` está presente, se incluyen en el payload (ver §3).
  - Si el contenido excede 30.000 chars, se parte en chunks rich (límite 32.768).
- El latch `_rich_send_disabled` se mantiene: si el servidor no soporta
  `sendRichMessage`, se cae al path legacy (HTML) sin degradar.

### 2. Streaming con drafts nativos

- En `send_delta()` con `streaming=True` y `rich_messages=True`:
  - Primer delta: `sendRichMessageDraft(chat_id, draft_id=<random>, rich_message={markdown: preview})`.
  - Deltas siguientes: mismo `draft_id`, contenido acumulado (con throttle por
    `stream_edit_interval`).
  - `stream_end`: `sendRichMessage(chat_id, rich_message={markdown: texto_final})` y
    Telegram reemplaza el draft automáticamente (no hay que borrar nada).
  - Si `sendRichMessageDraft` falla (servidor viejo), se cae al path actual
    (send + edit).
- El draft es efímero: si el stream se corta (crash), no queda mensaje basura.

### 3. App Actions (generative UI)

- El tool `message` acepta `actions: [{id, title, description?, icon?}]`.
- `OutboundMessage.actions` se propaga al canal.
- El canal llama `setMyActions(scope={type: "chat", chat_id}, actions=[...])` con las
  acciones del último mensaje (se reemplazan por las del mensaje más reciente).
- El bot recibe updates `action_updated` (allowed_updates incluye "action_updated"
  cuando `appActions` está habilitado). El handler `_on_action_updated`:
  - Valida `is_allowed(sender_id)`.
  - Inyecta al bus un mensaje con contenido `[action: <action_id>]` + metadata
    (`action_id`, `action_payload`, `user_id`, ...) — el agente lo interpreta y
    responde.
- Config: `appActions: bool = False` (opt-in, requiere Bot API 9.x+).

### 4. Config del canal

- `rich_messages: bool = False` (ya existe) — se mantiene.
- `app_actions: bool = False` — nuevo, opt-in.
- `streaming: bool = True` (ya existe) — los drafts se usan solo si `rich_messages`
  está activo.

## Edge Cases

- **Servidor Bot API viejo**: `sendRichMessage`/`sendRichMessageDraft` fallan con
  "method not found" → latch-off + fallback legacy (ya implementado).
- **Draft expirado (30 s)**: si el stream tarda más, Telegram descarta el draft; el
  fix final con `sendRichMessage` igualmente envía el mensaje completo (el draft
  desaparece solo).
- **Acciones sin soporte**: `setMyActions` falla silenciosamente (log debug); el bot
  sigue funcionando sin acciones.
- **`action_updated` sin chat**: se ignora (log warning).
- **Chunks rich > 32.768**: se parte en 30.000 por chunk (margen de seguridad).
- **`reply_markup` en rich**: se pasa como parámetro (ya soportado por
  `sendRichMessage`).

## Acceptance Criteria

1. `_try_send_rich()` envía `sendRichMessage` con markdown y, si hay, `actions` y
   `reply_markup`; fallback legacy intacto.
2. `send_delta()` con `rich_messages=True` usa `sendRichMessageDraft` (draft_id
   estable por stream) y fija con `sendRichMessage` en `stream_end`; sin drafts si
   `rich_messages=False` o si el servidor no lo soporta.
3. `OutboundMessage.actions` y el parámetro `actions` del tool `message` existen y se
   propagan al canal.
4. `_on_action_updated()` inyecta `[action: <id>]` al bus con metadata, validando
   `is_allowed`.
5. Config: `app_actions` en `TelegramConfig` + setup del canal (manifest + WebUI).
6. Tests: (a) rich send con markdown/actions/reply_markup, (b) draft streaming con
   draft_id estable y fix final, (c) fallback legacy cuando el servidor no soporta
   rich, (d) action_updated → bus con metadata, (e) `setMyActions` con scope por chat.
7. `pytest tests/channels/telegram/ -v` verde; `ruff check` limpio.
