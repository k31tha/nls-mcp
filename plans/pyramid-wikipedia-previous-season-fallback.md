# Plan: Previous-season link rewrite fallback in pyramid-wikipedia

## Background

When `pyramid-wikipedia` is run with a future season (e.g. `--season 2026-27`),
the resolution chain in `src/scripts/pyramid-wikipedia.ts` (lines ~281–312) is:

1. If `league.wikipedia` already contains the season → use it directly
2. Try the constructed title `"<SEASON> <league.wikipedia>"` via `checkWikiPageExists`
3. Fetch the league's current Wikipedia page and run `findCurrentSeasonLink`
   looking for an anchor whose text contains the **passed** season
4. Otherwise → `seasonLink = "(no <SEASON> link found)"` (also set when the
   redirect-resolution guard at line ~309 rejects a resolved URL)

Step 3 fails when the league article's infobox "Current:" link still points at
the **previous** season (the article has not been updated yet), even though a
season page for the passed season exists under a slightly different title than
the step-2 construction (different word order, en-dash, disambiguation suffix,
etc.).

**Goal**: when the sentinel `(no <SEASON> link found)` would be emitted,
re-evaluate the current Wikipedia page: find the "Current:" season link; if it
is for the previous season, rewrite the season substring in that link to the
passed season; check the rewritten page exists; if it does, use it as
`seasonLink` and let the existing pipeline determine clubs count, section, and
first club.

## Design sketch

Two new exported helpers in `pyramid-wikipedia.ts`:

```ts
// "2026-27" → "2025-26"; returns both hyphen and en-dash variants
export function previousSeasonVariants(season: string): string[]

// Replace the previous-season substring in a Wikipedia URL with the target
// season, preserving the original separator style (hyphen, en-dash, or
// percent-encoded en-dash %E2%80%93) and any #fragment
export function rewriteSeasonInUrl(url: string, prevVariants: string[], targetSeason: string): string | null
```

Fallback insertion point: inside the `else` branch (line ~292), when
`findCurrentSeasonLink` with the passed-season variants returns `null`:

1. Re-use the already-fetched `html` of the current page
2. Call `findCurrentSeasonLink(html, previousSeasonVariants(SEASON), league.wikipedia)`
   — same infobox-"Current:"-first logic, but matching the previous season
3. If a link is found, `rewriteSeasonInUrl` it to the passed season
4. Verify the rewritten page exists (`checkWikiPageExists` on the decoded title,
   or an ok `fetch` on the URL)
5. If it exists → `seasonLink = rewrittenUrl`; otherwise keep the sentinel

Because the fallback assigns `seasonLink` **before** the redirect-resolution
block (line ~300), the existing redirect resolution, title guard, and club
extraction (count / section / first club) all apply unchanged.

---

## Phase 1: Analysis — identify affected leagues and link shapes

### What to build

Run (or reason through) `pnpm pyramid-wikipedia -- --season 2026-27` and answer:

- Which leagues currently emit `(no 2026-27 link found)`?
- For each, what does the current article's infobox "Current:" link look like
  (link text, href, hyphen vs en-dash, presence of a `#fragment`)?
- For which of them does a 2026-27 page exist under the rewritten title, so the
  fallback would actually recover a link?
- Are there cases where the "Current:" link is *not* the immediately previous
  season (two seasons stale, or absent entirely)? These must keep the sentinel.

**Route to**: `question` sub-agent
**Input**: `src/scripts/pyramid-wikipedia.ts`; the latest `pyramid-wikipedia.csv`
rows containing `(no 2026-27 link found)`; the Wikipedia pages of those leagues.

### Acceptance criteria

- [ ] List of leagues producing the sentinel for `--season 2026-27`
- [ ] For each, documented "Current:" link href and separator style
- [ ] Confirmed which would be recovered by a previous-season rewrite
- [ ] Edge cases noted (no "Current:" link, link older than previous season,
  fragment-bearing links, percent-encoded en-dash)

---

## Phase 2: Implementation — previous-season rewrite fallback

### What to build

In `src/scripts/pyramid-wikipedia.ts`:

1. Add `previousSeasonVariants(season: string): string[]` — parse `YYYY-YY`,
   subtract one year from both parts, return `["2025-26", "2025–26"]`-style
   variants. Return `[]` (skip fallback) if the season string does not parse.
2. Add `rewriteSeasonInUrl(url, prevVariants, targetSeason): string | null` —
   replace the first previous-season occurrence in the URL (checking plain
   hyphen, en-dash, and percent-encoded en-dash forms) with the target season
   in the matching separator style; preserve any `#fragment`; return `null`
   when no variant is present in the URL.
3. Wire the fallback at the `link ?? …` assignment (line ~292): when `link` is
   `null`, attempt steps 2–5 of the design sketch before falling back to the
   sentinel. Reuse the already-fetched `html`; do not refetch the current page.
4. Export both helpers for unit testing.

**Route to**: `bugfix` sub-agent (minimal targeted change; branch
`fix/pyramid-wikipedia-previous-season-fallback`, PR per project convention —
no direct commits to main)
**Input**: Phase 1 findings; `src/scripts/pyramid-wikipedia.ts` lines ~281–312.

**Dependency**: Phase 1 must complete first — the observed link shapes drive
`rewriteSeasonInUrl`.

### Acceptance criteria

- [ ] `previousSeasonVariants` and `rewriteSeasonInUrl` exported
- [ ] Fallback only triggers when `findCurrentSeasonLink` for the passed season
  returns `null` (existing successful paths unaffected)
- [ ] Rewritten URL is verified to exist before being used; otherwise the
  sentinel `(no <SEASON> link found)` is emitted as before
- [ ] En-dash and percent-encoded en-dash URLs are rewritten correctly;
  `#fragment` is preserved
- [ ] Leagues identified in Phase 1 as recoverable show a season link and
  populated Clubs / Section / FirstClub columns on a `--season 2026-27` run
- [ ] `pnpm test` passes

---

## Phase 3: Tests — regression tests for the fallback

### What to build

Extend `src/scripts/pyramid-wikipedia.test.ts`:

- `describe("previousSeasonVariants")` — normal season, century boundary
  (`2099-00` style if applicable), malformed input returns `[]`
- `describe("rewriteSeasonInUrl")` — hyphen URL, en-dash URL, percent-encoded
  en-dash URL, URL with `#fragment`, URL containing no season variant (returns
  `null`)
- A fixture-HTML test proving the end-to-end fallback selection: a page whose
  infobox "Current:" anchor points at the previous season is rewritten to the
  passed season via `findCurrentSeasonLink` + `rewriteSeasonInUrl`

**Route to**: `test` sub-agent
**Input**: updated `pyramid-wikipedia.ts` from Phase 2; existing test file and
its fixture conventions.

**Dependency**: Phase 2 must complete first.

### Acceptance criteria

- [ ] All listed cases covered, one behaviour per `it`, sentence-style names
- [ ] No real network calls — `checkWikiPageExists` stubbed where exercised
- [ ] All tests pass with `pnpm test`

---

## Phase 4: Code improvement

### What to build

Review the Phase 2 and 3 changes for readability, performance, and
best-practice issues. Apply suggested changes.

**Route to**: `code-improver` sub-agent
**Input**: diff of `src/scripts/pyramid-wikipedia.ts` and
`src/scripts/pyramid-wikipedia.test.ts`

### Acceptance criteria

- [ ] No unaddressed readability or best-practice issues in the changed lines
- [ ] `pnpm test` still passes after any improvements applied

---

## Phase 5: Code review

### What to build

Correctness review of the final diff. All blocking and major issues must be
resolved before the PR is raised.

**Route to**: `code-reviewer` sub-agent
**Input**: final diff of `src/scripts/pyramid-wikipedia.ts` and
`src/scripts/pyramid-wikipedia.test.ts`

### Acceptance criteria

- [ ] No blocking or major correctness issues outstanding
- [ ] PR raised from `fix/pyramid-wikipedia-previous-season-fallback`
