import { describe, it, expect } from "vitest";
import { selectWrongLeagueFixes, type WrongLeagueCandidate } from "./pyramid-wikipedia-clubs.js";

function candidate(overrides: Partial<WrongLeagueCandidate> = {}): WrongLeagueCandidate {
  return {
    guid: "guid-1",
    clubName: "Example Town FC",
    fromLeague: "Wessex Football League Premier Division",
    fromStep: 5,
    toLeague: "Southern League Division One South",
    toStep: 4,
    toPyramidId: 42,
    disableAutoUpdate: false,
    active: true,
    ...overrides,
  };
}

describe("selectWrongLeagueFixes", () => {
  it("returns a plain candidate as eligible", () => {
    const { eligible, skipped } = selectWrongLeagueFixes([candidate()], { bulk: false });
    expect(eligible).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it("returns empty results for empty input", () => {
    const { eligible, skipped } = selectWrongLeagueFixes([], { bulk: true });
    expect(eligible).toHaveLength(0);
    expect(skipped).toHaveLength(0);
  });

  it("skips a DisableAutoUpdate club in interactive mode", () => {
    const { eligible, skipped } = selectWrongLeagueFixes([candidate({ disableAutoUpdate: true })], { bulk: false });
    expect(eligible).toHaveLength(0);
    expect(skipped[0].reason).toContain("DisableAutoUpdate");
  });

  it("skips a DisableAutoUpdate club in bulk mode", () => {
    const { eligible, skipped } = selectWrongLeagueFixes([candidate({ disableAutoUpdate: true })], { bulk: true });
    expect(eligible).toHaveLength(0);
    expect(skipped[0].reason).toContain("DisableAutoUpdate");
  });

  it("skips a candidate whose target league has no pyramidId", () => {
    const { eligible, skipped } = selectWrongLeagueFixes([candidate({ toPyramidId: "" })], { bulk: false });
    expect(eligible).toHaveLength(0);
    expect(skipped[0].reason).toContain("no pyramidId");
  });

  it("collapses duplicate rows for the same club and target league to one eligible entry", () => {
    // South West Peninsula pages list the same club twice via the double-section quirk
    const { eligible, skipped } = selectWrongLeagueFixes([candidate(), candidate()], { bulk: true });
    expect(eligible).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toContain("duplicate");
  });

  it("skips both rows in bulk mode when the same club targets two different leagues", () => {
    const rows = [
      candidate({ toLeague: "League A" }),
      candidate({ toLeague: "League B" }),
    ];
    const { eligible, skipped } = selectWrongLeagueFixes(rows, { bulk: true });
    expect(eligible).toHaveLength(0);
    expect(skipped).toHaveLength(2);
    expect(skipped.every(({ reason }) => reason.includes("ambiguous"))).toBe(true);
  });

  it("keeps both rows eligible in interactive mode when the same club targets two different leagues", () => {
    const rows = [
      candidate({ toLeague: "League A" }),
      candidate({ toLeague: "League B" }),
    ];
    const { eligible, skipped } = selectWrongLeagueFixes(rows, { bulk: false });
    expect(eligible).toHaveLength(2);
    expect(skipped).toHaveLength(0);
  });

  it("skips an inactive club in bulk mode", () => {
    const { eligible, skipped } = selectWrongLeagueFixes([candidate({ active: false })], { bulk: true });
    expect(eligible).toHaveLength(0);
    expect(skipped[0].reason).toContain("not active");
  });

  it("keeps an inactive club eligible in interactive mode", () => {
    const { eligible, skipped } = selectWrongLeagueFixes([candidate({ active: false })], { bulk: false });
    expect(eligible).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it("treats null active as not active in bulk mode", () => {
    const { eligible } = selectWrongLeagueFixes([candidate({ active: null })], { bulk: true });
    expect(eligible).toHaveLength(0);
  });

  it("processes independent clubs independently", () => {
    const rows = [
      candidate({ guid: "guid-1" }),
      candidate({ guid: "guid-2", disableAutoUpdate: true }),
      candidate({ guid: "guid-3", clubName: "Other Club" }),
    ];
    const { eligible, skipped } = selectWrongLeagueFixes(rows, { bulk: true });
    expect(eligible.map((c) => c.guid)).toEqual(["guid-1", "guid-3"]);
    expect(skipped.map(({ candidate: c }) => c.guid)).toEqual(["guid-2"]);
  });
});
