# Plan: `--fix-wrong-league` mode for pyramid-wikipedia-clubs

## Background

`pyramid-wikipedia-clubs.ts` reports clubs whose NLS pyramid assignment
disagrees with the Wikipedia season page (`MATCHED_WRONG_LEAGUE`,
`src/scripts/pyramid-wikipedia-clubs.ts:214-218`) but offers no remediation for
them — its only write mode is `--add-wiki-only` for `WIKI_ONLY` rows.

The existing `wikipedia-club-check --clone` flow handles the *distinct-entity*
case (reserve teams sharing a first-team wiki page) by **cloning** the club.
The gap is the *promotion/relegation* case: the same club genuinely moved
league, and the existing NLS club should be **reassigned** via
`POST /api/ClubApi/UpdateClubPyramid` with `{ pyramidId, clubId }`
(`docs/NLS.yaml:189`, `ClubPyramidEntity` at `:513`; existing call pattern in
`src/lib/nls/club-clone.ts:148-153`).

**Goal**: add a `--fix-wrong-league` flag (with `--bulk` support) to
`pyramid-wikipedia-clubs` that, after the report is written, iterates the
`MATCHED_WRONG_LEAGUE` rows and reassigns each confirmed club to the CSV row's
league, mirroring the `--add-wiki-only` interactive pattern.

## Design decisions

- **Collect candidates during the report loop** (like `wikiOnlyClubs`,
  line 366): the matched club's `guid`, `name`, `assignedLeague`,
  `assignedStep`, `disableAutoUpdate`, `active`, plus the row's `League`,
  `Step`, and `pyramidId`. The GUID is only available in memory at match time —
  it is not written to the CSV.
- **ClubID resolution**: `GET /api/v2/ClubApi/ClubFullDetailByGuid/{guid}` →
  `ClubID`, then `POST {NLS_API.v1}/ClubApi/UpdateClubPyramid` with
  `{ pyramidId, clubId }`.
- **Safety rules** (the selection must be a pure, exported, testable function):
  - Skip clubs with `disableAutoUpdate === true` — never auto-move them; list
    them with a `[skip]` reason.
  - Skip clubs with no resolvable `pyramidId` for the target league.
  - If the **same GUID** appears as `MATCHED_WRONG_LEAGUE` under two or more
    different target leagues in one run, the target is ambiguous — skip in
    bulk mode, surface both options in interactive mode.
  - Inactive clubs (`active !== true`): prompt in interactive mode (showing
    the status), skip in bulk mode.
- **Prompt format** (interactive): club name, current league (+step) → target
  league (+step), NLS status, then `(y/n/q)`.
- **No behaviour change** when the flag is absent; report output is identical.

---

## Phase 1: Analysis — characterise current MATCHED_WRONG_LEAGUE rows

### What to build

Run `pnpm pyramid-wikipedia-clubs` (read-only, no flags; requires
`NODE_OPTIONS=--use-system-ca` on this machine) against the current
2026-27 `pyramid-wikipedia.csv` and answer:

- How many `MATCHED_WRONG_LEAGUE` rows are there, and for which leagues?
- How many are genuine promotion/relegation moves vs reserve-team /
  shared-URL false positives?
- How many carry `DisableAutoUpdate = Y`?
- Are there GUIDs that would hit the ambiguous-target rule (same club
  wrong-league under two leagues)?

**Route to**: `question` sub-agent
**Input**: `src/scripts/pyramid-wikipedia-clubs.ts`; the generated
`pyramid-wikipedia-clubs.csv`; NLS API access.

### Acceptance criteria

- [ ] Count and league breakdown of `MATCHED_WRONG_LEAGUE` rows documented
- [ ] Genuine-move vs false-positive split estimated with examples
- [ ] `DisableAutoUpdate` incidence confirmed
- [ ] Any ambiguous-target GUIDs identified
- [ ] Confirmation (or correction) of the safety rules above based on real data

---

## Phase 2: Implementation — `--fix-wrong-league` flag

### What to build

In `src/scripts/pyramid-wikipedia-clubs.ts`:

1. During the report loop, collect `MATCHED_WRONG_LEAGUE` candidates into a
   `wrongLeagueClubs` array (fields per the design decisions).
2. Add an exported pure function that partitions candidates into
   `{ eligible, skipped }` with a per-item skip reason, applying the safety
   rules (disableAutoUpdate, missing pyramidId, ambiguous GUID, inactive —
   parameterised by `bulk`):

   ```ts
   export function selectWrongLeagueFixes(
     candidates: WrongLeagueCandidate[],
     opts: { bulk: boolean },
   ): { eligible: WrongLeagueCandidate[]; skipped: Array<{ candidate: WrongLeagueCandidate; reason: string }> }
   ```

3. After the `--add-wiki-only` block, add the `--fix-wrong-league` block
   mirroring its interactive/bulk structure: print skipped items with
   reasons, then for each eligible candidate prompt (or log in bulk), resolve
   `ClubID` by GUID, POST `UpdateClubPyramid`, and log ✓/✗ per club.
4. Flag parsing follows the existing style (`args.includes(...)`).

**Route to**: `bugfix` sub-agent (targeted feature addition; branch
`fix/pyramid-wikipedia-clubs-fix-wrong-league`, changes via PR — never
commit to main)
**Input**: Phase 1 findings; `src/scripts/pyramid-wikipedia-clubs.ts`;
`src/lib/nls/club-clone.ts:148-153` for the `UpdateClubPyramid` call shape.

**Dependency**: Phase 1 must complete first — real-data findings may adjust
the safety rules.

### Acceptance criteria

- [ ] `--fix-wrong-league` and `--fix-wrong-league --bulk` both work
- [ ] Without the flag, script behaviour and CSV output are unchanged
- [ ] `selectWrongLeagueFixes` exported and pure (no I/O)
- [ ] `DisableAutoUpdate` clubs are never reassigned, in either mode
- [ ] Ambiguous-GUID candidates skipped in bulk mode
- [ ] Inactive clubs skipped in bulk mode, prompted in interactive mode
- [ ] Each reassignment logs the from-league → to-league and the API result
- [ ] `pnpm build` and `pnpm test` pass

---

## Phase 3: Tests — `selectWrongLeagueFixes`

### What to build

New `describe("selectWrongLeagueFixes")` in a test file alongside the script
(`src/scripts/pyramid-wikipedia-clubs.test.ts`, new), covering:

- A plain eligible candidate is returned in `eligible`
- `disableAutoUpdate: true` → skipped with a reason, in both modes
- Missing target `pyramidId` → skipped
- Same GUID under two target leagues → both skipped in bulk mode
- Inactive club → skipped in bulk, eligible (flagged) in interactive
- Empty input → empty output

No network calls; the function under test is pure. Fixture shapes should
mirror the real candidate fields from Phase 2.

**Route to**: `test` sub-agent
**Input**: updated `pyramid-wikipedia-clubs.ts` from Phase 2.

**Dependency**: Phase 2 must complete first.

### Acceptance criteria

- [ ] All listed cases covered; one behaviour per `it`, sentence-style names
- [ ] All tests pass with `pnpm test`

---

## Phase 4: Docs — script reference in CLAUDE.md

### What to build

Add a `### pyramid-wikipedia-clubs` entry to the Scripts section of the root
`CLAUDE.md` (it is currently undocumented there), covering: what the script
reads (`pyramid-wikipedia.csv`) and writes (`pyramid-wikipedia-clubs.csv`),
the row filter (sentinel rows skipped), and the flags table including the new
`--fix-wrong-league`, plus the distinction from `wikipedia-club-check --clone`
(reassign existing club vs clone a distinct entity).

**Route to**: `docs` sub-agent
**Input**: final Phase 2 implementation; the existing `### pyramid-wikipedia`
CLAUDE.md section as the format reference.

**Dependency**: Phases 2–3 complete (document what shipped).

### Acceptance criteria

- [ ] CLAUDE.md documents both existing and new flags accurately
- [ ] Clone-vs-reassign distinction stated in one or two sentences
- [ ] No changes to source files

---

## Phase 5: Code improvement

### What to build

Review Phase 2–3 changes for readability, performance, and best-practice
issues; apply suggested changes.

**Route to**: `code-improver` sub-agent
**Input**: diff of `pyramid-wikipedia-clubs.ts` and its test file.

### Acceptance criteria

- [ ] No unaddressed readability or best-practice issues in the changed lines
- [ ] `pnpm test` still passes after improvements

---

## Phase 6: Code review

### What to build

Correctness review of the final diff. All blocking and major issues must be
resolved before the PR is raised. Pay particular attention to the write path:
a wrong `pyramidId`/`clubId` pairing mutates production NLS data.

**Route to**: `code-reviewer` sub-agent
**Input**: final diff across all changed files.

### Acceptance criteria

- [ ] No blocking or major correctness issues outstanding
- [ ] PR raised from `fix/pyramid-wikipedia-clubs-fix-wrong-league`
