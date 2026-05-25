# NLS MCP Server

An MCP (Model Context Protocol) server for the **Non League Social** platform, built with the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk). Exposes NLS club, pyramid, wiki, and reference data as tools for LLM agents.

Uses the full production-shaped stack:

**Host -> Agent (Claude LLM) -> MCP Gateway -> NLS Server**

Supports two transport modes: **stdio** (child processes) and **Streamable HTTP** (Express server). Includes a **React web chat interface** for interactive use in the browser.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  HOST (src/host/app.ts)                              │
│  Application entry point. Owns lifecycle of the      │
│  Agent and Gateway. Passes user messages to Agent.   │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  AGENT (src/agent/agent.ts)                    │  │
│  │  Business logic + LLM interaction.             │  │
│  │  Sends user messages to Claude with tool       │  │
│  │  descriptions. Executes tool calls through     │  │
│  │  the gateway. Returns final answers to Host.   │  │
│  │                                                │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │  GATEWAY (src/client/gateway.ts)         │  │  │
│  │  │  MCP infrastructure layer.               │  │  │
│  │  │  One SDK Client per Server (required     │  │  │
│  │  │  by protocol). Auto-routes callTool()    │  │  │
│  │  │  to the correct server.                  │  │  │
│  │  │                                          │  │  │
│  │  │  Client 1 ◄──────────► NLS Server        │  │  │
│  │  │       (stdio or HTTP)                    │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Project Structure

```
src/
├── host/
│   └── app.ts              Host — wires gateway + agent, manages lifecycle
├── agent/
│   └── agent.ts            Agent — LLM interaction, tool decisions
├── client/
│   └── gateway.ts          Gateway — MCP client infrastructure (stdio + HTTP)
├── api/
│   └── server.ts           Express API server for the web chat UI
├── lib/
│   ├── generic/
│   │   ├── api-call.ts     Shared typed fetch helper (JSON + MCP response wrapping)
│   │   ├── fetch-json.ts   Generic typed fetch with Zod validation
│   │   └── html-extract.ts Wikipedia/HTML extraction utilities (Cheerio)
│   └── nls/
│       ├── club-clone.ts   Clone an NLS club record with wiki social link
│       ├── club-status.ts  Set an NLS club to inactive
│       ├── config.ts       NLS API base URL configuration
│       ├── wiki.ts         NLS wiki page helpers (get/create/update)
│       └── wikipedia.ts    Wikipedia fetch helpers + re-exports
├── scripts/
│   ├── wiki.ts             CLI — manage NLS wiki pages
│   ├── pyramid.ts          CLI — search and explore the NLS pyramid
│   ├── league-scraper.ts   CLI — scrape club lists from league websites
│   ├── wikipedia-section.ts CLI — inspect Wikipedia section extraction for a league
│   ├── wikipedia-check.ts  CLI — bulk-check Wikipedia coverage across all leagues
│   ├── wikipedia-fix.ts    CLI — auto-fix stale nth-child selectors in pyramid data
│   ├── wikipedia-club-check.ts CLI — cross-reference NLS clubs against Wikipedia; CSV report + bulk actions
│   ├── pyramid-wikipedia.ts    CLI — discover 2025-26 season Wikipedia links per pyramid league; outputs pyramid-wikipedia.csv
│   └── pyramid-wikipedia-clubs.ts CLI — expand pyramid-wikipedia.csv to one row per club with NLS cross-reference; optionally create missing clubs
└── server/
    ├── nls.ts              MCP Server — NLS tools over stdio
    ├── http.ts             Express app — NLS server over Streamable HTTP
    └── tools/
        ├── nls-tools.ts            NLS tool registration
        ├── league-scraper-tools.ts League scraper tool registration
        └── nls-tools.test.ts       NLS tool tests (Vitest)

web/                         React + Tailwind chat frontend (Vite)
├── src/
│   ├── App.tsx              Chat UI component
│   ├── main.tsx             React entry point
│   └── index.css            Tailwind CSS imports
├── index.html               Vite entry HTML
├── vite.config.ts           Vite config with /api proxy
├── tsconfig.json            TypeScript config for React
└── package.json             Frontend dependencies
```

### Layer Responsibilities

| Layer | File | Does | Doesn't do |
|-------|------|------|------------|
| **Host** | `src/host/app.ts` | Loads env, creates gateway + agent, sends user messages, manages shutdown | Tool decisions, MCP protocol |
| **Agent** | `src/agent/agent.ts` | Sends messages + tool schemas to Claude, executes tool calls via gateway, returns answers | Server connections, transport |
| **Gateway** | `src/client/gateway.ts` | Connects to servers (stdio or HTTP), manages Client instances, routes `callTool()` to correct server | Business logic, LLM interaction |
| **Servers** | `src/server/*.ts` | Expose tools via MCP protocol (stdio or HTTP) | Anything about host, agent, or other servers |

### Why One Client Per Server?

MCP requires a dedicated Client instance for each Server connection. This is a deliberate protocol design, not a limitation:

1. **Stateful connections** — MCP is a stateful protocol. During initialization, each client-server pair negotiates capabilities (which tools exist, whether the server supports resources, etc.). This state belongs to that specific connection and can't be shared.

2. **Isolated lifecycles** — Each server is an independent process. One server crashing or restarting shouldn't affect others. A shared client would create coupling between unrelated servers.

3. **Capability negotiation is per-server** — Server A might support tools + resources, while Server B only supports tools. The client tracks what each server can do, so mixing them in one client would create ambiguity.

4. **Transport ownership** — Each Client owns its transport (e.g. a stdio pipe to a child process). Transports are 1:1 by nature — you can't multiplex two server processes over one stdin/stdout pair.

This is the same pattern used by real MCP hosts like Claude Desktop and VS Code. The `MultiServerGateway` class hides this detail — the Agent sees a single unified tool list and calls `gateway.callTool()` without knowing which server handles it.

### Two Gateway Classes

| Class | Use case |
|-------|----------|
| `McpGateway` | Single server. Wraps one SDK `Client`. Supports both `connect()` (stdio) and `connectHttp()`. |
| `MultiServerGateway` | Multiple servers. Creates one `McpGateway` per server internally, auto-routes tool calls by name. Supports `addServer()` (stdio) and `addHttpServer()`. This is what the Agent uses. |

## Quick Start

```bash
# Install dependencies
pnpm install

# Add your Anthropic API key to .env
# (copy from .env and replace the placeholder)
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Run in development mode (stdio — server spawned as child process)
pnpm dev:host
```

The Agent runs in two modes:

| Mode | When | Behaviour |
|------|------|-----------|
| **LLM** | `ANTHROPIC_API_KEY` is set in `.env` | Claude chooses tools, generates natural language answers |
| **Keyword fallback** | No API key | Simple pattern matching, demo still runs end-to-end |

### Build and run compiled output

```bash
pnpm build
pnpm start:host
```

### HTTP Transport Mode

Instead of spawning the server as a child process, you can run it as an HTTP service and connect over the network:

```bash
# Terminal 1 — start the Express HTTP server
pnpm dev:server:http

# Terminal 2 — run the host, connecting via HTTP
pnpm dev:host -- --http
```

The HTTP server mounts the NLS MCP server on a single Express app:

| Endpoint | Server |
|----------|--------|
| `POST /mcp/nls` | NLS server |

You can also set the `MCP_TRANSPORT=http` environment variable instead of passing `--http`. To change the server URL, set `MCP_HTTP_BASE_URL` (defaults to `http://localhost:3000`).

The HTTP transport uses the SDK's **Streamable HTTP** protocol in stateless mode — each request creates a fresh transport and server instance, so no session state is kept between requests.

### Web Chat Interface

A React frontend lets you interact with the Agent through your browser instead of the CLI:

```bash
# Terminal 1 — MCP server (HTTP)
pnpm dev:server:http

# Terminal 2 — API server (connects to MCP server, exposes /api/chat)
pnpm dev:api

# Terminal 3 — Vite dev server (React frontend)
pnpm dev:web
```

Open `http://localhost:5173` to start chatting.

The **API server** (`src/api/server.ts`, port 3001) initializes the Gateway + Agent on startup and exposes two endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Send `{ message: string }`, receive `AgentResponse` (thinking, toolCalls, answer) |
| `/api/tools` | GET | List available tools from the connected NLS MCP server |

The **Vite dev server** (port 5173) proxies `/api` requests to the API server, so the frontend calls `/api/chat` without worrying about CORS or ports.

## Available Tools

### NLS Server (`src/server/nls.ts`)

| Tool | Input | Description |
|------|-------|-------------|
| `club_list` | `filter: "active" \| "all"` | List all NLS clubs, optionally filtered to active only |
| `club_search` | `term: string` | Search for clubs by name |
| `club_detail` | `urlFriendlyName: string` | Full club details by URL-friendly name |
| `club_detail_by_guid` | `guid: string` | Full club details by GUID |
| `get_pyramid` | — | Full Non League pyramid: all leagues/divisions with embedded clubs |
| `search_pyramids` | `pyramidId?`, `leagueName?`, `leagueUrl?`, `pyramidStep?`, `wikipedia?` | Search pyramid leagues with optional filters |
| `get_wiki_page` | `name: string` | NLS wiki page content for a club or entity |
| `get_reference_data` | — | All NLS reference/lookup data (enumerations, config values) |
| `clone_club` | `sourceClubGuid`, `newClubName`, `wikiUrl?`, `pyramidId?` | Clone an NLS club record under a new name, copying address/contact details and adding a Wikipedia social link |
| `get_pyramid_wikipedia_section` | `pyramidId?`, `leagueName?` | Look up a pyramid league then fetch and extract its Wikipedia section (clubs, paragraphs, table rows) |

### League Scraper Server (`src/server/tools/league-scraper-tools.ts`)

| Tool | Input | Description |
|------|-------|-------------|
| `scrape_league_clubs` | `url: string`, `selector: string`, `attribute?` | Scrape club list from any league website using Playwright |
| `get_national_league_clubs` | `competition?: "national" \| "north" \| "south"` | Scrape the National League website for one of its three competitions |

See [`src/server/tools/LEAGUE-SCRAPER.md`](src/server/tools/LEAGUE-SCRAPER.md) for full details and setup instructions.

## How the LLM Tool Loop Works

When `ANTHROPIC_API_KEY` is set, the Agent runs a standard Anthropic tool-use loop:

```
User message
    │
    ▼
┌─────────────────────────────┐
│ Send to Claude with tool    │◄──────────────────┐
│ descriptions (from MCP)     │                   │
└─────────────┬───────────────┘                   │
              │                                   │
         stop_reason?                             │
              │                                   │
    ┌─────────┴─────────┐                         │
    │                   │                         │
 "end_turn"         "tool_use"                    │
    │                   │                         │
    ▼                   ▼                         │
 Return text     Execute tool calls               │
 answer          via gateway.callTool()           │
                        │                         │
                        ▼                         │
                 Feed tool_result                 │
                 blocks back ─────────────────────┘
```

The loop continues until Claude returns `stop_reason: "end_turn"` with a final text answer.

## Scripts

### Application

| Script | Description |
|--------|-------------|
| `pnpm build` | Compile TypeScript to `build/` |
| `pnpm dev:host` | Run the full demo with tsx (stdio mode) |
| `pnpm dev:host -- --http` | Run the full demo over HTTP (requires `dev:server:http`) |
| `pnpm dev:server` | Run NLS server standalone on stdio |
| `pnpm dev:server:http` | Run Express HTTP server (NLS + League Scraper on port 3000) |
| `pnpm dev:api` | Run API server for web chat (port 3001, requires `dev:server:http`) |
| `pnpm dev:web` | Run Vite React frontend (port 5173, requires `dev:api`) |
| `pnpm start:host` | Run compiled demo (stdio mode) |
| `pnpm start:server` | Run compiled NLS server |
| `pnpm start:server:http` | Run compiled Express HTTP server |
| `pnpm test` | Run Vitest test suite |

### Utility Scripts

| Script | Description |
|--------|-------------|
| `pnpm wiki` | Manage NLS wiki pages — get, create, update, or getOrCreate from Wikipedia |
| `pnpm pyramid` | Search and explore the NLS pyramid with optional filters |
| `pnpm league-scraper` | Scrape club lists from league websites (generic or National League) |
| `pnpm wikipedia-section` | Inspect Wikipedia section extraction for a given pyramid league |
| `pnpm wikipedia-check` | Bulk-check Wikipedia club counts vs pyramid counts across all active leagues |
| `pnpm wikipedia-fix` | Scan all active leagues and auto-fix stale `nth-child` selectors |
| `pnpm wikipedia-club-check` | Cross-reference all NLS clubs against Wikipedia league pages; outputs a CSV report with optional bulk actions |
| `pnpm pyramid-wikipedia` | Discover the 2025–26 season Wikipedia page for every active pyramid league and detect the club list section; outputs `pyramid-wikipedia.csv` |
| `pnpm pyramid-wikipedia-clubs` | Read `pyramid-wikipedia.csv` and expand to one row per club; cross-references each club against NLS data; optionally creates missing clubs with `--add-wiki-only` |

Run any script with `--help` or no arguments for usage details, or see [SAMPLES.md](SAMPLES.md) for examples.

### wikipedia-club-check

Produces a CSV (`wiki-pyramid-check.csv` by default) cross-referencing all NLS clubs (active and inactive) against their league's Wikipedia page. Clubs are matched by URL first, then by name, with FC/AFC suffix normalisation at each step. The `NLSActive` column indicates whether the matched NLS club is currently active.

**Flags**

| Flag | Description |
|------|-------------|
| `--output <file>` | Write CSV to a custom path instead of `wiki-pyramid-check.csv` |
| `--debug` | Enable verbose debug output |
| `--clone` | Interactively clone `MATCHED_WRONG_LEAGUE` clubs into the correct league |
| `--deactivate-no-league` | Interactively set `UNASSIGNED` clubs with no Wikipedia league link to inactive |
| `--fix-matched-no-wiki` | Interactively add a Wikipedia social link to matched clubs that have none in NLS |
| `--bulk` | Skip interactive prompts for `--clone`, `--deactivate-no-league`, and `--fix-matched-no-wiki`; apply all automatically |

**CSV status values**

| Status | Meaning |
|--------|---------|
| `MATCHED` | Wiki URL matches an NLS club assigned to the same league |
| `MATCHED_WRONG_LEAGUE` | Wiki URL matches an NLS club assigned to a different league |
| `MATCHED_UNASSIGNED` | Wiki URL matches an NLS club with no league assignment |
| `URL_MISMATCH` | Club name matches but wiki URL differs from NLS wiki URL |
| `WIKI_ONLY` | Club appears on the Wikipedia page but no NLS club could be matched |
| `PYRAMID_ONLY` | NLS club is assigned to this league but does not appear on its Wikipedia page |
| `UNASSIGNED` | Active NLS club with no league assignment and not matched to any wiki page |
| `NO_WIKI_LEAGUE` | NLS club is assigned to a league that has no Wikipedia page configured |

**Matching logic** (in priority order)

1. Exact URL match — NLS wiki URL vs Wikipedia page club URL
2. FC-pattern URL match — strips `_A.F.C.`, `A.F.C._`, `_.F.C.`, `F.C._`, `_F.C.` from both sides before comparing
3. Exact name match — within the assigned league's NLS clubs
4. FC-suffix name match — strips `A.F.C.`, `F.C.`, `AFC`, `FC` suffixes from both names, searches all NLS clubs

### pyramid-wikipedia

Walks every active pyramid league that has a Wikipedia page configured, resolves the current 2025–26 season article (following infobox "Current:" links and Wikipedia redirects including `#fragment` preservation), then auto-detects the stadia/stadium section that lists each league's clubs.

Shared Wikipedia articles (e.g. National League, NL North, and NL South all resolve to the same page with different `#` fragments) are fetched once and each league is assigned a distinct section.

Outputs **`pyramid-wikipedia.csv`**:

| Column | Description |
|--------|-------------|
| `Step` | Pyramid step number |
| `League` | NLS league name |
| `CurrentWikipedia` | Wikipedia article URL configured in NLS |
| `SeasonLink` | Resolved 2025–26 season article URL (may include `#fragment`) |
| `Clubs` | Number of clubs extracted from the stadia section |
| `Section` | Heading ID of the stadia section used |
| `FirstClub` | First club name extracted (sanity check) |

```bash
pnpm pyramid-wikipedia [--debug]
```

### pyramid-wikipedia-clubs

Reads `pyramid-wikipedia.csv` (produced by `pyramid-wikipedia`) and expands each league to one row per club. Fetches Wikipedia season pages once per base URL (shared-page leagues share one HTTP request), then cross-references each club against the live NLS data using the same matching rules as `wikipedia-club-check`.

**Matching order** (same priority as `wikipedia-club-check`):
1. Exact Wikipedia URL match — prefers a club assigned to the same league; if multiple clubs share the URL, picks the one at the lowest pyramid step
2. FC-pattern URL match — strips `A.F.C.`/`F.C.` variants from both sides before comparing
3. Exact name match within the league's assigned NLS clubs
4. Stripped name match (FC suffix removed) across all NLS clubs — lowest step wins

`FoundElsewhere` is left blank.

Outputs **`pyramid-wikipedia-clubs.csv`** with the same column layout as `wiki-pyramid-check.csv`:

`PyramidId, WikiLeague, WikiStep, WikiClubName, WikiClubUrl, NLSClubName, NLSWikiUrl, NLSAssignedLeague, NLSAssignedStep, Status, FoundElsewhere, DisableAutoUpdate, WikiClubLeague, WikiClubLeagueStep, NLSStatus, NLSActive`

**Flags**

| Flag | Description |
|------|-------------|
| `--add-wiki-only` | Interactively create an NLS club record for each `WIKI_ONLY` entry (club on Wikipedia but absent from NLS) |
| `--bulk` | Skip interactive prompts for `--add-wiki-only`; create all automatically |
| `--debug` | Enable verbose fetch logging |

```bash
pnpm pyramid-wikipedia-clubs [--add-wiki-only] [--bulk] [--debug]
```

## Configuration

| File | Purpose |
|------|---------|
| `.env` | Environment variables (gitignored) — see table below |
| `tsconfig.json` | TypeScript: ES2022, Node16 modules, `src/` → `build/` |
| `package.json` | ES modules (`"type": "module"`), scripts, dependencies |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Enables LLM mode in the host/agent |
| `NLS_API_BASE_URL` | `https://nonleaguesocial.co.uk` | NLS API root — affects all v1/v2/v3 calls |
| `WIKIPEDIA_API_URL` | `https://en.wikipedia.org/api/rest_v1` | Wikipedia REST API base (summary + HTML endpoints) |
| `WIKIPEDIA_WIKI_URL` | `https://en.wikipedia.org/wiki` | Wikipedia wiki base URL (page HTML scraping) |
| `MCP_TRANSPORT` | `stdio` | Set to `http` to use HTTP transport |
| `MCP_HTTP_BASE_URL` | `http://localhost:3000` | HTTP server URL when using HTTP transport |
| `API_PORT` | `3001` | Port for the web chat API server |

## Tech Stack

- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) — Official MCP SDK (server + client, stdio + Streamable HTTP transports)
- [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript) — Claude LLM with tool use
- [`express`](https://expressjs.com) — HTTP server for Streamable HTTP transport and API server
- [`cors`](https://github.com/expressjs/cors) — CORS middleware for the API server
- [`cheerio`](https://cheerio.js.org) — HTML parsing for Wikipedia section and infobox extraction
- [`playwright`](https://playwright.dev) — Headless Chromium for scraping JS-rendered league websites
- [React](https://react.dev) + [Vite](https://vite.dev) — Web chat frontend
- [Tailwind CSS](https://tailwindcss.com) v4 — Utility-first styling
- [`zod`](https://zod.dev) — Tool input schema validation and runtime type safety
- [`dotenv`](https://github.com/motdotla/dotenv) — Environment variable loading
- TypeScript with ES modules
