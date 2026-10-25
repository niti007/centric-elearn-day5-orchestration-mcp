---
description: Write a session handoff .md (approvals, progress, milestones, open work) so a new chat starts with full context
argument-hint: [<sessionId>|all] [--out <path>]
allowed-tools: Read, Glob, Grep, Write, Bash(ls:*), Bash(node:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*)
---

# /session-handoff

Go through the entire session and write a handoff file that lets a brand-new chat continue with zero lost context. Capture critical approvals, progress, milestones, current state, and next steps.

Argument: `$ARGUMENTS`

## Phase 1: Locate the transcript

Transcripts are JSONL files in `~/.claude/projects/<project-dir>/`, where `<project-dir>` is the current working directory with `:`, `\` and `/` each replaced by `-`. Use `ls -t` on that directory.

- No argument: use the most recently modified `.jsonl` (the current session).
- `all`: use every `.jsonl` in the directory.
- Anything else (other than `--out`): treat it as a session id and use `<id>.jsonl`.

## Phase 2: Extract

Transcripts are large. Do not read them whole. Use Grep, targeted Read (offset/limit), or a small `node -e` script to pull out:

- User prompts (`"type":"user"` entries with text content): the goal and how it evolved
- **Approvals and decisions**: ExitPlanMode results, AskUserQuestion answers, explicit user "yes / go ahead / don't / always / never" messages, permission denials
- Files created or edited (Write/Edit/NotebookEdit tool calls)
- Commands run and outcomes (tests, builds, commits), including failures
- Errors and the fix that resolved each
- Task or todo state, if present

Ignore tool-result payloads except to understand an outcome or error.

## Phase 3: Snapshot repo state

Run `git branch --show-current`, `git status --short`, `git log --oneline -10`, and `git diff --stat`. Use this to check what is actually on disk against what the transcript claims. If they disagree, trust the repo and note the discrepancy.

## Phase 4: Write the handoff

Write to `--out <path>` if given, otherwise `handoffs/handoff-<YYYY-MM-DD-HHmm>.md` (create the directory if missing). Use these sections:

1. **Header**: date, branch, session id, one-line goal
2. **How to use this file**: a paste-ready opening message for the new chat (for example "Read @<this file>, then continue from 'Next steps'")
3. **Goal and context**: the original ask and any changes to it
4. **Critical approvals and decisions**: table of decision | decided by (user/Claude) | quote or evidence | consequence. Include user constraints such as "don't commit" or "no auth".
5. **Milestones and progress**: done / in progress / not started, with file paths
6. **Current state**: branch, uncommitted files, test status, running processes, env vars that matter (for example `LEARNHUB_NOW`)
7. **Problems and fixes**: error, root cause, resolution; dead ends not to repeat
8. **Next steps**: ordered, with the very first action stated explicitly
9. **Key files and references**: path plus one-line purpose each
10. **Pending approvals**: anything proposed but not yet confirmed, clearly marked as NOT approved

## Rules

- Never invent approvals. Record only what the transcript shows, quoting the user's words.
- Keep "approved" and "proposed" strictly separate.
- Redact secrets (passwords, tokens, `.env` values).
- Make the file self-contained: repo-relative paths, no "as discussed above".
- Do not commit the file or change anything else.

## Phase 5: Report

Print the output path and a summary of at most 5 lines. Do not paste the whole file. Mention that `handoffs/` may be worth adding to `.gitignore` if the user doesn't want it tracked.
