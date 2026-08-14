# Tasks: Telegram Generative UI — Rich Messages, streaming nativo y teclados generados por el agente

Spec: `docs/spec-telegram-generative-ui.md` · Plan: `tasks/plan.md`

## Tareas

### T1: Tests de regresión — `nanobot/channels/telegram/tests/test_telegram_channel.py`

- [ ] **T1.1 Rich send extendido**
  - Acceptance: `_try_send_rich` envía markdown + reply_markup; con `is_ephemeral=True` + `receiver_user_id` en payload; contenido > 30.000 chars → chunks rich (2+ llamadas)
  - Verify: `pytest nanobot/channels/telegram/tests/test_telegram_channel.py -v` verde
  - Files: `nanobot/channels/telegram/tests/test_telegram_channel.py`

- [ ] **T1.2 Draft streaming**
  - Acceptance: `send_delta` rich → `sendRichMessageDraft` con draft_id no nulo y estable; `stream_end` → `sendRichMessage` final; fallback legacy si el servidor no soporta drafts; path legacy intacto sin rich
  - Verify: `pytest nanobot/channels/telegram/tests/test_telegram_channel.py -v` verde
  - Files: `nanobot/channels/telegram/tests/test_telegram_channel.py`

- [ ] **T1.3 Reply keyboard**
  - Acceptance: `send()` con `reply_keyboard` → `ReplyKeyboardMarkup` (one_time + placeholder) en el último chunk; no en chunks intermedios
  - Verify: `pytest nanobot/channels/telegram/tests/test_telegram_channel.py -v` verde
  - Files: `nanobot/channels/telegram/tests/test_telegram_channel.py`

- [ ] **T1.4 Comandos dinámicos**
  - Acceptance: `send()` con `menu_commands` → `setMyCommands` con scope `{"type": "chat", "chat_id": ...}`; fallo de `setMyCommands` no lanza
  - Verify: `pytest nanobot/channels/telegram/tests/test_telegram_channel.py -v` verde
  - Files: `nanobot/channels/telegram/tests/test_telegram_channel.py`

- [ ] **T1.5 Ephemeral**
  - Acceptance: `send()` con `ephemeral=True` → `is_ephemeral` + `receiver_user_id`; BadRequest → reintento sin ephemeral (mensaje normal)
  - Verify: `pytest nanobot/channels/telegram/tests/test_telegram_channel.py -v` verde
  - Files: `nanobot/channels/telegram/tests/test_telegram_channel.py`

- [ ] **T1.6 Tool message**
  - Acceptance: `MessageTool.execute` con `rich`/`reply_keyboard`/`menu_commands`/`ephemeral` → `OutboundMessage` con campos seteados; validación de tipos (error si `reply_keyboard` no es list[list[str]])
  - Verify: `pytest nanobot/channels/telegram/tests/test_telegram_channel.py -v` verde (o test del tool si existe)
  - Files: `nanobot/channels/telegram/tests/test_telegram_channel.py`

### T2: Implementación en `nanobot/channels/telegram/runtime.py`

- [ ] **T2.1 `_try_send_rich()` extendido**
  - Acceptance: acepta `is_ephemeral`/`receiver_user_id`; split rich en 30.000 chars (loop de chunks)
  - Verify: T1.1 verde + `ruff check` limpio
  - Files: `nanobot/channels/telegram/runtime.py`

- [ ] **T2.2 `send_delta()` con drafts nativos**
  - Acceptance: `_StreamBuf.draft_id`; primer delta rich → `sendRichMessageDraft`; deltas → mismo draft_id con throttle; `stream_end` → `sendRichMessage` final; fallback legacy si falla
  - Verify: T1.2 verde + `ruff check` limpio
  - Files: `nanobot/channels/telegram/runtime.py`

- [ ] **T2.3 Reply keyboard + comandos dinámicos + ephemeral**
  - Acceptance: `_send_reply_keyboard()` (one_time + placeholder, solo último chunk); `_set_chat_menu_commands()` (scope por chat, best-effort); `_send_ephemeral()` (fallback sin ephemeral); `send()` orquesta los campos nuevos
  - Verify: T1.3/T1.4/T1.5 verde + `ruff check` limpio
  - Files: `nanobot/channels/telegram/runtime.py`

### T3: Bus + tool message

- [ ] **T3.1 `OutboundMessage` extendido**
  - Acceptance: campos `rich: bool | None`, `reply_keyboard: list[list[str]]`, `menu_commands: list[dict]`, `ephemeral: bool` con defaults
  - Verify: `ruff check nanobot/bus/events.py` limpio
  - Files: `nanobot/bus/events.py`

- [ ] **T3.2 `MessageTool` extendido**
  - Acceptance: parámetros `rich`, `reply_keyboard`, `menu_commands`, `ephemeral` con validación de tipos
  - Verify: T1.6 verde + `ruff check` limpio
  - Files: `nanobot/agent/tools/message.py`

### T4: Setup del canal (manifest + WebUI)

- [ ] **T4.1 Manifest + WebUI**
  - Acceptance: campo `richMessages` en `SETUP_SPEC` y en `webui/index.ts` del canal
  - Verify: revisión manual del JSON de setup
  - Files: `nanobot/channels/telegram/manifest.py`, `nanobot/channels/telegram/webui/index.ts`

### T5: Verificación final + PR

- [ ] **T5.1 Verificación + PR**
  - Acceptance: pytest (nuevo + smoke), ruff verdes; branch en fork; PR a madkoding/nanobot con tests
  - Verify: suite completa + PR abierto
  - Files: — (git ops)
