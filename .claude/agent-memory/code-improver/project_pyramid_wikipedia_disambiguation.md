---
name: project-pyramid-wikipedia-disambiguation
description: normalizeWikiTitle helper extracted in pyramid-wikipedia.ts; both URL-matching sites now use one implementation
metadata:
  type: project
---

A `normalizeWikiTitle(title: string): string` helper was added to `src/scripts/pyramid-wikipedia.ts` to replace two inline copies of the disambiguation-stripping logic. It: replaces spaces with underscores, strips a trailing `_(…)` disambiguation suffix via `/_\([^)]+\)$/`, then lowercases. Both sites (`findCurrentSeasonLink` fallback scan and `main()` post-redirect guard) now call this helper.

The `findCurrentSeasonLink` site was also updated to lowercase the `href` side of the comparison so both sides are consistently case-insensitive (previously the normalised title was not lowercased in that location).

**Why:** Two independent copies of the same regex; any future change (e.g. handling edge cases) required a double edit. Case inconsistency between the two sites was a latent bug risk.

**How to apply:** If the disambiguation-stripping logic is extended (e.g. to handle non-ASCII parentheses), update only `normalizeWikiTitle`.
