# League Scraper Tools

MCP tools for scraping club lists from official league websites. Powered by [Playwright](https://playwright.dev) (Chromium) so JS-rendered SPAs are handled correctly.

## Integration with the Pyramid API

The league page URL and CSS selector for each league come from the NLS pyramid data. Use `search_pyramids` first to locate the right league entry, then pass its `websiteClubsPage` to `scrape_league_clubs`:

```
1. search_pyramids({ pyramidStep: 6, leagueName: "Northern Premier League" })
   → [ { leagueName: "Northern Premier League", websiteClubsPage: "https://...", ... } ]

2. scrape_league_clubs({ url: <websiteClubsPage>, selector: "a.club-card" })
   → [ { name: "FC Halifax Town", url: "https://..." }, ... ]
```

The `websiteClubsPage` field on each `PyramidLeagueClubEntity` is the official website URL for that league. Where the league site has a non-standard DOM structure, add a bespoke tool instead (see [Adding a bespoke tool](#adding-a-bespoke-tool)).

## Setup

Install the Chromium browser binary once after `pnpm install`:

```bash
pnpm playwright install chromium
```

## Tools

### `scrape_league_clubs` — generic

Scrapes any league page given a URL and a CSS selector. Use this when the target site has a straightforward DOM structure.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string (URL) | yes | The league website page to scrape |
| `selector` | string | yes | CSS selector targeting each club element |
| `attribute` | string | no | Element property/attribute to use as club name (default: `textContent`) |

**Output:** `{ name: string, url: string \| null }[]`

`url` is populated automatically when the matched element is an `<a>` tag, or contains a child `<a>`. Otherwise it is `null`.

**Examples:**

```
// Target anchor tags directly — name and url both extracted
selector: "a.club-card"

// Target a heading inside a linked card — url comes from the child <a>
selector: "h3.club-name"

// Extract a data attribute as the name
selector: "div.club", attribute: "data-club-name"
```

---

### `get_national_league_clubs` — bespoke

Scrapes the [National League](https://www.thenationalleague.org.uk) website for one of its three competitions.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `competition` | `national` \| `north` \| `south` | no | Competition to fetch (default: `national`) |

**Output:** `{ competition: string, clubs: { name: string, url: string \| null }[] }`

**Examples:**

```
competition: "national"   // National League (step 5)
competition: "north"      // National League North (step 6)
competition: "south"      // National League South (step 6)
```

---

## Adding a bespoke tool

Add a new `server.registerTool(...)` call inside `registerLeagueScraperTools` in `league-scraper-tools.ts`. Follow the `get_national_league_clubs` pattern:

1. Launch `chromium` per-call, always `close()` in a `finally` block
2. Use `waitUntil: "networkidle"` and `waitForSelector` before scraping
3. Return `{ name, url }[]` — extract `href` from the nearest `<a>` for `url`
4. Wrap in try/catch and return `isError: true` on failure
