"""Tests for the durable message bus backing store."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from nanobot.bus.events import InboundMessage, OutboundMessage
from nanobot.bus.queue import MessageBus


@pytest.fixture
def bus(tmp_path: Path) -> MessageBus:
    return MessageBus(workspace=tmp_path)


@pytest.mark.asyncio
async def test_durable_inbound_roundtrip(bus: MessageBus, tmp_path: Path) -> None:
    msg = InboundMessage(
        channel="telegram",
        sender_id="u1",
        chat_id="c1",
        content="hello",
        metadata={"message_id": "m1"},
    )
    await bus.publish_inbound(msg)
    assert bus.inbound_size == 1

    consumed = await bus.consume_inbound()
    assert consumed.channel == "telegram"
    assert consumed.content == "hello"
    assert bus.inbound_size == 0

    await bus.ack_inbound(consumed)
    assert not any((tmp_path / "bus" / "inbound" / "processing").glob("*.json"))


@pytest.mark.asyncio
async def test_durable_inbound_survives_crash(bus: MessageBus, tmp_path: Path) -> None:
    msg = InboundMessage(channel="discord", sender_id="u2", chat_id="c2", content="hi")
    await bus.publish_inbound(msg)

    consumed = await bus.consume_inbound()
    assert consumed.content == "hi"
    # Simulate a crash before ack: the message is still in processing.

    bus2 = MessageBus(workspace=tmp_path)
    recovered = await bus2.recover()
    assert recovered == 1
    assert bus2.inbound_size == 1

    re_consumed = await bus2.consume_inbound()
    assert re_consumed.content == "hi"

    await bus2.ack_inbound(re_consumed)
    assert bus2.inbound_size == 0


@pytest.mark.asyncio
async def test_durable_inbound_nack_requeues(bus: MessageBus, tmp_path: Path) -> None:
    msg = InboundMessage(channel="slack", sender_id="u3", chat_id="c3", content="retry me")
    await bus.publish_inbound(msg)

    consumed = await bus.consume_inbound()
    await bus.nack_inbound(consumed)
    assert bus.inbound_size == 1

    re_consumed = await bus.consume_inbound()
    assert re_consumed.content == "retry me"
    await bus.ack_inbound(re_consumed)
    assert bus.inbound_size == 0


@pytest.mark.asyncio
async def test_durable_outbound_roundtrip(bus: MessageBus, tmp_path: Path) -> None:
    msg = OutboundMessage(channel="telegram", chat_id="c1", content="reply")
    await bus.publish_outbound(msg)
    assert bus.outbound_size == 1

    consumed = await bus.consume_outbound()
    assert consumed.content == "reply"
    await bus.ack_outbound(consumed)
    assert bus.outbound_size == 0


@pytest.mark.asyncio
async def test_in_memory_bus_is_not_durable(tmp_path: Path) -> None:
    bus = MessageBus()
    msg = InboundMessage(channel="cli", sender_id="user", chat_id="direct", content="x")
    await bus.publish_inbound(msg)
    assert bus.inbound_size == 1
    consumed = await bus.consume_inbound()
    assert consumed is not None
    await bus.ack_inbound(consumed)
    await bus.nack_inbound(consumed)
    assert not (tmp_path / "bus").exists()


@pytest.mark.asyncio
async def test_durable_queue_preserves_timestamp(bus: MessageBus) -> None:
    from datetime import datetime, timezone

    ts = datetime.now(timezone.utc).replace(microsecond=0)
    msg = InboundMessage(
        channel="telegram",
        sender_id="u1",
        chat_id="c1",
        content="hello",
        timestamp=ts,
    )
    await bus.publish_inbound(msg)
    consumed = await bus.consume_inbound()
    assert consumed.timestamp.replace(microsecond=0) == ts
    await bus.ack_inbound(consumed)


@pytest.mark.asyncio
async def test_durable_publish_wakes_consumer(bus: MessageBus) -> None:
    consumed = None

    async def consumer() -> None:
        nonlocal consumed
        consumed = await bus.consume_inbound()

    task = asyncio.create_task(consumer())
    await asyncio.sleep(0.01)
    msg = InboundMessage(channel="telegram", sender_id="u1", chat_id="c1", content="wake")
    await bus.publish_inbound(msg)
    await asyncio.wait_for(task, timeout=1.0)
    assert consumed is not None
    assert consumed.content == "wake"
