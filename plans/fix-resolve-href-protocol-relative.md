# Plan: Fix resolveHref protocol-relative URL bug

## Background

`resolveHref` in `src/scripts/pyramid-wikipedia.ts` (line 66–68) does not handle
protocol-relative hrefs (`//en.wikipedia.org/...`). It only tests `href.startsWith("http")`;
a `//`-prefixed href falls through to the else branch, which prepends the full
`https://en.wikipedia.org` base, producing a malformed double-slash URL such as:

```
https://en.wikipedia.org//en.wikipedia.org/wiki/2026–27_National_League
```

Affected rows in the CSV: National League (Step 1), Wessex Football League, and
North West Counties Football League.

---

## Phase 1: Bugfix — handle protocol-relative hrefs in resolveHref

### What to build

In `src/scripts/pyramid-wikipedia.ts`, update `resolveHref` to recognise
protocol-relative URLs (those starting with `//`) and prepend only `https:` rather
than the full Wikipedia base:

```ts
function resolveHref(href: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  return `https://en.wikipedia.org${href}`;
}
```

No other changes. The same fix must also be applied to the identical inline logic
in `resolveWikiUrl` at line 51 if it contains the same pattern.

**Route to**: `bugfix` sub-agent
**Input**: root-cause description above; file `src/scripts/pyramid-wikipedia.ts`; lines 43–54 (`resolveWikiUrl`) and 66–68 (`resolveHref`)

### Acceptance criteria

- [ ] `resolveHref("//en.wikipedia.org/wiki/Foo")` returns `"https://en.wikipedia.org/wiki/Foo"`
- [ ] `resolveHref("https://en.wikipedia.org/wiki/Foo")` still returns the URL unchanged
- [ ] `resolveHref("/wiki/Foo")` still returns `"https://en.wikipedia.org/wiki/Foo"`
- [ ] `resolveWikiUrl` line 51 uses the same corrected logic (or delegates to `resolveHref`)
- [ ] `pnpm test` passes

---

## Phase 2: Regression test

### What to build

Add unit tests for `resolveHref` in `src/scripts/pyramid-wikipedia.test.ts` covering
all three href forms: `http`-prefixed, `//`-prefixed (the bug case), and `/`-prefixed.

**Route to**: `test` sub-agent
**Input**: updated `src/scripts/pyramid-wikipedia.ts` from Phase 1; existing test file
`src/scripts/pyramid-wikipedia.test.ts`

**Dependency**: Phase 1 must complete first — `resolveHref` must be exported for
direct unit testing (add `export` if not already present).

### Acceptance criteria

- [ ] `resolveHref` is exported from `pyramid-wikipedia.ts`
- [ ] Test file includes a `describe("resolveHref")` block
- [ ] Three cases tested: absolute `http` URL, protocol-relative `//` URL, root-relative `/` path
- [ ] All tests pass with `pnpm test`

---

## Phase 3: Code improvement

### What to build

Review the changes from Phases 1 and 2 for readability, performance, and best-practice
issues. Apply any suggested changes.

**Route to**: `code-improver` sub-agent
**Input**: diff of `src/scripts/pyramid-wikipedia.ts` and `src/scripts/pyramid-wikipedia.test.ts`

### Acceptance criteria

- [ ] No unaddressed readability or best-practice issues in the changed lines
- [ ] `pnpm test` still passes after any improvements applied

---

## Phase 4: Code review

### What to build

Review the final state of changes for correctness. All blocking and major issues must
be resolved before the fix is committed.

**Route to**: `code-reviewer` sub-agent
**Input**: final diff of `src/scripts/pyramid-wikipedia.ts` and `src/scripts/pyramid-wikipedia.test.ts`

### Acceptance criteria

- [ ] No blocking or major correctness issues outstanding
- [ ] PR can be raised on a `fix/resolve-href-protocol-relative` branch
