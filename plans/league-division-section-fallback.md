# Plan: League division section fallback for missing stadia sections

## Background

Several 2026-27 Wikipedia season articles (e.g. the Combined Counties Football
League) exist but have not yet had their stadia/venue tables added. The current
fallback chain in `pyramid-wikipedia.ts` is:

1. `findStadiaSections()` — looks for headings containing stadia keywords
2. `league.wikiPageSection` from NLS API (the configured section)
3. `(not found)`

When neither (1) nor (2) yields clubs, all three Combined Counties leagues
(Premier Division North, Premier Division South, Division One) land on `(not found)`
even though the page does contain per-division sections with club tables.

The goal is to insert a new intermediate fallback **between steps (1) and (2)**:
scan the page for headings whose IDs match the division portion of the league
name, and use the first one that contains clubs.

---

## Phase 1: Analysis — confirm page structure and heading IDs

### What to build

Inspect `https://en.wikipedia.org/wiki/2026%E2%80%9327_Combined_Counties_Football_League`
to answer:

- What heading IDs exist on the page?
- Which headings contain club tables (rows with club links)?
- What is the mapping from heading ID to NLS league name for each of the three
  Combined Counties leagues?
- Does the division-name derivation approach (strip the `wikiTitle` prefix from
  `leagueName`) produce heading IDs that match, or is a different strategy needed?

**Route to**: `question` sub-agent
**Input**: the Wikipedia URL above; the three NLS league names: "Combined Counties
Football League Premier Division North", "Combined Counties Football League Premier
Division South", "Combined Counties Football League Division One"; the NLS
`wikipedia` field for all three (likely `"Combined_Counties_Football_League"`).

### Acceptance criteria

- [ ] Confirmed list of heading IDs on the 2026-27 Combined Counties page
- [ ] Identified which heading IDs contain clubs for each of the three leagues
- [ ] Confirmed whether stripping the shared wikipedia-title prefix from the league
  name produces a slug that matches (or nearly matches) the relevant heading IDs
- [ ] Any edge cases noted (e.g. heading IDs that include numbers, underscores vs
  spaces, disambiguation)

---

## Phase 2: Implementation — `findLeagueDivisionSections`

### What to build

In `src/scripts/pyramid-wikipedia.ts`, add a new function
`findLeagueDivisionSections` and insert it into the fallback chain.

**New function signature:**

```ts
function findLeagueDivisionSections(
  $: cheerio.CheerioAPI,
  leagueName: string,
  wikiTitle: string,
  usedSections: Set<string>,
): string[]
```

**Logic:**

1. Derive the division label by stripping the normalised `wikiTitle` prefix from
   `leagueName` (case-insensitive, spaces/underscores normalised). For example:
   - league: `"Combined Counties Football League Premier Division North"`
   - wikiTitle: `"Combined_Counties_Football_League"`
   - division label: `"Premier Division North"`
2. Tokenise the division label into significant words (length > 3, ignore common
   stop-words like "the", "and", "for").
3. Score every unclaimed heading ID by counting how many of those tokens appear in
   the ID (decoded, underscores → spaces, lowercased).
4. Return heading IDs with score > 0, sorted descending by score.

**Fallback chain insertion** (after the stadia block, before the configured-section
fallback, lines ~313–326):

```ts
// NEW: try division-name sections before the NLS-configured section
if (!found) {
  const divisionCandidates = findLeagueDivisionSections($, league.leagueName, league.wikipedia, claimed);
  for (const id of divisionCandidates) {
    const { count, first } = findClubsInSection(html, id);
    if (count > 0) {
      clubsCol = String(count);
      sectionCol = id;
      firstClub = first;
      claimSection(cacheKey, id);
      found = true;
      break;
    }
  }
}
```

Export `findLeagueDivisionSections` so it can be unit-tested directly.

**Route to**: `bugfix` sub-agent (minimal targeted change)
**Input**: analysis findings from Phase 1; file
`src/scripts/pyramid-wikipedia.ts`; the fallback chain at lines ~285–334.

**Dependency**: Phase 1 must complete first — the exact heading ID format informs
the token-matching strategy.

### Acceptance criteria

- [ ] `findLeagueDivisionSections` is exported from `pyramid-wikipedia.ts`
- [ ] Combined Counties Premier Division North maps to its correct heading ID
- [ ] Combined Counties Premier Division South maps to its correct heading ID
- [ ] Combined Counties Division One maps to its correct heading ID
- [ ] The three Combined Counties leagues show club counts > 0 in the CSV when
  re-run (verified manually or via test fixture)
- [ ] Leagues that already resolve via stadia sections are unaffected
- [ ] `pnpm test` passes

---

## Phase 3: Tests — regression tests for `findLeagueDivisionSections`

### What to build

Add a `describe("findLeagueDivisionSections")` block in
`src/scripts/pyramid-wikipedia.test.ts` using a minimal HTML fixture that
mimics the Combined Counties page structure (headings + a simple club table per
division).

**Route to**: `test` sub-agent
**Input**: updated `src/scripts/pyramid-wikipedia.ts` from Phase 2; existing
test file `src/scripts/pyramid-wikipedia.test.ts`; the heading IDs confirmed
in Phase 1.

**Dependency**: Phase 2 must complete first.

### Acceptance criteria

- [ ] Fixture HTML contains at least three division headings and one club table
  each
- [ ] Test verifies the correct heading ID is returned for each of the three
  division labels
- [ ] Test verifies that already-claimed sections are excluded from results
- [ ] Test verifies that an unrelated heading (e.g. "History") scores 0 and is
  not returned
- [ ] All tests pass with `pnpm test`

---

## Phase 4: Code improvement

### What to build

Review changes from Phases 2 and 3 for readability, performance, and best-practice
issues. Apply any suggested changes.

**Route to**: `code-improver` sub-agent
**Input**: diff of `src/scripts/pyramid-wikipedia.ts` and
`src/scripts/pyramid-wikipedia.test.ts`

### Acceptance criteria

- [ ] No unaddressed readability or best-practice issues in the changed lines
- [ ] `pnpm test` still passes after any improvements applied

---

## Phase 5: Code review

### What to build

Review the final state of all changes for correctness. All blocking and major
issues must be resolved before the PR is raised.

**Route to**: `code-reviewer` sub-agent
**Input**: final diff of `src/scripts/pyramid-wikipedia.ts` and
`src/scripts/pyramid-wikipedia.test.ts`

### Acceptance criteria

- [ ] No blocking or major correctness issues outstanding
- [ ] PR can be raised on a `feature/league-division-section-fallback` branch
