import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerNlsTools } from "./nls-tools.js";

async function buildClient(): Promise<Client> {
  const server = new McpServer({ name: "test-nls", version: "1.0.0" });
  registerNlsTools(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

describe("club_detail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns raw JSON on a successful API response", async () => {
    const fakeClub = { ClubGuid: "abc-123", ClubName: "Test FC" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fakeClub,
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "club_detail", arguments: { urlFriendlyName: "test-fc" } });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify(fakeClub) }]);
  });

  it("returns isError with status code on non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "club_detail", arguments: { urlFriendlyName: "unknown-club" } });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("404");
  });

  it("returns isError on fetch network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network timeout")),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "club_detail", arguments: { urlFriendlyName: "test-fc" } });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("network timeout");
  });
});

describe("club_detail_by_guid", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns raw JSON on a successful API response", async () => {
    const fakeClub = { ClubGuid: "abc-123", ClubName: "Test FC" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fakeClub,
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "club_detail_by_guid", arguments: { guid: "abc-123" } });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify(fakeClub) }]);
  });

  it("returns isError with status code on non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "club_detail_by_guid", arguments: { guid: "abc-123" } });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("404");
  });

  it("returns isError on fetch network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network timeout")),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "club_detail_by_guid", arguments: { guid: "abc-123" } });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("network timeout");
  });
});
