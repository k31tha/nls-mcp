# Plan: Fix club extraction broken by th[scope=row] in league standings tables

## Background

PR #6 changed `extractWikipediaSection` in `src/lib/generic/html-extract.ts` to
find the first `<td>` containing an `<a>` link, rather than always using
`td:first-child`. This fixed the "position number as firstClub" problem for tables
where the position number is in column 1 and the club is in column 2.

However, Wikipedia league standings tables use `<th scope="row">` for the team
name cell, not `<td>`. A typical row looks like:

```html
<tr>
  <td>1</td>                                          <!-- position, <td>, no link -->
  <th scope="row"><a href="/wiki/Club">Club A</a></th> <!-- club, <th>, has link -->
  <td>38</td> <td>25</td> ...                          <!-- stats, <td>, no link -->
</tr>
```

Because PR #6 filters `$(row).find("td")` (only `<td>` elements), none of the
`<td>` cells contain a link → `clubCell` is empty → the row is skipped →
`count = 0` → `findLeagueDivisionSections` rejects the section → back to
`(not found)`.

The fix is to extend the filter to `find("td, th")`. Column-header rows (where
`<th>` elements are labels like "Pos", "Club") do not contain links, so the
`filter(...find("a").length > 0)` guard still excludes them correctly.

---

## Phase 1: Bugfix — extend filter to include `<th>` elements

### What to build

In `src/lib/generic/html-extract.ts`, change the single line inside
`extractWikipediaSection` that builds the club-cell selector:

```ts
// Before
const clubCell = $(row).find("td").filter((_, td) => $(td).find("a").length > 0).first();

// After
const clubCell = $(row).find("td, th").filter((_, cell) => $(cell).find("a").length > 0).first();
```

Also rename the `td` parameter in the filter callback to `cell` to reflect that it
now covers both element types.

No other changes.

**Route to**: `bugfix` sub-agent
**Input**: root-cause above; `src/lib/generic/html-extract.ts` — the single
filter line inside the `node.find("table tr").each(...)` block.

### Acceptance criteria

- [ ] Rows using `<th scope="row">` for the club name are correctly identified
- [ ] `firstClub` for Combined Counties Premier Division North is a club name, not `"1"`
- [ ] Sections that were previously `(not found)` after PR #6 are found again
- [ ] Stadia-table behaviour is unchanged (club in first `<td>` with link still wins)
- [ ] Column-header rows (e.g. `<th>Pos</th><th>Club</th>`) are still skipped
  (they have no links so the filter excludes them)
- [ ] `pnpm test` passes

---

## Phase 2: Tests — add th[scope=row] fixture

### What to build

Add a test case to `src/lib/generic/html-extract.test.ts` in the existing
`"extractWikipediaSection — division-style tables"` describe block:

```ts
it("returns club name from a th[scope=row] cell (Wikipedia standings table pattern)", () => {
  const html = `
    <html><body>
      <h2 id="Premier_Division_North">Premier Division North</h2>
      <table><tbody>
        <tr><th>Pos</th><th>Club</th><th>P</th></tr>
        <tr>
          <td>1</td>
          <th scope="row"><a href="/wiki/Club_A">Club A</a></th>
          <td>38</td>
        </tr>
        <tr>
          <td>2</td>
          <th scope="row"><a href="/wiki/Club_B">Club B</a></th>
          <td>35</td>
        </tr>
      </tbody></table>
    </body></html>
  `;
  const { clubs } = extractWikipediaSection(html, "Premier_Division_North");

  expect(clubs).toHaveLength(2);
  expect(clubs[0].name).toBe("Club A");
});
```

**Route to**: `test` sub-agent
**Input**: updated `src/lib/generic/html-extract.ts` from Phase 1; existing
test file `src/lib/generic/html-extract.test.ts`.

**Dependency**: Phase 1 must complete first.

### Acceptance criteria

- [ ] Test for `th[scope=row]` pattern added inside the division-style describe block
- [ ] Verifies both count (2) and first club name ("Club A")
- [ ] All tests pass with `pnpm test`

---

## Phase 3: Code improvement

### What to build

Review changes from Phases 1 and 2 for readability and best-practice issues.
Apply any suggested changes.

**Route to**: `code-improver` sub-agent
**Input**: diff of `src/lib/generic/html-extract.ts` and
`src/lib/generic/html-extract.test.ts`

### Acceptance criteria

- [ ] No unaddressed readability or best-practice issues in the changed lines
- [ ] `pnpm test` still passes after any improvements applied

---

## Phase 4: Code review

### What to build

Review the final state of all changes for correctness before the PR is raised.

**Route to**: `code-reviewer` sub-agent
**Input**: final diff of `src/lib/generic/html-extract.ts` and
`src/lib/generic/html-extract.test.ts`

### Acceptance criteria

- [ ] No blocking or major correctness issues outstanding
- [ ] PR can be raised on a `fix/html-extract-th-scope-row` branch
