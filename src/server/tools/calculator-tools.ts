import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerCalculatorTools(server: McpServer): void {
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
}
