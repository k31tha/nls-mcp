import { describe, it, expect } from "vitest";
import { parseArgs, findCurrentSeasonLink } from "./pyramid-wikipedia.js";

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
