"""run_workflow tool for launching background workflows."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from nanobot.agent.tools.base import Tool, ToolResult, tool_parameters
from nanobot.agent.tools.context import current_request_context
from nanobot.agent.tools.schema import StringSchema, tool_parameters_schema
from nanobot.security.workspace_access import current_workspace_scope
from nanobot.workflows.runner import parse_workflow_args

if TYPE_CHECKING:
    from nanobot.workflows.runner import WorkflowRunner


@tool_parameters(
    tool_parameters_schema(
        workflow=StringSchema("The name of the workflow to run (e.g. 'research-plan')."),
        args=StringSchema(
            "Optional key=value arguments, space separated (e.g. 'topic=rust async runtime')."
        ),
        required=["workflow"],
    )
)
class RunWorkflowTool(Tool):
    """Tool to launch a named workflow in the background."""

    def __init__(self, runner: "WorkflowRunner | None" = None):
        self._runner = runner

    @classmethod
    def create(cls, ctx: Any) -> Tool:
        return cls(runner=ctx.workflow_runner)

    @classmethod
    def enabled(cls, ctx: Any) -> bool:
        return ctx.workflow_runner is not None

    @property
    def name(self) -> str:
        return "run_workflow"

    @property
    def description(self) -> str:
        base = (
            "Run a named workflow in the background. "
            "Workflows are deterministic multi-step orchestrations built from "
            "subagents (sequential, parallel, or pipelined). "
            "The workflow reports its result back when done; the chat stays usable meanwhile."
        )
        names = self._runner.list_workflow_names() if self._runner else []
        if names:
            base += f" Available workflows: {', '.join(names)}."
        return base

    async def execute(self, workflow: str, args: str = "", **kwargs: Any) -> str:
        """Launch a workflow in the background and return an ack string."""
        if self._runner is None:
            return ToolResult.error("Error: run_workflow is unavailable")
        request_ctx = current_request_context()
        if request_ctx is None or request_ctx.runtime is None:
            return ToolResult.error("Error: run_workflow requires an active model runtime")
        session_key = request_ctx.session_key or f"{request_ctx.channel}:{request_ctx.chat_id}"
        run_id = await self._runner.start(
            name=workflow,
            args=parse_workflow_args(args),
            runtime=request_ctx.runtime,
            session_key=session_key,
            channel=request_ctx.channel,
            chat_id=request_ctx.chat_id,
            workspace_scope=current_workspace_scope(),
            origin_message_id=request_ctx.message_id,
        )
        return f"Workflow '{workflow}' started (run: {run_id}). I'll notify you when it completes."
