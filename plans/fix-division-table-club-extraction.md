# Plan: Fix club extraction for division tables with a leading position column

## Background

`extractWikipediaSection` in `src/lib/generic/html-extract.ts` (lines 113–117)
always reads the **first `<td>`** of every table row as the club cell:

```ts
const firstCell = $(row).find("td:first-child").first();
const anchor = firstCell.find("a").first();
const name = firstCell.text().trim();
```

**Stadia tables** (the original use-case) have the club name in column 1, so this
works. **Division membership tables** (e.g. Combined Counties 2026–27) have a
row-number in column 1 and the club name in column 2:

| # | Club | Town |
|---|---|---|
| 1 | Club A | … |

Result: `firstClub = "1"` and `count` counts every numbered row rather than every
club link.

The fix is to find the **first `<td>` that contains an `<a>` link** instead of
always using `td:first-child`. Club cells always have a Wikipedia link; position
cells do not. Rows with no linked cell at all (dividers, totals) are skipped.

---

## Phase 1: Bugfix — use first linked `<td>` as the club cell

### What to build

In `src/lib/generic/html-extract.ts`, replace the club-extraction block inside
`extractWikipediaSection` (lines 113–117) with:

```ts
// Find the first <td> that contains a link — the club cell regardless of
// whether the table has a leading position-number column.
const clubCell = $(row).find("td").filter((_, td) => $(td).find("a").length > 0).first();
if (!clubCell.length) return;
const anchor = clubCell.find("a").first();
const name = clubCell.text().trim();
const href = anchor.attr("href") ?? "";
if (name) clubs.push({ name, url: resolveWikiHref(href) });
```

No other files change. Stadia tables are unaffected because their first `<td>`
already contains an `<a>`, so it is still selected as the first linked cell.

**Route to**: `bugfix` sub-agent
**Input**: root-cause above; `src/lib/generic/html-extract.ts` lines 113–117.

### Acceptance criteria

- [ ] `firstClub` for Combined Counties Premier Division North is a club name, not `"1"`
- [ ] `count` for the three Combined Counties leagues reflects actual club links,
  not row numbers
- [ ] Existing stadia-table behaviour is unchanged (club is still in the first
  column which has a link)
- [ ] Rows with no `<td>` containing a link are skipped (not pushed as clubs)
- [ ] `pnpm test` passes

---

## Phase 2: Tests — regression tests for both table structures

### What to build

Add or extend tests in `src/lib/generic/html-extract.test.ts` (create the file
if it does not exist) covering:

1. A stadia-style table (club in column 1 with link) — existing behaviour must
   still return the correct name and URL.
2. A division-style table (position number in column 1, club link in column 2) —
   must return the club name, not `"1"`.
3. A row with no `<td>` links at all — must not appear in `clubs`.

**Route to**: `test` sub-agent
**Input**: updated `src/lib/generic/html-extract.ts` from Phase 1; existing test
file `src/lib/generic/html-extract.test.ts` if present.

**Dependency**: Phase 1 must complete first.

### Acceptance criteria

- [ ] Test file exists at `src/lib/generic/html-extract.test.ts`
- [ ] `describe("extractWikipediaSection")` block present
- [ ] Test: stadia-style table returns club name from column 1
- [ ] Test: division-style table (position number first) returns club name from
  column 2
- [ ] Test: row with no linked cell contributes no entry to `clubs`
- [ ] All tests pass with `pnpm test`

---

## Phase 3: Code improvement

### What to build

Review changes from Phases 1 and 2 for readability, performance, and best-practice
issues. Apply any suggested changes.

**Route to**: `code-improver` sub-agent
**Input**: diff of `src/lib/generic/html-extract.ts` and
`src/lib/generic/html-extract.test.ts`

### Acceptance criteria

- [ ] No unaddressed readability or best-practice issues in the changed lines
- [ ] `pnpm test` still passes after any improvements applied

---

## Phase 4: Code review

### What to build

Review the final state of all changes for correctness. All blocking and major
issues must be resolved before the PR is raised.

**Route to**: `code-reviewer` sub-agent
**Input**: final diff of `src/lib/generic/html-extract.ts` and
`src/lib/generic/html-extract.test.ts`

### Acceptance criteria

- [ ] No blocking or major correctness issues outstanding
- [ ] PR can be raised on a `fix/division-table-club-extraction` branch
