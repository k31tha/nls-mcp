# Plan: Script testability — eliminate mutable module-level state

> Source: code-improver finding — `src/scripts/pyramid-wikipedia.ts` mutable module-level `let` variables

## Phase 1: Convert mutable module-level state to parameters

**Sub-agent:** `bugfix-agent`

### What to build

In `src/scripts/pyramid-wikipedia.ts`, mutable `let` variables are declared at module scope and overwritten inside `main()`. This makes exported functions order-dependent and untestable in isolation.

- Convert each module-level `let` to a parameter on the function(s) that use it, or derive them inside those functions directly
- Ensure the default values (currently set by `main()`) are preserved as defaults on the parameters
- `main()` should pass the parsed CLI arguments to the functions rather than setting globals

### Acceptance criteria

- [ ] No mutable `let` variables remain at module scope
- [ ] Exported functions accept their configuration as parameters (with sensible defaults)
- [ ] `main()` parses CLI args and passes them as arguments — does not set globals
- [ ] Script behaviour is identical when run via `pnpm pyramid-wikipedia`
- [ ] `pnpm build` passes

---

## Phase 2: Add unit tests for exported functions

**Sub-agent:** `test-agent`

### What to build

Now that exported functions no longer depend on module-level state, write unit tests in `src/scripts/pyramid-wikipedia.test.ts`. Stub network calls. Cover:
- The season-string-to-Wikipedia-URL mapping
- Any exported data transformation functions
- Edge cases: seasons with en-dashes vs hyphens, empty league list

### Acceptance criteria

- [ ] `src/scripts/pyramid-wikipedia.test.ts` exists and runs
- [ ] Network calls are stubbed — no real HTTP in tests
- [ ] URL mapping logic is tested for hyphen and en-dash season variants
- [ ] Data transformation functions are covered
- [ ] Full test suite is green

---

## Phase 3: Code improvement pass

**Sub-agent:** `code-improver`

### What to build

Review changes from Phases 1–2 across `src/scripts/pyramid-wikipedia.ts` and `src/scripts/pyramid-wikipedia.test.ts`. Apply any Medium/High-impact suggestions.

### Acceptance criteria

- [ ] code-improver has reviewed both changed files
- [ ] All Medium/High-impact suggestions are applied
- [ ] `pnpm build` passes

---

## Phase 4: Code review gate

**Sub-agent:** `code-reviewer`

### What to build

Review all changes from Phases 1–3 for correctness, type safety, and testability.

### Acceptance criteria

- [ ] code-reviewer has reviewed all changed files
- [ ] All blocking and major issues are resolved
- [ ] Full test suite is green
- [ ] `pnpm build` passes with no TypeScript errors
