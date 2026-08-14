# Plan: Telegram Thinking Blocks — razonamiento interno del agente visible en el chat

Spec: `docs/spec-telegram-thinking-blocks.md`

## Componentes y dependencias

```
TelegramChannel (runtime.py)
   ├── send_reasoning_delta()   → nuevo: acumula reasoning + draft <tg-thinking> (privado) o blockquote expandible (legacy)
   ├── send_reasoning_end()     → nuevo: cierra segmento de reasoning
   ├── send_delta()             → + draft rich con thinking + contenido; fijación con draft_id en stream_end
   ├── _StreamBuf               → + reasoning: str, using_draft: bool, draft_expires_at: float
   ├── _finalize_stream()       → extraído de stream_end: rich (draft_id o editMessageText) + <details> reasoning
   └── _fallback_legacy()       → nuevo: expiración de draft / grupos / latch-off

ChannelManager (manager.py)     → ya despacha reasoning si show_reasoning (no se toca)
AgentRunner (runner.py)         → ya emite reasoning (no se toca)
```

## Orden de implementación

### T1: Tests primero (TDD) — `nanobot/channels/telegram/tests/test_telegram_channel.py`

1. **T1.1 Reasoning delta acumula y abre draft**
   - `send_reasoning_delta` con `rich_messages=True` + chat privado → primer delta
     llama `sendRichMessageDraft` con `draft_id` no nulo y markdown con
     `<tg-thinking>…</tg-thinking>`
   - Deltas siguientes → mismo `draft_id`, reasoning acumulado
   - `send_reasoning_end` → cierra el segmento (no envía nada nuevo; el draft queda
     con el thinking completo)
2. **T1.2 Reasoning en legacy (grupos / rich off)**
   - `send_reasoning_delta` con `rich_messages=False` → preview legacy
     (`send_message` + `edit_message_text`) con `<blockquote expandable>`
   - `send_reasoning_end` → no-op (el blockquote se cierra solo)
3. **T1.3 Fijación con draft_id + details final**
   - `stream_end` con draft activo → `sendRichMessage` con `draft_id` (reemplaza el
     draft) y markdown final = contenido + `<details><summary>🧠 Razonamiento</summary>…</details>`
   - `reply_parameters` conservado en el payload de fijación
   - Buffer limpiado tras fijar
4. **T1.4 Fallback por expiración del draft**
   - Draft con `draft_expires_at` vencido en `stream_end` → path legacy
     (`send_message` + `edit_message_text`) con el contenido acumulado
5. **T1.5 Fallback por fallo de fijación**
   - `sendRichMessage` falla al fijar (BadRequest) → fallback legacy con el contenido
     acumulado; latch-off `_rich_send_disabled` si es error de capacidad
6. **T1.6 show_reasoning=False**
   - `send_reasoning_delta` con `show_reasoning=False` → no-op (sin draft, sin
     acumulación)
7. **T1.7 Sin reasoning (regresión)**
   - `send_delta` sin reasoning previo → path actual intacto (preview legacy +
     editMessageText rich in-place en stream_end, sin `<details>`)

### T2: Implementación en `nanobot/channels/telegram/runtime.py`

1. `_StreamBuf` + `reasoning: str = ""`, `using_draft: bool = False`,
   `draft_expires_at: float = 0.0`
2. `send_reasoning_delta(chat_id, delta, metadata, *, stream_id)`:
   - Si `not self.show_reasoning` → return
   - Acumula en `buf.reasoning` (crea buffer si no existe, con `stream_id`)
   - Privado + rich habilitado → `sendRichMessageDraft` con `draft_id` estable
     (reutiliza `_next_draft_id()` si existe o genera uno por stream) y markdown
     `<tg-thinking>{reasoning}</tg-thinking>`; setea `using_draft=True`,
     `draft_expires_at = now + 25s` (margen bajo el límite de 30s)
   - Legacy → preview `send_message` con `<blockquote expandable>{reasoning}</blockquote>`
     (HTML) y `edit_message_text` en deltas siguientes (throttle `stream_edit_interval`)
3. `send_reasoning_end(chat_id, metadata, *, stream_id)`:
   - Marca `buf.reasoning_open = False`; si hay draft, lo deja como está (el
     `stream_end` fija con el thinking completo)
4. `send_delta()`:
   - Si `buf.using_draft` y hay reasoning acumulado → el draft se actualiza con
     `<tg-thinking>…</tg-thinking>` + contenido parcial (mismo `draft_id`)
   - Si `buf.using_draft` y el draft expiró (`now > draft_expires_at`) → switch a
     legacy: `send_message` con el contenido acumulado + reasoning en blockquote
   - `stream_end` → `_finalize_stream()` (ver T2.5)
5. `_finalize_stream()` (extraído del bloque `stream_end` actual):
   - Draft activo y no expirado → `sendRichMessage` con `draft_id`,
     `rich_message.markdown` = contenido + `<details><summary>🧠 Razonamiento</summary>…</details>`
     (si hay reasoning), `reply_parameters` si aplica, `reply_markup` si hay
     reply_keyboard staged
   - Sin draft → path actual (editMessageText rich in-place o legacy HTML)
   - Fallos → fallback legacy con contenido acumulado
6. `_fallback_legacy()`: envía el contenido acumulado por `send_message` +
   `edit_message_text` (reutiliza la lógica existente del path legacy)
7. Truncado: `buf.reasoning` se recorta a 8.000 chars (constante
   `TELEGRAM_REASONING_MAX_LEN`) para no inflar el mensaje final

### T3: Verificación final + PR

1. `pytest nanobot/channels/telegram/tests/test_telegram_channel.py -v` verde
2. `ruff check nanobot/channels/telegram/`
3. Smoke: `pytest tests/ -q` (suite completa)
4. Sync a los 3 site-packages del gateway (pyenv, uv tool, uv cache)
5. Commit conventional (`feat(telegram): thinking blocks para reasoning`), push al
   fork, PR a madkoding/nanobot con tests (requisito del PR Guardian)

## Riesgos y mitigaciones

- **Draft expirado (30 s)**: `draft_expires_at` con margen de 25 s; al expirar se
  switcha a legacy con el contenido acumulado (nunca se pierde texto).
- **Draft huérfano**: fijación **siempre** con `draft_id` en `stream_end`; si el
  stream se corta, el draft expira solo (~30 s) sin dejar basura permanente.
- **Servidor viejo (sin rich)**: latch-off `_rich_send_disabled` + fallback legacy
  (blockquote expandible) — ya existe el patrón.
- **Grupos**: drafts solo en chats privados; en grupos legacy directo.
- **Flood control**: throttle con `stream_edit_interval` (ya existe) + retry con
  backoff en `_call_with_retry`.
- **Reasoning largo**: truncado a 8.000 chars (constante) para no inflar el mensaje
  final ni pasarse del límite rich (32.768).
- **Reply keyboard en streaming**: solo en stream_end (ya implementado); el
  reasoning no lo interfiere (REQ-006).
