# Wikipedia Scraper — Season CLI Argument

## Goal

Make the season string in `pyramid-wikipedia.ts` configurable at runtime via `--season <value>`, defaulting to `2025-26`. This lets operators run the scraper for the upcoming `2026-27` season without changing source code.

## Phase 1 — Accept `--season` CLI argument

**What to build**

In `src/scripts/pyramid-wikipedia.ts`:

- Parse a `--season <value>` flag from `process.argv` in the existing `args` block (line 169). Fall back to `"2025-26"` when the flag is absent.
- Remove the hardcoded `const SEASON = "2025-26"` (line 20) and derive it from the parsed arg instead. Keep `SEASON_VARIANTS` logic unchanged.
- Replace the hardcoded season string in the table header label (line 189) with the `SEASON` variable.
- Replace the hardcoded season string in the "no link found" message (line 226) with the `SEASON` variable.

**Acceptance criteria**

- [ ] `pnpm tsx src/scripts/pyramid-wikipedia.ts` runs with `2025-26` as before (no regression).
- [ ] `pnpm tsx src/scripts/pyramid-wikipedia.ts --season 2026-27` runs with `2026-27` in all output and lookup logic.
- [ ] `pnpm build` passes with no TypeScript errors.
- [ ] Unknown seasons are accepted without error (no validation needed — the value is passed directly to Wikipedia URLs).

## Phase 2 — Extract `parseArgs` and add unit tests

**What to build**

In `src/scripts/pyramid-wikipedia.ts`:

- Extract the arg-parsing block from `main()` into an exported pure function `parseArgs(argv: string[]): { season: string; debug: boolean }`.
- Replace the inline arg-parsing in `main()` with a call to `parseArgs(process.argv.slice(2))`.

In `src/scripts/pyramid-wikipedia.test.ts` (new file):

- Test `parseArgs` with Vitest covering:
  - defaults `season` to `"2025-26"` when `--season` is absent
  - returns the supplied value when `--season 2026-27` is passed
  - returns the default when `--season` appears with no following value
  - sets `debug: true` when `--debug` is present
  - handles `--debug` and `--season` together in either order

**Acceptance criteria**

- [ ] `parseArgs` is exported from `pyramid-wikipedia.ts`.
- [ ] `pnpm test` passes with all new cases green.
- [ ] No change to runtime behaviour — `main()` output is identical to Phase 1.
