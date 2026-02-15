/**
 * Host Application — The AI application entry point
 *
 * The Host is the outermost layer.  It owns:
 *   - The MultiServerGateway (MCP infrastructure)
 *   - The Agent              (business logic + LLM)
 *
 * It wires them together but does not make tool decisions itself.
 * The flow is:
 *   1. Host creates the Gateway and adds MCP servers
 *   2. Host creates the Agent, passing the Gateway in
 *   3. Host sends user messages to the Agent
 *   4. Agent uses Claude (or keyword fallback) to decide tool calls
 *   5. Agent executes tools through the Gateway
 *   6. Agent returns structured responses to the Host
 *   7. Host displays results and tears down
 *
 *   Host (this file)
 *   ├── Agent              (src/agent/agent.ts)   — LLM + tool decisions
 *   └── MultiServerGateway (src/client/gateway.ts) — MCP infrastructure
 *       ├── Client 1 ◄──stdio──► calculator server
 *       └── Client 2 ◄──stdio──► weather server
 *
 * Flags:
 *   --http  Connect to servers via HTTP (requires `pnpm dev:server:http` running)
 *
 * Environment:
 *   ANTHROPIC_API_KEY  — set in .env to enable LLM mode (loaded via dotenv)
 *   MCP_TRANSPORT=http — alternative to --http flag
 */

import "dotenv/config";
import { MultiServerGateway } from "../client/gateway.js";
import { Agent } from "../agent/agent.js";

const useHttp =
  process.argv.includes("--http") || process.env.MCP_TRANSPORT === "http";

function serverPath(name: string): { command: string; args: string[] } {
  const isTs = import.meta.url.endsWith(".ts");
  return isTs
    ? { command: "npx", args: ["tsx", `src/server/${name}.ts`] }
    : { command: "node", args: [`build/server/${name}.js`] };
}

async function main() {
  console.log("=".repeat(60));
  console.log("  MCP Architecture Demo");
  console.log("  Host -> Agent -> Gateway -> Servers");
  console.log("=".repeat(60));
  console.log();

  const mode = useHttp ? "HTTP" : "stdio";
  console.log(`[Host] Transport mode: ${mode}`);

  // ── Host: set up infrastructure ───────────────────────────
  console.log("[Host] Setting up MCP Gateway...");
  const gateway = new MultiServerGateway();

  if (useHttp) {
    const baseUrl = process.env.MCP_HTTP_BASE_URL ?? "http://localhost:3000";
    await gateway.addHttpServer({
      name: "calculator",
      url: `${baseUrl}/mcp/calculator`,
    });
    console.log("[Host] Calculator server connected (HTTP).");

    await gateway.addHttpServer({
      name: "weather",
      url: `${baseUrl}/mcp/weather`,
    });
    console.log("[Host] Weather server connected (HTTP).");
  } else {
    const calc = serverPath("calculator");
    await gateway.addServer({ name: "calculator", ...calc });
    console.log("[Host] Calculator server connected.");

    const weather = serverPath("weather");
    await gateway.addServer({ name: "weather", ...weather });
    console.log("[Host] Weather server connected.");
  }

  // ── Host: create and initialise the Agent ─────────────────
  console.log("[Host] Creating Agent...");
  const agent = new Agent(gateway);
  await agent.initialize();

  console.log(`[Host] Agent ready with ${agent.availableTools.length} tools:`);
  for (const t of agent.availableTools) {
    console.log(`  - ${t.name}: ${t.description}`);
  }
  console.log(
    agent.usesLLM
      ? "[Host] Mode: LLM (Claude via Anthropic API)"
      : "[Host] Mode: keyword fallback (set ANTHROPIC_API_KEY for LLM)",
  );
  console.log();

  // ── Host: send user messages to the Agent ─────────────────
  const userMessages = [
    'What is the weather in "Tokyo"?',
    "Add 15 and 27",
    "Multiply 8 and 6",
    'Calculate "( 2 + 3 ) * 4 - 1"',
    "What can you do?",
  ];

  for (const message of userMessages) {
    console.log(`[User] ${message}`);

    const response = await agent.processMessage(message);

    console.log(`[Agent thinking] ${response.thinking}`);
    for (const call of response.toolCalls) {
      console.log(`[Agent tool call] ${call.tool}(${JSON.stringify(call.args)}) → ${call.result}`);
    }
    console.log(`[Agent answer] ${response.answer}`);
    console.log();
  }

  // ── Host: tear down ───────────────────────────────────────
  console.log("[Host] Shutting down...");
  await gateway.close();
  console.log("[Host] Done!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
