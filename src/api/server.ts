/**
 * API Server — Express backend for the React chat UI
 *
 * Initializes the MCP Gateway + Agent on startup (HTTP transport),
 * then exposes:
 *   POST /api/chat   — send a user message, get an AgentResponse
 *   GET  /api/tools  — list available tools
 *
 * Requires the MCP HTTP server running (`pnpm dev:server:http`).
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { MultiServerGateway } from "../client/gateway.js";
import { Agent } from "../agent/agent.js";

const app = express();
app.use(cors());
app.use(express.json());

// ── Initialize Gateway + Agent ──────────────────────────────
console.log("[API] Connecting to MCP servers...");
const gateway = new MultiServerGateway();
const baseUrl = process.env.MCP_HTTP_BASE_URL ?? "http://localhost:3000";

let agent!: Agent;
try {
  await gateway.addHttpServer({
    name: "nls",
    url: `${baseUrl}/mcp/nls`,
  });
  console.log("[API] NLS server connected.");

  agent = new Agent(gateway);
  await agent.initialize();

  console.log(`[API] Agent ready with ${agent.availableTools.length} tools.`);
} catch (error) {
  console.error("[API] Failed to connect to MCP HTTP server:", error);
  process.exit(1);
}

// ── Routes ──────────────────────────────────────────────────

app.get("/api/tools", (_req, res) => {
  res.json(agent.availableTools);
});

app.post("/api/chat/reset", (_req, res) => {
  agent.clearHistory();
  res.json({ ok: true });
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
    console.error("[API] Error processing message:", error);
    res.status(500).json({ error: "Failed to process message" });
  }
});

// ── Start ───────────────────────────────────────────────────
const PORT = parseInt(process.env.API_PORT ?? "3001", 10) || 3001;
app.listen(PORT, () => {
  console.log(`[API] Server listening on http://localhost:${PORT}`);
});
