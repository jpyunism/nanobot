# Tasks: Telegram Generative UI — Rich Messages + App Actions

Spec: `docs/spec-telegram-generative-ui.md` · Plan: `tasks/plan.md`

## Tareas

- [ ] **T1: Tests de regresión `tests/channels/telegram/test_telegram_channel.py`**
  - Acceptance: cubre (1) rich send con markdown/actions/reply_markup, (2) chunks rich > 30.000 chars, (3) fallback legacy con latch-off, (4) draft streaming con draft_id estable + fix final, (5) path legacy intacto sin rich, (6) action_updated → bus con metadata, (7) setMyActions con scope por chat
  - Verify: `pytest tests/channels/telegram/test_telegram_channel.py -v` verde
  - Files: `tests/channels/telegram/test_telegram_channel.py`

- [ ] **T2: Implementación en `nanobot/channels/telegram/runtime.py`**
  - Acceptance: `_try_send_rich()` con actions + chunks rich; `send_delta()` con drafts nativos; `_on_action_updated()` + `_register_actions()`; `app_actions` en config; allowed_updates con action_updated
  - Verify: `pytest tests/channels/telegram/test_telegram_channel.py -v` verde + `ruff check` limpio
  - Files: `nanobot/channels/telegram/runtime.py`

- [ ] **T3: Bus + tool message**
  - Acceptance: `OutboundMessage.actions` (list[dict]) y parámetro `actions` en `MessageTool` con validación
  - Verify: `pytest tests/agent/ -v` verde (si hay tests del tool) + `ruff check` limpio
  - Files: `nanobot/bus/events.py`, `nanobot/agent/tools/message.py`

- [ ] **T4: Setup del canal (manifest + WebUI)**
  - Acceptance: campo `appActions` en `SETUP_SPEC` y en `webui/index.ts` del canal
  - Verify: `bun run build` en webui (si aplica) o revisión manual del JSON
  - Files: `nanobot/channels/telegram/manifest.py`, `nanobot/channels/telegram/webui/index.ts`

- [ ] **T5: Verificación final + PR**
  - Acceptance: pytest (nuevo + smoke), ruff verdes; branch en fork; PR a madkoding/nanobot con tests
  - Verify: suite completa + PR abierto
  - Files: — (git ops)
