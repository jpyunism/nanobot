# Tasks: Telegram Thinking Blocks — razonamiento interno del agente visible en el chat

Spec: `docs/spec-telegram-thinking-blocks.md` · Plan: `tasks/plan.md`

## Tareas

### T1: Tests primero (TDD) — `nanobot/channels/telegram/tests/test_telegram_channel.py`

- [ ] **T1.1 Reasoning delta acumula y abre draft**
  - Acceptance: `send_reasoning_delta` con `rich_messages=True` + chat privado → primer delta llama `sendRichMessageDraft` con `draft_id` no nulo y markdown con `<tg-thinking>…</tg-thinking>`; deltas siguientes → mismo `draft_id`, reasoning acumulado; `send_reasoning_end` cierra el segmento sin enviar nada nuevo
  - Verify: `pytest nanobot/channels/telegram/tests/test_telegram_channel.py -v` verde
  - Files: `nanobot/channels/telegram/tests/test_telegram_channel.py`

- [ ] **T1.2 Reasoning en legacy (grupos / rich off)**
  - Acceptance: `send_reasoning_delta` con `rich_messages=False` → preview legacy (`send_message` + `edit_message_text`) con `<blockquote expandable>`; `send_reasoning_end` → no-op
  - Verify: `pytest nanobot/channels/telegram/tests/test_telegram_channel.py -v` verde
  - Files: `nanobot/channels/telegram/tests/test_telegram_channel.py`

- [ ] **T1.3 Fijación con draft_id + details final**
  - Acceptance: `stream_end` con draft activo → `sendRichMessage` con `draft_id` (reemplaza el draft) y markdown final = contenido + `<details><summary>🧠 Razonamiento</summary>…</details>`; `reply_parameters` conservado; buffer limpiado
  - Verify: `pytest nanobot/channels/telegram/tests/test_telegram_channel.py -v` verde
  - Files: `nanobot/channels/telegram/tests/test_telegram_channel.py`

- [ ] **T1.4 Fallback por expiración del draft**
  - Acceptance: draft con `draft_expires_at` vencido en `stream_end` → path legacy (`send_message` + `edit_message_text`) con el contenido acumulado
  - Verify: `pytest nanobot/channels/telegram/tests/test_telegram_channel.py -v` verde
  - Files: `nanobot/channels/telegram/tests/test_telegram_channel.py`

- [ ] **T1.5 Fallback por fallo de fijación**
  - Acceptance: `sendRichMessage` falla al fijar (BadRequest) → fallback legacy con el contenido acumulado; latch-off `_rich_send_disabled` si es error de capacidad
  - Verify: `pytest nanobot/channels/telegram/tests/test_telegram_channel.py -v` verde
  - Files: `nanobot/channels/telegram/tests/test_telegram_channel.py`

- [ ] **T1.6 show_reasoning=False**
  - Acceptance: `send_reasoning_delta` con `show_reasoning=False` → no-op (sin draft, sin acumulación)
  - Verify: `pytest nanobot/channels/telegram/tests/test_telegram_channel.py -v` verde
  - Files: `nanobot/channels/telegram/tests/test_telegram_channel.py`

- [ ] **T1.7 Sin reasoning (regresión)**
  - Acceptance: `send_delta` sin reasoning previo → path actual intacto (preview legacy + editMessageText rich in-place en stream_end, sin `<details>`)
  - Verify: `pytest nanobot/channels/telegram/tests/test_telegram_channel.py -v` verde
  - Files: `nanobot/channels/telegram/tests/test_telegram_channel.py`

### T2: Implementación en `nanobot/channels/telegram/runtime.py`

- [ ] **T2.1 `_StreamBuf` + reasoning**
  - Acceptance: campos `reasoning: str = ""`, `using_draft: bool = False`, `draft_expires_at: float = 0.0`
  - Files: `nanobot/channels/telegram/runtime.py`

- [ ] **T2.2 `send_reasoning_delta`**
  - Acceptance: acumula en `buf.reasoning`; privado + rich → `sendRichMessageDraft` con `draft_id` estable y `<tg-thinking>`; legacy → blockquote expandible; truncado a 8.000 chars
  - Files: `nanobot/channels/telegram/runtime.py`

- [ ] **T2.3 `send_reasoning_end`**
  - Acceptance: marca fin del segmento; no envía nada nuevo
  - Files: `nanobot/channels/telegram/runtime.py`

- [ ] **T2.4 `send_delta` con draft**
  - Acceptance: draft activo → actualiza con thinking + contenido parcial; draft expirado → switch a legacy
  - Files: `nanobot/channels/telegram/runtime.py`

- [ ] **T2.5 `_finalize_stream`**
  - Acceptance: draft activo → `sendRichMessage` con `draft_id` + `<details>` reasoning; sin draft → path actual; fallos → fallback legacy
  - Files: `nanobot/channels/telegram/runtime.py`

- [ ] **T2.6 `_fallback_legacy`**
  - Acceptance: envía contenido acumulado por `send_message` + `edit_message_text`
  - Files: `nanobot/channels/telegram/runtime.py`

### T3: Verificación final + PR

- [ ] **T3.1 Suite completa**
  - Acceptance: `pytest nanobot/channels/telegram/tests/ -q` verde + `ruff check nanobot/channels/telegram/` limpio + smoke `pytest tests/ -q`
  - Verify: comandos de verificación
  - Files: —

- [ ] **T3.2 Sync + commit + push**
  - Acceptance: sync a los 3 site-packages del gateway; commit conventional (`feat(telegram): thinking blocks para reasoning`); push a `feature/telegram-generative-ui`
  - Verify: `git log --oneline -3` + `git push origin feature/telegram-generative-ui`
  - Files: —
