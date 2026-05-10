import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { fetchJson, HttpError } from "./fetch-json.js";

const mockFetch = (ok: boolean, data?: unknown, status = 200, statusText = "OK") =>
  vi.fn().mockResolvedValue({ ok, status, statusText, json: async () => data, text: async () => "" });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("fetchJson — success", () => {
  it("returns raw JSON when no schema is provided", async () => {
    const data = { id: 1, name: "Test" };
    vi.stubGlobal("fetch", mockFetch(true, data));

    const result = await fetchJson("https://example.com/api");

    expect(result).toEqual(data);
  });

  it("validates and returns typed data when a schema is provided", async () => {
    const schema = z.object({ id: z.number(), name: z.string() });
    const data = { id: 1, name: "Test" };
    vi.stubGlobal("fetch", mockFetch(true, data));

    const result = await fetchJson("https://example.com/api", undefined, schema);

    expect(result).toEqual(data);
  });

  it("defaults to GET when no method is specified", async () => {
    const fetchSpy = mockFetch(true, {});
    vi.stubGlobal("fetch", fetchSpy);

    await fetchJson("https://example.com/api");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("GET");
  });

  it("sends POST with serialized body and Content-Type header", async () => {
    const fetchSpy = mockFetch(true, {});
    vi.stubGlobal("fetch", fetchSpy);
    const body = { name: "New Item" };

    await fetchJson("https://example.com/api", { method: "POST", body });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify(body));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("sends PUT with serialized body and Content-Type header", async () => {
    const fetchSpy = mockFetch(true, {});
    vi.stubGlobal("fetch", fetchSpy);
    const body = { name: "Updated" };

    await fetchJson("https://example.com/api/1", { method: "PUT", body });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify(body));
  });

  it("does not set body or Content-Type for GET with no body", async () => {
    const fetchSpy = mockFetch(true, {});
    vi.stubGlobal("fetch", fetchSpy);

    await fetchJson("https://example.com/api", { method: "GET" });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string> | undefined)?.["Content-Type"]).toBeUndefined();
  });
});

describe("fetchJson — errors", () => {
  it("throws HttpError with status on non-OK response", async () => {
    vi.stubGlobal("fetch", mockFetch(false, undefined, 404, "Not Found"));

    await expect(fetchJson("https://example.com/api")).rejects.toThrow(HttpError);
    await expect(fetchJson("https://example.com/api")).rejects.toMatchObject({ status: 404 });
  });

  it("throws HttpError with status 500", async () => {
    vi.stubGlobal("fetch", mockFetch(false, undefined, 500, "Internal Server Error"));

    await expect(fetchJson("https://example.com/api")).rejects.toMatchObject({ status: 500 });
  });

  it("includes the URL and method in the HttpError message", async () => {
    vi.stubGlobal("fetch", mockFetch(false, undefined, 500, "Internal Server Error"));

    await expect(fetchJson("https://example.com/api", { method: "POST" })).rejects.toThrow("POST https://example.com/api");
  });

  it("throws on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network timeout")));

    await expect(fetchJson("https://example.com/api")).rejects.toThrow("network timeout");
  });

  it("throws ZodError when response fails schema validation", async () => {
    const schema = z.object({ id: z.number() });
    vi.stubGlobal("fetch", mockFetch(true, { id: "not-a-number" }));

    await expect(fetchJson("https://example.com/api", undefined, schema)).rejects.toThrow(z.ZodError);
  });
});
