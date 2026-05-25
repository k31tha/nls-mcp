# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**nls-mcp** is an MCP (Model Context Protocol) server for Non League Social (NLS), exposing English non-league football club data as LLM-callable tools. The project also includes a Claude-powered agent that consumes those tools and an Express + React web chat frontend.

## Commands

```bash
pnpm build              # Compile TypeScript (src/ → build/)
pnpm test               # Run Vitest tests
pnpm dev:host           # Run full demo (agent + NLS server via stdio)
pnpm dev:server         # Run NLS MCP server standalone (stdio)
pnpm dev:server:http    # Run NLS MCP server standalone (HTTP)
pnpm dev:api            # Run Express API server for web frontend (port 3001)
pnpm dev:web            # Run Vite React frontend
```

To run a single test file:
```bash
pnpm vitest run src/server/tools/nls-tools.test.ts
```

## Architecture

The codebase has four distinct layers:

**Host** (`src/host/app.ts`) — Lifecycle owner. Instantiates the Gateway and Agent, wires them together, and handles startup/shutdown.

**Agent** (`src/agent/agent.ts`) — LLM interaction loop. Sends messages to Claude (`claude-sonnet-4-6`), receives tool-call responses, forwards them to the Gateway for execution, and feeds results back to the model. Falls back to keyword matching if `ANTHROPIC_API_KEY` is absent.

**Gateway** (`src/client/gateway.ts`) — MCP infrastructure. Wraps the official SDK `Client`. Two variants: `McpGateway` (single server) and `MultiServerGateway` (multiple servers, one `Client` per server as the protocol requires). Supports both stdio and HTTP transports.

**Servers** (`src/server/`) — Expose tools via MCP. Two servers: `nls.ts` (stdio, spawned as child process) and `http.ts` (Express, Streamable HTTP transport — stateless, fresh transport per request). Tools live in `src/server/tools/`.

**Web API** (`src/api/server.ts`) — Thin Express layer exposing `/api/chat` and `/api/tools` for the React frontend. Proxied via Vite dev server from port 5173 → 3001.

**Shared lib** (`src/lib/`) — `generic/` contains typed fetch helpers with Zod validation (`fetch-json.ts`, `api-call.ts`); `nls/` contains NLS API helpers (`wiki.ts`, `wikipedia.ts`, `club-status.ts`, `club-clone.ts`).

**Scripts** (`src/scripts/`) — CLI utilities for NLS data management (wiki sync, pyramid search, bulk club operations, Wikipedia cross-referencing). Run directly with `tsx`.

## Environment Variables

Copy `.env.example` (or create `.env`) with:
- `ANTHROPIC_API_KEY` — required for LLM agent mode
- `NLS_API_BASE_URL` — NLS REST API base URL
- `WIKIPEDIA_API_URL` — Wikipedia API endpoint
- `MCP_TRANSPORT` — `stdio` (default) or `http`
- `API_PORT` — port for Express API server (default 3001)

## Agents

@agents/orchestrator.md
@agents/docs-agent.md
@agents/test-agent.md

## Scripts

CLI utilities in `src/scripts/`. Run via `pnpm <script-name>` or directly with `tsx src/scripts/<name>.ts`.

### `pyramid-wikipedia`

Cross-references every active pyramid league against Wikipedia, finds the current-season article, and writes a CSV summary to `pyramid-wikipedia.csv`.

```bash
pnpm pyramid-wikipedia                        # default: 2025-26
pnpm pyramid-wikipedia -- --season 2026-27   # override season
pnpm pyramid-wikipedia -- --debug            # verbose HTTP logging
```

| Flag | Default | Description |
|------|---------|-------------|
| `--season <value>` | `2025-26` | Season string used in Wikipedia title lookups and output headers |
| `--debug` | off | Sets `DEBUG=1` for verbose fetch logging |

The season value is passed directly to Wikipedia URL lookups — no validation is applied. Both `YYYY-YY` (hyphen) and `YYYY–YY` (en-dash) variants are checked automatically.

## NLS API Reference

`docs/NLS.yaml` is the OpenAPI spec for the upstream NLS REST API — the contract that `src/lib/nls/` and `src/server/tools/nls-tools.ts` call against. Check it when adding new tools or tracing a data shape back to its source endpoint.

## Key Conventions

- ES modules throughout (`"type": "module"` in package.json); use `.js` extensions in imports even for `.ts` source files.
- TypeScript strict mode; `tsconfig.json` targets ES2022 with `module: Node16`.
- Zod is used for all external data validation (API responses, tool inputs). New tools should define input schemas with `z.object(...)` and validate responses before returning.
- The `@modelcontextprotocol/sdk` `Server` class registers tools via `server.tool(name, schema, handler)`. Each handler returns `{ content: [{ type: "text", text: "..." }] }`.
- Transport is selected at runtime: stdio servers are spawned as child processes via `tsx`; HTTP servers use `StreamableHTTPServerTransport` from the MCP SDK.
