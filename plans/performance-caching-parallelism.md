# Plan: Performance — caching and parallelism

> Source: code-improver findings — 3 performance issues across agent, gateway, and scripts

## Phase 1: Cache Anthropic tool schema in agent

**Sub-agent:** `bugfix-agent`

### What to build

In `src/agent/agent.ts`, the Anthropic tool schema is rebuilt from scratch on every message in the loop. Cache the result after `initialize()` is called and reuse it for all subsequent messages. Only rebuild if the set of available tools changes (e.g. after `addServer()`).

### Acceptance criteria

- [ ] Tool schema is computed once after `initialize()`, not per-message
- [ ] Cached value is used in the message loop
- [ ] If tools can change after init, the cache invalidates correctly
- [ ] `pnpm build` passes

---

## Phase 2: Cache `listTools()` result in gateway

**Sub-agent:** `bugfix-agent`

### What to build

In `src/client/gateway.ts`, `listTools()` makes a live RPC call to each server on every invocation, despite the tool list being available from `addServer()`. Cache the tool list at `addServer()` time and return it from `listTools()` without a network call. Provide an explicit `refreshTools()` method (or equivalent) if callers need to force a reload.

### Acceptance criteria

- [ ] `listTools()` returns the cached tool list without a live RPC call
- [ ] The cache is populated when `addServer()` is called
- [ ] A refresh path exists if callers need up-to-date tool data
- [ ] `pnpm build` passes

---

## Phase 3: Parallelise league processing in `pyramid-wikipedia`

**Sub-agent:** `bugfix-agent`

### What to build

In `src/scripts/pyramid-wikipedia.ts`, leagues are fetched and processed sequentially with two network calls per league where one suffices. Replace the sequential loop with `Promise.all` (or `Promise.allSettled` with error handling per league). Eliminate the redundant second network call per league.

### Acceptance criteria

- [ ] Leagues are processed concurrently (not sequentially)
- [ ] Each league makes only one network call (not two)
- [ ] Per-league errors are handled gracefully without aborting the entire run
- [ ] CSV output is equivalent to the sequential version
- [ ] `pnpm build` passes

---

## Phase 4: Code improvement pass

**Sub-agent:** `code-improver`

### What to build

Review changes from Phases 1–3 across `src/agent/agent.ts`, `src/client/gateway.ts`, and `src/scripts/pyramid-wikipedia.ts`. Apply any Medium/High-impact suggestions.

### Acceptance criteria

- [ ] code-improver has reviewed all three changed files
- [ ] All Medium/High-impact suggestions are applied
- [ ] `pnpm build` passes

---

## Phase 5: Code review gate

**Sub-agent:** `code-reviewer`

### What to build

Review all changes from Phases 1–4 for correctness, concurrency safety, and convention compliance.

### Acceptance criteria

- [ ] code-reviewer has reviewed all changed files
- [ ] All blocking and major issues are resolved
- [ ] Full test suite is green
- [ ] `pnpm build` passes with no TypeScript errors
