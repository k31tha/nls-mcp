import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWikiPage, createWikiPage, updateWikiPage, getOrCreateWikiPage } from "./wiki.js";

vi.mock("./wikipedia.js", () => ({
  fetchWikipediaHtml: vi.fn(),
}));

import { fetchWikipediaHtml } from "./wikipedia.js";

const mockFetch = (ok: boolean, data?: unknown, status = 200, statusText = "OK") =>
  vi.fn().mockResolvedValue({ ok, status, statusText, json: async () => data, text: async () => "" });

const fakePage = { WikiPageID: 1, WikiPageName: "fc-halifax-town", WikiContent: "FC Halifax Town are a football club based in Halifax, West Yorkshire.", CreatedDate: null, ModifiedDate: null };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(fetchWikipediaHtml).mockResolvedValue("<html><body>FC Halifax Town are a football club based in Halifax, West Yorkshire.</body></html>");
});

describe("getWikiPage", () => {
  it("returns the wiki page on a 200 response", async () => {
    vi.stubGlobal("fetch", mockFetch(true, fakePage));

    const result = await getWikiPage("fc-halifax-town");

    expect(result).toEqual(fakePage);
  });

  it("returns null on 404", async () => {
    vi.stubGlobal("fetch", mockFetch(false, undefined, 404, "Not Found"));

    const result = await getWikiPage("unknown-club");

    expect(result).toBeNull();
  });

  it("throws on non-404 error responses", async () => {
    vi.stubGlobal("fetch", mockFetch(false, undefined, 500, "Internal Server Error"));

    await expect(getWikiPage("fc-halifax-town")).rejects.toThrow("500");
  });

  it("throws on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network timeout")));

    await expect(getWikiPage("fc-halifax-town")).rejects.toThrow("network timeout");
  });
});

describe("createWikiPage", () => {
  it("POSTs with serialized body and Content-Type header", async () => {
    const fetchSpy = mockFetch(true, fakePage);
    vi.stubGlobal("fetch", fetchSpy);

    await createWikiPage("fc-halifax-town", "FC Halifax Town are a football club based in Halifax, West Yorkshire.");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ WikiPageName: "fc-halifax-town", WikiContentBase64: Buffer.from("FC Halifax Town are a football club based in Halifax, West Yorkshire.").toString("base64") }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("returns the created wiki page", async () => {
    vi.stubGlobal("fetch", mockFetch(true, fakePage));

    const result = await createWikiPage("fc-halifax-town", "FC Halifax Town are a football club based in Halifax, West Yorkshire.");

    expect(result).toEqual(fakePage);
  });

  it("throws on error response", async () => {
    vi.stubGlobal("fetch", mockFetch(false, undefined, 400, "Bad Request"));

    await expect(createWikiPage("fc-halifax-town", "content")).rejects.toThrow("400");
  });
});

describe("updateWikiPage", () => {
  it("PUTs with serialized body and Content-Type header", async () => {
    const fetchSpy = mockFetch(true, fakePage);
    vi.stubGlobal("fetch", fetchSpy);

    await updateWikiPage("fc-halifax-town", "Updated content.");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/fc-halifax-town");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ WikiPageName: "fc-halifax-town", WikiContentBase64: Buffer.from("Updated content.").toString("base64") }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("returns the updated wiki page", async () => {
    const updated = { ...fakePage, WikiContent: "Updated content." };
    vi.stubGlobal("fetch", mockFetch(true, updated));

    const result = await updateWikiPage("fc-halifax-town", "Updated content.");

    expect(result).toEqual(updated);
  });

  it("throws on error response", async () => {
    vi.stubGlobal("fetch", mockFetch(false, undefined, 404, "Not Found"));

    await expect(updateWikiPage("fc-halifax-town", "content")).rejects.toThrow("404");
  });
});

describe("getOrCreateWikiPage", () => {
  it("returns existing page without fetching Wikipedia when refresh is not set", async () => {
    vi.stubGlobal("fetch", mockFetch(true, fakePage));

    const result = await getOrCreateWikiPage("fc-halifax-town", "FC Halifax Town");

    expect(result).toEqual(fakePage);
    expect(fetchWikipediaHtml).not.toHaveBeenCalled();
  });

  it("fetches from Wikipedia and creates page when NLS returns 404", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found", json: async () => null, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, status: 201, statusText: "Created", json: async () => fakePage });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getOrCreateWikiPage("fc-halifax-town", "FC Halifax Town");

    expect(fetchWikipediaHtml).toHaveBeenCalledWith("FC Halifax Town");
    expect(fetchSpy.mock.calls[1][1].method).toBe("POST");
    expect(result).toEqual(fakePage);
  });

  it("uses the wikipediaName for the Wikipedia lookup", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found", json: async () => null, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, status: 201, statusText: "Created", json: async () => fakePage });
    vi.stubGlobal("fetch", fetchSpy);

    await getOrCreateWikiPage("fc-halifax-town", "FC Halifax Town");

    expect(fetchWikipediaHtml).toHaveBeenCalledWith("FC Halifax Town");
  });

  it("fetches from Wikipedia and updates page when refresh is true and page exists", async () => {
    const updated = { ...fakePage, WikiContent: "FC Halifax Town are a football club based in Halifax, West Yorkshire." };
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => fakePage })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => updated });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getOrCreateWikiPage("fc-halifax-town", "FC Halifax Town", { refresh: true });

    expect(fetchWikipediaHtml).toHaveBeenCalledWith("FC Halifax Town");
    expect(fetchSpy.mock.calls[1][0]).toContain(`/${fakePage.WikiPageName}`);
    expect(fetchSpy.mock.calls[1][1].method).toBe("POST");
    expect(result).toEqual(updated);
  });

  it("fetches from Wikipedia and creates page when refresh is true but page does not exist", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found", json: async () => null, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, status: 201, statusText: "Created", json: async () => fakePage });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getOrCreateWikiPage("fc-halifax-town", "FC Halifax Town", { refresh: true });

    expect(fetchWikipediaHtml).toHaveBeenCalledWith("FC Halifax Town");
    expect(fetchSpy.mock.calls[1][1].method).toBe("POST");
    expect(result).toEqual(fakePage);
  });
});
