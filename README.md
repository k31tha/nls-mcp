# MCP TypeScript Architecture Demo

A working demonstration of the **Model Context Protocol** architecture using the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk). Shows the full production-shaped stack:

**Host -> Agent (Claude LLM) -> MCP Gateway -> MCP Servers**

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
│  │  │  Client 1 ◄──stdio──► Calculator Server  │  │  │
│  │  │  Client 2 ◄──stdio──► Weather Server     │  │  │
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
│   └── gateway.ts          Gateway — MCP client infrastructure
└── server/
    ├── calculator.ts       MCP Server — add, multiply, calculate tools
    └── weather.ts          MCP Server — get_weather tool
```

### Layer Responsibilities

| Layer | File | Does | Doesn't do |
|-------|------|------|------------|
| **Host** | `src/host/app.ts` | Loads env, creates gateway + agent, sends user messages, manages shutdown | Tool decisions, MCP protocol |
| **Agent** | `src/agent/agent.ts` | Sends messages + tool schemas to Claude, executes tool calls via gateway, returns answers | Server connections, transport |
| **Gateway** | `src/client/gateway.ts` | Spawns server processes, manages Client instances, routes `callTool()` to correct server | Business logic, LLM interaction |
| **Servers** | `src/server/*.ts` | Expose tools via MCP protocol over stdio | Anything about host, agent, or other servers |

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
| `McpGateway` | Single server. Wraps one SDK `Client`. Use when you need direct control. |
| `MultiServerGateway` | Multiple servers. Creates one `McpGateway` per server internally, auto-routes tool calls by name. This is what the Agent uses. |

## Quick Start

```bash
# Install dependencies
pnpm install

# Add your Anthropic API key to .env
# (copy from .env and replace the placeholder)
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Run in development mode
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
| `pnpm dev:host` | Run the full demo with tsx (no build needed) |
| `pnpm dev:server` | Run calculator server standalone on stdio |
| `pnpm dev:server:weather` | Run weather server standalone on stdio |
| `pnpm start:host` | Run compiled demo |
| `pnpm start:server` | Run compiled calculator server |

## Configuration

| File | Purpose |
|------|---------|
| `.env` | `ANTHROPIC_API_KEY` — enables LLM mode (gitignored) |
| `tsconfig.json` | TypeScript: ES2022, Node16 modules, `src/` → `build/` |
| `package.json` | ES modules (`"type": "module"`), scripts, dependencies |

## Tech Stack

- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) — Official MCP SDK (server + client)
- [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript) — Claude LLM with tool use
- [`zod`](https://zod.dev) — Tool input schema validation
- [`dotenv`](https://github.com/motdotla/dotenv) — Environment variable loading
- TypeScript with ES modules
