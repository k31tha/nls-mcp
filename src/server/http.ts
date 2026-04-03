/**
 * MCP HTTP Server — Express entry point
 *
 * Hosts the NLS MCP server on a single Express app
 * using the SDK's Streamable HTTP transport with path-based routing:
 *
 *   POST /mcp/nls  — NLS server
 *
 * Runs in stateless mode: each POST creates a fresh transport + server,
 * so no session state is kept between requests.
 */

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Request, Response } from "express";
import { registerNlsTools } from "./tools/nls-tools.js";

function createNlsServer(): McpServer {
  const server = new McpServer({ name: "nls", version: "1.0.0" });
  registerNlsTools(server);
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

mountMcpEndpoint(app, "/mcp/nls", createNlsServer);

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`MCP HTTP Server listening on port ${PORT}`);
  console.log(`  NLS: http://localhost:${PORT}/mcp/nls`);
});
