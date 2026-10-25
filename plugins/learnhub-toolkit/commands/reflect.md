---
description: Mine this session for reusable learnings, compare with existing skills/agents/hooks, and propose (then build) conversions
argument-hint: [all|<sessionId>]
allowed-tools: Read, Glob, Grep, Write, Edit, Bash(ls:*), Bash(node:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*), Bash(git show:*)
---

# /reflect

Extract learnings from a Claude session, compare them with what already exists in the user's project, and recommend what should become a skill, agent, hook, command, or CLAUDE.md entry. Build only what the user approves.

Argument: `$ARGUMENTS`

## Phase 1: Locate the transcript

Transcripts are JSONL files in `~/.claude/projects/<project-dir>/`, where `<project-dir>` is the current working directory with `:`, `\` and `/` each replaced by `-` (e.g. `c--Users-labuser-day4-...`). Use `ls -t` on that directory.

- No argument: use the most recently modified `.jsonl` (the current session).
- `all`: use every `.jsonl` in the directory.
- Anything else: treat it as a session id and use `<id>.jsonl`.

## Phase 2: Extract learnings

Transcripts are large. Do not read them whole. Use Grep and targeted Read (offset/limit) or a small `node -e` script to pull out:

- User prompts (`"type":"user"` entries whose content is text, not tool results)
- Corrections and preferences ("no, instead...", "don't...", "always...")
- Command or tool sequences repeated more than once
- Errors followed by a fix (a recurring pitfall)
- Manual steps the user asked for every time (e.g. "after commit, do X")

Ignore tool-result payloads except to understand an error.

## Phase 3: Inventory what already exists

Read or list: `CLAUDE.md`, `.claude/settings.json` (hooks), `.claude/hooks/`, `.claude/commands/`, `.claude/skills/`, `.claude/agents/`, `.githooks/`, `.mcp.json`, and the user-level `~/.claude/{commands,skills,agents,settings.json}`.

## Phase 4: Compare and recommend

Output a table: learning | evidence (short quote or count) | already covered by | gap? | best vehicle.

Pick the vehicle like this:
- **Skill**: a reusable multi-step procedure Claude should follow when a situation arises.
- **Agent**: isolated or parallel research/review work that benefits from its own context and tool limits.
- **Hook**: a deterministic action that must happen every time on an event (no judgment needed).
- **Command**: a shortcut the user triggers explicitly.
- **CLAUDE.md**: a fact or convention, not a procedure.

Also list learnings that are NOT worth converting, with a one-line reason. Be honest: one-off tasks and things already covered should not be turned into new artifacts. Recommend a few high-value items, not everything.

## Phase 5: Stop and ask

End your message by asking which recommendations to build. Make NO file changes until the user says yes. If they approve only some, build only those.

## Phase 6: Build

Create each approved item in the proper place, matching existing conventions:
- (paths are in the user's project, not the plugin) Commands: `.claude/commands/<name>.md`
- Skills: `.claude/skills/<name>/SKILL.md`
- Agents: `.claude/agents/<name>.md`
- Hooks: script in `.claude/hooks/` plus an entry merged into `.claude/settings.json` (preserve existing hooks; never overwrite the file)
- CLAUDE.md: edit in place

## Phase 7: Commit

The working tree may hold unrelated changes. Run `git status`, then `git add` only the exact files you created or edited. Never use `git add -A` or `git add .`. Commit with a message describing what was added and why, ending with the attribution trailer required by the session's instructions. Confirm with `git show --stat HEAD` that only the intended files are in the commit.
