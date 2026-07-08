import { describe, it, expect } from "vitest";
import * as cheerio from "cheerio";
import {
  parseArgs,
  findCurrentSeasonLink,
  resolveHref,
  findLeagueDivisionSections,
  previousSeasonVariants,
  rewriteSeasonInUrl,
  rewritePreviousSeasonLink,
} from "./pyramid-wikipedia.js";

// Minimal fixture mimicking the 2026-27 Combined Counties Football League page:
// three division headings each followed by a simple club table.
const combinedCountiesHtml = `
  <html><body>
    <h2 id="Premier_Division_North">Premier Division North</h2>
    <table><tbody>
      <tr><td><a href="/wiki/Club_A">Club A</a></td></tr>
      <tr><td><a href="/wiki/Club_B">Club B</a></td></tr>
    </tbody></table>
    <h2 id="Premier_Division_South">Premier Division South</h2>
    <table><tbody>
      <tr><td><a href="/wiki/Club_C">Club C</a></td></tr>
      <tr><td><a href="/wiki/Club_D">Club D</a></td></tr>
    </tbody></table>
    <h2 id="Division_One">Division One</h2>
    <table><tbody>
      <tr><td><a href="/wiki/Club_E">Club E</a></td></tr>
      <tr><td><a href="/wiki/Club_F">Club F</a></td></tr>
    </tbody></table>
    <h2 id="History">History</h2>
    <p>Some history text.</p>
  </body></html>
`;

describe("findLeagueDivisionSections", () => {
  const wikiTitle = "Combined_Counties_Football_League";

  it("returns Premier_Division_North for the Premier Division North league", () => {
    const $ = cheerio.load(combinedCountiesHtml);
    const result = findLeagueDivisionSections($, "Combined Counties Football League Premier Division North", wikiTitle, new Set());
    expect(result[0]).toBe("Premier_Division_North");
  });

  it("returns Premier_Division_South for the Premier Division South league", () => {
    const $ = cheerio.load(combinedCountiesHtml);
    const result = findLeagueDivisionSections($, "Combined Counties Football League Premier Division South", wikiTitle, new Set());
    expect(result[0]).toBe("Premier_Division_South");
  });

  it("returns Division_One for the Division One league", () => {
    const $ = cheerio.load(combinedCountiesHtml);
    // Claim the Premier sections to simulate them having been used already
    const claimed = new Set(["Premier_Division_North", "Premier_Division_South"]);
    const result = findLeagueDivisionSections($, "Combined Counties Football League Division One", wikiTitle, claimed);
    expect(result[0]).toBe("Division_One");
  });

  it("excludes already-claimed sections from results", () => {
    const $ = cheerio.load(combinedCountiesHtml);
    const claimed = new Set(["Premier_Division_North"]);
    const result = findLeagueDivisionSections($, "Combined Counties Football League Premier Division North", wikiTitle, claimed);
    expect(result).not.toContain("Premier_Division_North");
  });

  it("does not return unrelated headings like History", () => {
    const $ = cheerio.load(combinedCountiesHtml);
    const result = findLeagueDivisionSections($, "Combined Counties Football League Premier Division North", wikiTitle, new Set());
    expect(result).not.toContain("History");
  });
});

describe("resolveHref", () => {
  it("returns an absolute http URL unchanged", () => {
    expect(resolveHref("https://en.wikipedia.org/wiki/Foo")).toBe("https://en.wikipedia.org/wiki/Foo");
  });

  it("prepends https: to a protocol-relative URL", () => {
    expect(resolveHref("//en.wikipedia.org/wiki/Foo")).toBe("https://en.wikipedia.org/wiki/Foo");
  });

  it("prepends https://en.wikipedia.org to a root-relative path", () => {
    expect(resolveHref("/wiki/Foo")).toBe("https://en.wikipedia.org/wiki/Foo");
  });
});

describe("parseArgs", () => {
  it("defaults season to 2025-26 when --season is absent", () => {
    expect(parseArgs([])).toMatchObject({ season: "2025-26" });
  });

  it("returns the supplied season when --season is provided", () => {
    expect(parseArgs(["--season", "2026-27"])).toMatchObject({ season: "2026-27" });
  });

  it("defaults season to 2025-26 when --season has no following value", () => {
    expect(parseArgs(["--season"])).toMatchObject({ season: "2025-26" });
  });

  it("sets debug to false when --debug is absent", () => {
    expect(parseArgs([])).toMatchObject({ debug: false });
  });

  it("sets debug to true when --debug is present", () => {
    expect(parseArgs(["--debug"])).toMatchObject({ debug: true });
  });

  it("handles --debug and --season together", () => {
    expect(parseArgs(["--debug", "--season", "2026-27"])).toEqual({ season: "2026-27", debug: true });
  });

  it("handles --season before --debug", () => {
    expect(parseArgs(["--season", "2026-27", "--debug"])).toEqual({ season: "2026-27", debug: true });
  });
});

// Minimal Wikipedia infobox HTML fixture
const infoboxWith = (currentText: string) => `
  <table class="infobox">
    <tbody>
      <tr><td class="infobox-full-data">Current: <a href="/wiki/${currentText.replace(/ /g, "_")}">${currentText}</a></td></tr>
    </tbody>
  </table>
`;

const pageWithLink = (linkText: string, href: string) =>
  `<html><body><a href="${href}">${linkText}</a></body></html>`;

describe("findCurrentSeasonLink", () => {
  it("returns the infobox Current link when it matches the season", () => {
    const html = infoboxWith("2025-26 National League");
    expect(findCurrentSeasonLink(html, ["2025-26", "2025–26"])).toContain("2025-26_National_League");
  });

  it("does not return the infobox Current link when it belongs to a different season", () => {
    const html = infoboxWith("2025-26 National League");
    // Requesting 2026-27 — infobox still shows 2025-26, should not be returned
    expect(findCurrentSeasonLink(html, ["2026-27", "2026–27"])).toBeNull();
  });

  it("falls through to general link scan when infobox does not match the season", () => {
    const infobox = infoboxWith("2025-26 National League");
    const bodyLink = `<a href="/wiki/2026-27_National_League">2026-27 National League</a>`;
    const html = infobox + bodyLink;
    expect(findCurrentSeasonLink(html, ["2026-27", "2026–27"])).toContain("2026-27_National_League");
  });

  it("returns null when no link matches the season anywhere on the page", () => {
    const html = infoboxWith("2025-26 National League");
    expect(findCurrentSeasonLink(html, ["2026-27", "2026–27"])).toBeNull();
  });

  it("matches en-dash season variant in the general scan", () => {
    const html = pageWithLink("2026–27 National League", "/wiki/2026%E2%80%9327_National_League");
    expect(findCurrentSeasonLink(html, ["2026-27", "2026–27"])).not.toBeNull();
  });

  it("rejects a fallback link whose href does not contain the wikiTitle (underscored)", () => {
    // Simulates the rugby false-positive: page links to "2026–27 National League 2 North"
    // but we are looking for the football "National_League_North" article
    const html = pageWithLink("2026–27 National League 2 North", "/wiki/2026%E2%80%9327_National_League_2_North");
    expect(findCurrentSeasonLink(html, ["2026-27", "2026–27"], "National_League_North")).toBeNull();
  });

  it("rejects a fallback link whose href does not contain the wikiTitle (spaced)", () => {
    // Same rugby false-positive but wikiTitle provided with spaces (as NLS API may return it)
    const html = pageWithLink("2026–27 National League 2 North", "/wiki/2026%E2%80%9327_National_League_2_North");
    expect(findCurrentSeasonLink(html, ["2026-27", "2026–27"], "National League North")).toBeNull();
  });

  it("accepts a fallback link whose href contains the wikiTitle (spaced)", () => {
    // wikiTitle with spaces should still match an underscored href
    const html = pageWithLink("2026–27 National League North", "/wiki/2026%E2%80%9327_National_League_North");
    expect(findCurrentSeasonLink(html, ["2026-27", "2026–27"], "National League North")).toContain("National_League_North");
  });

  it("accepts a fallback link whose href contains the wikiTitle (underscored)", () => {
    const html = pageWithLink("2026–27 National League North", "/wiki/2026%E2%80%9327_National_League_North");
    expect(findCurrentSeasonLink(html, ["2026-27", "2026–27"], "National_League_North")).toContain("National_League_North");
  });

  it("accepts a fallback link matching the base title when wikiTitle has a disambiguation suffix", () => {
    // "National League (division)" is the NLS-stored title for the top-level National League.
    // The season article drops the suffix: 2026-27_National_League — the guard must not reject it.
    const html = pageWithLink("2026–27 National League", "/wiki/2026%E2%80%9327_National_League");
    expect(findCurrentSeasonLink(html, ["2026-27", "2026–27"], "National League (division)")).not.toBeNull();
  });

  it("still rejects a rugby false-positive when wikiTitle has no disambiguation suffix", () => {
    // Sanity check: stripping must not widen the guard so far that unrelated articles slip through.
    // "National League North" has no suffix; "National_League_2_North" must remain rejected.
    const html = pageWithLink("2026–27 National League 2 North", "/wiki/2026%E2%80%9327_National_League_2_North");
    expect(findCurrentSeasonLink(html, ["2026-27", "2026–27"], "National League North")).toBeNull();
  });
});

describe("previousSeasonVariants", () => {
  it("returns hyphen and en-dash variants of the previous season", () => {
    expect(previousSeasonVariants("2026-27")).toEqual(["2025-26", "2025–26"]);
  });

  it("accepts an en-dash season string", () => {
    expect(previousSeasonVariants("2026–27")).toEqual(["2025-26", "2025–26"]);
  });

  it("handles the century boundary", () => {
    expect(previousSeasonVariants("2100-01")).toEqual(["2099-00", "2099–00"]);
  });

  it("returns an empty array for a malformed season string", () => {
    expect(previousSeasonVariants("next-season")).toEqual([]);
  });
});

describe("rewriteSeasonInUrl", () => {
  const prev = ["2025-26", "2025–26"];

  it("rewrites a hyphenated season keeping the hyphen", () => {
    expect(rewriteSeasonInUrl("https://en.wikipedia.org/wiki/2025-26_United_Counties_League", prev, "2026-27"))
      .toBe("https://en.wikipedia.org/wiki/2026-27_United_Counties_League");
  });

  it("rewrites an en-dash season keeping the en-dash", () => {
    expect(rewriteSeasonInUrl("https://en.wikipedia.org/wiki/2025–26_United_Counties_League", prev, "2026-27"))
      .toBe("https://en.wikipedia.org/wiki/2026–27_United_Counties_League");
  });

  it("rewrites a percent-encoded en-dash season keeping the encoding", () => {
    expect(rewriteSeasonInUrl("https://en.wikipedia.org/wiki/2025%E2%80%9326_United_Counties_League", prev, "2026-27"))
      .toBe("https://en.wikipedia.org/wiki/2026%E2%80%9327_United_Counties_League");
  });

  it("preserves a #fragment", () => {
    expect(rewriteSeasonInUrl("https://en.wikipedia.org/wiki/2025–26_National_League#National_League_North", prev, "2026-27"))
      .toBe("https://en.wikipedia.org/wiki/2026–27_National_League#National_League_North");
  });

  it("returns null when the URL contains no previous-season variant", () => {
    expect(rewriteSeasonInUrl("https://en.wikipedia.org/wiki/National_League_North", prev, "2026-27")).toBeNull();
  });
});

describe("rewritePreviousSeasonLink", () => {
  // Mimics the National_League_North article: infobox "Current:" still points at 2025–26
  const staleInfoboxHtml = `
    <table class="infobox">
      <tbody>
        <tr><td class="infobox-full-data">Current: <a href="//en.wikipedia.org/wiki/2025–26_National_League#National_League_North">2025–26 National League North</a></td></tr>
      </tbody>
    </table>
  `;

  it("rewrites a previous-season Current link when the target page exists", async () => {
    const result = await rewritePreviousSeasonLink(staleInfoboxHtml, "National_League_North", "2026-27", async () => true);
    expect(result).toBe("https://en.wikipedia.org/wiki/2026–27_National_League#National_League_North");
  });

  it("verifies existence using the decoded title without the fragment", async () => {
    const checked: string[] = [];
    await rewritePreviousSeasonLink(staleInfoboxHtml, "National_League_North", "2026-27", async (title) => {
      checked.push(title);
      return true;
    });
    expect(checked).toEqual(["2026–27_National_League"]);
  });

  it("returns null when the rewritten page does not exist", async () => {
    const result = await rewritePreviousSeasonLink(staleInfoboxHtml, "National_League_North", "2026-27", async () => false);
    expect(result).toBeNull();
  });

  it("returns null when the page has no previous-season link", async () => {
    const html = infoboxWith("2024-25 National League");
    const result = await rewritePreviousSeasonLink(html, "National_League_North", "2026-27", async () => true);
    expect(result).toBeNull();
  });

  it("returns null for a malformed season string", async () => {
    const result = await rewritePreviousSeasonLink(staleInfoboxHtml, "National_League_North", "next-season", async () => true);
    expect(result).toBeNull();
  });
});
