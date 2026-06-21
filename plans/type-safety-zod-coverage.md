# Plan: Type safety and Zod response coverage

> Source: code-improver findings — best practices issues across gateway, tools, and API layers

## Phase 1: Fix TextContent cast in gateway

**Sub-agent:** `bugfix-agent`

### What to build

In `src/client/gateway.ts`, `callTool` casts `result.content` to an `any`-adjacent type. Replace the cast with the SDK's `TextContent` type guard (or narrow the type explicitly using the discriminated union the MCP SDK provides).

### Acceptance criteria

- [ ] `callTool` in `src/client/gateway.ts` uses a proper type guard instead of a cast
- [ ] No `any` or implicit `any` remains in the changed code
- [ ] `pnpm build` passes

---

## Phase 2: Add Zod response schema to `get_pyramid`

**Sub-agent:** `bugfix-agent`

### What to build

In `src/server/tools/nls-tools.ts`, the `get_pyramid` tool handler validates inputs but not the API response. The `clubs` field is typed as `z.array(z.unknown())` despite `ClubSchema` already being defined in the same file.

- Replace `z.array(z.unknown())` with `z.array(ClubSchema)` (or the relevant existing schema)
- Add a Zod `.parse()` or `.safeParse()` call on the raw API response before returning it, consistent with how other tools in the same file handle responses

### Acceptance criteria

- [ ] `clubs` field uses `ClubSchema` (or equivalent) instead of `z.unknown()`
- [ ] API response is validated with Zod before being returned to the caller
- [ ] Error path on parse failure returns `isError: true` with a descriptive message
- [ ] `pnpm build` passes

---

## Phase 3: Replace manual type check in `/api/chat` with Zod

**Sub-agent:** `bugfix-agent`

### What to build

In `src/api/server.ts`, the `/api/chat` route performs manual type checking on the request body instead of using Zod, which is inconsistent with the rest of the codebase. Define a `z.object(...)` schema for the chat request body and validate with `.safeParse()`. Return a 400 with a descriptive message on failure.

### Acceptance criteria

- [ ] `/api/chat` request body is validated with a Zod schema
- [ ] Manual `typeof` / `if` type checks are removed
- [ ] Invalid request returns HTTP 400 with a JSON error body
- [ ] `pnpm build` passes

---

## Phase 4: Code improvement pass

**Sub-agent:** `code-improver`

### What to build

Review changes from Phases 1–3 across `src/client/gateway.ts`, `src/server/tools/nls-tools.ts`, and `src/api/server.ts`. Apply any Medium/High-impact suggestions.

### Acceptance criteria

- [ ] code-improver has reviewed all three changed files
- [ ] All Medium/High-impact suggestions are applied
- [ ] `pnpm build` passes

---

## Phase 5: Code review gate

**Sub-agent:** `code-reviewer`

### What to build

Review all changes from Phases 1–4 for correctness, type safety, and convention compliance. Cross-reference `docs/NLS.yaml` for response field shapes where relevant.

### Acceptance criteria

- [ ] code-reviewer has reviewed all changed files
- [ ] All blocking and major issues are resolved
- [ ] Full test suite is green
- [ ] `pnpm build` passes with no TypeScript errors
