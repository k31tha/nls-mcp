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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "weather",
  version: "1.0.0",
});

server.registerTool(
  "get_weather",
  {
    description: "Get the current weather for a location",
    inputSchema: {
      location: z.string().describe("City or location name, e.g. 'London'"),
    },
  },
  async ({ location }) => ({
    content: [
      {
        type: "text",
        text: `Weather in ${location}: 22°C, partly cloudy with light winds`,
      },
    ],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Weather MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
