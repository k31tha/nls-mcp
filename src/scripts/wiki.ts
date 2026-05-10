import "dotenv/config";
import { getWikiPage, createWikiPage, updateWikiPage, getOrCreateWikiPage } from "../lib/nls/wiki.js";

const METHODS = ["get", "create", "update", "getOrCreate"] as const;
type Method = (typeof METHODS)[number];

function parseArgs(argv: string[]): { name: string; method: Method; refresh: boolean; debug: boolean; content?: string; wikipediaName?: string } {
  const args = argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const name = get("--name");
  const method = get("--method") as Method | undefined;
  const content = get("--content");
  const wikipediaName = get("--wikipedia-name");
  const refresh = args.includes("--refresh");
  const debug = args.includes("--debug");

  if (!name) bail('Missing required argument: --name <page-name>');
  if (!method) bail('Missing required argument: --method <get|create|update|getOrCreate>');
  if (!METHODS.includes(method)) bail(`Unknown method "${method}". Must be one of: ${METHODS.join(", ")}`);
  if ((method === "create" || method === "update") && !content) bail(`--content <text> is required for method "${method}"`);
  if (method === "getOrCreate" && !wikipediaName) bail('--wikipedia-name <title> is required for method "getOrCreate"');

  return { name, method, refresh, debug, content, wikipediaName };
}

function bail(message: string): never {
  console.error(`Error: ${message}`);
  console.error(`
Usage:
  tsx src/scripts/wiki.ts --name <page-name> --method <method> [--refresh] [--content <text>] [--wikipedia-name <title>]

Methods:
  get           Get an NLS wiki page (returns null if not found)
  create        Create an NLS wiki page  (requires --content)
  update        Update an NLS wiki page  (requires --content)
  getOrCreate   Get page, create from Wikipedia if missing, update if --refresh

Options:
  --wikipedia-name  Wikipedia article title to use instead of --name (e.g. "FC Halifax Town" vs "fc-halifax-town")

Examples:
  tsx src/scripts/wiki.ts --name fc-halifax-town --method get
  tsx src/scripts/wiki.ts --name fc-halifax-town --method getOrCreate --wikipedia-name "FC Halifax Town"
  tsx src/scripts/wiki.ts --name fc-halifax-town --method getOrCreate --wikipedia-name "FC Halifax Town" --refresh
  tsx src/scripts/wiki.ts --name fc-halifax-town --method create --content "FC Halifax Town wiki content"
  tsx src/scripts/wiki.ts --name fc-halifax-town --method update --content "Updated content"
`);
  process.exit(1);
}

async function main() {
  const { name, method, refresh, debug, content, wikipediaName } = parseArgs(process.argv);
  if (debug) process.env.DEBUG = "1";

  console.log(`Running: ${method}("${name}"${method === "getOrCreate" ? `, { refresh: ${refresh}${wikipediaName ? `, wikipediaName: "${wikipediaName}"` : ""} }` : ""})\n`);

  let result: unknown;

  switch (method) {
    case "get":
      result = await getWikiPage(name);
      break;
    case "create":
      result = await createWikiPage(name, content!);
      break;
    case "update":
      result = await updateWikiPage(name, content!);
      break;
    case "getOrCreate":
      result = await getOrCreateWikiPage(name, wikipediaName!, { refresh });
      break;
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
