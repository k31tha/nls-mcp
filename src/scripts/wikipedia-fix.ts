import "dotenv/config";
import { fetchJson } from "../lib/generic/fetch-json.js";
import { NLS_API } from "../lib/nls/config.js";
import { fetchWikipediaPageHtml } from "../lib/nls/wikipedia.js";
import { extractTextBySelector } from "../lib/generic/html-extract.js";
import { z } from "zod";

const PyramidLeagueSchema = z.object({
  pyramidId: z.number(),
  leagueName: z.string(),
  pyramidStep: z.number(),
  pyramidStepInactive: z.boolean(),
  wikipedia: z.string().nullable(),
  wikiPageSection: z.string().nullable(),
  clubs: z.array(z.object({ Active: z.boolean().nullable() })),
});

function replaceNthChild(selector: string, n: number): string {
  return selector.replace(/:nth-child\(\d+\)/, `:nth-child(${n})`);
}

function findCorrectNthChild(html: string, selector: string, minResults: number, max = 80): number | null {
  for (let n = 1; n <= max; n++) {
    const results = extractTextBySelector(html, replaceNthChild(selector, n)).filter(Boolean);
    if (results.length >= minResults) return n;
  }
  return null;
}

async function main() {
  const debug = process.argv.includes("--debug");
  if (debug) process.env.DEBUG = "1";

  console.log("Fetching all pyramid leagues...\n");
  const all = await fetchJson(`${NLS_API.v3}/PyramidApi/Pyramids`, undefined, z.array(PyramidLeagueSchema));

  const leagues = all.filter(
    (l): l is typeof l & { wikipedia: string; wikiPageSection: string } =>
      !l.pyramidStepInactive && l.wikipedia !== null && l.wikiPageSection !== null,
  );

  console.log(`${"Step".padEnd(6)}${"League".padEnd(45)}Result`);
  console.log("─".repeat(100));

  for (const league of leagues) {
    const pyramidClubs = league.clubs.filter((c) => c.Active === true).length;
    process.stdout.write(`${String(league.pyramidStep).padEnd(6)}${league.leagueName.slice(0, 44).padEnd(45)}`);

    try {
      const html = await fetchWikipediaPageHtml(league.wikipedia);
      const current = extractTextBySelector(html, league.wikiPageSection).filter(Boolean);

      if (current.length >= 5) {
        console.log(`OK (${current.length} clubs)`);
        continue;
      }

      const minResults = Math.max(5, Math.floor(pyramidClubs * 0.5));
      const n = findCorrectNthChild(html, league.wikiPageSection, minResults);

      if (n === null) {
        console.log(`⚠ Could not auto-fix`);
      } else {
        const fixed = replaceNthChild(league.wikiPageSection, n);
        const count = extractTextBySelector(html, fixed).filter(Boolean).length;
        console.log(`FIXED (${count} clubs) → ${fixed}`);
      }
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
