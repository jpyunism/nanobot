"""generate_tests: analyze a module, write a focused test suite, and review coverage."""

from nanobot.workflows.runner import AgentResult

ARGUMENTS = {
    "path": "Source file or module to test.",
}

PHASES = ["analyze", "write", "review"]


async def run(args: dict, ctx):
    path = str(args.get("path") or "").strip()
    if not path:
        return AgentResult(text="No path provided. Usage: /workflow generate_tests path=<path>")

    ctx.set_phase("analyze")
    analysis = await ctx.agent(
        agent="plan",
        prompt=f"Analyze {path}: its public API, edge cases, and the project's existing test conventions.",
    )

    ctx.set_phase("write")
    tests = await ctx.agent(
        agent="build",
        prompt=f"Write a focused pytest suite for {path} following the project's conventions:\n\n{analysis.text}",
    )

    ctx.set_phase("review")
    return await ctx.agent(
        agent="plan",
        prompt=f"Review this test suite for coverage gaps and correctness:\n\n{tests.text}",
    )
