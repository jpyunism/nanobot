# Plan: ACK de mensajes inline (comandos priority y runtime-control)

Spec: `docs/spec-inline-ack-replay.md`

## Componentes y dependencias

```
run() (loop.py)
   ├── handle_runtime_control (loop.py:1223)  → + ack/nack del inbound
   ├── _dispatch_command_inline (loop.py:872) → + ack/nack del inbound
   │     ├── ruta priority (loop.py:1226)
   │     └── ruta no-priority en turno activo (loop.py:1254)
   └── _dispatch (loop.py:1302)               → SIN cambios (ya ackea/nackea)
```

## Orden de implementación

1. **Tests primero (TDD)**: crear `tests/agent/test_inline_ack.py`
   - Test 1: `/stop` despachado inline → `processing/` queda vacío (ack)
   - Test 2: dispatch inline que lanza → mensaje vuelve a `inbox/` (nack)
   - Test 3: runtime-control consumido → `processing/` queda vacío (ack)
   - Test 4: runtime-control que lanza → nack
   - Test 5: recover no revive un `/stop` ya acked (integración con cola durable)
2. **Implementación** en `nanobot/agent/loop.py`:
   - `_dispatch_command_inline()`: try/except → ack tras publish exitoso, nack ante error
   - `run()`: tras `handle_runtime_control()` → ack; try/except → nack
3. **Verificación**: pytest (nuevo + smoke durable_queue/stop_pending_queue/auto_compact),
   ruff, luego PR a madkoding/nanobot

## Riesgos y mitigaciones

- **Doble ack con `cmd_restart`**: `ack_inbound` es idempotente (pop + unlink
  missing_ok). Sin riesgo.
- **Nack de mensajes ya procesados**: solo se nackea si el dispatch/handler lanza; el
  mensaje vuelve a `inbox/` y se reintenta (comportamiento deseado, consistente con
  `_dispatch()`).
- **Cambio de comportamiento en tests existentes**: los tests actuales de
  `_dispatch_command_inline` no existen; los de `cmd_stop`/`cmd_status` usan mocks y no
  tocan el bus. Verificar con smoke suite.
- **PR Guardian (motoko-section9)**: exige tests para código de producción — los tests
  TDD del paso 1 lo cubren.

## Verificaciones (checkpoints)

- [ ] `pytest tests/agent/test_inline_ack.py -v` verde
- [ ] `pytest tests/bus/test_durable_queue.py tests/command/test_stop_pending_queue.py -v` verde (smoke)
- [ ] `pytest tests/agent/test_auto_compact.py -v` verde (priority commands path)
- [ ] `ruff check nanobot/agent/loop.py` limpio
- [ ] grep: `_dispatch_command_inline` contiene `ack_inbound` y `nack_inbound`
