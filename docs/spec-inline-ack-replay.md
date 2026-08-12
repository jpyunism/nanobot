# Spec: ACK de mensajes inline (comandos priority y runtime-control) para evitar replay al reiniciar

## Objective

Al reiniciar el gateway, el bot de Telegram reenvía una ráfaga de mensajes viejos
(bloques de `/status` con "Uptime: 0m 5s", "Stopped N task(s).", "No active task to
stop."). La causa raíz es que los mensajes despachados **inline** desde el loop de
`run()` nunca se reconocen (ACK) en la cola durable, quedan en `bus/inbound/processing/`
y `recover()` los re-encola en el próximo arranque.

**Usuario**: operador del gateway (Telegram/WebUI). **Éxito**: tras un reinicio del
gateway, ningún mensaje ya procesado se re-ejecuta ni se reenvía; `processing/` queda
vacío de mensajes inline consumidos.

## Assumptions

1. La cola durable (`DurableInboundQueue`) mueve `inbox/` → `processing/` al consumir y
   solo elimina el archivo con `ack_inbound()`. `recover()` (llamado en `run()` al
   arrancar) mueve todo lo que quedó en `processing/` de vuelta a `inbox/` para
   redelivery. Por lo tanto, **todo mensaje consumido debe ser acked** o se re-ejecuta en
   el próximo boot.
2. Los comandos priority (`/stop`, `/status`, `/restart`) se despachan inline vía
   `_dispatch_command_inline()` (loop.py:872) desde `run()` — tanto en la ruta priority
   (loop.py:1226) como en la ruta de comandos no-priority durante turno activo
   (loop.py:1254). `_dispatch_command_inline()` publica la respuesta pero **no hace ACK**.
3. `cmd_restart` ya hace ACK explícito (builtin.py:229) porque el proceso muere antes de
   que el loop pueda ackear; los demás comandos inline no.
4. Los mensajes de runtime-control (hot reload de image generation y MCP, manejados por
   `agent_context.handle_runtime_control` en loop.py:1223) también se consumen sin ACK y
   acumulan en `processing/`.
5. El ACK debe ocurrir **después** de despachar con éxito (mismo criterio que
   `_dispatch()`: `task_success` → ack, fallo → nack). Si el dispatch lanza, el mensaje
   debe quedar para redelivery (nack), no perderse.
6. No cambia el comportamiento de `_dispatch()` (turnos normales ya ackean/nackean en
   loop.py:1419-1422).

## Tech Stack

- Python 3.11+, asyncio
- pytest (tests de regresión)
- ruff (lint)

## Commands

```bash
# Tests nuevos + regresión
pytest tests/agent/test_inline_ack.py -v
pytest tests/bus/test_durable_queue.py -v

# Lint
ruff check nanobot/agent/loop.py nanobot/agent/context.py

# Smoke general
pytest tests/command/test_stop_pending_queue.py tests/agent/test_auto_compact.py -v
```

## Project Structure

- `nanobot/agent/loop.py` → `_dispatch_command_inline()` hace `ack_inbound(msg)` tras
  publicar la respuesta; `run()` hace ack tras `handle_runtime_control` (y nack si el
  handler lanza).
- `nanobot/agent/context.py` → sin cambios de lógica (el ack se hace en el caller).
- `tests/agent/test_inline_ack.py` → nuevo: tests de regresión del ACK inline.

## Behavior

### 1. Comandos priority inline (ruta loop.py:1226)

- Antes: `_dispatch_command_inline()` publica outbound, no ackea → el inbound queda en
  `processing/` → `recover()` lo re-encola al reiniciar → replay.
- Después: tras `dispatch_fn(ctx)` exitoso y publicación del outbound, se llama
  `bus.ack_inbound(msg)`. Si el dispatch lanza, se hace `bus.nack_inbound(msg)`.

### 2. Comandos no-priority durante turno activo (ruta loop.py:1254)

- Mismo tratamiento: ack tras dispatch exitoso, nack ante excepción.

### 3. Runtime-control (hot reload image/MCP, loop.py:1223)

- Tras `handle_runtime_control()` retornar `True` (mensaje consumido), se hace
  `bus.ack_inbound(msg)`. Si el handler lanza, nack.

### 4. Replay al reiniciar

- Con el fix, los mensajes inline consumidos ya no existen en `processing/` al apagar;
  `recover()` solo redelivera mensajes genuinamente interrumpidos (turnos normales en
  curso), que es el comportamiento deseado.

## Edge Cases

- **Dispatch falla**: nack → el mensaje vuelve a `inbox/` y se reintenta en el mismo
  boot (no se pierde). Consistente con `_dispatch()`.
- **Bus en memoria (sin workspace)**: `ack_inbound`/`nack_inbound` son no-ops (ya
  implementado en `MessageBus`), no hay cambio de comportamiento.
- **Mensaje ya acked por `cmd_restart`**: `ack_inbound` es idempotente (pop de dict +
  unlink missing_ok), no rompe nada.
- **Runtime-control con ack future**: el handler resuelve el `ack` future (mecanismo
  existente); el ack del bus es independiente y adicional.

## Acceptance Criteria

1. `_dispatch_command_inline()` ackea el inbound tras dispatch exitoso y lo nackea si el
   dispatch lanza.
2. `run()` ackea el inbound tras `handle_runtime_control()` exitoso y lo nackea si lanza.
3. Test de regresión: un `/stop` despachado inline desaparece de `processing/` (ack).
4. Test de regresión: un mensaje runtime-control consumido desaparece de `processing/`.
5. Test de regresión: tras simular un crash con un `/stop` en `processing/`, `recover()`
   lo re-encola (comportamiento actual documentado) — y con el fix, un `/stop` ya
   despachado **no** está en `processing/` para ser recuperado.
6. `pytest tests/agent/test_inline_ack.py -v` verde; `ruff check` limpio.
