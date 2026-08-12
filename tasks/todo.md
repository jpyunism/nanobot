# Tasks: ACK de mensajes inline (comandos priority y runtime-control)

Spec: `docs/spec-inline-ack-replay.md` · Plan: `tasks/plan.md`

## Tareas

- [x] **T1: Tests de regresión `tests/agent/test_inline_ack.py`**
  - Acceptance: cubre (1) `/stop` inline → ack (processing vacío), (2) dispatch inline que lanza → nack (vuelve a inbox), (3) runtime-control consumido → ack, (4) runtime-control que lanza → nack, (5) recover no revive un `/stop` ya acked
  - Verify: `pytest tests/agent/test_inline_ack.py -v` verde (5 passed)
  - Files: `tests/agent/test_inline_ack.py`

- [x] **T2: Implementación en `nanobot/agent/loop.py`**
  - Acceptance: `_dispatch_command_inline()` ackea tras publish exitoso y nackea si el dispatch lanza; `run()` ackea tras `handle_runtime_control()` exitoso y nackea si lanza
  - Verify: `pytest tests/agent/test_inline_ack.py -v` verde + `ruff check` limpio
  - Files: `nanobot/agent/loop.py`

- [x] **T3: Verificación final + PR**
  - Acceptance: pytest (nuevo + smoke durable_queue/stop_pending_queue/auto_compact), ruff verdes; branch en fork; PR a madkoding/nanobot con tests
  - Verify: suite completa 5504 passed (excl. whatsapp/neonize); PR #15 abierto
  - Files: — (git ops)
