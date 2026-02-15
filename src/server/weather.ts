/**
 * MCP Server — Weather
 *
 * One of two MCP servers in this project.  Exposes a get_weather tool
 * over stdio using the official MCP SDK.  Currently returns hardcoded
 * demo data — swap in a real weather API to make it live.
 *
 * Spawned as a child process by the Gateway; communicates via MCP
 * protocol over stdio.
 */

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerWeatherTools } from "./tools/weather-tools.js";

const server = new McpServer({
  name: "weather",
  version: "1.0.0",
});

registerWeatherTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Weather MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
