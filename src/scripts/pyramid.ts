import "dotenv/config";
import { fetchJson } from "../lib/generic/fetch-json.js";
import { NLS_API } from "../lib/nls/config.js";

function parseArgs(argv: string[]): { pyramidId?: number; leagueName?: string; leagueUrl?: string; pyramidStep?: number; wikipedia?: string; debug: boolean } {
  const args = argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const pyramidIdRaw = get("--pyramid-id");
  const pyramidStepRaw = get("--pyramid-step");
  const debug = args.includes("--debug");

  return {
    pyramidId: pyramidIdRaw !== undefined ? Number(pyramidIdRaw) : undefined,
    leagueName: get("--league-name"),
    leagueUrl: get("--league-url"),
    pyramidStep: pyramidStepRaw !== undefined ? Number(pyramidStepRaw) : undefined,
    wikipedia: get("--wikipedia"),
    debug,
  };
}

function bail(message: string): never {
  console.error(`Error: ${message}`);
  console.error(`
Usage:
  tsx src/scripts/pyramid.ts [--pyramid-id <id>] [--league-name <name>] [--league-url <url>] [--pyramid-step <step>] [--wikipedia <title>] [--debug]

Options (all optional — omit all to return the full pyramid list):
  --pyramid-id    Filter by pyramid ID
  --league-name   Filter by league name
  --league-url    Filter by league URL slug
  --pyramid-step  Filter by pyramid step level
  --wikipedia     Filter by Wikipedia article name

Examples:
  tsx src/scripts/pyramid.ts
  tsx src/scripts/pyramid.ts --pyramid-step 4
  tsx src/scripts/pyramid.ts --league-name "Northern Premier League"
  tsx src/scripts/pyramid.ts --pyramid-step 6 --wikipedia "Northern Counties East Football League"
`);
  process.exit(1);
}

async function main() {
  const { pyramidId, leagueName, leagueUrl, pyramidStep, wikipedia, debug } = parseArgs(process.argv);
  if (debug) process.env.DEBUG = "1";

  const params = new URLSearchParams();
  if (pyramidId !== undefined) params.append("pyramidId", String(pyramidId));
  if (leagueName !== undefined) params.append("leagueName", leagueName);
  if (leagueUrl !== undefined) params.append("leagueUrl", leagueUrl);
  if (pyramidStep !== undefined) params.append("pyramidStep", String(pyramidStep));
  if (wikipedia !== undefined) params.append("wikipedia", wikipedia);

  const qs = params.toString();
  const url = `${NLS_API.v3}/PyramidApi/Pyramids${qs ? `?${qs}` : ""}`;

  console.log(`Fetching: ${url}\n`);

  const result = await fetchJson(url);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
