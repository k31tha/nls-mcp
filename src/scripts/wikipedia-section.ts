import "dotenv/config";
import { fetchJson } from "../lib/generic/fetch-json.js";
import { NLS_API } from "../lib/nls/config.js";
import { fetchWikipediaPageHtml, extractWikipediaSection } from "../lib/nls/wikipedia.js";
import { z } from "zod";

const PyramidLeagueClubSchema = z.object({
  pyramidId: z.number(),
  leagueName: z.string(),
  wikipedia: z.string(),
  wikiPageSection: z.string(),
});

function parseArgs(argv: string[]): { pyramidId?: number; leagueName?: string; overrideSelector?: string; debug: boolean } {
  const args = argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const pyramidIdRaw = get("--pyramid-id");
  const debug = args.includes("--debug");

  if (!get("--pyramid-id") && !get("--league-name")) bail("Provide --pyramid-id or --league-name");

  return {
    pyramidId: pyramidIdRaw !== undefined ? Number(pyramidIdRaw) : undefined,
    leagueName: get("--league-name"),
    overrideSelector: get("--selector"),
    debug,
  };
}

function bail(message: string): never {
  console.error(`Error: ${message}`);
  console.error(`
Usage:
  tsx src/scripts/wikipedia-section.ts --pyramid-id <id> | --league-name <name> [--debug]

Options:
  --pyramid-id    Look up by pyramid ID
  --league-name   Look up by league name
  --selector      Override the wikiPageSection selector from the pyramid record
  --debug         Enable debug logging

Examples:
  tsx src/scripts/wikipedia-section.ts --league-name "National League"
  tsx src/scripts/wikipedia-section.ts --pyramid-id 1
  tsx src/scripts/wikipedia-section.ts --league-name "National League" --selector "#mw-content-text > div.mw-content-ltr.mw-parser-output > table:nth-child(39) > tbody > tr:nth-child(n+2) > td:nth-child(1) > a"
  tsx src/scripts/wikipedia-section.ts --league-name "Northern Premier League" --debug
`);
  process.exit(1);
}

async function main() {
  const { pyramidId, leagueName, overrideSelector, debug } = parseArgs(process.argv);
  if (debug) process.env.DEBUG = "1";

  const params = new URLSearchParams();
  if (pyramidId !== undefined) params.append("pyramidId", String(pyramidId));
  if (leagueName !== undefined) params.append("leagueName", leagueName);

  const qs = params.toString();
  const url = `${NLS_API.v3}/PyramidApi/Pyramids${qs ? `?${qs}` : ""}`;

  console.log(`Fetching pyramid: ${url}\n`);
  const leagues = await fetchJson(url, undefined, z.array(PyramidLeagueClubSchema));

  if (!leagues.length) {
    console.log("No matching pyramid league found.");
    return;
  }

  const league = leagues[0];
  const selector = overrideSelector ?? league.wikiPageSection;

  console.log(`League:          ${league.leagueName}`);
  console.log(`Wikipedia:       ${league.wikipedia}`);
  console.log(`Section:         ${selector}${overrideSelector ? " (overridden)" : ""}\n`);

  const html = await fetchWikipediaPageHtml(league.wikipedia);
  const result = extractWikipediaSection(html, selector);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
