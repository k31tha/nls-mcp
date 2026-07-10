# Plan: Double base URL in WikiClubUrl (html-extract protocol-relative hrefs)

## Background — root cause (already diagnosed)

`pyramid-wikipedia-clubs.csv` shows `WikiClubUrl` values like
`https://en.wikipedia.org//en.wikipedia.org/wiki/AFC_Fylde`.

Cause: `resolveWikiHref` in `src/lib/generic/html-extract.ts:15-18`:

```ts
function resolveWikiHref(href: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return `${WIKIPEDIA_ORIGIN}${href}`;
  return href;
}
```

Wikipedia season pages serve Parsoid-style HTML whose anchors are
protocol-relative (`//en.wikipedia.org/wiki/AFC_Fylde`). That href passes the
`startsWith("/")` check and gets `https://en.wikipedia.org` prepended,
producing the double base. This is the same bug class already fixed for
`resolveHref` in `src/scripts/pyramid-wikipedia.ts` (see
`plans/completed/fix-resolve-href-protocol-relative.md`) — but in the shared
extraction module, which `pyramid-wikipedia-clubs`, `wikipedia-club-check`,
and the MCP tools all use.

Downstream impact beyond cosmetics: `normalizeUrl` matching in
`pyramid-wikipedia-clubs` compares these URLs against NLS club wiki URLs, so
double-base URLs can never URL-match — clubs fall through to weaker
name-based matching or `WIKI_ONLY`, and `--add-wiki-only`'s
`club.url.replace("https://en.wikipedia.org/wiki/", "")` produces a garbage
wiki value for such rows. Fixing this may change match results (likely for
the better) in the next report run.

## Phase 1: Fix — handle protocol-relative (and Parsoid `./`) hrefs

### What to build

In `src/lib/generic/html-extract.ts`, update `resolveWikiHref`:

```ts
function resolveWikiHref(href: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("./")) return `${WIKIPEDIA_ORIGIN}/wiki/${href.slice(2)}`;
  if (href.startsWith("/")) return `${WIKIPEDIA_ORIGIN}${href}`;
  return href;
}
```

- The `//` case mirrors `resolveHref` in `pyramid-wikipedia.ts`.
- The `./` case covers the other Parsoid link form (`./AFC_Fylde`) seen in
  REST-served HTML, which currently passes through unresolved.

Minimal change; do not touch the extraction logic itself.

**Route to**: `bugfix` sub-agent (branch
`fix/html-extract-protocol-relative-href`, changes via PR — never commit to
main)
**Input**: `src/lib/generic/html-extract.ts:13-18`; the reference fix in
`src/scripts/pyramid-wikipedia.ts` `resolveHref`.

### Acceptance criteria

- [ ] `//en.wikipedia.org/wiki/X` resolves to `https://en.wikipedia.org/wiki/X`
- [ ] `./X` resolves to `https://en.wikipedia.org/wiki/X`
- [ ] `/wiki/X` and absolute `https://…` behave as before
- [ ] A regenerated `pyramid-wikipedia-clubs.csv` contains no
  `en.wikipedia.org//en.wikipedia.org` occurrences
- [ ] `pnpm build` and `pnpm test` pass

## Phase 2: Tests — regression coverage for `resolveWikiHref`

### What to build

Extend the existing `html-extract` test file: feed `extractWikipediaSection`
fixture HTML whose club anchors use each href form (absolute,
root-relative, protocol-relative, `./`) and assert the returned `url` values
are all fully-qualified single-base URLs. If `resolveWikiHref` remains
unexported, test through `extractWikipediaSection`; export it only if that
keeps the tests clearer (default-parameter-safe export per bugfix
conventions).

**Route to**: `test` sub-agent
**Dependency**: Phase 1 first.

### Acceptance criteria

- [ ] All four href forms covered
- [ ] All tests pass with `pnpm test`

## Phase 3: Code improvement

Review the Phase 1–2 diff; apply readability/best-practice suggestions.

**Route to**: `code-improver` sub-agent

### Acceptance criteria

- [ ] No unaddressed issues; `pnpm test` still passes

## Phase 4: Code review

Correctness gate on the final diff — note the shared module is used by the
clubs report, `wikipedia-club-check`, and MCP tools, so behaviour changes
ripple. All blocking/major issues resolved before the PR is raised.

**Route to**: `code-reviewer` sub-agent

### Acceptance criteria

- [ ] No blocking or major issues outstanding
- [ ] PR raised from `fix/html-extract-protocol-relative-href`
