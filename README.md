# MCP TypeScript Architecture Demo

A working demonstration of the **Model Context Protocol** architecture using the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk). Shows the full production-shaped stack:

**Host -> Agent (Claude LLM) -> MCP Gateway -> MCP Servers**

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
│  │  │  Client 1 ◄──────────► Calculator Server  │  │  │
│  │  │  Client 2 ◄──────────► Weather Server     │  │  │
│  │  │       (stdio or HTTP)                      │  │  │
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
└── server/
    ├── calculator.ts       MCP Server — calculator over stdio
    ├── weather.ts          MCP Server — weather over stdio
    ├── http.ts             Express app — both servers over Streamable HTTP
    └── tools/
        ├── calculator-tools.ts  Shared calculator tool registration
        └── weather-tools.ts     Shared weather tool registration

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

# Run in development mode (stdio — servers spawned as child processes)
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

Instead of spawning servers as child processes, you can run them as an HTTP service and connect over the network:

```bash
# Terminal 1 — start the Express HTTP server (hosts both MCP servers)
pnpm dev:server:http

# Terminal 2 — run the host, connecting via HTTP
pnpm dev:host -- --http
```

The HTTP server mounts both MCP servers on a single Express app:

| Endpoint | Server |
|----------|--------|
| `POST /mcp/calculator` | Calculator (add, multiply, calculate) |
| `POST /mcp/weather` | Weather (get_weather) |

You can also set the `MCP_TRANSPORT=http` environment variable instead of passing `--http`. To change the server URL, set `MCP_HTTP_BASE_URL` (defaults to `http://localhost:3000`).

The HTTP transport uses the SDK's **Streamable HTTP** protocol in stateless mode — each request creates a fresh transport and server instance, so no session state is kept between requests.

### Web Chat Interface

A React frontend lets you interact with the Agent through your browser instead of the CLI:

```bash
# Terminal 1 — MCP servers (HTTP)
pnpm dev:server:http

# Terminal 2 — API server (connects to MCP servers, exposes /api/chat)
pnpm dev:api

# Terminal 3 — Vite dev server (React frontend)
pnpm dev:web
```

Open `http://localhost:5173` to start chatting.

The **API server** (`src/api/server.ts`, port 3001) initializes the Gateway + Agent on startup and exposes two endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Send `{ message: string }`, receive `AgentResponse` (thinking, toolCalls, answer) |
| `/api/tools` | GET | List available tools from all connected MCP servers |

The **Vite dev server** (port 5173) proxies `/api` requests to the API server, so the frontend calls `/api/chat` without worrying about CORS or ports.

## Available Tools

### Calculator Server (`src/server/calculator.ts`)

| Tool | Input | Description |
|------|-------|-------------|
| `add` | `a: number, b: number` | Add two numbers |
| `multiply` | `a: number, b: number` | Multiply two numbers |
| `calculate` | `expression: string` | Evaluate a math expression (`+`, `-`, `*`, `/`, parentheses) |

### Weather Server (`src/server/weather.ts`)

| Tool | Input | Description |
|------|-------|-------------|
| `get_weather` | `location: string` | Get weather for a location (returns hardcoded demo data) |

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

| Script | Description |
|--------|-------------|
| `pnpm build` | Compile TypeScript to `build/` |
| `pnpm dev:host` | Run the full demo with tsx (stdio mode) |
| `pnpm dev:host -- --http` | Run the full demo over HTTP (requires `dev:server:http`) |
| `pnpm dev:server` | Run calculator server standalone on stdio |
| `pnpm dev:server:weather` | Run weather server standalone on stdio |
| `pnpm dev:server:http` | Run Express HTTP server (both MCP servers on port 3000) |
| `pnpm dev:api` | Run API server for web chat (port 3001, requires `dev:server:http`) |
| `pnpm dev:web` | Run Vite React frontend (port 5173, requires `dev:api`) |
| `pnpm start:host` | Run compiled demo (stdio mode) |
| `pnpm start:server` | Run compiled calculator server |
| `pnpm start:server:http` | Run compiled Express HTTP server |

## Configuration

| File | Purpose |
|------|---------|
| `.env` | `ANTHROPIC_API_KEY` — enables LLM mode; `MCP_TRANSPORT=http` — use HTTP mode; `MCP_HTTP_BASE_URL` — HTTP server URL; `API_PORT` — API server port (default 3001) (gitignored) |
| `tsconfig.json` | TypeScript: ES2022, Node16 modules, `src/` → `build/` |
| `package.json` | ES modules (`"type": "module"`), scripts, dependencies |

## Tech Stack

- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) — Official MCP SDK (server + client, stdio + Streamable HTTP transports)
- [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript) — Claude LLM with tool use
- [`express`](https://expressjs.com) — HTTP server for Streamable HTTP transport and API server
- [`cors`](https://github.com/expressjs/cors) — CORS middleware for the API server
- [React](https://react.dev) + [Vite](https://vite.dev) — Web chat frontend
- [Tailwind CSS](https://tailwindcss.com) v4 — Utility-first styling
- [`zod`](https://zod.dev) — Tool input schema validation
- [`dotenv`](https://github.com/motdotla/dotenv) — Environment variable loading
- TypeScript with ES modules
