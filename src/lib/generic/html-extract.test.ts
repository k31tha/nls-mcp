import { describe, it, expect } from "vitest";
import { extractTextBySelector, extractWikipediaSection, extractClubWebsiteFromWikiPage, extractClubLeagueFromWikiPage } from "./html-extract.js";

describe("extractTextBySelector", () => {
  const html = `
    <table>
      <tbody>
        <tr><td><a href="/wiki/FC_Halifax_Town">FC Halifax Town</a></td></tr>
        <tr><td><a href="/wiki/Wrexham_AFC">Wrexham AFC</a></td></tr>
        <tr><td><a href="/wiki/Altrincham_FC">Altrincham FC</a></td></tr>
      </tbody>
    </table>
  `;

  it("returns text from all elements matching the selector", () => {
    const result = extractTextBySelector(html, "tbody tr td a");

    expect(result).toEqual(["FC Halifax Town", "Wrexham AFC", "Altrincham FC"]);
  });

  it("returns a single match when selector targets one element", () => {
    const result = extractTextBySelector(html, "tbody tr:first-child td a");

    expect(result).toEqual(["FC Halifax Town"]);
  });

  it("returns an empty array when no elements match", () => {
    const result = extractTextBySelector(html, "tbody tr td span");

    expect(result).toEqual([]);
  });

  it("trims whitespace from extracted text", () => {
    const spacedHtml = "<div>  padded text  </div>";

    const result = extractTextBySelector(spacedHtml, "div");

    expect(result).toEqual(["padded text"]);
  });

  it("excludes elements with no text content", () => {
    const mixedHtml = `
      <ul>
        <li><a>Solihull Moors</a></li>
        <li><a></a></li>
        <li><a>Eastleigh FC</a></li>
      </ul>
    `;

    const result = extractTextBySelector(mixedHtml, "li a");

    expect(result).toEqual(["Solihull Moors", "Eastleigh FC"]);
  });

  it("handles nth-child selectors", () => {
    const result = extractTextBySelector(html, "tbody tr:nth-child(n+2) td a");

    expect(result).toEqual(["Wrexham AFC", "Altrincham FC"]);
  });
});

// ── extractWikipediaSection ───────────────────────────────────────────────────

const flatSectionHtml = `
  <html><body>
    <h2 id="Clubs">Clubs</h2>
    <table><tbody>
      <tr><td><a href="/wiki/FC_Halifax_Town">FC Halifax Town</a></td><td>Halifax</td></tr>
      <tr><td><a href="/wiki/Wrexham_AFC">Wrexham AFC</a></td><td>Wrexham</td></tr>
    </tbody></table>
    <p>Two clubs compete.</p>
    <h2 id="History">History</h2>
    <p>Founded in 1890.</p>
  </body></html>
`;

const mwHeadingHtml = `
  <html><body>
    <div class="mw-heading mw-heading2"><h2 id="Clubs">Clubs</h2></div>
    <table><tbody>
      <tr><td><a href="/wiki/FC_Halifax_Town">FC Halifax Town</a></td></tr>
    </tbody></table>
    <div class="mw-heading mw-heading2"><h2 id="History">History</h2></div>
    <p>Should not appear.</p>
  </body></html>
`;

const sectionWrappedHtml = `
  <html><body>
    <section>
      <h2 id="Clubs">Clubs</h2>
      <table><tbody>
        <tr><td><a href="/wiki/FC_Halifax_Town">FC Halifax Town</a></td></tr>
      </tbody></table>
    </section>
    <section>
      <h2 id="History">History</h2>
      <p>Should not appear.</p>
    </section>
  </body></html>
`;

describe("extractWikipediaSection — section ID mode", () => {
  it("returns clubs from a table in a flat-structure section", () => {
    const { clubs } = extractWikipediaSection(flatSectionHtml, "Clubs");

    expect(clubs).toHaveLength(2);
    expect(clubs[0]).toEqual({ name: "FC Halifax Town", url: "https://en.wikipedia.org/wiki/FC_Halifax_Town" });
    expect(clubs[1]).toEqual({ name: "Wrexham AFC", url: "https://en.wikipedia.org/wiki/Wrexham_AFC" });
  });

  it("resolves relative wiki hrefs to absolute URLs", () => {
    const { clubs } = extractWikipediaSection(flatSectionHtml, "Clubs");

    expect(clubs[0].url).toMatch(/^https:\/\/en\.wikipedia\.org/);
  });

  it("returns empty result when section ID is not found", () => {
    const result = extractWikipediaSection(flatSectionHtml, "Nonexistent_Section");

    expect(result.clubs).toHaveLength(0);
    expect(result.paragraphs).toHaveLength(0);
  });

  it("accepts section IDs with underscores as used in Wikipedia heading ids", () => {
    const html = `<html><body><h2 id="Current_clubs">Current clubs</h2><table><tbody><tr><td><a href="/wiki/FC_Halifax_Town">FC Halifax Town</a></td></tr></tbody></table></body></html>`;
    const { clubs } = extractWikipediaSection(html, "Current_clubs");

    expect(clubs).toHaveLength(1);
  });

  it("stops collecting nodes at the next same-level heading", () => {
    const { paragraphs } = extractWikipediaSection(flatSectionHtml, "Clubs");

    expect(paragraphs).toContain("Two clubs compete.");
    expect(paragraphs).not.toContain("Founded in 1890.");
  });

  it("extracts clubs when heading is wrapped in a mw-heading div", () => {
    const { clubs } = extractWikipediaSection(mwHeadingHtml, "Clubs");

    expect(clubs).toHaveLength(1);
    expect(clubs[0].name).toBe("FC Halifax Town");
  });

  it("stops at next mw-heading div of the same level", () => {
    const { paragraphs } = extractWikipediaSection(mwHeadingHtml, "Clubs");

    expect(paragraphs).not.toContain("Should not appear.");
  });

  it("extracts clubs from a section-wrapped Wikipedia structure", () => {
    const { clubs } = extractWikipediaSection(sectionWrappedHtml, "Clubs");

    expect(clubs).toHaveLength(1);
    expect(clubs[0].name).toBe("FC Halifax Town");
  });

  it("extracts paragraphs from p elements in the section", () => {
    const { paragraphs } = extractWikipediaSection(flatSectionHtml, "Clubs");

    expect(paragraphs).toContain("Two clubs compete.");
  });

  it("extracts tableRows with all cell text", () => {
    const { tableRows } = extractWikipediaSection(flatSectionHtml, "Clubs");

    expect(tableRows[0]).toContain("Halifax");
  });
});

describe("extractWikipediaSection — CSS selector mode", () => {
  const selectorHtml = `
    <html><body>
      <ul>
        <li><a href="/wiki/FC_Halifax_Town">FC Halifax Town</a></li>
        <li><a href="/wiki/Wrexham_AFC">Wrexham AFC</a></li>
        <li>No link club</li>
      </ul>
    </body></html>
  `;

  it("detects a CSS selector and returns matching anchors", () => {
    const { clubs } = extractWikipediaSection(selectorHtml, "ul li a");

    expect(clubs).toHaveLength(2);
    expect(clubs[0].name).toBe("FC Halifax Town");
  });

  it("widens a trailing '> a' to capture entries without links", () => {
    const { clubs } = extractWikipediaSection(selectorHtml, "ul li > a");

    // All three li items are captured via the widened selector
    expect(clubs.some((c) => c.name === "No link club")).toBe(true);
  });

  it("returns empty clubs for a non-matching selector", () => {
    const { clubs } = extractWikipediaSection(selectorHtml, "ul li span");

    expect(clubs).toHaveLength(0);
  });
});

// ── extractClubWebsiteFromWikiPage ────────────────────────────────────────────

describe("extractClubWebsiteFromWikiPage", () => {
  it("returns the website URL from the infobox Website row", () => {
    const html = `
      <table class="infobox"><tbody>
        <tr><th>Founded</th><td>1919</td></tr>
        <tr><th>Website</th><td><a href="https://www.fchalifaxtown.com">www.fchalifaxtown.com</a></td></tr>
      </tbody></table>
    `;

    expect(extractClubWebsiteFromWikiPage(html)).toBe("https://www.fchalifaxtown.com");
  });

  it("falls back to the official website link in the External links section", () => {
    const html = `
      <html><body>
        <h2 id="External_links">External links</h2>
        <ul><li><a href="https://www.fchalifaxtown.com">Official website</a></li></ul>
      </body></html>
    `;

    expect(extractClubWebsiteFromWikiPage(html)).toBe("https://www.fchalifaxtown.com");
  });

  it("returns null when no website is found", () => {
    const html = `<table class="infobox"><tbody><tr><th>Founded</th><td>1919</td></tr></tbody></table>`;

    expect(extractClubWebsiteFromWikiPage(html)).toBeNull();
  });

  it("ignores infobox website links that are not absolute URLs", () => {
    const html = `
      <table class="infobox"><tbody>
        <tr><th>Website</th><td><a href="/relative/path">site</a></td></tr>
      </tbody></table>
    `;

    expect(extractClubWebsiteFromWikiPage(html)).toBeNull();
  });
});

// ── extractClubLeagueFromWikiPage ─────────────────────────────────────────────

describe("extractClubLeagueFromWikiPage", () => {
  it("returns the league name and URL from the infobox League row", () => {
    const html = `
      <table class="infobox"><tbody>
        <tr><th>League</th><td><a href="/wiki/National_League_(England)">National League</a></td></tr>
      </tbody></table>
    `;

    const result = extractClubLeagueFromWikiPage(html);

    expect(result).toEqual({
      name: "National League",
      url: "https://en.wikipedia.org/wiki/National_League_(England)",
    });
  });

  it("returns null when no League row is present", () => {
    const html = `
      <table class="infobox"><tbody>
        <tr><th>Founded</th><td>1919</td></tr>
      </tbody></table>
    `;

    expect(extractClubLeagueFromWikiPage(html)).toBeNull();
  });

  it("returns null when League row has no anchor", () => {
    const html = `
      <table class="infobox"><tbody>
        <tr><th>League</th><td>National League</td></tr>
      </tbody></table>
    `;

    expect(extractClubLeagueFromWikiPage(html)).toBeNull();
  });
});
