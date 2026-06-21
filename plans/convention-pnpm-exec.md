# Plan: Convention — replace npx with pnpm exec

> Source: code-improver finding — `src/host/app.ts` uses `npx tsx` in violation of pnpm convention

## Phase 1: Replace `npx tsx` with `pnpm exec tsx`

**Sub-agent:** `bugfix-agent`

### What to build

In `src/host/app.ts`, `serverPath` or the child-process spawn call uses `npx tsx` to launch the MCP server subprocess. Replace it with `pnpm exec tsx` so the project's own installed `tsx` binary is used, consistent with the rest of the project.

Search the file for any other `npx` usage and replace those too.

### Acceptance criteria

- [ ] All `npx` references in `src/host/app.ts` are replaced with `pnpm exec`
- [ ] No other files in `src/` use `npx` (check and fix if found)
- [ ] `pnpm build` passes
- [ ] `pnpm dev:host` still launches correctly (smoke test)

---

## Phase 2: Code improvement pass

**Sub-agent:** `code-improver`

### What to build

Review changes from Phase 1 in `src/host/app.ts`. Apply any Medium/High-impact suggestions.

### Acceptance criteria

- [ ] code-improver has reviewed `src/host/app.ts`
- [ ] All Medium/High-impact suggestions are applied
- [ ] `pnpm build` passes

---

## Phase 3: Code review gate

**Sub-agent:** `code-reviewer`

### What to build

Review all changes from Phases 1–2 for correctness and convention compliance.

### Acceptance criteria

- [ ] code-reviewer has reviewed all changed files
- [ ] All blocking and major issues are resolved
- [ ] `pnpm build` passes with no TypeScript errors
