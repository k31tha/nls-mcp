/**
 * MCP HTTP Server — Express entry point
 *
 * Hosts both MCP servers (calculator, weather) on a single Express app
 * using the SDK's Streamable HTTP transport with path-based routing:
 *
 *   POST /mcp/calculator  — calculator server
 *   POST /mcp/weather     — weather server
 *
 * Runs in stateless mode: each POST creates a fresh transport + server,
 * so no session state is kept between requests.
 */

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Request, Response } from "express";
import { registerCalculatorTools } from "./tools/calculator-tools.js";
import { registerWeatherTools } from "./tools/weather-tools.js";

function createCalculatorServer(): McpServer {
  const server = new McpServer({ name: "calculator", version: "1.0.0" });
  registerCalculatorTools(server);
  return server;
}

function createWeatherServer(): McpServer {
  const server = new McpServer({ name: "weather", version: "1.0.0" });
  registerWeatherTools(server);
  return server;
}

/**
 * Wire up POST/GET/DELETE handlers for a given path and server factory.
 */
function mountMcpEndpoint(
  app: ReturnType<typeof createMcpExpressApp>,
  path: string,
  createServer: () => McpServer,
): void {
  app.post(path, async (req: Request, res: Response) => {
    const server = createServer();
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error(`Error handling POST ${path}:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get(path, async (_req: Request, res: Response) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      }),
    );
  });

  app.delete(path, async (_req: Request, res: Response) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      }),
    );
  });
}

// ── Bootstrap ────────────────────────────────────────────────

const app = createMcpExpressApp();

mountMcpEndpoint(app, "/mcp/calculator", createCalculatorServer);
mountMcpEndpoint(app, "/mcp/weather", createWeatherServer);

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`MCP HTTP Server listening on port ${PORT}`);
  console.log(`  Calculator: http://localhost:${PORT}/mcp/calculator`);
  console.log(`  Weather:    http://localhost:${PORT}/mcp/weather`);
});
