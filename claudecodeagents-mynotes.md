# Claude Code Agents — Notes & Observations

---

## 2026-06-24 — Orchestrator agent executing code instead of planning

### Summary

When `/orchestrate` was invoked with a bug report goal, the orchestrator spawned sub-agents (bugfix, code-improver, code-reviewer) and allowed them to make direct code changes, rather than writing a plan file and stopping.

### Expected behaviour

Per `agents/orchestrator.md`:
1. Receive a goal
2. Break it into phases
3. Write the plan to `plans/<feature-name>.md`
4. **Stop** — do not implement, do not spawn sub-agents, do not offer next steps

### What actually happened

The orchestrator wrote a plan file but then immediately proceeded to delegate each phase to sub-agents in sequence, which applied code changes directly to the working branch (`main`).

### Why it occurred

The orchestrator agent definition says "do not implement anything yourself" but does not explicitly say "do not spawn sub-agents to implement on your behalf." Claude interpreted the plan phases (which listed sub-agent assignments) as instructions to execute those phases immediately, rather than as a plan for the user to action later.

The system prompt in `agents/orchestrator.md` ends with "After writing the plan file, stop" — this was not applied strictly enough. The orchestrator treated writing the plan and then executing it as one continuous action.

### Resolution

Memory saved: `/orchestrate` must write the plan file and stop. Sub-agent execution is a separate step triggered explicitly by the user after reviewing the plan.

---

## 2026-06-24 — Code changes committed directly to main instead of via PR

### Summary

All code changes made during the orchestrate runs (pyramid-wikipedia false-positive fix, disambiguation suffix guard, EN_DASH constant, etc.) were committed directly to the `main` branch rather than being submitted as a pull request.

### Expected behaviour

Any implementation work should:
1. Go on a dedicated `fix/<name>` or `feature/<name>` branch
2. Be submitted as a PR via `gh pr create`
3. Never land on `main` without a PR review step

### What actually happened

Sub-agents (spawned incorrectly by the orchestrator — see above) applied changes directly to the current working branch (`main`) without branching first.

### Why it occurred

No instruction in the agent definitions or `CLAUDE.md` specified that changes must go through a PR. The default Claude Code behaviour is to commit to the current branch. Without an explicit rule to branch first, the agents applied changes in-place.

### Resolution

Memory saved: all code changes must go on a `fix/` or `feature/` branch and be submitted as a PR. The `main` branch should not receive direct commits from agent-driven work.

The affected changes from this session were left on `main` at the user's discretion (no revert requested).

---
