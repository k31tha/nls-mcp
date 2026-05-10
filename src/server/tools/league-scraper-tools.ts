import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { chromium } from "playwright";
import { z } from "zod";

export type ClubEntry = { name: string; url: string | null };

export async function scrapeClubs(
  pageUrl: string,
  selector: string,
  attribute: string,
): Promise<ClubEntry[]> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForSelector(selector);

    return await page.$$eval(
      selector,
      (els, attr) =>
        els.map((el) => ({
          name: (attr === "textContent" ? el.textContent : el.getAttribute(attr))?.trim() ?? "",
          url: el.tagName === "A" ? (el as HTMLAnchorElement).href : (el.querySelector("a")?.href ?? null),
        })),
      attribute,
    );
  } finally {
    await browser.close();
  }
}

export async function scrapeNationalLeague(url: string): Promise<ClubEntry[]> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, {
      waitUntil: "networkidle",
    });
    await page.waitForSelector(".content-card");

    return await page.$$eval(".content-card", (cards) =>
      cards
        .flatMap((card) => {
          if (card.tagName !== "A") return [];
          const href = (card as HTMLAnchorElement).getAttribute("href") ?? "";
          if (!href.startsWith("http")) return [];
          const name = card.querySelector("img")?.getAttribute("alt")?.trim() ?? "";
          if (!name) return [];
          return [{ name, url: href }];
        }),
    );
  } finally {
    await browser.close();
  }
}

export function registerLeagueScraperTools(server: McpServer): void {
  server.registerTool(
    "scrape_league_clubs",
    {
      description:
        "Scrape a list of clubs from a league's official website. The league page URL can be sourced from the websiteClubsPage field returned by search_pyramids. Returns { name, url }[] — url is auto-extracted when the matched element or its first child is an <a> tag.",
      inputSchema: {
        url: z.string().url().describe("The league website page URL to scrape"),
        selector: z.string().describe("CSS selector targeting each club element (e.g. 'h3.club-name', 'a.club-card')"),
        attribute: z
          .string()
          .optional()
          .default("textContent")
          .describe("Element property or attribute to use as the club name (default: textContent)"),
      },
    },
    async ({ url, selector, attribute }) => {
      try {
        const clubs = await scrapeClubs(url, selector, attribute);
        return { content: [{ type: "text", text: JSON.stringify(clubs) }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_national_league_clubs",
    {
      description:
        "Scrape the National League website and return all clubs as { name, url }[]. Pass the clubsPageUrl from the pyramid API payload.",
      inputSchema: {
        url: z.string().url().describe("The clubs page URL from the pyramid API payload (e.g. https://www.thenationalleague.org.uk/clubs/national)"),
      },
    },
    async ({ url }) => {
      try {
        const clubs = await scrapeNationalLeague(url);
        return { content: [{ type: "text", text: JSON.stringify({ url, clubs }) }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
