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
    expect(result.content as unknown[]).toEqual([{ type: "text", text: JSON.stringify(fakeClub) }]);
  });

  it("returns isError with status code on non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "",
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "club_detail", arguments: { urlFriendlyName: "unknown-club" } });

    expect(result.isError).toBe(true);
    const text = ((result.content as Array<{ type: string; text: string }>)[0]).text;
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
    const text = ((result.content as Array<{ type: string; text: string }>)[0]).text;
    expect(text).toContain("network timeout");
  });
});

describe("get_pyramid", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns raw JSON on a successful API response", async () => {
    const fakePyramid = [{ pyramidId: "1", leagueName: "Northern Premier League", pyramidStep: 4, clubs: [] }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fakePyramid,
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "get_pyramid", arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.content as unknown[]).toEqual([{ type: "text", text: JSON.stringify(fakePyramid) }]);
  });

  it("returns isError with status code on non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "",
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "get_pyramid", arguments: {} });

    expect(result.isError).toBe(true);
    const text = ((result.content as Array<{ type: string; text: string }>)[0]).text;
    expect(text).toContain("500");
  });

  it("returns isError on fetch network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network timeout")),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "get_pyramid", arguments: {} });

    expect(result.isError).toBe(true);
    const text = ((result.content as Array<{ type: string; text: string }>)[0]).text;
    expect(text).toContain("network timeout");
  });
});

describe("get_wiki_page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns raw JSON on a successful API response", async () => {
    const fakePage = { name: "test-fc", content: "Test FC wiki content" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fakePage,
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "get_wiki_page", arguments: { name: "test-fc" } });

    expect(result.isError).toBeFalsy();
    expect(result.content as unknown[]).toEqual([{ type: "text", text: JSON.stringify(fakePage) }]);
  });

  it("returns isError with status code on non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "",
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "get_wiki_page", arguments: { name: "unknown" } });

    expect(result.isError).toBe(true);
    const text = ((result.content as Array<{ type: string; text: string }>)[0]).text;
    expect(text).toContain("404");
  });

  it("returns isError on fetch network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network timeout")),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "get_wiki_page", arguments: { name: "test-fc" } });

    expect(result.isError).toBe(true);
    const text = ((result.content as Array<{ type: string; text: string }>)[0]).text;
    expect(text).toContain("network timeout");
  });
});

describe("club_search", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns raw JSON on a successful API response", async () => {
    const fakeResults = [{ ClubGuid: "abc-123", ClubName: "Test FC" }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fakeResults,
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "club_search", arguments: { term: "test" } });

    expect(result.isError).toBeFalsy();
    expect(result.content as unknown[]).toEqual([{ type: "text", text: JSON.stringify(fakeResults) }]);
  });

  it("returns isError with status code on non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "",
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "club_search", arguments: { term: "test" } });

    expect(result.isError).toBe(true);
    const text = ((result.content as Array<{ type: string; text: string }>)[0]).text;
    expect(text).toContain("500");
  });

  it("returns isError on fetch network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network timeout")),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "club_search", arguments: { term: "test" } });

    expect(result.isError).toBe(true);
    const text = ((result.content as Array<{ type: string; text: string }>)[0]).text;
    expect(text).toContain("network timeout");
  });
});

describe("get_reference_data", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns raw JSON on a successful API response", async () => {
    const fakeData = [{ id: 1, name: "Some Reference" }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fakeData,
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "get_reference_data", arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.content as unknown[]).toEqual([{ type: "text", text: JSON.stringify(fakeData) }]);
  });

  it("returns isError with status code on non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "",
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "get_reference_data", arguments: {} });

    expect(result.isError).toBe(true);
    const text = ((result.content as Array<{ type: string; text: string }>)[0]).text;
    expect(text).toContain("500");
  });

  it("returns isError on fetch network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network timeout")),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "get_reference_data", arguments: {} });

    expect(result.isError).toBe(true);
    const text = ((result.content as Array<{ type: string; text: string }>)[0]).text;
    expect(text).toContain("network timeout");
  });
});

describe("search_pyramids", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns raw JSON on a successful API response", async () => {
    const fakeData = [{ pyramidId: 1, leagueName: "Northern Premier League", leagueUrl: "northern-premier-league", pyramidStep: 4, pyramidStepInactive: false, wikipedia: "Northern Premier League", wikiPageSection: "", clubs: [] }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fakeData,
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "search_pyramids", arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.content as unknown[]).toEqual([{ type: "text", text: JSON.stringify(fakeData) }]);
  });

  it("returns isError with status code on non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "",
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "search_pyramids", arguments: {} });

    expect(result.isError).toBe(true);
    const text = ((result.content as Array<{ type: string; text: string }>)[0]).text;
    expect(text).toContain("500");
  });

  it("returns isError on fetch network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network timeout")),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "search_pyramids", arguments: {} });

    expect(result.isError).toBe(true);
    const text = ((result.content as Array<{ type: string; text: string }>)[0]).text;
    expect(text).toContain("network timeout");
  });

  it("builds the correct query string from provided params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = await buildClient();
    await client.callTool({
      name: "search_pyramids",
      arguments: { pyramidStep: 4, leagueName: "Northern Premier League" },
    });

    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain("pyramidStep=4");
    expect(calledUrl).toContain("leagueName=Northern+Premier+League");
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
    expect(result.content as unknown[]).toEqual([{ type: "text", text: JSON.stringify(fakeClub) }]);
  });

  it("returns isError with status code on non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "",
      }),
    );

    const client = await buildClient();
    const result = await client.callTool({ name: "club_detail_by_guid", arguments: { guid: "abc-123" } });

    expect(result.isError).toBe(true);
    const text = ((result.content as Array<{ type: string; text: string }>)[0]).text;
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
    const text = ((result.content as Array<{ type: string; text: string }>)[0]).text;
    expect(text).toContain("network timeout");
  });
});
