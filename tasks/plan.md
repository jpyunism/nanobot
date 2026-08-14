# Plan: Telegram Generative UI — Rich Messages + App Actions

Spec: `docs/spec-telegram-generative-ui.md`

## Componentes y dependencias

```
TelegramChannel (runtime.py)
   ├── _try_send_rich()        → + actions, chunks rich >4096
   ├── send_delta()            → + sendRichMessageDraft (draft_id por stream)
   ├── _on_action_updated()    → nuevo handler (action_updated → bus)
   └── _register_actions()     → setMyActions con scope por chat

OutboundMessage (bus/events.py) → + actions: list[dict]
MessageTool (agent/tools/message.py) → + actions param
TelegramConfig (runtime.py) → + app_actions: bool
manifest.py + webui/index.ts → + appActions en setup
```

## Orden de implementación

1. **T1: Tests primero (TDD)** — `tests/channels/telegram/test_telegram_channel.py`
   - Test 1: `_try_send_rich` envía markdown + actions + reply_markup (payload dict)
   - Test 2: rich send con contenido > 30.000 chars → chunks rich
   - Test 3: fallback legacy cuando el servidor no soporta rich (latch-off)
   - Test 4: `send_delta` con rich → `sendRichMessageDraft` con draft_id estable y
     `sendRichMessage` en stream_end
   - Test 5: `send_delta` sin rich → path legacy (send + edit) intacto
   - Test 6: `_on_action_updated` → mensaje `[action: <id>]` al bus con metadata
   - Test 7: `setMyActions` con scope por chat
2. **T2: Implementación** — `nanobot/channels/telegram/runtime.py`:
   - `_try_send_rich()`: payload con `actions` (si hay), split rich en 30.000
   - `send_delta()`: path draft nativo (draft_id por stream, throttle, fix final)
   - `_on_action_updated()` + `_register_actions()` + `app_actions` en config
   - allowed_updates incluye "action_updated" cuando app_actions
3. **T3: Bus + tool** — `nanobot/bus/events.py` (`actions` en OutboundMessage) y
   `nanobot/agent/tools/message.py` (parámetro `actions` con validación)
4. **T4: Setup del canal** — `manifest.py` (campo appActions) + `webui/index.ts`
5. **T5: Verificación + PR** — pytest (nuevo + smoke), ruff, branch en fork,
   PR a madkoding/nanobot con tests

## Riesgos y mitigaciones

- **PTB sin tipos rich (22.8)**: payloads dict vía `do_api_request` (patrón existente);
  si PTB 23 sale con tipos, migrar después sin cambio de contrato.
- **Draft expirado (30 s)**: el fix final con `sendRichMessage` siempre envía el
  mensaje completo; el draft se descarta solo.
- **Servidor viejo**: latch-off `_rich_send_disabled` + fallback legacy (ya existe).
- **Flood control**: throttle con `stream_edit_interval` (ya existe) + retry con
  backoff en `_call_with_retry`.
