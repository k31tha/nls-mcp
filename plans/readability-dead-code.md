# Plan: Readability and dead code removal

> Source: code-improver findings — 4 readability issues across agent, wikipedia lib, and tools

## Phase 1: Remove dead keyword fallback routes from agent

**Sub-agent:** `bugfix-agent`

### What to build

In `src/agent/agent.ts`, the keyword fallback branch contains routes for `get_weather`, `calculate`, `add`, and `multiply` — none of which correspond to real NLS tools. Delete these dead branches entirely. If the fallback mechanism itself is unused now, remove it too.

### Acceptance criteria

- [ ] Dead keyword routes (`get_weather`, `calculate`, `add`, `multiply`) are deleted
- [ ] If the fallback block is now empty or unreachable, it is removed
- [ ] No real NLS tool routes are accidentally removed
- [ ] `pnpm build` passes

---

## Phase 2: Deduplicate Wikipedia fetch helpers

**Sub-agent:** `bugfix-agent`

### What to build

In `src/lib/nls/wikipedia.ts`:
- The three near-identical fetch functions should be consolidated into a shared helper that accepts the URL and returns parsed JSON/HTML
- Add the missing `User-Agent` header to `fetchWikipediaHtml` (match the header already used in the other fetch helpers)
- Replace the magic `"–26".slice(0,1)` en-dash extraction with a named constant or explicit character literal so the intent is clear

### Acceptance criteria

- [ ] Three fetch functions are reduced to one shared helper (or two if HTML vs JSON genuinely differ)
- [ ] `fetchWikipediaHtml` sends a `User-Agent` header consistent with sibling functions
- [ ] Magic `slice` is replaced with a named constant or explicit string
- [ ] All existing callers are updated to use the consolidated helper
- [ ] `pnpm build` passes

---

## Phase 3: Extract shared URL builder in `nls-tools.ts`

**Sub-agent:** `bugfix-agent`

### What to build

In `src/server/tools/nls-tools.ts`, URL-building logic is duplicated across two tool handlers. Extract it into a small private helper function used by both handlers.

### Acceptance criteria

- [ ] Duplicated URL construction is extracted into a named helper
- [ ] Both handlers call the helper
- [ ] No logic change — output URLs are identical to before
- [ ] `pnpm build` passes

---

## Phase 4: Code improvement pass

**Sub-agent:** `code-improver`

### What to build

Review changes from Phases 1–3 across `src/agent/agent.ts`, `src/lib/nls/wikipedia.ts`, and `src/server/tools/nls-tools.ts`. Apply any Medium/High-impact suggestions.

### Acceptance criteria

- [ ] code-improver has reviewed all three changed files
- [ ] All Medium/High-impact suggestions are applied
- [ ] `pnpm build` passes

---

## Phase 5: Code review gate

**Sub-agent:** `code-reviewer`

### What to build

Review all changes from Phases 1–4 for correctness and convention compliance.

### Acceptance criteria

- [ ] code-reviewer has reviewed all changed files
- [ ] All blocking and major issues are resolved
- [ ] Full test suite is green
- [ ] `pnpm build` passes with no TypeScript errors
