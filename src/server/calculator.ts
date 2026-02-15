/**
 * MCP Server — Calculator
 *
 * One of two MCP servers in this project.  Exposes three tools
 * (add, multiply, calculate) over stdio using the official MCP SDK.
 *
 * The Host never talks to this file directly — the Gateway spawns it
 * as a child process and communicates via the MCP protocol over stdio.
 *
 * Key SDK patterns used:
 *   - McpServer            — creates the server instance
 *   - server.registerTool  — registers a tool with a zod input schema
 *   - StdioServerTransport — connects the server to stdin/stdout
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCalculatorTools } from "./tools/calculator-tools.js";

const server = new McpServer({
  name: "calculator",
  version: "1.0.0",
});

registerCalculatorTools(server);

// Start the server on stdio
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Calculator MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
