---
name: project-pyramid-schema-gap
description: PyramidLeagueClubSchema includes websiteClubsPage which is not in NLS.yaml — spec is incomplete, field exists in live API
metadata:
  type: project
---

`PyramidLeagueClubSchema` in `src/server/tools/nls-tools.ts` includes a `websiteClubsPage: z.string().nullable()` field that does not appear in `docs/NLS.yaml`'s `PyramidLeagueClubEntity` definition. This is not a schema error — the NLS.yaml spec is known to be incomplete relative to the actual API response. The field is real and populated in live data.

**Why:** NLS.yaml is maintained by hand and lags the live API; treat it as a minimum contract, not an exhaustive one.

**How to apply:** When cross-referencing Zod schemas against NLS.yaml, do not flag extra fields in the schema as errors if they are plausible API fields. Only flag missing required fields or type mismatches.
