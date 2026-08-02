# Agent Instructions

## Workspace Guidance

Use this file for project-specific preferences, recurring workflow conventions, and instructions you want the agent to remember for this workspace. Keep durable facts about the user in `USER.md`, personality/style guidance in `SOUL.md`, and long-term memory in `memory/MEMORY.md`.

## Identity Separation (Guardrails)

- **The operator is the only user whose profile lives in `USER.md`.** Never copy a third party's data (name, nickname, phone, LinkedIn) into the operator's profile.
- **Third-party identities (personal contacts, group members, communities) do NOT go in `USER.md` or `MEMORY.md`.** They live exclusively in `users.json` (single source of truth for identities).
- `users.json` organizes identities by scope and they are **never mixed**:
  - `personal_contacts` → personal contacts in DMs. Not members of any group.
  - `groups.<group>.members` → members of each WhatsApp group, nested under their group. Each group has its own list.
  - `communities` → external communities/projects. Neither personal contacts nor group members.
- **Never mix** a personal contact with a group member, or a member of one group with a member of a different group.
- If a person appears in more than one scope (e.g. personal contact AND group member), record the reference in each scope without merging their data.
- When adding a new WhatsApp group, create a new key under `groups` with its own members; do not touch other groups or personal contacts.
- If a crossed/duplicated identity is detected, verify against `users.json` and correct it immediately.

## Scheduled Reminders

- Before scheduling reminders, check available skills and follow skill guidance first.
- Use the built-in `cron` tool to create/list/remove jobs (do not call `nanobot cron` via `exec`).
- Get USER_ID and CHANNEL from the current session (e.g., `8281248569` and `telegram` from `telegram:8281248569`).
- Cron jobs run as scheduled turns in the origin chat/session and normally deliver the result back to that channel. Do not use cron for background checks that should stay silent when there is nothing useful to report; use `HEARTBEAT.md` instead.

**Do NOT just write reminders to MEMORY.md** — that won't trigger actual notifications.

## Heartbeat Tasks

`HEARTBEAT.md` is checked periodically by the protected heartbeat cron job that `nanobot gateway` registers when `gateway.heartbeat.enabled` is true. Do not create a duplicate heartbeat job unless the user has disabled the built-in one and explicitly wants a custom schedule.

- Use `apply_patch` for normal task-list updates, especially when adding, removing, or changing multiple lines.
- Use `edit_file` only for small exact replacements copied from the current `HEARTBEAT.md`.
- Use `write_file` for first creation or intentional full-file rewrites.

When the user asks for a recurring/periodic heartbeat task, or for a periodic background check that should only notify on actionable changes, update `HEARTBEAT.md` instead of creating a one-time reminder. Use the built-in `cron` tool for explicit reminders, scheduled tasks that should report every run, or custom schedules that should not be part of the heartbeat task list.
