# Plan: Move stale completed plans and bake plan completion into the /implement flow

## Background

`agents/orchestrator.md` says a plan moves to `plans/completed/` when all its
acceptance criteria are met, but nothing in the delivery flow actually performs
the move. Two delivered plans are now stale in `plans/`:

- `plans/pyramid-wikipedia-previous-season-fallback.md` (shipped in PR #8)
- `plans/pyramid-wikipedia-clubs-fix-wrong-league.md` (shipped in PR #10)

The user asked for the move to happen as part of "the merge PR step". There is
no scripted merge step — `/implement` (`.claude/commands/implement.md`) stops
at "open the PR and wait", and merging is an ad-hoc user request afterwards.

**Recommended mechanism**: include the plan move in the implementation PR
itself — a final `/implement` step moves `plans/<name>.md` to
`plans/completed/<name>.md` before the commit. The plan then lands in
`completed/` at exactly the moment the PR merges, with no separate follow-up
commit, and a rejected PR leaves nothing half-moved. This satisfies the intent
of "add it to the merge step" atomically.

---

## Phase 1: Housekeeping PR — move stale plans and update the flow docs

### What to build

One small PR containing:

1. `git mv plans/pyramid-wikipedia-previous-season-fallback.md plans/completed/`
2. `git mv plans/pyramid-wikipedia-clubs-fix-wrong-league.md plans/completed/`
3. `.claude/commands/implement.md` — insert a step between the current steps 5
   (commit) and 6 (open PR), renumbering the rest:
   > Move the plan file to `plans/completed/` (`git mv plans/<name>.md
   > plans/completed/<name>.md`) and include the move in the commit, so the
   > plan is archived at the moment the PR merges.
4. `agents/orchestrator.md` — align the Output section: note that the move to
   `plans/completed/` ships inside the implementation PR (via `/implement`),
   not as a separate action.

No source code changes; no `@` references point at the moved plan files (only
`plans/completed/nls-club-detail-tools.md` is referenced, and it already lives
in `completed/`).

**Route to**: `docs` sub-agent (file moves + process docs; per its remit for
keeping references accurate when files move)
**Input**: the two stale plan paths; `.claude/commands/implement.md`;
`agents/orchestrator.md`.

**Branch/PR**: `chore/plan-completion-workflow`, PR against main — never
commit to main directly.

### Acceptance criteria

- [ ] Both stale plan files exist under `plans/completed/` and no longer under
  `plans/` (history preserved via `git mv`)
- [ ] This plan file (`plans/plan-completion-workflow.md`) also ships in
  `plans/completed/` in the same PR — it is the first plan to follow the new
  rule
- [ ] `.claude/commands/implement.md` contains the new move step, correctly
  renumbered
- [ ] `agents/orchestrator.md` Output section reflects where the move happens
- [ ] No other files modified; `pnpm test` still passes (no code touched)
- [ ] PR raised from `chore/plan-completion-workflow`

---

No code-improvement or code-review phases: this plan contains no bugfix or
feature-implementation phase (documentation and file moves only).
