# Tasks: Fix watchdog de canales — reinicio en loop y canales muertos sin reintento

Spec: `docs/spec-fix-watchdog-canales.md` · Plan: `tasks/plan.md`

## Tareas

### T1: TDD (RED) — tests de regresión

- [x] **T1.1 Test manager: restart del watchdog resetea last_activity_at**
  - Acceptance: canal sano con `last_activity_at` viejo (>600s) → el watchdog lo reinicia una vez y el timer queda en 0 (sin loop); el test falla (RED) porque hoy no se resetea
  - Verify: `uv run pytest tests/channels/test_channel_watchdog.py -q` falla (RED)
  - Files: `tests/channels/test_channel_watchdog.py`

- [x] **T1.2 Test manager: canal con start fallido se reintenta**
  - Acceptance: canal cuyo task de start terminó (falló) → el watchdog crea un task nuevo (reintento) en vez de saltearlo; el test falla (RED) porque hoy hace `continue`
  - Verify: `uv run pytest tests/channels/test_channel_watchdog.py -q` falla (RED)
  - Files: `tests/channels/test_channel_watchdog.py`

- [x] **T1.3 Test telegram: stop seguro tras start fallido**
  - Acceptance: `start()` que falla en `initialize()` → `is_running == False` y `stop()` posterior no lanza `RuntimeError`; el test falla (RED) porque hoy `_running` queda `True` y `stop()` lanza
  - Verify: `uv run pytest nanobot/channels/telegram/tests/test_telegram_channel.py -q -k "start_failure"` falla (RED)
  - Files: `nanobot/channels/telegram/tests/test_telegram_channel.py`

### T2: Implementación (GREEN)

- [x] **T2.1 `_start_channel` resetea last_activity_at**
  - Acceptance: `channel.last_activity_at = 0.0` antes de `await channel.start()` (D1)
  - Verify: T1.1 pasa (GREEN)
  - Files: `nanobot/channels/manager.py`

- [x] **T2.2 Watchdog reintenta canales fallidos**
  - Acceptance: task done o canal en `_channel_errors` → `_start_channel_task` con throttle `WATCHDOG_RETRY_INTERVAL_S` (60s) por canal (D2)
  - Verify: T1.2 pasa (GREEN)
  - Files: `nanobot/channels/manager.py`

- [x] **T2.3 Telegram start/stop seguros**
  - Acceptance: `start()` limpia `_running=False`/`_app=None` en el except; `stop()` es no-op si `_app` es None o el updater no arrancó (D3)
  - Verify: T1.3 pasa (GREEN)
  - Files: `nanobot/channels/telegram/runtime.py`

### T3: Verificación y PR

- [x] **T3.1 Suite completa + lint**
  - Acceptance: `uv run pytest` desde el dir del repo verde (sin regresiones nuevas) y `ruff check` limpio en los archivos tocados
  - Verify: salida de pytest y ruff

- [x] **T3.2 Commit + PR al fork**
  - Acceptance: commit conventional (`fix(channels): ...`), push a `jpyunism:fix/telegram-watchdog-restart`, PR a `madkoding/nanobot` con tests de regresión (requisito PR Guardian)
  - Verify: PR abierto en GitHub con CI verde
