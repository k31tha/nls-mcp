# MCP TypeScript Project — Reimplementation Guide

This guide provides everything needed to scaffold a new MCP (Model Context Protocol) project with **user-defined servers and tools**. It follows the proven architecture from this demo and is designed to be used as a prompt reference for AI-assisted or manual project creation.

---

## Architecture Overview

```
HOST → AGENT (LLM) → GATEWAY (MCP Clients) → MCP SERVERS
```

| Layer | Responsibility |
|-------|---------------|
| **Host** | Entry point. Wires Gateway + Agent, manages lifecycle, sends user messages. |
| **Agent** | Business logic + LLM interaction. Converts MCP tool schemas to Anthropic format, runs the tool-use loop, returns answers. |
| **Gateway** | MCP infrastructure. One SDK `Client` per server. Routes `callTool()` by tool name. Supports stdio and HTTP transports. |
| **Servers** | Expose tools via MCP protocol. Each server is independent. Shared tool registration functions enable reuse across stdio and HTTP transports. |

### Why One Client Per Server?

MCP is a stateful protocol. Each client-server pair negotiates capabilities at connection time. Transports are 1:1 (one stdin/stdout pair per child process). The Gateway hides this — the Agent sees a single unified tool list.

---

## Project Structure

```
src/
├── host/
│   └── app.ts              Host — entry point, lifecycle
├── agent/
│   └── agent.ts            Agent — LLM tool-use loop
├── client/
│   └── gateway.ts          Gateway — MCP client infrastructure
├── api/
│   └── server.ts           Express API for web chat UI
└── server/
    ├── <name>.ts            MCP Server — stdio transport (one per server)
    ├── http.ts              Express app — all servers over Streamable HTTP
    └── tools/
        └── <name>-tools.ts  Tool registration functions (shared by stdio + HTTP)

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

---

## Step-by-Step Reimplementation

### Step 1: Initialize the Project

```bash
mkdir my-mcp-project && cd my-mcp-project
pnpm init
```

**package.json** — set `"type": "module"` and install dependencies:

```bash
pnpm add @modelcontextprotocol/sdk @anthropic-ai/sdk express cors dotenv zod
pnpm add -D typescript @types/node @types/express @types/cors tsx
```

**tsconfig.json**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**.env**:

```
ANTHROPIC_API_KEY=sk-ant-...
```

---

### Step 2: Define Your MCP Servers and Tools

> **This is where you customize.** Decide what servers and tools your project needs.

#### Prompt: Define Your Servers

```
I need the following MCP servers for my project:

Server 1: <server-name>
  Description: <what this server does>
  Tools:
    - <tool-name>(<param>: <type>, ...): <description>
    - <tool-name>(<param>: <type>, ...): <description>

Server 2: <server-name>
  Description: <what this server does>
  Tools:
    - <tool-name>(<param>: <type>, ...): <description>

(Add as many servers/tools as needed)
```

#### Example

```
Server 1: database
  Description: Query and manage a SQLite database
  Tools:
    - query(sql: string): Execute a read-only SQL query, return rows as JSON
    - list_tables(): List all table names in the database

Server 2: github
  Description: Interact with GitHub repositories
  Tools:
    - list_issues(repo: string, state: "open" | "closed"): List issues for a repo
    - create_issue(repo: string, title: string, body: string): Create a new issue
```

---

### Step 3: Implement Tool Registration

Create one file per server in `src/server/tools/`. Each exports a single `register*Tools(server)` function.

**Pattern** — `src/server/tools/<name>-tools.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function register<Name>Tools(server: McpServer): void {

  server.registerTool(
    "<tool-name>",
    {
      description: "<What this tool does>",
      inputSchema: {
        paramName: z.<type>().describe("<param description>"),
        // Add more params as needed
      },
    },
    async ({ paramName }) => {
      // Tool implementation here
      const result = /* ... */;

      return {
        content: [{ type: "text" as const, text: String(result) }],
      };
    },
  );

  // Register more tools...
}
```

**Response format**:

```typescript
// Success
{ content: [{ type: "text", text: "result string" }] }

// Error
{ content: [{ type: "text", text: "Error: something went wrong" }], isError: true }
```

**Zod types commonly used**:

| Zod | Description |
|-----|-------------|
| `z.string()` | String parameter |
| `z.number()` | Number parameter |
| `z.boolean()` | Boolean parameter |
| `z.enum(["a", "b"])` | Enum/union of literals |
| `z.string().optional()` | Optional parameter |
| `z.array(z.string())` | Array of strings |
| `z.object({ ... })` | Nested object |

---

### Step 4: Create Stdio Servers

One file per server. Minimal — just create the `McpServer`, register tools, connect stdio transport.

**Pattern** — `src/server/<name>.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { register<Name>Tools } from "./tools/<name>-tools.js";

const server = new McpServer({
  name: "<server-name>",
  version: "1.0.0",
});

register<Name>Tools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("<Name> MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

> **Note**: Use `console.error` for logging — `stdout` is reserved for the MCP protocol over stdio.

---

### Step 5: Create the HTTP Server

A single Express app that mounts all servers as Streamable HTTP endpoints.

**`src/server/http.ts`**:

```typescript
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";

// Import the Express app factory from the SDK
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";

// Import all tool registration functions
import { register<Name1>Tools } from "./tools/<name1>-tools.js";
import { register<Name2>Tools } from "./tools/<name2>-tools.js";

// Server factory functions (fresh instance per request = stateless)
function create<Name1>Server(): McpServer {
  const server = new McpServer({ name: "<name1>", version: "1.0.0" });
  register<Name1>Tools(server);
  return server;
}

function create<Name2>Server(): McpServer {
  const server = new McpServer({ name: "<name2>", version: "1.0.0" });
  register<Name2>Tools(server);
  return server;
}

// Mount an MCP server on a POST endpoint
function mountMcpEndpoint(
  app: ReturnType<typeof createMcpExpressApp>,
  path: string,
  createServer: () => McpServer,
): void {
  app.post(path, async (req: Request, res: Response) => {
    const server = createServer();
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // Reject non-POST methods
  app.all(path, (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. Use POST." },
      id: null,
    });
  });
}

// Wire it up
const app = createMcpExpressApp();

mountMcpEndpoint(app, "/mcp/<name1>", create<Name1>Server);
mountMcpEndpoint(app, "/mcp/<name2>", create<Name2>Server);

const PORT = parseInt(process.env.MCP_HTTP_PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`MCP HTTP server listening on http://localhost:${PORT}`);
  console.log(`  POST /mcp/<name1>`);
  console.log(`  POST /mcp/<name2>`);
});
```

> **Stateless mode**: A fresh `McpServer` + `StreamableHTTPServerTransport` is created per request. No session state between requests. This fits serverless/stateless deployments.

---

### Step 6: Implement the Gateway

The Gateway manages MCP client connections and routes tool calls.

**`src/client/gateway.ts`**:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export interface ServerConfig {
  name: string;
  command: string;
  args: string[];
}

export interface HttpServerConfig {
  name: string;
  url: string;
}

// ── Single-server wrapper ──────────────────────────────────────────

export class McpGateway {
  private client: Client;
  private transport: StdioClientTransport | StreamableHTTPClientTransport | null = null;

  constructor() {
    this.client = new Client({ name: "mcp-gateway", version: "1.0.0" });
  }

  async connect(command: string, args: string[]): Promise<void> {
    this.transport = new StdioClientTransport({ command, args });
    await this.client.connect(this.transport);
  }

  async connectHttp(url: string): Promise<void> {
    this.transport = new StreamableHTTPClientTransport(new URL(url));
    await this.client.connect(this.transport);
  }

  async listTools(): Promise<ToolInfo[]> {
    const result = await this.client.listTools();
    return result.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.client.callTool({ name, arguments: args });
    const textParts = (result.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!);
    return textParts.join("\n");
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

// ── Multi-server router ────────────────────────────────────────────

export class MultiServerGateway {
  private gateways = new Map<string, McpGateway>();
  private toolRoutes = new Map<string, string>(); // tool-name → server-name

  async addServer(config: ServerConfig): Promise<ToolInfo[]> {
    const gw = new McpGateway();
    await gw.connect(config.command, config.args);
    this.gateways.set(config.name, gw);

    const tools = await gw.listTools();
    for (const tool of tools) {
      this.toolRoutes.set(tool.name, config.name);
    }
    return tools;
  }

  async addHttpServer(config: HttpServerConfig): Promise<ToolInfo[]> {
    const gw = new McpGateway();
    await gw.connectHttp(config.url);
    this.gateways.set(config.name, gw);

    const tools = await gw.listTools();
    for (const tool of tools) {
      this.toolRoutes.set(tool.name, config.name);
    }
    return tools;
  }

  async listTools(): Promise<ToolInfo[]> {
    const all: ToolInfo[] = [];
    for (const gw of this.gateways.values()) {
      all.push(...(await gw.listTools()));
    }
    return all;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const serverName = this.toolRoutes.get(name);
    if (!serverName) throw new Error(`Unknown tool: ${name}`);
    const gw = this.gateways.get(serverName);
    if (!gw) throw new Error(`No gateway for server: ${serverName}`);
    return gw.callTool(name, args);
  }

  async close(): Promise<void> {
    for (const gw of this.gateways.values()) {
      await gw.close();
    }
    this.gateways.clear();
    this.toolRoutes.clear();
  }
}
```

> **This file is fully reusable.** Copy it as-is into any new project. It has no knowledge of specific servers or tools.

---

### Step 7: Implement the Agent

The Agent handles LLM interaction and the tool-use loop.

**`src/agent/agent.ts`**:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  ContentBlock,
  ToolUseBlock,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages.js";
import { MultiServerGateway, type ToolInfo } from "../client/gateway.js";

export interface AgentResponse {
  thinking: string;
  toolCalls: { tool: string; args: Record<string, unknown>; result: string }[];
  answer: string;
}

export class Agent {
  private gateway: MultiServerGateway;
  private tools: ToolInfo[] = [];
  private anthropic: Anthropic | null = null;
  private model = "claude-sonnet-4-20250514";
  private conversationHistory: MessageParam[] = [];

  constructor(gateway: MultiServerGateway) {
    this.gateway = gateway;
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic();
    }
  }

  get availableTools(): ToolInfo[] {
    return this.tools;
  }

  async initialize(): Promise<void> {
    this.tools = await this.gateway.listTools();
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  async processMessage(message: string): Promise<AgentResponse> {
    if (this.anthropic) {
      return this.processWithLLM(message);
    }
    return this.processWithKeywords(message);
  }

  private async processWithLLM(message: string): Promise<AgentResponse> {
    // Convert MCP tool schemas → Anthropic tool format
    const anthropicTools: Tool[] = this.tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      input_schema: t.inputSchema as Tool["input_schema"],
    }));

    // Add user message to history
    this.conversationHistory.push({ role: "user", content: message });

    const response: AgentResponse = { thinking: "", toolCalls: [], answer: "" };

    // Call Claude
    let result = await this.anthropic!.messages.create({
      model: this.model,
      max_tokens: 4096,
      tools: anthropicTools,
      messages: this.conversationHistory,
    });

    // Tool-use loop
    while (result.stop_reason === "tool_use") {
      const assistantContent = result.content;
      this.conversationHistory.push({ role: "assistant", content: assistantContent });

      // Extract thinking text
      for (const block of assistantContent) {
        if (block.type === "text") {
          response.thinking += block.text;
        }
      }

      // Execute tool calls
      const toolUseBlocks = assistantContent.filter(
        (b): b is ToolUseBlock => b.type === "tool_use",
      );

      const toolResults: ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        let resultText: string;
        try {
          resultText = await this.gateway.callTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
          );
        } catch (err) {
          resultText = `Error: ${err}`;
        }
        response.toolCalls.push({
          tool: toolUse.name,
          args: toolUse.input as Record<string, unknown>,
          result: resultText,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: resultText,
        });
      }

      // Feed results back to Claude
      this.conversationHistory.push({ role: "user", content: toolResults });
      result = await this.anthropic!.messages.create({
        model: this.model,
        max_tokens: 4096,
        tools: anthropicTools,
        messages: this.conversationHistory,
      });
    }

    // Extract final answer
    const finalContent = result.content;
    this.conversationHistory.push({ role: "assistant", content: finalContent });
    response.answer = finalContent
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return response;
  }

  private async processWithKeywords(message: string): Promise<AgentResponse> {
    // Fallback: pattern-match keywords to tools for demo without API key
    const response: AgentResponse = { thinking: "Keyword mode (no API key)", toolCalls: [], answer: "" };

    // Implement simple keyword matching for your specific tools here
    response.answer = `Available tools: ${this.tools.map((t) => t.name).join(", ")}`;
    return response;
  }
}
```

> **This file is mostly reusable.** The keyword fallback should be customized per project. The LLM path is generic.

---

### Step 8: Implement the Host

The Host wires everything together and manages lifecycle.

**`src/host/app.ts`**:

```typescript
import "dotenv/config";
import { MultiServerGateway } from "../client/gateway.js";
import { Agent } from "../agent/agent.js";

// ── Server path helper (tsx dev vs compiled node) ──────────────────

function serverPath(name: string): { command: string; args: string[] } {
  const isTsx = import.meta.url.endsWith(".ts");
  if (isTsx) {
    return { command: "npx", args: ["tsx", `src/server/${name}.ts`] };
  }
  return { command: "node", args: [`build/server/${name}.js`] };
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const useHttp =
    process.argv.includes("--http") || process.env.MCP_TRANSPORT === "http";

  const gateway = new MultiServerGateway();

  if (useHttp) {
    const baseUrl = process.env.MCP_HTTP_BASE_URL ?? "http://localhost:3000";
    console.log("[Host] Connecting via HTTP...");

    // ── Add your HTTP servers here ──
    await gateway.addHttpServer({ name: "<name1>", url: `${baseUrl}/mcp/<name1>` });
    await gateway.addHttpServer({ name: "<name2>", url: `${baseUrl}/mcp/<name2>` });

  } else {
    console.log("[Host] Spawning stdio servers...");

    // ── Add your stdio servers here ──
    await gateway.addServer({ name: "<name1>", ...serverPath("<name1>") });
    await gateway.addServer({ name: "<name2>", ...serverPath("<name2>") });
  }

  const agent = new Agent(gateway);
  await agent.initialize();

  console.log("[Host] Ready. Tools:", agent.availableTools.map((t) => t.name));

  // ── Send test messages ──
  const messages = [
    "Your test message here",
  ];

  for (const msg of messages) {
    console.log(`\n[User] ${msg}`);
    const response = await agent.processMessage(msg);

    if (response.thinking) console.log(`[Agent thinking] ${response.thinking}`);
    for (const tc of response.toolCalls) {
      console.log(`[Tool] ${tc.tool}(${JSON.stringify(tc.args)}) → ${tc.result}`);
    }
    console.log(`[Agent] ${response.answer}`);
  }

  await gateway.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

---

### Step 9: Add the API Server (for Web UI)

**`src/api/server.ts`**:

```typescript
import "dotenv/config";
import express from "express";
import cors from "cors";
import { MultiServerGateway } from "../client/gateway.js";
import { Agent } from "../agent/agent.js";

const app = express();
app.use(cors());
app.use(express.json());

// ── Initialize Gateway + Agent ─────────────────────────────────────

const gateway = new MultiServerGateway();
const baseUrl = process.env.MCP_HTTP_BASE_URL ?? "http://localhost:3000";

// ── Add your servers here ──
await gateway.addHttpServer({ name: "<name1>", url: `${baseUrl}/mcp/<name1>` });
await gateway.addHttpServer({ name: "<name2>", url: `${baseUrl}/mcp/<name2>` });

const agent = new Agent(gateway);
await agent.initialize();

// ── Routes ─────────────────────────────────────────────────────────

app.get("/api/tools", (_req, res) => {
  res.json(agent.availableTools);
});

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }
  try {
    const response = await agent.processMessage(message);
    res.json(response);
  } catch (error) {
    console.error("[API] Error:", error);
    res.status(500).json({ error: "Failed to process message" });
  }
});

app.post("/api/chat/reset", (_req, res) => {
  agent.clearHistory();
  res.json({ ok: true });
});

// ── Start ──────────────────────────────────────────────────────────

const PORT = parseInt(process.env.API_PORT ?? "3001", 10);
app.listen(PORT, () => {
  console.log(`[API] Server listening on http://localhost:${PORT}`);
});
```

---

### Step 10: Add the Web Frontend

#### Initialize

```bash
mkdir web && cd web
pnpm create vite . --template react-ts
pnpm add -D tailwindcss @tailwindcss/vite
```

#### `web/vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
```

#### `web/src/index.css`

```css
@import "tailwindcss";
```

#### `web/src/App.tsx`

```tsx
import { useState, useRef, useEffect } from "react";

interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          thinking: data.thinking,
          toolCalls: data.toolCalls,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: Failed to get response" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const newChat = async () => {
    await fetch("/api/chat/reset", { method: "POST" });
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b">
        <h1 className="text-xl font-bold">MCP Chat</h1>
        <button
          onClick={newChat}
          className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
        >
          New Chat
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg max-w-[80%] ${
              msg.role === "user"
                ? "ml-auto bg-blue-500 text-white"
                : "bg-gray-100"
            }`}
          >
            <p className="whitespace-pre-wrap">{msg.content}</p>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <details className="mt-2 text-sm opacity-75">
                <summary>Tool calls ({msg.toolCalls.length})</summary>
                {msg.toolCalls.map((tc, j) => (
                  <div key={j} className="mt-1 pl-2 border-l-2">
                    <strong>{tc.tool}</strong>({JSON.stringify(tc.args)})
                    <br />→ {tc.result}
                  </div>
                ))}
              </details>
            )}
          </div>
        ))}
        {loading && (
          <div className="bg-gray-100 p-3 rounded-lg max-w-[80%] animate-pulse">
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
        className="flex gap-2 p-4 border-t"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={loading}
          className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

---

### Step 11: Add Scripts to package.json

```json
{
  "scripts": {
    "build": "tsc",
    "dev:host": "tsx src/host/app.ts",
    "dev:server:<name1>": "tsx src/server/<name1>.ts",
    "dev:server:<name2>": "tsx src/server/<name2>.ts",
    "dev:server:http": "tsx src/server/http.ts",
    "dev:api": "tsx src/api/server.ts",
    "dev:web": "cd web && pnpm dev",
    "start:host": "node build/host/app.js",
    "start:server:http": "node build/server/http.js"
  }
}
```

---

## Running the Project

### CLI — stdio mode (simplest)

```bash
pnpm dev:host
```

Spawns servers as child processes. No separate terminal needed.

### CLI — HTTP mode

```bash
# Terminal 1
pnpm dev:server:http

# Terminal 2
pnpm dev:host -- --http
```

### Web UI

```bash
# Terminal 1
pnpm dev:server:http

# Terminal 2
pnpm dev:api

# Terminal 3
pnpm dev:web
```

Open `http://localhost:5173`.

---

## Prompt Templates for AI-Assisted Creation

### Prompt: Generate tool registration for a new server

```
Create an MCP tool registration file following this pattern:

File: src/server/tools/<name>-tools.ts

The file should:
- Import McpServer from "@modelcontextprotocol/sdk/server/mcp.js"
- Import z from "zod"
- Export a function registerXTools(server: McpServer): void
- Register these tools using server.registerTool():

  <tool definitions here>

Each tool handler should:
- Return { content: [{ type: "text", text: "result" }] } on success
- Return { content: [{ type: "text", text: "Error: ..." }], isError: true } on failure
- Use Zod schemas for input validation via the inputSchema option

Use the inputSchema shorthand where parameters are defined as a flat object
of Zod types (not wrapped in z.object()), e.g.:
  inputSchema: {
    param1: z.string().describe("..."),
    param2: z.number().describe("..."),
  }
```

### Prompt: Generate a complete new MCP project

```
Create a new MCP TypeScript project with these servers and tools:

<your server/tool definitions>

Follow this architecture:
- src/client/gateway.ts — McpGateway + MultiServerGateway (reusable, copy from guide)
- src/agent/agent.ts — Agent class with LLM tool-use loop (reusable, copy from guide)
- src/server/tools/<name>-tools.ts — one per server, registerXTools() function
- src/server/<name>.ts — one per server, stdio transport wrapper
- src/server/http.ts — Express app mounting all servers as Streamable HTTP endpoints
- src/host/app.ts — entry point, wires gateway + agent, supports --http flag
- src/api/server.ts — Express API for web chat
- web/ — React + Tailwind + Vite chat frontend

Use: @modelcontextprotocol/sdk, @anthropic-ai/sdk, express, cors, dotenv, zod
TypeScript: ES2022, Node16 modules, strict mode
Package: ES modules ("type": "module")
```

### Prompt: Add a new server to an existing project

```
Add a new MCP server called "<name>" to my existing project.

Tools:
  <tool definitions>

I need:
1. src/server/tools/<name>-tools.ts — tool registration
2. src/server/<name>.ts — stdio server
3. Update src/server/http.ts — add mountMcpEndpoint for /mcp/<name>
4. Update src/host/app.ts — add gateway.addServer / addHttpServer for <name>
5. Update src/api/server.ts — add gateway.addHttpServer for <name>
6. Add dev:server:<name> script to package.json
```

---

## Key Principles

1. **Layer isolation** — Each layer only talks to its neighbor. Agent never touches servers directly.
2. **Transport agnostic** — Same servers work over stdio and HTTP. Tool logic is shared.
3. **One Client per Server** — Required by MCP protocol. The Gateway hides this from the Agent.
4. **Stateless HTTP** — Fresh server instance per request. No session management needed.
5. **Graceful lifecycle** — Always call `gateway.close()` on shutdown.
6. **Dual mode** — LLM mode with API key, keyword fallback without. The demo always works.
7. **Zod schemas** — Define input validation and documentation in one place. The SDK converts them to JSON Schema for tool descriptions automatically.
