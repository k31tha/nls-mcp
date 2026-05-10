import "dotenv/config";
import { fetchJson } from "../lib/generic/fetch-json.js";
import { NLS_API } from "../lib/nls/config.js";
import { fetchWikipediaPageHtml, extractWikipediaSection } from "../lib/nls/wikipedia.js";
import { z } from "zod";

const PyramidClubSchema = z.object({
  Active: z.boolean().nullable(),
});

const PyramidLeagueSchema = z.object({
  pyramidId: z.number(),
  leagueName: z.string(),
  pyramidStep: z.number(),
  pyramidStepInactive: z.boolean(),
  wikipedia: z.string().nullable(),
  wikiPageSection: z.string().nullable(),
  clubs: z.array(PyramidClubSchema),
});

async function checkLeague(league: { wikipedia: string; wikiPageSection: string }): Promise<{ wikiClubs: number; first?: string; error?: string }> {
  try {
    const html = await fetchWikipediaPageHtml(league.wikipedia);
    const result = extractWikipediaSection(html, league.wikiPageSection);
    return { wikiClubs: result.clubs.length, first: result.clubs[0]?.name };
  } catch (err) {
    return { wikiClubs: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const debug = process.argv.includes("--debug");
  const onlyStale = process.argv.includes("--onlystale");
  if (debug) process.env.DEBUG = "1";

  console.log(`Fetching all pyramid leagues...\n`);
  const all = await fetchJson(`${NLS_API.v3}/PyramidApi/Pyramids`, undefined, z.array(PyramidLeagueSchema));

  const leagues = all.filter((l) => !l.pyramidStepInactive && l.wikipedia !== null && l.wikiPageSection !== null) as
    (typeof all[number] & { wikipedia: string; wikiPageSection: string })[];

  console.log(`Found ${all.length} total leagues, ${leagues.length} active with Wikipedia + section configured.\n`);

  if (onlyStale) {
    console.log(`${"Step".padEnd(6)}${"League".padEnd(45)}${"Wiki".padEnd(6)}${"Pyramid".padEnd(9)}Selector`);
  } else {
    console.log(`${"Step".padEnd(6)}${"League".padEnd(45)}${"Wiki".padEnd(6)}${"Pyramid".padEnd(9)}First Club`);
  }
  console.log("─".repeat(100));

  for (const league of leagues) {
    const pyramidClubs = league.clubs.filter((c) => c.Active === true).length;
    const { wikiClubs, first, error } = await checkLeague(league);
    const stale = error !== undefined || wikiClubs === 0;

    if (onlyStale && !stale) continue;

    const note = onlyStale
      ? league.wikiPageSection
      : error ? `ERROR: ${error}` : stale ? "⚠ selector may be stale" : (first ?? "");

    console.log(
      `${String(league.pyramidStep).padEnd(6)}${league.leagueName.slice(0, 44).padEnd(45)}${String(wikiClubs).padEnd(6)}${String(pyramidClubs).padEnd(9)}${note}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
