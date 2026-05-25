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
