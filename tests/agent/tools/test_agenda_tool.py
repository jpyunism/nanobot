"""Tests for AgendaTool."""

from __future__ import annotations

import pytest

from nanobot.agent.tools.agenda import AgendaTool


def _tool(tmp_path) -> AgendaTool:
    return AgendaTool(workspace=str(tmp_path), default_timezone="UTC")


@pytest.mark.anyio
async def test_agenda_tool_list_empty(tmp_path):
    tool = _tool(tmp_path)
    result = await tool.execute("list")
    assert result == "No appointments found."


@pytest.mark.anyio
async def test_agenda_tool_add_and_list(tmp_path):
    tool = _tool(tmp_path)
    created = await tool.execute(
        "add",
        title="Meeting",
        date="2026-08-10",
        time="09:30",
        category="work",
    )
    assert "Created appointment 'Meeting' on 2026-08-10" in created
    result = await tool.execute("list")
    assert "Meeting" in result
    assert "category: work" in result


@pytest.mark.anyio
async def test_agenda_tool_add_all_day(tmp_path):
    tool = _tool(tmp_path)
    created = await tool.execute(
        "add",
        title="Holiday",
        date="2026-08-15",
        all_day=True,
        category="reminder",
    )
    assert "Created appointment 'Holiday' on 2026-08-15" in created
    result = await tool.execute("list")
    assert "all-day" in result
    assert "Holiday" in result


@pytest.mark.anyio
async def test_agenda_tool_add_requires_title_and_date(tmp_path):
    tool = _tool(tmp_path)
    result = await tool.execute("add", date="2026-08-10")
    assert "Error" in result
    result = await tool.execute("add", title="Bad")
    assert "Error" in result


@pytest.mark.anyio
async def test_agenda_tool_update(tmp_path):
    tool = _tool(tmp_path)
    created = await tool.execute(
        "add",
        title="Old",
        date="2026-08-10",
        time="09:30",
    )
    appt_id = created.split("id: ")[1].rstrip(")")
    updated = await tool.execute(
        "update",
        id=appt_id,
        title="New",
        date="2026-09-01",
        time="15:00",
    )
    assert "Updated appointment 'New' on 2026-09-01" in updated


@pytest.mark.anyio
async def test_agenda_tool_delete(tmp_path):
    tool = _tool(tmp_path)
    created = await tool.execute(
        "add",
        title="ToDelete",
        date="2026-08-10",
    )
    appt_id = created.split("id: ")[1].rstrip(")")
    deleted = await tool.execute("delete", id=appt_id)
    assert "Deleted appointment" in deleted
    result = await tool.execute("list")
    assert result == "No appointments found."


@pytest.mark.anyio
async def test_agenda_tool_delete_missing(tmp_path):
    tool = _tool(tmp_path)
    result = await tool.execute("delete", id="no-such-id")
    assert "Error" in result
