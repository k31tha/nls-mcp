# Plan: API server startup error handling

> Source: code-improver finding — Issue 16 (highest priority)
> Merged: PR #3

## Phase 1: Fix unhandled rejection on startup

**Sub-agent:** `bugfix-agent`

### What to build

In `src/api/server.ts`, the top-level `await` that starts the MCP HTTP server has no error handling. If the upstream MCP server is unreachable at startup, Node throws an unhandled rejection and the process crashes with no useful log.

Wrap the top-level `await` (and any other awaited startup calls at module scope) in a `try/catch` block that:
- Logs a descriptive error message to `stderr` naming the failed operation
- Calls `process.exit(1)`

### Acceptance criteria

- [x] Top-level `await` in `src/api/server.ts` is wrapped in `try/catch`
- [x] Catch block logs the error to `stderr` with context (`"Failed to connect to MCP HTTP server:"`)
- [x] Catch block calls `process.exit(1)`
- [x] No other logic in the file is changed (beyond NaN guard on `API_PORT`)

---

## Phase 2: Regression test

**Sub-agent:** `test-agent`

### What to build

Add a test in `src/api/server.test.ts` (create if absent) that stubs the MCP HTTP server initialisation to throw and asserts:
- `process.exit` is called with code `1`
- A descriptive message is written to `stderr`

### Acceptance criteria

- [x] Test file exists and runs
- [x] Test stubs the failing initialisation call
- [x] Test asserts `process.exit(1)` is called (mock throws to halt execution)
- [x] Test asserts a `stderr` write occurs with relevant context
- [x] Success-path test: agent initialised and `app.listen` called on clean startup
- [x] Full test suite is green

---

## Phase 3: Code improvement pass

**Sub-agent:** `code-improver`

### Acceptance criteria

- [x] code-improver reviewed `src/api/server.ts` and `src/api/server.test.ts`
- [x] Error log message corrected: "start" → "connect to"
- [x] `parseInt` NaN guard added: `|| 3001`
- [x] `(e as any).json` replaced with `Object.assign` in test mock

---

## Phase 4: Code review gate

**Sub-agent:** `code-reviewer`

### Acceptance criteria

- [x] code-reviewer reviewed all changed files
- [x] All blocking and major issues resolved (process.exit mock made to throw; success-path test added)
- [x] Full test suite is green
- [x] `pnpm build` passes with no TypeScript errors
