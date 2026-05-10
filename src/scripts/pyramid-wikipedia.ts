import "dotenv/config";
import * as cheerio from "cheerio";
import { fetchJson } from "../lib/generic/fetch-json.js";
import { NLS_API } from "../lib/nls/config.js";
import { fetchWikipediaPageHtml } from "../lib/nls/wikipedia.js";
import { z } from "zod";

const PyramidLeagueSchema = z.object({
  pyramidId: z.number(),
  leagueName: z.string(),
  pyramidStep: z.number(),
  pyramidStepInactive: z.boolean(),
  wikipedia: z.string().nullable(),
});

const SEASON = "2025-26";
// Wikipedia uses an en-dash; normalise both forms when matching
const SEASON_VARIANTS = [SEASON, SEASON.replace("-", "–26".slice(1))];

function wikiUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}`;
}

function hasSeasonInTitle(title: string): boolean {
  return SEASON_VARIANTS.some((v) => title.includes(v));
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

function findCurrentSeasonLink(html: string): string | null {
  const $ = cheerio.load(html);
  let found: string | null = null;

  $("a[href]").each((_, el) => {
    if (found) return false;
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().trim();
    const combined = href + " " + text;
    if (SEASON_VARIANTS.some((v) => combined.includes(v))) {
      found = href.startsWith("http") ? href : `https://en.wikipedia.org${href}`;
    }
  });

  return found;
}

async function main() {
  const args = process.argv.slice(2);
  const debug = args.includes("--debug");
  if (debug) process.env.DEBUG = "1";

  const all = await fetchJson(`${NLS_API.v3}/PyramidApi/Pyramids`, undefined, z.array(PyramidLeagueSchema));
  const leagues = all
    .filter((l) => !l.pyramidStepInactive && l.wikipedia !== null)
    .sort((a, b) => a.pyramidStep - b.pyramidStep || a.leagueName.localeCompare(b.leagueName)) as
    (typeof all[number] & { wikipedia: string })[];

  console.log(`${leagues.length} active leagues with Wikipedia configured. Checking for ${SEASON} links...\n`);

  const COL_STEP = 6;
  const COL_LEAGUE = 45;
  const COL_CURRENT = 65;
  const header =
    "Step".padEnd(COL_STEP) +
    "League".padEnd(COL_LEAGUE) +
    "Current Wikipedia".padEnd(COL_CURRENT) +
    "2025-26 Link";
  console.log(header);
  console.log("─".repeat(COL_STEP + COL_LEAGUE + COL_CURRENT + 70));

  for (const league of leagues) {
    const step = String(league.pyramidStep).padEnd(COL_STEP);
    const name = league.leagueName.slice(0, COL_LEAGUE - 1).padEnd(COL_LEAGUE);
    const currentUrl = wikiUrl(league.wikipedia);
    const current = currentUrl.slice(0, COL_CURRENT - 1).padEnd(COL_CURRENT);

    if (hasSeasonInTitle(league.wikipedia)) {
      console.log(`${step}${name}${current}(already ${SEASON})`);
      continue;
    }

    process.stdout.write(`${step}${name}${current}checking...`);

    let seasonLink: string;
    try {
      const candidateTitle = `${SEASON} ${league.wikipedia}`;
      if (await checkWikiPageExists(candidateTitle)) {
        seasonLink = wikiUrl(candidateTitle);
      } else {
        const html = await fetchWikipediaPageHtml(league.wikipedia);
        const link = findCurrentSeasonLink(html);
        seasonLink = link ?? "(no 2025-26 link found)";
      }
    } catch (err) {
      seasonLink = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }

    process.stdout.write("\r");
    console.log(`${step}${name}${current}${seasonLink}`);
  }

  console.log("─".repeat(COL_STEP + COL_LEAGUE + COL_CURRENT + 70));
}

main().catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
