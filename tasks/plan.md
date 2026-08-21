# Plan: Fix watchdog de canales — reinicio en loop y canales muertos sin reintento

Spec: `docs/spec-fix-watchdog-canales.md`

## Componentes y dependencias

```
ChannelManager (channels/manager.py)
   ├── _start_channel()        → resetear last_activity_at al (re)iniciar (D1)
   ├── _watchdog_loop()        → reintentar canales con task done / en _channel_errors (D2)
   └── WATCHDOG_RETRY_INTERVAL_S (nueva constante, 60s)

TelegramChannel (channels/telegram/runtime.py)
   ├── start()                 → limpiar _running/_app en el except (D3)
   └── stop()                  → no-op seguro si el updater no arrancó (D3)

Tests
   ├── nanobot/channels/manager_tests/  → watchdog: reset de liveness + retry de fallidos
   └── nanobot/channels/telegram/tests/test_telegram_channel.py → stop seguro tras start fallido
```

## Orden de implementación

### T1: TDD (RED) — tests de regresión
- Manager: canal sano con `last_activity_at` viejo → tras un restart del
  watchdog, el timer queda en 0 (no se reinicia en loop).
- Manager: canal cuyo task de start terminó (falló) → el watchdog lo reintenta
  (nuevo task creado) en vez de `continue`.
- Telegram: `start()` que falla en `initialize()` → `is_running == False` y
  `stop()` posterior no lanza (no-op).
- Estado RED: hoy el watchdog no resetea, saltea los done y `stop()` lanza
  `RuntimeError`.

### T2: Implementación (GREEN)
- `_start_channel`: `channel.last_activity_at = 0.0` antes de `await channel.start()`.
- `_watchdog_loop`: si `task is None or task.done()` y el canal sigue registrado
  (o está en `_channel_errors`), reintentar con `_start_channel_task` (con
  throttle de `WATCHDOG_RETRY_INTERVAL_S` por canal para no martillar).
- `TelegramChannel.start()`: en el `except`, `self._running = False` y
  `self._app = None` antes de re-lanzar.
- `TelegramChannel.stop()`: si `self._app` es None → return; si el updater no
  está running, saltar `updater.stop()` (try/except RuntimeError o chequeo de
  estado) y seguir con `app.stop()`/`app.shutdown()`.

### T3: Verificación
- Suite completa del repo con `uv run pytest` (desde el dir del repo).
- `ruff check` limpio en los archivos tocados.
- Commit conventional + push al fork + PR a madkoding/nanobot (con test de
  regresión, requisito del PR Guardian).
