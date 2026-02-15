/**
 * MCP Gateway — Client that connects to an MCP Server
 *
 * Two gateway classes are provided:
 *
 *   McpGateway          — wraps a single MCP Client ↔ Server connection.
 *   MultiServerGateway  — manages many McpGateway instances and presents
 *                         a unified tool surface to the Agent.
 *
 * MCP requires one Client per Server (stateful capability negotiation,
 * isolated lifecycles, 1:1 transport ownership).  MultiServerGateway
 * keeps that constraint but hides it behind a single interface:
 *
 *   Host
 *   └── Agent
 *       └── MultiServerGateway
 *           ├── Client 1  ◄──►  Server 1
 *           ├── Client 2  ◄──►  Server 2
 *           └── Client N  ◄──►  Server N
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: unknown;
}

// ── Single-server gateway ───────────────────────────────────

export class McpGateway {
  private client: Client;
  private transport: StdioClientTransport | StreamableHTTPClientTransport | null = null;

  constructor() {
    this.client = new Client({
      name: "mcp-gateway",
      version: "1.0.0",
    });
  }

  /**
   * Connect to an MCP server by spawning it as a child process.
   */
  async connect(command: string, args: string[]): Promise<void> {
    this.transport = new StdioClientTransport({ command, args });
    await this.client.connect(this.transport);
  }

  /**
   * Connect to an MCP server over Streamable HTTP.
   */
  async connectHttp(url: string): Promise<void> {
    this.transport = new StreamableHTTPClientTransport(new URL(url));
    await this.client.connect(this.transport);
  }

  /**
   * Discover available tools on the connected server.
   */
  async listTools(): Promise<ToolInfo[]> {
    const result = await this.client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Call a tool on the connected server.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const result = await this.client.callTool({ name, arguments: args });
    const textParts = (result.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === "text")
      .map((c) => c.text);
    return textParts.join("\n");
  }

  /**
   * Close the connection and clean up.
   */
  async close(): Promise<void> {
    await this.client.close();
  }
}

// ── Multi-server gateway ────────────────────────────────────

export interface ServerConfig {
  /** Friendly name used in logs and error messages. */
  name: string;
  command: string;
  args: string[];
}

export interface HttpServerConfig {
  /** Friendly name used in logs and error messages. */
  name: string;
  url: string;
}

/**
 * Manages multiple MCP server connections behind a single interface.
 *
 * Internally creates one McpGateway (and therefore one SDK Client) per
 * server — honouring the MCP "one client per server" rule — but exposes
 * a unified `listTools()` / `callTool()` surface so the Agent doesn't
 * need to know which server owns which tool.
 */
export class MultiServerGateway {
  /** server-name → gateway */
  private gateways = new Map<string, McpGateway>();
  /** tool-name → server-name (built during addServer) */
  private toolRoutes = new Map<string, string>();

  /**
   * Add and connect to a server via stdio (child process).
   * Tools are discovered immediately so that `callTool` can route
   * to the correct gateway.
   */
  async addServer(config: ServerConfig): Promise<ToolInfo[]> {
    const gw = new McpGateway();
    await gw.connect(config.command, config.args);
    this.gateways.set(config.name, gw);

    const tools = await gw.listTools();
    for (const tool of tools) {
      this.toolRoutes.set(tool.name, config.name);
    }
    return tools;
  }

  /**
   * Add and connect to a server via Streamable HTTP.
   * Tools are discovered immediately so that `callTool` can route
   * to the correct gateway.
   */
  async addHttpServer(config: HttpServerConfig): Promise<ToolInfo[]> {
    const gw = new McpGateway();
    await gw.connectHttp(config.url);
    this.gateways.set(config.name, gw);

    const tools = await gw.listTools();
    for (const tool of tools) {
      this.toolRoutes.set(tool.name, config.name);
    }
    return tools;
  }

  /**
   * List tools from every connected server.
   */
  async listTools(): Promise<ToolInfo[]> {
    const all: ToolInfo[] = [];
    for (const gw of this.gateways.values()) {
      all.push(...(await gw.listTools()));
    }
    return all;
  }

  /**
   * Call a tool — automatically routed to the server that owns it.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const serverName = this.toolRoutes.get(name);
    if (!serverName) {
      throw new Error(
        `Unknown tool "${name}". Known tools: ${[...this.toolRoutes.keys()].join(", ")}`,
      );
    }
    const gw = this.gateways.get(serverName)!;
    return gw.callTool(name, args);
  }

  /**
   * Disconnect from all servers.
   */
  async close(): Promise<void> {
    await Promise.all(
      [...this.gateways.values()].map((gw) => gw.close()),
    );
    this.gateways.clear();
    this.toolRoutes.clear();
  }
}
