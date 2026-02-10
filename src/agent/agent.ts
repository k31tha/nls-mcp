/**
 * Agent — Business logic and LLM interaction layer
 *
 *   Host
 *   └── Agent          ← you are here
 *       └── Gateway
 *           ├── Client 1 ◄──► Server 1
 *           └── Client N ◄──► Server N
 *
 * The Agent is the decision-maker.  It receives user messages from the
 * Host and decides how to respond — which may involve calling MCP tools.
 *
 * Two execution modes:
 *
 *   LLM mode (ANTHROPIC_API_KEY set):
 *     1. Converts MCP tool schemas to Anthropic tool format
 *     2. Sends user message + tools to Claude
 *     3. When Claude returns stop_reason "tool_use", executes each
 *        tool call through the gateway
 *     4. Feeds tool_result blocks back to Claude
 *     5. Repeats until Claude returns stop_reason "end_turn"
 *     6. Returns the final text answer
 *
 *   Keyword fallback (no API key):
 *     Pattern-matches user messages to tools so the demo runs
 *     without an API key.
 *
 * The Agent never connects to servers directly — it only knows about
 * the Gateway interface (listTools, callTool).
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  ContentBlock,
  ToolUseBlock,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages.js";
import { MultiServerGateway, type ToolInfo } from "../client/gateway.js";

export interface AgentResponse {
  thinking: string;
  toolCalls: { tool: string; args: Record<string, unknown>; result: string }[];
  answer: string;
}

export class Agent {
  private gateway: MultiServerGateway;
  private tools: ToolInfo[] = [];
  private anthropic: Anthropic | null = null;
  private model = "claude-sonnet-4-20250514";

  constructor(gateway: MultiServerGateway) {
    this.gateway = gateway;

    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic();
    }
  }

  async initialize(): Promise<void> {
    this.tools = await this.gateway.listTools();
  }

  get availableTools(): ToolInfo[] {
    return this.tools;
  }

  get usesLLM(): boolean {
    return this.anthropic !== null;
  }

  async processMessage(userMessage: string): Promise<AgentResponse> {
    if (this.anthropic) {
      return this.processWithLLM(userMessage);
    }
    return this.processWithKeywords(userMessage);
  }

  // ── LLM-powered path ─────────────────────────────────────

  private async processWithLLM(userMessage: string): Promise<AgentResponse> {
    const toolCalls: AgentResponse["toolCalls"] = [];

    // Convert MCP tool schemas to Anthropic tool format
    const anthropicTools: Tool[] = this.tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      input_schema: t.inputSchema as Tool["input_schema"],
    }));

    // Start the conversation
    const messages: MessageParam[] = [
      { role: "user", content: userMessage },
    ];

    // Tool-use loop: keep going until Claude gives a final text answer
    let response = await this.anthropic!.messages.create({
      model: this.model,
      max_tokens: 1024,
      tools: anthropicTools,
      messages,
    });

    while (response.stop_reason === "tool_use") {
      const assistantContent = response.content;

      // Collect all tool_use blocks from this turn
      const toolUseBlocks = assistantContent.filter(
        (b): b is ToolUseBlock => b.type === "tool_use",
      );

      // Execute each tool call through the gateway
      const toolResults: ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const args = (block.input as Record<string, unknown>) ?? {};
        let result: string;
        try {
          result = await this.gateway.callTool(block.name, args);
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }

        toolCalls.push({ tool: block.name, args, result });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }

      // Feed tool results back to Claude
      messages.push({ role: "assistant", content: assistantContent });
      messages.push({ role: "user", content: toolResults });

      response = await this.anthropic!.messages.create({
        model: this.model,
        max_tokens: 1024,
        tools: anthropicTools,
        messages,
      });
    }

    // Extract final text answer
    const textBlocks = response.content.filter(
      (b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text",
    );
    const answer = textBlocks.map((b) => b.text).join("\n");

    return {
      thinking: toolCalls.length > 0
        ? `Used ${toolCalls.length} tool(s) to answer.`
        : "Answered without tools.",
      toolCalls,
      answer,
    };
  }

  // ── Keyword fallback (no API key) ─────────────────────────

  private async processWithKeywords(userMessage: string): Promise<AgentResponse> {
    const toolCalls: AgentResponse["toolCalls"] = [];
    const msg = userMessage.toLowerCase();

    if (msg.includes("weather")) {
      const location = extractQuoted(userMessage) ?? "London";
      const result = await this.gateway.callTool("get_weather", { location });
      toolCalls.push({ tool: "get_weather", args: { location }, result });
      return { thinking: `Keyword match → get_weather("${location}")`, toolCalls, answer: result };
    }

    if (msg.includes("calculate") || msg.includes("eval")) {
      const expression = extractQuoted(userMessage) ?? userMessage;
      const result = await this.gateway.callTool("calculate", { expression });
      toolCalls.push({ tool: "calculate", args: { expression }, result });
      return { thinking: `Keyword match → calculate("${expression}")`, toolCalls, answer: result };
    }

    if (msg.includes("add") || msg.includes("+")) {
      const nums = extractNumbers(userMessage);
      if (nums.length >= 2) {
        const [a, b] = nums;
        const result = await this.gateway.callTool("add", { a, b });
        toolCalls.push({ tool: "add", args: { a, b }, result });
        return { thinking: `Keyword match → add(${a}, ${b})`, toolCalls, answer: `${a} + ${b} = ${result}` };
      }
    }

    if (msg.includes("multiply") || msg.includes("*")) {
      const nums = extractNumbers(userMessage);
      if (nums.length >= 2) {
        const [a, b] = nums;
        const result = await this.gateway.callTool("multiply", { a, b });
        toolCalls.push({ tool: "multiply", args: { a, b }, result });
        return { thinking: `Keyword match → multiply(${a}, ${b})`, toolCalls, answer: `${a} * ${b} = ${result}` };
      }
    }

    return {
      thinking: "No matching tool found.",
      toolCalls: [],
      answer: `I have these tools: ${this.tools.map((t) => t.name).join(", ")}.`,
    };
  }
}

function extractQuoted(text: string): string | undefined {
  return text.match(/"([^"]+)"/)?.[1];
}

function extractNumbers(text: string): number[] {
  return (text.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}
