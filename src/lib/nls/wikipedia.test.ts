import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchWikipediaPage, fetchWikipediaHtml } from "./wikipedia.js";

const mockFetch = (ok: boolean, data?: unknown, status = 200, statusText = "OK") =>
  vi.fn().mockResolvedValue({ ok, status, statusText, json: async () => data });

const mockFetchText = (ok: boolean, text = "", status = 200, statusText = "OK") =>
  vi.fn().mockResolvedValue({ ok, status, statusText, text: async () => text });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("fetchWikipediaPage", () => {
  it("returns the extract from a successful response", async () => {
    vi.stubGlobal("fetch", mockFetch(true, { title: "FC Halifax Town", extract: "FC Halifax Town are a football club based in Halifax, West Yorkshire." }));

    const result = await fetchWikipediaPage("FC Halifax Town");

    expect(result).toBe("FC Halifax Town are a football club based in Halifax, West Yorkshire.");
  });

  it("encodes the name in the URL", async () => {
    const fetchSpy = mockFetch(true, { title: "FC Halifax Town", extract: "content" });
    vi.stubGlobal("fetch", fetchSpy);

    await fetchWikipediaPage("FC Halifax Town");

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain(encodeURIComponent("FC Halifax Town"));
  });

  it("throws on a 404 response", async () => {
    vi.stubGlobal("fetch", mockFetch(false, undefined, 404, "Not Found"));

    await expect(fetchWikipediaPage("Unknown FC")).rejects.toThrow("404");
  });

  it("throws on a non-OK response", async () => {
    vi.stubGlobal("fetch", mockFetch(false, undefined, 500, "Internal Server Error"));

    await expect(fetchWikipediaPage("FC Halifax Town")).rejects.toThrow("500");
  });

  it("throws on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network timeout")));

    await expect(fetchWikipediaPage("FC Halifax Town")).rejects.toThrow("network timeout");
  });

  it("throws when extract field is missing from the response", async () => {
    vi.stubGlobal("fetch", mockFetch(true, { title: "FC Halifax Town" }));

    await expect(fetchWikipediaPage("FC Halifax Town")).rejects.toThrow();
  });

  it("includes the page name in the error message on failure", async () => {
    vi.stubGlobal("fetch", mockFetch(false, undefined, 404, "Not Found"));

    await expect(fetchWikipediaPage("Nonexistent FC")).rejects.toThrow("Nonexistent FC");
  });
});

describe("fetchWikipediaHtml", () => {
  it("returns the HTML text on a successful response", async () => {
    const html = "<html><body><p>FC Halifax Town are a football club based in Halifax, West Yorkshire.</p></body></html>";
    vi.stubGlobal("fetch", mockFetchText(true, html));

    const result = await fetchWikipediaHtml("FC Halifax Town");

    expect(result).toBe(html);
  });

  it("encodes the name in the URL", async () => {
    const fetchSpy = mockFetchText(true, "<html/>");
    vi.stubGlobal("fetch", fetchSpy);

    await fetchWikipediaHtml("FC Halifax Town");

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain(encodeURIComponent("FC Halifax Town"));
    expect(url).toContain("/page/html/");
  });

  it("throws on a 404 response", async () => {
    vi.stubGlobal("fetch", mockFetchText(false, "", 404, "Not Found"));

    await expect(fetchWikipediaHtml("Unknown FC")).rejects.toThrow("404");
  });

  it("throws on a non-OK response", async () => {
    vi.stubGlobal("fetch", mockFetchText(false, "", 500, "Internal Server Error"));

    await expect(fetchWikipediaHtml("FC Halifax Town")).rejects.toThrow("500");
  });

  it("throws on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network timeout")));

    await expect(fetchWikipediaHtml("FC Halifax Town")).rejects.toThrow("network timeout");
  });

  it("includes the page name in the error message on failure", async () => {
    vi.stubGlobal("fetch", mockFetchText(false, "", 404, "Not Found"));

    await expect(fetchWikipediaHtml("Nonexistent FC")).rejects.toThrow("Nonexistent FC");
  });
});
