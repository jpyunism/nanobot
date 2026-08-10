---
name: git-worktree
description: "Work inside an isolated git worktree for a task. When a chat is bound to a worktree (its workspace points at a worktree directory), commit your changes there and let the user merge the branch back from the WebUI kanban. Do not create worktrees yourself — the kanban does that."
metadata: {"nanobot":{"emoji":"🌿"}}
---

# Git Worktree Skill

A **worktree** is an isolated checkout of a git repo on its own branch. The
WebUI kanban creates one per task card. When you are working on a task, your
workspace may point at a worktree directory.

## How to tell you're in a worktree

A worktree has a `.git` **file** (not a directory) pointing at the main repo:

```bash
ls -la .git   # a file like: gitdir: /path/to/main/.git/worktrees/<name>
git branch --show-current   # your task branch, e.g. card-fix-login-abc123
```

## Rules

- **Do not create or remove worktrees.** The WebUI kanban creates a worktree
  when a card is added and removes it when the card is deleted. If the user
  asks you to "make a worktree", tell them to add a card in the Projects →
  Board view instead.
- **Commit your work in the worktree** on the current branch. That branch is
  the task's branch.
- **Do not merge or push** unless the user explicitly asks. Merging is done
  from the WebUI kanban (the "Merge" button on a card) so the user controls
  when a task lands on the main branch.
- If the user asks to merge, prefer the WebUI button. If they insist you do it
  from here, run `git merge --no-ff <branch>` in the **main repo** (not the
  worktree) or `gh pr create` if the repo is on GitHub.

## Typical flow

1. You are pointed at a worktree (workspace = worktree dir).
2. Read the task, make changes, run tests.
3. `git add -A && git commit -m "..."` on the task branch.
4. Tell the user the work is committed and they can merge it from the kanban.
