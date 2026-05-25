import { z } from "zod";
export { extractTextBySelector, extractWikipediaSection, extractClubLeagueFromWikiPage, extractClubWebsiteFromWikiPage } from "../generic/html-extract.js";
export type { WikipediaSectionResult, WikipediaLink } from "../generic/html-extract.js";

const WIKIPEDIA_BASE = process.env.WIKIPEDIA_API_URL ?? "https://en.wikipedia.org/api/rest_v1";
const WIKIPEDIA_SUMMARY = `${WIKIPEDIA_BASE}/page/summary`;
const WIKIPEDIA_HTML = `${WIKIPEDIA_BASE}/page/html`;
const WIKIPEDIA_WIKI = process.env.WIKIPEDIA_WIKI_URL ?? "https://en.wikipedia.org/wiki";

const WikipediaSummarySchema = z.object({
  title: z.string(),
  extract: z.string(),
});

export async function fetchWikipediaPage(name: string): Promise<string> {
  const url = `${WIKIPEDIA_SUMMARY}/${encodeURIComponent(name)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Wikipedia: ${response.status} ${response.statusText} for "${name}"`);
  }
  const { extract } = WikipediaSummarySchema.parse(await response.json());
  return extract;
}

export async function fetchWikipediaHtml(name: string): Promise<string> {
  const url = `${WIKIPEDIA_HTML}/${encodeURIComponent(name)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Wikipedia: ${response.status} ${response.statusText} for "${name}"`);
  }
  return response.text();
}

export async function fetchWikipediaPageHtml(name: string): Promise<string> {
  const url = `${WIKIPEDIA_WIKI}/${encodeURIComponent(name)}`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) {
    throw new Error(`Wikipedia: ${response.status} ${response.statusText} for "${name}"`);
  }
  return response.text();
}

export async function fetchWikipediaPageHtmlByUrl(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) {
    throw new Error(`Wikipedia: ${response.status} ${response.statusText} for "${url}"`);
  }
  return response.text();
}

