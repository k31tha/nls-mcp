import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerNlsTools } from "./tools/nls-tools.js";

const server = new McpServer({
  name: "nls",
  version: "1.0.0",
});

registerNlsTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("NLS MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
