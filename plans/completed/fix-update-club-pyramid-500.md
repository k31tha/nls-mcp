# Plan: UpdateClubPyramid returns 500 for every --fix-wrong-league reassignment

## Background

Running `pnpm pyramid-wikipedia-clubs -- --fix-wrong-league --bulk` fails for
every eligible club:

```
Reassigning "Harborough Town FC": Southern League Central (step 3) → National League North (step 2)...
  ✗ Failed: UpdateClubPyramid returned 500 Internal Server Error
```

The call (`src/scripts/pyramid-wikipedia-clubs.ts`, `fixWrongLeagueClubs`):

```ts
await fetch(`${NLS_API.v1}/ClubApi/UpdateClubPyramid`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ pyramidId: club.toPyramidId, clubId: detail.ClubID }),
});
```

Facts established:

- The URL is `{root}/api/ClubApi/UpdateClubPyramid`, which matches the OpenAPI
  path (`docs/NLS.yaml:189`); the path is not the problem.
- The payload matches `ClubPyramidEntity` (`NLS.yaml:513`: camelCase
  `pyramidId` integer-nullable, `clubId` integer).
- **The "working reference" was never proven to work**: the identical call in
  `src/lib/nls/club-clone.ts:148-153` does not check `res.ok`, so `clone_club`
  may have been silently receiving the same 500 forever. The yaml may simply
  be wrong about this endpoint's contract.
- A 500 (not 400/404) on every call suggests the server binds a different
  shape and NPEs — classic candidates given the rest of the API surface:
  PascalCase property names (`PyramidId` / `ClubId` or `Club_ClubID`),
  a string `PyramidId` (ClubList returns `PyramidId` as string; `AddClub`
  sends `String(pyramidId)`), or a required `ClubGuid`.

---

## Phase 1: Diagnosis — find the payload shape the endpoint accepts

### What to build

Determine empirically what `POST /api/ClubApi/UpdateClubPyramid` accepts.
Use a **safe no-op probe**: pick one club that is already in the correct
league and "reassign" it to its *current* `pyramidId`, so a success mutates
nothing. (Requires `NODE_OPTIONS=--use-system-ca` on this machine.)

Try, in order, capturing status + response body for each:

1. The current payload `{ pyramidId: <int>, clubId: <int> }` (reproduce; read
   the 500 response body — it may name the null field)
2. PascalCase: `{ PyramidId: <int>, ClubId: <int> }`
3. String pyramid id: `{ PyramidId: "<int>", ClubId: <int> }` (and camelCase
   equivalent)
4. `Club_ClubID` naming (as used by `AddClubSocial`) and/or adding
   `ClubGuid`
5. If all fail, compare with how the NLS web frontend calls it (check any
   Swagger/`swagger.json` the API exposes, e.g. `{root}/swagger`), and
   whether the endpoint requires authentication (401/403 masquerading as 500)

Also verify the `clone_club` suspicion: confirm whether `club-clone.ts`'s
unchecked call receives the same 500.

**Route to**: `question` sub-agent (investigation; the no-op probe is
deliberately non-mutating even on success)
**Input**: this plan; `src/scripts/pyramid-wikipedia-clubs.ts`
(`fixWrongLeagueClubs`); `src/lib/nls/club-clone.ts:148-153`;
`docs/NLS.yaml:189,513`.

### Acceptance criteria

- [ ] 500 reproduced with the current payload and the response body captured
- [ ] The accepted payload shape identified (or authentication/other server
  requirement identified), demonstrated by a 200 on the no-op probe
- [ ] Confirmed whether `clone_club`'s call suffers the same failure
- [ ] `docs/NLS.yaml` `ClubPyramidEntity` correctness assessed against reality

---

## Phase 2: Fix — correct the call (and the silent failure in club-clone)

### What to build

Based on Phase 1:

1. Introduce one shared helper `updateClubPyramid(clubId, pyramidId, ...)` in
   `src/lib/nls/` (new file or an existing appropriate module) that sends the
   proven-correct payload and **throws on non-OK** with status and response
   body in the message.
2. Use it from `fixWrongLeagueClubs` in `pyramid-wikipedia-clubs.ts`.
3. Use it from `cloneClub` in `club-clone.ts`, replacing the unchecked
   `fetch` — same root-cause surface, explicitly in scope for this plan.
4. If Phase 1 showed the yaml is wrong, update `ClubPyramidEntity` in
   `docs/NLS.yaml` to the real contract.

**Route to**: `bugfix` sub-agent (branch `fix/update-club-pyramid-500`,
changes via PR — never commit to main)
**Input**: Phase 1 findings; the two call sites.

**Dependency**: Phase 1 must complete first.

### Acceptance criteria

- [ ] `updateClubPyramid` helper exists, exported, sends the proven payload,
  throws with status + body on non-OK
- [ ] Both call sites use the helper; no unchecked `fetch` to
  `UpdateClubPyramid` remains
- [ ] A real reassignment succeeds end-to-end via
  `--fix-wrong-league` (one club, interactive mode) and is visible in NLS
- [ ] `docs/NLS.yaml` matches the real contract
- [ ] `pnpm build` and `pnpm test` pass

---

## Phase 3: Tests — helper contract

### What to build

Vitest coverage for `updateClubPyramid` (alongside its module), with `fetch`
stubbed (error-path stubbing is the explicitly allowed exception):

- Sends the proven-correct method, URL, headers, and body shape
- Resolves on 200
- Throws with status and response body in the message on non-OK
- Propagates network errors

**Route to**: `test` sub-agent
**Dependency**: Phase 2 must complete first.

### Acceptance criteria

- [ ] All listed cases covered; names read as sentences
- [ ] No real network calls in tests
- [ ] `pnpm test` passes

---

## Phase 4: Code improvement

Review the Phase 2–3 diff for readability/best practices; apply changes.

**Route to**: `code-improver` sub-agent

### Acceptance criteria

- [ ] No unaddressed issues in changed lines; `pnpm test` still passes

---

## Phase 5: Code review

Correctness gate on the final diff — this is a production-data write path.
All blocking and major issues resolved before the PR is raised.

**Route to**: `code-reviewer` sub-agent

### Acceptance criteria

- [ ] No blocking or major issues outstanding
- [ ] PR raised from `fix/update-club-pyramid-500`
