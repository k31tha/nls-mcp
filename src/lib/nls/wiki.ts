import { z } from "zod";
import { fetchJson, HttpError } from "../generic/fetch-json.js";
import { fetchWikipediaHtml } from "./wikipedia.js";
import { NLS_API } from "./config.js";

const NLS_WIKI_BASE = `${NLS_API.v3}/WikiPageApi/WikiPages`;

const WikiPageSchema = z.object({
  WikiPageID: z.number(),
  WikiPageName: z.string(),
  WikiContent: z.string(),
  CreatedDate: z.string().nullable(),
  ModifiedDate: z.string().nullable(),
}).passthrough();

export type WikiPage = z.infer<typeof WikiPageSchema>;

export async function getWikiPage(name: string): Promise<WikiPage | null> {
  try {
    return await fetchJson(`${NLS_WIKI_BASE}/${encodeURIComponent(name)}`, undefined, WikiPageSchema);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

export async function createWikiPage(name: string, content: string): Promise<WikiPage> {
  return fetchJson(NLS_WIKI_BASE, { method: "POST", body: { WikiPageName: name, WikiContentBase64: Buffer.from(content).toString("base64") } }, WikiPageSchema);
}

export async function updateWikiPage(name: string, content: string): Promise<WikiPage> {
  return fetchJson(`${NLS_WIKI_BASE}/${encodeURIComponent(name)}`, { method: "POST", body: { WikiPageName: name, WikiContentBase64: Buffer.from(content).toString("base64") } }, WikiPageSchema);
}

export async function getOrCreateWikiPage(
  name: string,
  wikipediaName: string,
  options?: { refresh?: boolean },
): Promise<WikiPage> {
  const existing = await getWikiPage(name);

  if (existing && !options?.refresh) return existing;

  const content = await fetchWikipediaHtml(wikipediaName);

  return existing ? updateWikiPage(name, content) : createWikiPage(name, content);
}
