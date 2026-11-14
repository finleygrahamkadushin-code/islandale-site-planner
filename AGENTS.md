# Islandale Site Planner: rules for Codex and other agents

**Follow `CLAUDE.md`.** It is the one rule file for this repo, for Claude and for you. Read it first, then `PLAN.md`. This file only adds how to share the repo with the Claude sessions that work here too.

## The shared board

Read `~/.claude/boards/islandale.md` before you start, and again before you recommend or redo a change: it says what is decided, merged, waiting and owned right now, and another session may already have done what you are about to do. Claude sessions see it on every message; you don't, so read it yourself. After you merge something, or Finley decides something, add a dated line to it.

## Branches

- The main line is **`scheme-c-only`** (Scheme C only). `main` keeps all 12 schemes as an archive; don't work from it.
- One task, one branch: `codex/<short-task-name>`, cut from `scheme-c-only`.
- Never commit to, merge into or push `scheme-c-only` or `main`. Only Finley says when something merges.
- Branches named `claude/*` belong to Claude sessions. Don't commit to one unless its `HANDOFF-<task>.md` hands it to you. Run `git worktree list` to see which branches are checked out and busy.

## Handing work over (either way)

- When you stop before the task is done (out of usage, out of time, or switching tools), copy `HANDOFF-TEMPLATE.md` to `HANDOFF-<task>.md` on your branch, fill it in, and commit it.
- When you pick up a branch, read its `HANDOFF-<task>.md` first and do the "Next step" it names. Update the note when you stop.
- Delete the handoff note in the last commit before the branch is merged.

## Checks before you say a task is done

- Typecheck: `npx tsc -p tsconfig.app.json` (`tsc -p .` checks nothing here).
- Unit tests for the section you touched: `npx vitest run src/<section>`.
- Browser tests (`npx playwright test e2e/<file>`) are slow under software graphics; run only the spec for your section.

## Don't edit

- `eslint.config.js` (protected; Finley edits it).
- `legacy/islandale-planner.html`, except through the appended `ext:` blocks `CLAUDE.md` describes.
- `data/plans/islandale.plan.json` only changes when the plan itself changes. Don't commit view-only or blank saves of it.

## Reviews

When asked to review a Claude branch, compare it with `scheme-c-only` (`git diff scheme-c-only...<branch>`) and report problems ranked by severity, with file and line. Don't push fixes to a Claude branch; write them in the review.
