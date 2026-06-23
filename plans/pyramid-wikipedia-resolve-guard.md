# pyramid-wikipedia: fix over-aggressive post-resolve guard

## Context

Two successive patches were applied to `src/scripts/pyramid-wikipedia.ts` to stop a rugby false-positive (`2026–27 National League 2 North`) from appearing as a season link for the football National League North.

Patch 1 added a `wikiTitle` filter to `findCurrentSeasonLink`'s broad fallback scan.
Patch 2 added a post-`resolveWikiUrl` guard in `main()` that rejects any resolved URL whose decoded path does not contain the normalised `league.wikipedia` title.

Patch 2 is too aggressive: `league.wikipedia` for the top-level National League entry is stored as `"National League (division)"` (the Wikipedia disambiguation title). The corresponding season article is `2026-27_National_League` — it drops the `_(division)` suffix — so the guard rejects a perfectly valid link.

## Root cause (one sentence)

The post-`resolveWikiUrl` guard normalises the full `league.wikipedia` value including any disambiguation suffix, but Wikipedia season articles never carry that suffix.

## Phase 1 — Bugfix

**Agent:** `bugfix`

**What to fix** (`src/scripts/pyramid-wikipedia.ts`, `main()` function):

Strip any trailing Wikipedia disambiguation suffix — i.e., anything matching ` (...)` or `_(...)` — from the normalised title before the guard check.

Example:
- `"National League (division)"` → strip `(division)` → compare against `"national_league"` instead of `"national_league_(division)"`
- `"National League North"` → no suffix → compare against `"national_league_north"` as before

The guard then accepts `2026-27_National_League` (contains `national_league`) and still rejects `2026-27_National_League_2_North` (does not contain `national_league_north`).

The same stripping should be applied inside `findCurrentSeasonLink` where `wikiTitle` is normalised for the fallback scan.

**Regression test** (`src/scripts/pyramid-wikipedia.test.ts`):

Add a test that passes `wikiTitle = "National League (division)"` and asserts that a fallback link to `"/wiki/2026%E2%80%9327_National_League"` is accepted (not rejected by the disambig suffix).

**Acceptance criteria:**
- [ ] `findCurrentSeasonLink` accepts a link whose href matches the base title without the disambiguation suffix
- [ ] `findCurrentSeasonLink` still rejects the rugby `National_League_2_North` false-positive
- [ ] The post-`resolveWikiUrl` guard in `main()` accepts `2026-27_National_League` when `league.wikipedia = "National League (division)"`
- [ ] `pnpm vitest run src/scripts/pyramid-wikipedia.test.ts` passes

## Phase 2 — Code improvement

**Agent:** `code-improver`

Review the disambiguation-stripping logic for readability and robustness. Confirm the regex covers all Wikipedia disambiguation patterns in use (single-word and multi-word suffixes).

## Phase 3 — Code review

**Agent:** `code-reviewer`

Verify correctness of the guard and the test coverage. All blocking issues must be resolved before the fix is considered complete.
