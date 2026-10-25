---
name: jira-writing
description: Draft clear, actionable Jira tickets (bugs, stories, tasks) with concrete evidence. Use when asked to write, rewrite, or improve a Jira ticket or issue description.
---

# Jira writing

Draft ticket text only. Do not create or update tickets in Jira.

## Rules

- One issue per ticket. Split unrelated problems.
- Summary: imperative or descriptive, under about 80 characters, no trailing period, names the component (e.g. "Refund allowed after 7 days when progress is under 30%").
- Be specific: include IDs, query results, file paths, endpoints, and error text. Avoid "sometimes" and "it seems".
- Separate facts (what was observed) from hypotheses (what might cause it).
- Keep it short enough to scan; use bullets and headings.

## Templates

### Bug

```
Summary: <component>: <what is wrong>

Environment: <branch/commit, DB, app clock (LEARNHUB_NOW) if relevant>
Steps to reproduce:
1. ...
Expected: ...
Actual: ...
Evidence: <queries, IDs, logs, file:line>
Severity: <blocker | major | minor> - <one-line impact>
Suspected cause (optional): ...
```

### Story

```
Summary: <outcome for the user>

As a <role>, I want <capability> so that <benefit>.

Acceptance criteria:
- Given <context>, when <action>, then <result>.
- ...
Out of scope: ...
Notes: <links, designs, dependencies>
```

### Task

```
Summary: <verb> <thing>

Goal: <why this is needed>
Scope: <bullets of work>
Done when: <verifiable checks>
```

## Before finishing

Check that a developer who has not seen this conversation could act on the ticket, and that the acceptance criteria or expected result can be verified.
