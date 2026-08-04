"""Async message queue for decoupled channel-agent communication."""

import asyncio
from pathlib import Path

from nanobot.bus.durable_queue import DurableInboundQueue, DurableOutboundQueue
from nanobot.bus.events import InboundMessage, OutboundMessage


class MessageBus:
    """
    Async message bus that decouples chat channels from the agent core.

    Channels push messages to the inbound queue, and the agent processes
    them and pushes responses to the outbound queue.

    When a workspace path is provided, the bus persists messages to disk using
    inbox/processing directories so that in-flight messages survive a gateway
    restart. Without a workspace the bus behaves as an in-memory queue.
    """

    def __init__(self, workspace: Path | None = None):
        self.inbound: asyncio.Queue[InboundMessage] = asyncio.Queue()
        self.outbound: asyncio.Queue[OutboundMessage] = asyncio.Queue()
        self._durable_inbound: DurableInboundQueue | None = None
        self._durable_outbound: DurableOutboundQueue | None = None
        if workspace is not None:
            self._durable_inbound = DurableInboundQueue(workspace)
            self._durable_outbound = DurableOutboundQueue(workspace)

    async def publish_inbound(self, msg: InboundMessage) -> None:
        """Publish a message from a channel to the agent."""
        if self._durable_inbound is not None:
            await self._durable_inbound.publish(msg)
            return
        await self.inbound.put(msg)

    async def consume_inbound(self) -> InboundMessage:
        """Consume the next inbound message (blocks until available)."""
        if self._durable_inbound is not None:
            return await self._durable_inbound.consume()
        return await self.inbound.get()

    async def publish_outbound(self, msg: OutboundMessage) -> None:
        """Publish a response from the agent to channels."""
        if self._durable_outbound is not None:
            await self._durable_outbound.publish(msg)
            return
        await self.outbound.put(msg)

    async def consume_outbound(self) -> OutboundMessage:
        """Consume the next outbound message (blocks until available)."""
        if self._durable_outbound is not None:
            return await self._durable_outbound.consume()
        return await self.outbound.get()

    async def recover(self) -> int:
        """Requeue durable messages left unacknowledged by a previous process."""
        recovered = 0
        if self._durable_inbound is not None:
            recovered += await self._durable_inbound.recover()
        if self._durable_outbound is not None:
            recovered += await self._durable_outbound.recover()
        return recovered

    async def ack_inbound(self, msg: InboundMessage) -> None:
        """Acknowledge a consumed inbound message; no-op for in-memory queues."""
        if self._durable_inbound is not None:
            await self._durable_inbound.ack(msg)

    async def nack_inbound(self, msg: InboundMessage) -> None:
        """Requeue a consumed inbound message; no-op for in-memory queues."""
        if self._durable_inbound is not None:
            await self._durable_inbound.nack(msg)

    async def ack_outbound(self, msg: OutboundMessage) -> None:
        """Acknowledge a consumed outbound message; no-op for in-memory queues."""
        if self._durable_outbound is not None:
            await self._durable_outbound.ack(msg)

    async def nack_outbound(self, msg: OutboundMessage) -> None:
        """Requeue a consumed outbound message; no-op for in-memory queues."""
        if self._durable_outbound is not None:
            await self._durable_outbound.nack(msg)

    @property
    def inbound_size(self) -> int:
        """Number of pending inbound messages."""
        if self._durable_inbound is not None:
            return self._durable_inbound.size()
        return self.inbound.qsize()

    @property
    def outbound_size(self) -> int:
        """Number of pending outbound messages."""
        if self._durable_outbound is not None:
            return self._durable_outbound.size()
        return self.outbound.qsize()
