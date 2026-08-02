"""research_plan: produce a brief, risk review, implementation plan, and summary."""

from nanobot.workflows.runner import AgentResult

ARGUMENTS = {
    "topic": {"type": "string", "description": "Topic to research."},
}

PHASES = ["brief", "review", "summary"]


async def run(args: dict, ctx):
    topic = str(args.get("topic") or "").strip()
    if not topic:
        return AgentResult(text="No topic provided. Usage: /workflow research_plan topic=<topic>")

    ctx.set_phase("brief")
    brief = await ctx.agent(
        agent="build",
        prompt=f"Create a short technical brief about: {topic}",
    )

    ctx.set_phase("review")
    risks, implementation = await ctx.parallel(
        [
            lambda: ctx.agent(
                agent="plan",
                prompt=f"Review this brief for risks:\n\n{brief.text}",
            ),
            lambda: ctx.agent(
                agent="build",
                prompt=f"Suggest an implementation approach:\n\n{brief.text}",
            ),
        ]
    )

    ctx.set_phase("summary")
    return await ctx.agent(
        agent="general",
        prompt="\n".join(
            [
                f"Summarize the result for: {topic}",
                "",
                "BRIEF:",
                brief.text,
                "",
                "RISKS:",
                risks.text,
                "",
                "IMPLEMENTATION:",
                implementation.text,
            ]
        ),
    )
