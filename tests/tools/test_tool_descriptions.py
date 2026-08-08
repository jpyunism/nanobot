import sys
from unittest.mock import patch

from nanobot.agent.tools.apply_patch import ApplyPatchTool
from nanobot.agent.tools.exec_session import ListExecSessionsTool, WriteStdinTool
from nanobot.agent.tools.filesystem import EditFileTool, ReadFileTool, WriteFileTool
from nanobot.agent.tools.search import FindFilesTool, GrepTool
from nanobot.agent.tools.shell import ExecTool


def test_coding_tool_descriptions_steer_editing_priority() -> None:
    apply_patch = ApplyPatchTool().description.lower()
    edit_file = EditFileTool().description.lower()
    write_file = WriteFileTool().description.lower()

    assert "multi-file" in apply_patch
    assert "dry_run=true" in apply_patch
    assert "edit_file" in apply_patch

    assert "replace" in edit_file
    assert "apply_patch" in edit_file

    assert "replace" in write_file
    assert "apply_patch" in write_file


def test_coding_tool_descriptions_steer_discovery_and_shell_usage() -> None:
    read_file = ReadFileTool().description.lower()
    find_files = FindFilesTool().description.lower()
    grep = GrepTool().description.lower()
    exec_tool = ExecTool().description.lower()
    write_stdin = WriteStdinTool().description.lower()
    list_sessions = ListExecSessionsTool().description.lower()

    assert "line_num" in read_file
    assert "offset" in read_file or "limit" in read_file

    assert "find" in find_files
    assert "regex" in grep

    assert "read_file" in exec_tool
    assert "yield_time_ms" in exec_tool

    assert "wait_for" in write_stdin
    assert "exec session" in list_sessions or "session_id" in list_sessions


def test_exec_tool_shell_guidance_matches_platform() -> None:
    with patch("nanobot.agent.tools.shell._IS_WINDOWS", False):
        unix_description = ExecTool().description.lower()
    assert "unix" in unix_description or "bash" in unix_description
    assert "powershell" not in unix_description

    with patch("nanobot.agent.tools.shell._IS_WINDOWS", True):
        windows_description = ExecTool().description.lower()
    assert "powershell" in windows_description
    assert "cmd" in windows_description

    shell_parameter = ExecTool().parameters["properties"]["shell"]["description"].lower()
    assert "shell" in shell_parameter
    if sys.platform == "win32":
        assert "powershell" in shell_parameter or "cmd" in shell_parameter
    else:
        assert "bash" in shell_parameter or "unix" in shell_parameter
        assert "powershell" not in shell_parameter