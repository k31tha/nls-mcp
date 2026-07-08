import "dotenv/config";
import { writeFileSync } from "fs";
import * as cheerio from "cheerio";
import { fetchJson } from "../lib/generic/fetch-json.js";
import { NLS_API } from "../lib/nls/config.js";
import { fetchWikipediaPageHtml, fetchWikipediaPageHtmlByUrl, extractWikipediaSection } from "../lib/nls/wikipedia.js";
import { z } from "zod";

const OUT_FILE = "pyramid-wikipedia.csv";

const PyramidLeagueSchema = z.object({
  pyramidId: z.number(),
  leagueName: z.string(),
  pyramidStep: z.number(),
  pyramidStepInactive: z.boolean(),
  wikipedia: z.string().nullable(),
  wikiPageSection: z.string().nullable(),
});

const EN_DASH = "–";
let SEASON = "2025-26";
let SEASON_VARIANTS = [SEASON, SEASON.replace("-", EN_DASH)];
const STADIA_KEYWORDS = ["stadia", "stadium", "stadiums", "ground", "grounds", "venue", "venues"];

function wikiUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}`;
}

function hasSeasonInTitle(title: string): boolean {
  return SEASON_VARIANTS.some((v) => title.includes(v));
}

function parseWikiUrl(url: string): { base: string; fragment: string | null; cacheKey: string } {
  const [base, fragment] = url.split("#");
  // Normalise: decode percent-encoding then replace en-dash → hyphen so
  // "2025%E2%80%9326_National_League" and "2025-26_National_League" share one cache entry
  const cacheKey = decodeURIComponent(base).replace(/–/g, "-");
  return { base, fragment: fragment ? decodeURIComponent(fragment) : null, cacheKey };
}

// Resolve a Wikipedia URL through redirects, returning the final URL including any #fragment.
// Uses ?redirect=no to fetch the redirect page itself so the fragment in the href is preserved.
async function resolveWikiUrl(url: string): Promise<string> {
  const { base } = parseWikiUrl(url);
  try {
    const res = await fetch(`${base}?redirect=no`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return url;
    const html = await res.text();
    const $ = cheerio.load(html);
    const href = $(".redirectText a, .mw-parser-output .redirectMsg a").first().attr("href");
    if (href) return resolveHref(href);
  } catch { /* fall through */ }
  return url;
}

async function checkWikiPageExists(title: string): Promise<boolean> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    return res.ok;
  } catch {
    return false;
  }
}

export function resolveHref(href: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  return `https://en.wikipedia.org${href}`;
}

/**
 * Converts a Wikipedia article title to a normalised slug suitable for
 * substring-matching against decoded href paths. Replaces spaces with
 * underscores, strips any trailing disambiguation suffix of the form
 * `_(…)` (e.g. `_(division)`, `_(association_football)`), then lowercases.
 */
function normalizeWikiTitle(title: string): string {
  return title
    .replace(/ /g, "_")
    .replace(/_\([^)]+\)$/, "")
    .toLowerCase();
}

// "2026-27" → ["2025-26", "2025–26"]; [] when the season string does not parse
export function previousSeasonVariants(season: string): string[] {
  const m = /^(\d{4})[-–]\d{2}$/.exec(season);
  if (!m) return [];
  const startYear = parseInt(m[1], 10) - 1;
  const prev = `${startYear}-${String(startYear + 1).slice(-2)}`;
  return [prev, prev.replace("-", EN_DASH)];
}

const ENCODED_EN_DASH = "%E2%80%93";

// Replace the previous-season substring in a Wikipedia URL with the target season,
// preserving the original separator style (hyphen, en-dash, or percent-encoded
// en-dash) and any #fragment. Returns null when no variant occurs in the URL.
export function rewriteSeasonInUrl(url: string, prevVariants: string[], targetSeason: string): string | null {
  for (const prev of prevVariants) {
    const candidates: Array<[string, string]> = [
      [prev, prev.includes(EN_DASH) ? targetSeason.replace("-", EN_DASH) : targetSeason],
      [prev.replace(/[-–]/, ENCODED_EN_DASH), targetSeason.replace("-", ENCODED_EN_DASH)],
    ];
    for (const [from, to] of candidates) {
      if (url.includes(from)) return url.replace(from, to);
    }
  }
  return null;
}

// Fallback for articles whose "Current:" link still points at the previous season:
// rewrite that link to the requested season and use it if the page exists.
export async function rewritePreviousSeasonLink(
  html: string,
  wikiTitle: string,
  season: string,
  pageExists: (title: string) => Promise<boolean> = checkWikiPageExists,
): Promise<string | null> {
  const prevVariants = previousSeasonVariants(season);
  if (prevVariants.length === 0) return null;
  const prevLink = findCurrentSeasonLink(html, prevVariants, wikiTitle);
  if (!prevLink) return null;
  const rewritten = rewriteSeasonInUrl(prevLink, prevVariants, season);
  if (!rewritten) return null;
  const { base } = parseWikiUrl(rewritten);
  const title = decodeURIComponent(base.split("/wiki/")[1] ?? "");
  if (!title || !(await pageExists(title))) return null;
  return rewritten;
}

export function findCurrentSeasonLink(html: string, seasonVariants = SEASON_VARIANTS, wikiTitle?: string): string | null {
  const $ = cheerio.load(html);

  let found: string | null = null;
  $("table.infobox td.infobox-full-data").each((_, td) => {
    if (found) return false;
    const $td = $(td);
    if ($td.text().includes("Current:")) {
      $td.find("a[href]").each((_, a) => {
        if (found) return false;
        const href = $(a).attr("href") ?? "";
        const text = $(a).text().trim();
        if (href && seasonVariants.some((v) => text.includes(v))) {
          found = resolveHref(href);
        }
      });
    }
  });
  if (found) return found;

  $("a[href]").each((_, el) => {
    if (found) return false;
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().trim();
    if (seasonVariants.some((v) => text.includes(v))) {
      if (wikiTitle) {
        const normalizedTitle = normalizeWikiTitle(wikiTitle);
        if (!decodeURIComponent(href).toLowerCase().includes(normalizedTitle)) return;
      }
      found = resolveHref(href);
    }
  });

  return found;
}

function collectHeadings($: cheerio.CheerioAPI): Array<{ id: string; level: number }> {
  const seen = new Set<string>();
  const result: Array<{ id: string; level: number }> = [];
  // Use only heading elements directly — avoids duplicates from mw-heading wrappers
  $("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]").each((_, el) => {
    const id = $(el).attr("id")!;
    if (seen.has(id)) return;
    seen.add(id);
    const level = parseInt(($(el).prop("tagName") as string)[1], 10);
    result.push({ id, level });
  });
  return result;
}

// Returns stadia-like heading IDs scoped to the fragment section (if given),
// scored by proximity to the league name, excluding already-claimed sections.
function findStadiaSections(
  $: cheerio.CheerioAPI,
  fragment: string | null,
  leagueName: string,
  usedSections: Set<string>,
): string[] {
  const allHeadings = collectHeadings($);

  const isStadia = (id: string) => {
    const lower = id.toLowerCase().replace(/_/g, " ");
    return STADIA_KEYWORDS.some((kw) => lower.includes(kw));
  };

  // Scope candidates to the fragment's section when possible
  let scopedHeadings = allHeadings;
  if (fragment) {
    const fragIdx = allHeadings.findIndex((h) => h.id === fragment);
    if (fragIdx !== -1) {
      const fragLevel = allHeadings[fragIdx].level;
      const end = allHeadings.findIndex((h, i) => i > fragIdx && h.level <= fragLevel);
      scopedHeadings = allHeadings.slice(fragIdx + 1, end === -1 ? undefined : end);
    }
  }

  const stadiaCandidates = scopedHeadings.filter(({ id }) => isStadia(id) && !usedSections.has(id));

  if (stadiaCandidates.length > 0) return stadiaCandidates.map(({ id }) => id);

  // No stadia section found in fragment scope — score all unclaimed stadia sections by
  // how well their nearest parent heading matches the league name
  const leagueWords = leagueName.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const allStadia = allHeadings.filter(({ id }) => isStadia(id) && !usedSections.has(id));

  const scored = allStadia.map(({ id }) => {
    const idx = allHeadings.findIndex((h) => h.id === id);
    const stadiaLevel = allHeadings[idx].level;
    // Find nearest preceding heading at a higher level (the section this stadia belongs to)
    const parent = [...allHeadings.slice(0, idx)].reverse().find((h) => h.level < stadiaLevel);
    const parentText = (parent?.id ?? "").toLowerCase().replace(/_/g, " ");
    const score = leagueWords.filter((w) => parentText.includes(w)).length;
    return { id, score };
  });

  return scored.sort((a, b) => b.score - a.score).map(({ id }) => id);
}

// Returns heading IDs whose text matches the division portion of leagueName,
// scored by token overlap, excluding already-claimed sections.
export function findLeagueDivisionSections(
  $: cheerio.CheerioAPI,
  leagueName: string,
  wikiTitle: string,
  usedSections: Set<string>,
): string[] {
  const normalizedTitle = wikiTitle.replace(/_/g, " ").toLowerCase();
  const normalizedLeague = leagueName.toLowerCase();
  const divisionLabel = normalizedLeague.startsWith(normalizedTitle)
    ? leagueName.slice(normalizedTitle.length).trim()
    : leagueName;

  const tokens = divisionLabel.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  if (tokens.length === 0) return [];

  const allHeadings = collectHeadings($);
  const scored = allHeadings
    .filter(({ id }) => !usedSections.has(id))
    .map(({ id }) => {
      const normalized = decodeURIComponent(id).replace(/_/g, " ").toLowerCase();
      const score = tokens.filter((t) => normalized.includes(t)).length;
      return { id, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map(({ id }) => id);
}

function findClubsInSection(html: string, sectionId: string): { count: number; first: string } {
  const { clubs } = extractWikipediaSection(html, sectionId);
  return { count: clubs.length, first: clubs[0]?.name ?? "" };
}

function csvField(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function parseArgs(argv: string[]): { season: string; debug: boolean } {
  const debug = argv.includes("--debug");
  const seasonIdx = argv.indexOf("--season");
  const season = (seasonIdx !== -1 && argv[seasonIdx + 1]) ? argv[seasonIdx + 1] : "2025-26";
  return { season, debug };
}

async function main() {
  const { season, debug } = parseArgs(process.argv.slice(2));
  if (debug) process.env.DEBUG = "1";

  SEASON = season;
  SEASON_VARIANTS = [SEASON, SEASON.replace("-", EN_DASH)];

  const all = await fetchJson(`${NLS_API.v3}/PyramidApi/Pyramids`, undefined, z.array(PyramidLeagueSchema));
  const leagues = all
    .filter((l) => !l.pyramidStepInactive && l.wikipedia !== null)
    .sort((a, b) => a.pyramidStep - b.pyramidStep || a.leagueName.localeCompare(b.leagueName)) as
    (typeof all[number] & { wikipedia: string })[];

  console.log(`${leagues.length} active leagues with Wikipedia configured. Checking for ${SEASON} links...\n`);

  const COL_STEP = 6;
  const COL_LEAGUE = 45;
  const COL_CURRENT = 65;
  const COL_SEASON = 70;
  const header =
    "Step".padEnd(COL_STEP) +
    "League".padEnd(COL_LEAGUE) +
    "Current Wikipedia".padEnd(COL_CURRENT) +
    `${SEASON} Link`.padEnd(COL_SEASON) +
    "Clubs".padEnd(6) +
    "Section".padEnd(35) +
    "First Club";
  console.log(header);
  console.log("─".repeat(COL_STEP + COL_LEAGUE + COL_CURRENT + COL_SEASON + 6 + 35 + 30));

  const csvRows: string[] = ["Step,League,CurrentWikipedia,SeasonLink,Clubs,Section,FirstClub"];

  // Cache fetched HTML by base URL; track used (baseUrl, sectionId) pairs
  const htmlCache = new Map<string, string>();
  const usedSections = new Map<string, Set<string>>(); // baseUrl → Set<sectionId>

  const claimSection = (baseUrl: string, sectionId: string) => {
    if (!usedSections.has(baseUrl)) usedSections.set(baseUrl, new Set());
    usedSections.get(baseUrl)!.add(sectionId);
  };

  for (const league of leagues) {
    const step = String(league.pyramidStep).padEnd(COL_STEP);
    const name = league.leagueName.slice(0, COL_LEAGUE - 1).padEnd(COL_LEAGUE);
    const currentUrl = wikiUrl(league.wikipedia);
    const current = currentUrl.slice(0, COL_CURRENT - 1).padEnd(COL_CURRENT);

    process.stdout.write(`${step}${name}${current}checking...`);

    let seasonLink: string;
    if (hasSeasonInTitle(league.wikipedia)) {
      seasonLink = currentUrl;
    } else {
      try {
        const candidateTitle = `${SEASON} ${league.wikipedia}`;
        if (await checkWikiPageExists(candidateTitle)) {
          seasonLink = wikiUrl(candidateTitle);
        } else {
          const html = await fetchWikipediaPageHtml(league.wikipedia);
          const link = findCurrentSeasonLink(html, SEASON_VARIANTS, league.wikipedia)
            ?? await rewritePreviousSeasonLink(html, league.wikipedia, SEASON);
          seasonLink = link ?? `(no ${SEASON} link found)`;
        }
      } catch (err) {
        seasonLink = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // Resolve redirect so seasonLink shows the final URL including any #fragment
    if (seasonLink.startsWith("http")) {
      try {
        const resolved = await resolveWikiUrl(seasonLink);
        // Reject the resolved URL if it no longer relates to this league's article
        const normalizedTitle = normalizeWikiTitle(league.wikipedia);
        if (decodeURIComponent(resolved).toLowerCase().includes(normalizedTitle)) {
          seasonLink = resolved;
        } else {
          console.warn(`[guard] rejected resolved URL for "${league.leagueName}": ${resolved}`);
          seasonLink = `(no ${SEASON} link found)`;
          // The rejected URL may have come from a stale redirect (e.g. a hyphen
          // title redirecting to an unrelated article). Retry via the article's
          // previous-season "Current:" link before giving up.
          const html = await fetchWikipediaPageHtml(league.wikipedia);
          const recovered = await rewritePreviousSeasonLink(html, league.wikipedia, SEASON);
          if (recovered) {
            const reResolved = await resolveWikiUrl(recovered);
            if (decodeURIComponent(reResolved).toLowerCase().includes(normalizedTitle)) {
              seasonLink = reResolved;
            }
          }
        }
      } catch { /* leave seasonLink as-is */ }
    }

    let clubsCol = "";
    let sectionCol = "";
    let firstClub = "";

    if (seasonLink.startsWith("http") && league.wikiPageSection) {
      try {
        let { base, fragment, cacheKey } = parseWikiUrl(seasonLink);

        if (!htmlCache.has(cacheKey)) {
          const html = await fetchWikipediaPageHtmlByUrl(base);
          htmlCache.set(cacheKey, html);
        }
        const html = htmlCache.get(cacheKey)!;
        const $ = cheerio.load(html);
        const claimed = usedSections.get(cacheKey) ?? new Set();

        // Find stadia sections scoped to the fragment (if any), excluding already-used ones
        const stadiaCandidates = findStadiaSections($, fragment, league.leagueName, claimed);

        let found = false;
        for (const id of stadiaCandidates) {
          const { count, first } = findClubsInSection(html, id);
          if (count > 0) {
            clubsCol = String(count);
            sectionCol = id;
            firstClub = first;
            claimSection(cacheKey, id);
            found = true;
            break;
          }
        }

        // Intermediate fallback: try division-name sections before the NLS-configured section
        if (!found) {
          const divisionCandidates = findLeagueDivisionSections($, league.leagueName, league.wikipedia, claimed);
          for (const id of divisionCandidates) {
            const { count, first } = findClubsInSection(html, id);
            if (count > 0) {
              clubsCol = String(count);
              sectionCol = id;
              firstClub = first;
              claimSection(cacheKey, id);
              found = true;
              break;
            }
          }
        }

        // Final fallback: configured section (if not already claimed)
        if (!found && !claimed.has(league.wikiPageSection)) {
          const { count, first } = findClubsInSection(html, league.wikiPageSection);
          if (count > 0) {
            clubsCol = String(count);
            sectionCol = league.wikiPageSection;
            firstClub = first;
            claimSection(cacheKey, league.wikiPageSection);
          } else {
            clubsCol = "0";
            sectionCol = "(not found)";
          }
        } else if (!found) {
          clubsCol = "0";
          sectionCol = "(not found)";
        }
      } catch {
        clubsCol = "error";
      }
    } else if (!league.wikiPageSection) {
      sectionCol = "(no section configured)";
    }

    process.stdout.write("\r");
    console.log(`${step}${name}${current}${seasonLink.padEnd(COL_SEASON)}${clubsCol.padEnd(6)}${sectionCol.padEnd(35)}${firstClub}`);

    csvRows.push([
      league.pyramidStep,
      league.leagueName,
      currentUrl,
      seasonLink,
      clubsCol,
      sectionCol,
      firstClub,
    ].map(csvField).join(","));
  }

  console.log("─".repeat(COL_STEP + COL_LEAGUE + COL_CURRENT + COL_SEASON + 6 + 35 + 30));

  writeFileSync(OUT_FILE, csvRows.join("\n"), "utf8");
  console.log(`\nOutput: ${OUT_FILE}`);
}

main().catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
