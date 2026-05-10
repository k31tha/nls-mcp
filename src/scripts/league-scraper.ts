import "dotenv/config";
import { writeFileSync } from "fs";
import { scrapeClubs, scrapeNationalLeague } from "../server/tools/league-scraper-tools.js";
import { chromium } from "playwright";

const METHODS = ["generic", "national-league"] as const;
type Method = (typeof METHODS)[number];

function parseArgs(argv: string[]): { method: Method; url?: string; selector?: string; attribute?: string; competition?: "national" | "north" | "south"; debug: boolean; dumpHtml: boolean } {
  const args = argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const method = get("--method") as Method | undefined;
  const debug = args.includes("--debug");
  const dumpHtml = args.includes("--dump-html");

  if (!method) bail("Missing required argument: --method <generic|national-league>");
  if (!METHODS.includes(method)) bail(`Unknown method "${method}". Must be one of: ${METHODS.join(", ")}`);
  if (method === "generic" && !get("--url")) bail("--url <url> is required for method \"generic\"");
  if (method === "generic" && !get("--selector")) bail("--selector <selector> is required for method \"generic\"");

  const competition = get("--competition") as "national" | "north" | "south" | undefined;
  if (competition && !["national", "north", "south"].includes(competition)) {
    bail(`Unknown competition "${competition}". Must be one of: national, north, south`);
  }

  return { method, url: get("--url"), selector: get("--selector"), attribute: get("--attribute"), competition, debug, dumpHtml };
}

function bail(message: string): never {
  console.error(`Error: ${message}`);
  console.error(`
Usage:
  tsx src/scripts/league-scraper.ts --method <method> [options]

Methods:
  generic         Scrape any league page (requires --url and --selector)
  national-league Scrape the National League website

Options:
  --url           Page URL to scrape                        (generic)
  --selector      CSS selector targeting each club element  (generic)
  --attribute     Element attribute to use as name          (generic, default: textContent)
  --competition   national | north | south                  (national-league, default: national)
  --debug         Enable debug logging
  --dump-html     Save the fully-rendered page HTML to league-scraper-dump.html instead of scraping

Examples:
  tsx src/scripts/league-scraper.ts --method national-league
  tsx src/scripts/league-scraper.ts --method national-league --competition north
  tsx src/scripts/league-scraper.ts --method generic --url "https://example.com/clubs" --selector "a.club-card"
  tsx src/scripts/league-scraper.ts --method generic --url "https://example.com/clubs" --selector "div.club" --attribute "data-name"
`);
  process.exit(1);
}

async function dumpPageHtml(pageUrl: string, outFile: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    const html = await page.content();
    writeFileSync(outFile, html, "utf8");
    console.log(`HTML saved to ${outFile}`);
  } finally {
    await browser.close();
  }
}

async function main() {
  const { method, url, selector, attribute, competition, debug, dumpHtml } = parseArgs(process.argv);
  if (debug) process.env.DEBUG = "1";

  if (dumpHtml) {
    const comp = competition ?? "national";
    const pageUrl = method === "national-league"
      ? `https://www.thenationalleague.org.uk/clubs/${comp}`
      : url!;
    await dumpPageHtml(pageUrl, "league-scraper-dump.html");
    return;
  }

  let result: unknown;

  switch (method) {
    case "generic":
      console.log(`Scraping: ${url}\nSelector: ${selector}${attribute ? `\nAttribute: ${attribute}` : ""}\n`);
      result = await scrapeClubs(url!, selector!, attribute ?? "textContent");
      break;
    case "national-league": {
      const comp = competition ?? "national";
      const nlUrl = `https://www.thenationalleague.org.uk/clubs/${comp}`;
      console.log(`Scraping National League — ${nlUrl}\n`);
      result = await scrapeNationalLeague(nlUrl);
      break;
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
