"""code_review: parallel review of a git diff (correctness, security, style) plus a summary."""

ARGUMENTS = {
    "range": "Git diff range to review (e.g. 'HEAD~1..HEAD'); defaults to working tree.",
}

PHASES = ["review", "summary"]


async def run(args: dict, ctx):
    diff_spec = str(args.get("range") or "").strip()
    diff_cmd = f"git diff {diff_spec}".rstrip()
    fetch = f"Run `{diff_cmd}` and review the resulting diff."

    ctx.set_phase("review")
    correctness, security, style = await ctx.parallel(
        [
            lambda: ctx.agent(
                agent="plan",
                prompt=f"{fetch} Focus on correctness: logic bugs, edge cases, regressions. Be specific, cite file:line.",
            ),
            lambda: ctx.agent(
                agent="plan",
                prompt=f"{fetch} Focus on security and data safety: injection, secrets, permissions, unsafe paths.",
            ),
            lambda: ctx.agent(
                agent="plan",
                prompt=f"{fetch} Focus on style and maintainability: naming, dead code, duplication, readability.",
            ),
        ]
    )

    ctx.set_phase("summary")
    return await ctx.agent(
        agent="general",
        prompt="\n".join(
            [
                f"Summarize the review of `{diff_cmd}`. Rank issues by severity and give a go/no-go verdict.",
                "",
                "CORRECTNESS:",
                correctness.text,
                "",
                "SECURITY:",
                security.text,
                "",
                "STYLE:",
                style.text,
            ]
        ),
    )
