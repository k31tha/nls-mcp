import * as cheerio from "cheerio";

export function extractTextBySelector(html: string, selector: string): string[] {
  const $ = cheerio.load(html);
  const results: string[] = [];
  $(selector).each((_, el) => {
    const text = $(el).text().trim();
    if (text) results.push(text);
  });
  return results;
}

const WIKIPEDIA_ORIGIN = "https://en.wikipedia.org";

function resolveWikiHref(href: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return `${WIKIPEDIA_ORIGIN}${href}`;
  return href;
}

export type WikipediaLink = { name: string; url: string };

export type WikipediaSectionResult = {
  clubs: WikipediaLink[];
  paragraphs: string[];
  tableRows: string[][];
};

function isCssSelector(value: string): boolean {
  return /[\s>.\[:]/.test(value);
}

export function extractWikipediaSection(html: string, sectionId: string): WikipediaSectionResult {
  if (isCssSelector(sectionId)) {
    const $ = cheerio.load(html);
    const clubs: WikipediaLink[] = [];

    // Strip a trailing "> a" and select the parent cell/item instead, so that
    // entries with no Wikipedia link are still captured (url will be "").
    const stripped = sectionId.replace(/\s*>\s*a\s*$/, "");
    const isWidened = stripped !== sectionId;

    try {
      $(isWidened ? stripped : sectionId).each((_, el) => {
        const $el = $(el);
        if (isWidened) {
          const $link = $el.find("a").first();
          const name = $el.text().trim();
          const href = $link.attr("href") ?? "";
          if (name) clubs.push({ name, url: resolveWikiHref(href) });
        } else {
          const href = $el.attr("href") ?? "";
          const $parent = $el.parent();
          const name = ($parent.is("li") ? $parent.text() : $el.text()).trim();
          if (name) clubs.push({ name, url: resolveWikiHref(href) });
        }
      });
    } catch {
      // invalid CSS selector — return empty
    }
    return { clubs, paragraphs: [], tableRows: [] };
  }
  const $ = cheerio.load(html);

  const normalizedId = sectionId.replace(/ /g, "_");
  const heading = $(`[id="${normalizedId}"]`).first();
  if (!heading.length) return { clubs: [], paragraphs: [], tableRows: [] };

  // If wrapped in a <section>, use that scope; otherwise walk siblings on the flat Wikipedia page structure
  const enclosingSection = heading.closest("section");
  let nodes: ReturnType<typeof $>[] = [];

  if (enclosingSection.length) {
    enclosingSection.children().each((_, el) => { nodes.push($(el)); });
  } else {
    const headingEl = heading.closest("h1, h2, h3, h4, h5, h6");
    const headingTag = (headingEl.prop("tagName") ?? "h2").toLowerCase();
    // New Wikipedia wraps headings in <div class="mw-heading mw-headingN">; walk from that wrapper if present
    const wrapper = headingEl.closest("div.mw-heading");
    let sibling = (wrapper.length ? wrapper : headingEl).next();
    while (sibling.length) {
      const tag = (sibling.prop("tagName") ?? "").toLowerCase();
      // Stop at next same-or-higher heading (direct or inside a mw-heading wrapper)
      if (/^h[1-6]$/.test(tag) && tag <= headingTag) break;
      if (tag === "div" && sibling.hasClass("mw-heading")) {
        const innerTag = (sibling.find("h1,h2,h3,h4,h5,h6").first().prop("tagName") ?? "").toLowerCase();
        if (innerTag && innerTag <= headingTag) break;
      }
      nodes.push(sibling);
      sibling = sibling.next();
    }
  }

  const clubs: WikipediaLink[] = [];
  const paragraphs: string[] = [];
  const tableRows: string[][] = [];

  for (const node of nodes) {
    const pEls = node.is("p") ? [node.get(0)!, ...node.find("p").toArray()] : node.find("p").toArray();
    for (const el of pEls) {
      const text = $(el).text().trim();
      if (text) paragraphs.push(text);
    }
    // Extract clubs from the first column of tables (club name links)
    node.find("table tr").each((_, row) => {
      const cells: string[] = [];
      $(row).find("th, td").each((_, cell) => {
        const text = $(cell).text().trim();
        if (text) cells.push(text);
      });
      if (cells.length) tableRows.push(cells);
      // Use the first <td> that contains a link — the club cell regardless of
      // whether the table has a leading position-number column.
      const clubCell = $(row).find("td, th").filter((_, cell) => $(cell).find("a").length > 0).first();
      if (!clubCell.length) return;
      const anchor = clubCell.find("a").first();
      const name = clubCell.text().trim();
      const href = anchor.attr("href") ?? "";
      if (name) clubs.push({ name, url: resolveWikiHref(href) });
    });
  }

  return { clubs, paragraphs, tableRows };
}

export function extractClubWebsiteFromWikiPage(html: string): string | null {
  const $ = cheerio.load(html);

  // 1. Infobox "Website" row
  let result: string | null = null;
  $("table.infobox tr").each((_, row) => {
    const $row = $(row);
    if ($row.find("th").text().trim().toLowerCase() === "website") {
      const href = $row.find("td a").first().attr("href");
      if (href?.startsWith("http")) {
        result = href;
        return false;
      }
    }
  });
  if (result) return result;

  // 2. External links section — anchor whose text contains "official website"
  const heading = $("[id='External_links'], [id='External_links_2']").first();
  if (!heading.length) return null;

  const headingEl = heading.closest("h1,h2,h3,h4,h5,h6");
  const wrapper = headingEl.closest("div.mw-heading");
  let sibling = (wrapper.length ? wrapper : headingEl).next();
  while (sibling.length) {
    const tag = (sibling.prop("tagName") ?? "").toLowerCase();
    if (/^h[1-6]$/.test(tag)) break;
    if (tag === "div" && sibling.hasClass("mw-heading")) break;
    sibling.find("a[href]").each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (text.includes("official website")) {
        const href = $(el).attr("href");
        if (href?.startsWith("http")) {
          result = href;
          return false;
        }
      }
    });
    if (result) break;
    sibling = sibling.next();
  }

  return result;
}

export function extractClubLeagueFromWikiPage(html: string): WikipediaLink | null {
  const $ = cheerio.load(html);
  let result: WikipediaLink | null = null;
  $("table.infobox tr").each((_, row) => {
    const $row = $(row);
    const headerText = $row.find("th").text().trim().toLowerCase();
    if (headerText === "league") {
      const $link = $row.find("td a").first();
      const name = $link.text().trim();
      const href = $link.attr("href") ?? "";
      if (name && href) {
        result = { name, url: resolveWikiHref(href) };
        return false; // break
      }
    }
  });
  return result;
}
