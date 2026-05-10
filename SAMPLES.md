# Sample Commands

## Wiki Script (`pnpm wiki`)

### Get a wiki page
Returns the NLS wiki page for a club, or `null` if it does not exist.

```bash
pnpm wiki --name fc-halifax-town --method get
pnpm wiki --name wrexham-afc --method get
pnpm wiki --name altrincham-fc --method get
```

### Get or create a wiki page
Fetches the NLS wiki page if it exists. If not, pulls content from Wikipedia and creates it.

`--name` is the NLS URL slug identifying the club in the NLS database.
`--wikipedia-name` is the exact Wikipedia article title and is always required for this method.

```bash
pnpm wiki --name fc-halifax-town --method getOrCreate --wikipedia-name "FC Halifax Town"
pnpm wiki --name wrexham-afc --method getOrCreate --wikipedia-name "Wrexham A.F.C."
pnpm wiki --name altrincham-fc --method getOrCreate --wikipedia-name "Altrincham F.C."
```

### Get or create with refresh
Forces a refresh from Wikipedia even if the NLS page already exists, updating it with the latest content.

```bash
pnpm wiki --name fc-halifax-town --method getOrCreate --wikipedia-name "FC Halifax Town" --refresh
pnpm wiki --name wrexham-afc --method getOrCreate --wikipedia-name "Wrexham A.F.C." --refresh
```

### Create a wiki page with explicit content
Creates a new NLS wiki page with the provided content string.

```bash
pnpm wiki --name fc-halifax-town --method create --content "FC Halifax Town are a football club based in Halifax, West Yorkshire."
pnpm wiki --name solihull-moors --method create --content "Solihull Moors FC are a football club based in Solihull."
```

### Update a wiki page with explicit content
Updates an existing NLS wiki page with the provided content string.

```bash
pnpm wiki --name fc-halifax-town --method update --content "Updated content for FC Halifax Town."
pnpm wiki --name wrexham-afc --method update --content "Updated content for Wrexham AFC."
```

---

## Pyramid Script (`pnpm pyramid`)

Search and explore the NLS pyramid. All filters are optional; omit all to return the full list.

```bash
# Full pyramid
pnpm pyramid

# Filter by step level
pnpm pyramid --pyramid-step 5

# Filter by league name (partial match)
pnpm pyramid --league-name "Northern Premier League"

# Filter by pyramid ID
pnpm pyramid --pyramid-id 42

# Filter by Wikipedia article name
pnpm pyramid --wikipedia "National_League_(English_football)"
```

---

## League Scraper Script (`pnpm league-scraper`)

Scrapes club lists from league websites using headless Chromium. Requires Playwright's Chromium binary (run `pnpm playwright install chromium` once after install).

### Generic scrape
Provide a URL and a CSS selector targeting each club element.

```bash
pnpm league-scraper --method generic --url "https://www.example-league.com/clubs" --selector "a.club-card"
pnpm league-scraper --method generic --url "https://www.example-league.com/clubs" --selector "h3.club-name"
```

### National League (bespoke)

```bash
pnpm league-scraper --method national-league
pnpm league-scraper --method national-league --competition north
pnpm league-scraper --method national-league --competition south
```

### Dump page HTML
Save the fully-rendered page HTML for inspection instead of scraping. Useful for finding the right selector.

```bash
pnpm league-scraper --method generic --url "https://www.example-league.com/clubs" --selector "" --dump-html
```

---

## Wikipedia Section Script (`pnpm wikipedia-section`)

Inspect what the Wikipedia section extractor returns for a pyramid league. Useful for verifying or debugging `wikiPageSection` selectors.

```bash
# Look up by league name
pnpm wikipedia-section --league-name "National League"
pnpm wikipedia-section --league-name "Northern Premier League"

# Look up by pyramid ID
pnpm wikipedia-section --pyramid-id 1

# Override the selector stored in the pyramid record
pnpm wikipedia-section --league-name "National League" --selector "#Current_members"

# Debug mode — extra logging
pnpm wikipedia-section --league-name "Midland Football League" --debug
```

---

## Wikipedia Check Script (`pnpm wikipedia-check`)

Bulk-check all active pyramid leagues: fetches each league's Wikipedia page and reports how many clubs the extractor finds vs how many are in the pyramid.

```bash
# Check all active leagues
pnpm wikipedia-check

# Show only leagues where the selector appears stale (zero or very few clubs extracted)
pnpm wikipedia-check --onlystale
```

Output columns: `Step | League | Wiki clubs | Pyramid clubs | First club / selector / error`

---

## Wikipedia Fix Script (`pnpm wikipedia-fix`)

Scans all active leagues and attempts to auto-fix stale `nth-child` selectors. When a selector returns too few clubs, it tries incrementing the `nth-child` value until enough clubs are found and prints the corrected selector.

```bash
pnpm wikipedia-fix
pnpm wikipedia-fix --debug
```

Output: `OK (N clubs)` / `FIXED (N clubs) → <new selector>` / `⚠ Could not auto-fix`

---

## Wikipedia Club Check Script (`pnpm wikipedia-club-check`)

Cross-references every active NLS club against the Wikipedia pages for all pyramid leagues. Produces a CSV report with one row per club occurrence and a status for each.

```bash
# Run and write to wiki-pyramid-check.csv (default)
pnpm wikipedia-club-check

# Write to a different file
pnpm wikipedia-club-check --output my-report.csv

# Debug mode
pnpm wikipedia-club-check --debug

# After generating the report, interactively clone MATCHED_WRONG_LEAGUE clubs
pnpm wikipedia-club-check --clone
```

### Status values

| Status | Meaning |
|--------|---------|
| `MATCHED` | Club found on Wikipedia and assigned to the correct league in NLS |
| `MATCHED_WRONG_LEAGUE` | Club found on Wikipedia but assigned to a different league in NLS |
| `MATCHED_UNASSIGNED` | Club found on Wikipedia but has no league assignment in NLS |
| `URL_MISMATCH` | Club matched by name but the Wikipedia URL differs |
| `WIKI_ONLY` | Club found on Wikipedia but not in NLS at all |
| `PYRAMID_ONLY` | Club assigned to a league in NLS but not found on the Wikipedia page |
| `UNASSIGNED` | Club exists in NLS with no league assignment and not matched on any Wikipedia page |

### CSV columns

`WikiLeague, WikiStep, WikiClubName, WikiClubUrl, NLSClubName, NLSWikiUrl, NLSAssignedLeague, NLSAssignedStep, Status, FoundElsewhere, DisableAutoUpdate, WikiClubLeague, WikiClubLeagueStep`

`WikiClubLeague` / `WikiClubLeagueStep` are populated for `PYRAMID_ONLY` and `UNASSIGNED` rows by fetching the club's own Wikipedia page and reading the league from its infobox. `WikiClubLeagueStep` is `NOT IN PYRAMID` if the league isn't in the NLS pyramid.

### `--clone` flag

When `--clone` is passed, after writing the CSV the script interactively prompts for each `MATCHED_WRONG_LEAGUE` row and asks whether to clone the NLS club under the Wikipedia name. The clone copies address, contact, and website details from the source club, assigns the correct league, and adds the Wikipedia URL as a social link.

---

## Environment Variables

Set these in `.env` to override default endpoints:

| Variable | Default | Description |
|----------|---------|-------------|
| `NLS_API_BASE_URL` | `https://nonleaguesocial.co.uk` | NLS API root — affects all v1/v2/v3 calls |
| `WIKIPEDIA_API_URL` | `https://en.wikipedia.org/api/rest_v1` | Wikipedia REST API base URL (summary + HTML endpoints) |
| `WIKIPEDIA_WIKI_URL` | `https://en.wikipedia.org/wiki` | Wikipedia wiki base URL (page HTML scraping) |
| `ANTHROPIC_API_KEY` | — | Enables LLM mode in the host |
| `MCP_TRANSPORT` | `stdio` | Set to `http` to use HTTP transport |
| `MCP_HTTP_BASE_URL` | `http://localhost:3000` | HTTP server URL when using HTTP transport |
| `API_PORT` | `3001` | Port for the web chat API server |
