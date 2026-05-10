import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { apiCall } from "./api-call.js";

const mockFetch = (ok: boolean, data?: unknown, status = 200, statusText = "OK") =>
  vi.fn().mockResolvedValue({ ok, status, statusText, json: async () => data, text: async () => "" });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("apiCall — MCP content block formatting", () => {
  it("returns a content block with JSON text on success", async () => {
    const data = { id: 1 };
    vi.stubGlobal("fetch", mockFetch(true, data));

    const result = await apiCall("https://example.com/api");

    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify(data) }]);
  });

  it("applies transform and returns the result in the content block", async () => {
    const schema = z.array(z.object({ id: z.number(), active: z.boolean() }));
    const data = [{ id: 1, active: true }, { id: 2, active: false }];
    vi.stubGlobal("fetch", mockFetch(true, data));

    const result = await apiCall("https://example.com/api", undefined, schema, (items) =>
      items.filter((i) => i.active),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify([{ id: 1, active: true }]) }]);
  });

  it("returns isError content block on non-OK HTTP response", async () => {
    vi.stubGlobal("fetch", mockFetch(false, undefined, 404, "Not Found"));

    const result = await apiCall("https://example.com/api");

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("404");
  });

  it("returns isError content block on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network timeout")));

    const result = await apiCall("https://example.com/api");

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("network timeout");
  });

  it("returns isError content block on schema validation failure", async () => {
    const schema = z.object({ id: z.number() });
    vi.stubGlobal("fetch", mockFetch(true, { id: "not-a-number" }));

    const result = await apiCall("https://example.com/api", undefined, schema);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("validation");
  });
});
