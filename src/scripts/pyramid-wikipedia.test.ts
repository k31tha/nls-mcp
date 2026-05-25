import { describe, it, expect } from "vitest";
import { parseArgs } from "./pyramid-wikipedia.js";

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
