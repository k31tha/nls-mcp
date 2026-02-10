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
import { z } from "zod";

const server = new McpServer({
  name: "calculator",
  version: "1.0.0",
});

// Tool: add two numbers
server.registerTool(
  "add",
  {
    description: "Add two numbers together",
    inputSchema: {
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    },
  },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }],
  }),
);

// Tool: multiply two numbers
server.registerTool(
  "multiply",
  {
    description: "Multiply two numbers together",
    inputSchema: {
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    },
  },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a * b) }],
  }),
);

// Tool: evaluate a mathematical expression (basic)
server.registerTool(
  "calculate",
  {
    description:
      "Evaluate a simple mathematical expression (supports +, -, *, /, parentheses)",
    inputSchema: {
      expression: z
        .string()
        .describe("Mathematical expression to evaluate, e.g. '2 + 3 * 4'"),
    },
  },
  async ({ expression }) => {
    try {
      // Validate: only allow numbers, operators, parentheses, whitespace, and decimal points
      if (!/^[\d+\-*/().\s]+$/.test(expression)) {
        return {
          content: [
            {
              type: "text",
              text: `Error: expression contains invalid characters. Only numbers and +, -, *, /, (, ) are allowed.`,
            },
          ],
          isError: true,
        };
      }
      // Use Function constructor to evaluate safely-validated expression
      const result = new Function(`return (${expression})`)() as number;
      if (typeof result !== "number" || !isFinite(result)) {
        return {
          content: [
            { type: "text", text: `Error: expression did not produce a finite number.` },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: String(result) }],
      };
    } catch {
      return {
        content: [{ type: "text", text: `Error: could not evaluate expression.` }],
        isError: true,
      };
    }
  },
);

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
