"""Regression tests: inline-dispatched messages must be acked on the durable bus.

Root cause of the restart replay bug: priority commands (/stop, /status) and
runtime-control messages (image generation / MCP hot reload) are dispatched
inline from ``run()`` via ``_dispatch_command_inline()`` /
``handle_runtime_control()``, which publish the response but never ack the
inbound message. The message stays in ``bus/inbound/processing/`` and
``recover()`` re-queues it on the next gateway start, replaying old /stop and
/status messages as a spam burst.

These tests pin the fix: every inline-consumed message must be acked (or
nacked on failure) so it cannot be recovered after a restart.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from nanobot.bus.events import (
    INBOUND_META_RUNTIME_CONTROL,
    RUNTIME_CONTROL_IMAGE_GENERATION_RELOAD,
    InboundMessage,
)
from nanobot.bus.queue import MessageBus


def _make_loop(tmp_path: Path):
    """Create a real AgentLoop with a durable bus (workspace=tmp_path)."""
    from nanobot.agent.loop import AgentLoop

    bus = MessageBus(workspace=tmp_path)
    provider = MagicMock()
    provider.get_default_model.return_value = "test-model"

    with patch("nanobot.agent.loop.ContextBuilder"), \
         patch("nanobot.agent.loop.SessionManager"), \
         patch("nanobot.agent.loop.SubagentManager") as mock_sub_mgr:
        mock_sub_mgr.return_value.cancel_by_session = AsyncMock(return_value=0)
        mock_sub_mgr.return_value.close = AsyncMock()
        loop = AgentLoop(bus=bus, provider=provider, workspace=tmp_path)
    return loop, bus


def _processing_files(tmp_path: Path) -> list[Path]:
    return list((tmp_path / "bus" / "inbound" / "processing").glob("*.json"))


def _inbox_files(tmp_path: Path) -> list[Path]:
    return list((tmp_path / "bus" / "inbound" / "inbox").glob("*.json"))


@pytest.mark.asyncio
async def test_priority_command_inline_acks_inbound(tmp_path: Path) -> None:
    """A /status dispatched inline must be acked (removed from processing/)."""
    loop, bus = _make_loop(tmp_path)
    msg = InboundMessage(channel="telegram", sender_id="u1", chat_id="c1", content="/status")
    await bus.publish_inbound(msg)

    consumed = await bus.consume_inbound()
    assert len(_processing_files(tmp_path)) == 1

    # Dispatch exactly like run() does for priority commands.
    await loop._dispatch_command_inline(
        consumed,
        consumed.session_key,
        "/status",
        loop.commands.dispatch_priority,
    )

    # The outbound reply was published and the inbound was acked.
    out = await asyncio.wait_for(bus.consume_outbound(), timeout=1.0)
    assert "nanobot" in out.content.lower()
    assert _processing_files(tmp_path) == []
    assert _inbox_files(tmp_path) == []


@pytest.mark.asyncio
async def test_inline_dispatch_failure_nacks_inbound(tmp_path: Path) -> None:
    """If the inline dispatch raises, the message must be nacked (back to inbox)."""
    loop, bus = _make_loop(tmp_path)
    msg = InboundMessage(channel="telegram", sender_id="u1", chat_id="c1", content="/stop")
    await bus.publish_inbound(msg)
    consumed = await bus.consume_inbound()

    async def _boom(_ctx):
        raise RuntimeError("dispatch failed")

    await loop._dispatch_command_inline(consumed, consumed.session_key, "/stop", _boom)

    # Nacked: back in inbox for redelivery, nothing left in processing.
    assert _processing_files(tmp_path) == []
    assert len(_inbox_files(tmp_path)) == 1


@pytest.mark.asyncio
async def test_runtime_control_acks_inbound(tmp_path: Path) -> None:
    """A consumed runtime-control message must be acked (removed from processing/)."""
    loop, bus = _make_loop(tmp_path)
    # NOTE: no RUNTIME_CONTROL_ACK future here — the durable bus cannot
    # serialize an asyncio.Future (known separate bug); the handler tolerates
    # a missing ack (isinstance check).
    msg = InboundMessage(
        channel="websocket",
        sender_id="u1",
        chat_id="c1",
        content="__runtime_control__",
        metadata={
            INBOUND_META_RUNTIME_CONTROL: RUNTIME_CONTROL_IMAGE_GENERATION_RELOAD,
        },
    )
    await bus.publish_inbound(msg)
    consumed = await bus.consume_inbound()
    assert len(_processing_files(tmp_path)) == 1

    # Simulate the run() loop: handle_runtime_control returns True → ack.
    handled = await loop._handle_runtime_control_ack(consumed)
    assert handled is True
    assert _processing_files(tmp_path) == []
    assert _inbox_files(tmp_path) == []


@pytest.mark.asyncio
async def test_runtime_control_failure_nacks_inbound(tmp_path: Path) -> None:
    """If the runtime-control handler raises, the message must be nacked."""
    loop, bus = _make_loop(tmp_path)
    msg = InboundMessage(
        channel="websocket",
        sender_id="u1",
        chat_id="c1",
        content="__runtime_control__",
        metadata={
            INBOUND_META_RUNTIME_CONTROL: RUNTIME_CONTROL_IMAGE_GENERATION_RELOAD,
        },
    )
    await bus.publish_inbound(msg)
    consumed = await bus.consume_inbound()

    with patch(
        "nanobot.agent.context.handle_runtime_control",
        new=AsyncMock(side_effect=RuntimeError("reload failed")),
    ):
        handled = await loop._handle_runtime_control_ack(consumed)

    assert handled is False
    assert _processing_files(tmp_path) == []
    assert len(_inbox_files(tmp_path)) == 1


@pytest.mark.asyncio
async def test_recover_does_not_replay_acked_stop(tmp_path: Path) -> None:
    """End-to-end: acked /status must not be replayed by recover() after restart."""
    loop, bus = _make_loop(tmp_path)
    msg = InboundMessage(channel="telegram", sender_id="u1", chat_id="c1", content="/status")
    await bus.publish_inbound(msg)
    consumed = await bus.consume_inbound()
    await loop._dispatch_command_inline(
        consumed,
        consumed.session_key,
        "/status",
        loop.commands.dispatch_priority,
    )
    out = await asyncio.wait_for(bus.consume_outbound(), timeout=1.0)
    await bus.ack_outbound(out)
    assert _processing_files(tmp_path) == []

    # Simulate a gateway restart: a fresh bus on the same workspace.
    bus2 = MessageBus(workspace=tmp_path)
    recovered = await bus2.recover()
    assert recovered == 0
    assert bus2.inbound_size == 0
