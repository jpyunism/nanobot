# Plan: Telegram Generative UI — Rich Messages, streaming nativo y teclados generados por el agente

Spec: `docs/spec-telegram-generative-ui.md`

## Componentes y dependencias

```
TelegramChannel (runtime.py)
   ├── _try_send_rich()          → + reply_markup, is_ephemeral/receiver_user_id, chunks rich >4096
   ├── send_delta()              → + sendRichMessageDraft (draft_id por stream) + fix final
   ├── _StreamBuf                → + draft_id: int | None
   ├── _send_reply_keyboard()    → nuevo: ReplyKeyboardMarkup (one_time + placeholder)
   ├── _set_chat_menu_commands() → nuevo: setMyCommands con scope por chat
   └── _send_ephemeral()         → nuevo: is_ephemeral + receiver_user_id (fallback sin ephemeral)

OutboundMessage (bus/events.py) → + rich: bool|None, reply_keyboard, menu_commands, ephemeral
MessageTool (agent/tools/message.py) → + rich, reply_keyboard, menu_commands, ephemeral (validación)
manifest.py + webui/index.ts → + richMessages en setup del canal
```

## Orden de implementación

### T1: Tests primero (TDD) — `nanobot/channels/telegram/tests/test_telegram_channel.py`

1. **T1.1 Rich send extendido**
   - `_try_send_rich` envía markdown + reply_markup (payload dict con `reply_markup`)
   - `_try_send_rich` con `is_ephemeral=True` + `receiver_user_id` en el payload
   - Rich send con contenido > 30.000 chars → chunks rich (2+ llamadas a
     `sendRichMessage`)
   - Fallback legacy con latch-off (ya existe, se mantiene verde)
2. **T1.2 Draft streaming**
   - `send_delta` con `rich_messages=True`: primer delta → `sendRichMessageDraft` con
     `draft_id` no nulo; deltas siguientes → mismo `draft_id`, contenido acumulado
   - `stream_end` → `sendRichMessage` con el texto final; buffer limpiado
   - `send_delta` sin `rich_messages` → path legacy (send + edit) intacto
   - `sendRichMessageDraft` falla (BadRequest "Method not found") → fallback al path
     legacy (send_message + edit_message_text)
3. **T1.3 Reply keyboard**
   - `send()` con `reply_keyboard=[["A","B"],["C"]]` → `send_message` con
     `reply_markup=ReplyKeyboardMarkup` (one_time_keyboard=True,
     input_field_placeholder presente)
   - Reply keyboard solo en el último chunk (mensaje final), no en chunks intermedios
4. **T1.4 Comandos dinámicos**
   - `send()` con `menu_commands=[{command, description}]` → `setMyCommands` llamado
     con `scope={"type": "chat", "chat_id": ...}`
   - `setMyCommands` falla → no lanza (best-effort, log debug)
5. **T1.5 Ephemeral**
   - `send()` con `ephemeral=True` → `send_message` con `is_ephemeral=True` +
     `receiver_user_id`
   - BadRequest por ephemeral no soportado → reintento sin `is_ephemeral` (mensaje
     normal enviado)
6. **T1.6 Tool message**
   - `MessageTool.execute` con `rich=True`, `reply_keyboard`, `menu_commands`,
     `ephemeral=True` → `OutboundMessage` con los campos seteados
   - Validación: `reply_keyboard` debe ser list[list[str]] (error si no)

### T2: Implementación en `nanobot/channels/telegram/runtime.py`

1. `_try_send_rich()`: acepta `is_ephemeral`/`receiver_user_id`; split rich en 30.000
   chars (loop de chunks con `sendRichMessage` por chunk)
2. `send_delta()`: path draft nativo
   - `_StreamBuf.draft_id: int | None`
   - Primer delta rich: `sendRichMessageDraft(chat_id, draft_id, rich_message={markdown})`
   - Deltas rich: mismo draft_id, contenido acumulado, throttle `stream_edit_interval`
   - `stream_end` rich: `sendRichMessage` con texto final; pop buffer
   - Fallback: si `sendRichMessageDraft` lanza BadRequest de capacidad → latch-off
     `_rich_send_disabled` + path legacy
3. `_send_reply_keyboard()`: construye `ReplyKeyboardMarkup` y lo adjunta al último
   chunk del mensaje final
4. `_set_chat_menu_commands()`: `setMyCommands(commands, scope={"type": "chat",
   "chat_id": chat_id})` best-effort
5. `_send_ephemeral()`: `send_message(..., is_ephemeral=True, receiver_user_id=...)`;
   BadRequest → reintento sin ephemeral
6. `send()`: orquesta los nuevos campos (rich, reply_keyboard, menu_commands,
   ephemeral) según el `OutboundMessage`

### T3: Bus + tool

1. `nanobot/bus/events.py`: `OutboundMessage` + `rich: bool | None = None`,
   `reply_keyboard: list[list[str]] = field(default_factory=list)`,
   `menu_commands: list[dict] = field(default_factory=list)`,
   `ephemeral: bool = False`
2. `nanobot/agent/tools/message.py`: parámetros `rich`, `reply_keyboard`,
   `menu_commands`, `ephemeral` con validación (reply_keyboard list[list[str]],
   menu_commands list[dict] con `command`/`description` strings)

### T4: Setup del canal (manifest + WebUI)

1. `nanobot/channels/telegram/manifest.py`: campo `richMessages` en `SETUP_SPEC`
   (bool, default false)
2. `nanobot/channels/telegram/webui/index.ts`: field `channels.telegram.richMessages`
   en `setup.fields`

### T5: Verificación final + PR

1. `pytest nanobot/channels/telegram/tests/test_telegram_channel.py -v` verde
2. `ruff check nanobot/channels/telegram/ nanobot/agent/tools/message.py nanobot/bus/events.py`
3. Smoke: `pytest tests/ -q` (suite completa)
4. Commit conventional (`feat(telegram): ...`), push al fork, PR a madkoding/nanobot
   con tests (requisito del PR Guardian)

## Riesgos y mitigaciones

- **PTB sin tipos rich (22.8)**: payloads dict vía `do_api_request` (patrón existente);
  si PTB 23 sale con tipos, migrar después sin cambio de contrato.
- **Draft expirado (30 s)**: el fix final con `sendRichMessage` siempre envía el
  mensaje completo; el draft se descarta solo.
- **Servidor viejo**: latch-off `_rich_send_disabled` + fallback legacy (ya existe).
- **Flood control**: throttle con `stream_edit_interval` (ya existe) + retry con
  backoff en `_call_with_retry`.
- **Ephemeral en servidor 10.1**: BadRequest → reintento sin `is_ephemeral`
  (best-effort, sin latch).
- **Reply keyboard en streaming**: solo en stream_end (nunca en previews) para no
  confundir al usuario con teclados que cambian.
