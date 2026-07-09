import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateClubPyramid } from "./club-pyramid.js";
import { HttpError } from "../generic/fetch-json.js";

const GUID = "efdb5b94-dc7b-4287-9eb5-8eb402404912";

// Shape returned by ClubFullDetailByGuid — entity fields plus extras the
// helper must strip before writing back
const clubDetail = {
  ClubID: 2246,
  ClubName: "AFC Fylde",
  ClubAddress: "Coronation Way, Wesham, Preston, PR4 3JZ",
  ContactEmailAddr: null,
  MainWebsite: "https://www.afcfylde.co.uk/",
  LongLat: null,
  Source: "evostick",
  ClubPostcode: null,
  UrlFriendlyName: "afc-fylde",
  PyramidId: "1112",
  Nicknames: "The Coasters",
  Active: true,
  ClubGuid: GUID,
  MinorClub: false,
  DisableAutoUpdate: null,
  StatusTypeId: 1,
  Socials: [{ SocialMedia_SocialMediaID: 10, SocialURL: "AFC_Fylde", Active: true }],
  ClubWikiLink: "AFC_Fylde",
};

const jsonResponse = (data: unknown, ok = true, status = 200, statusText = "OK", bodyText = "") => ({
  ok,
  status,
  statusText,
  json: async () => data,
  text: async () => bodyText,
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("updateClubPyramid", () => {
  it("fetches the club detail and posts it back to EditClub with only PyramidId changed", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(jsonResponse(clubDetail))
      .mockResolvedValueOnce(jsonResponse({ ClubID: 2246, PyramidId: "1500" }));
    vi.stubGlobal("fetch", fetchSpy);

    await updateClubPyramid(GUID, 1500);

    const [getUrl] = fetchSpy.mock.calls[0] as [string];
    expect(getUrl).toContain(`/api/v2/ClubApi/ClubFullDetailByGuid/${GUID}`);

    const [postUrl, init] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(postUrl).toContain("/api/v2/ClubApi/EditClub");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string);
    expect(body.PyramidId).toBe("1500");
    expect(body.ClubID).toBe(2246);
    expect(body.ClubName).toBe("AFC Fylde");
    expect(body.DisableAutoUpdate).toBeNull();
  });

  it("sends PyramidId as a string per the ClubEntity contract", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(jsonResponse(clubDetail))
      .mockResolvedValueOnce(jsonResponse({ ClubID: 2246, PyramidId: "1500" }));
    vi.stubGlobal("fetch", fetchSpy);

    await updateClubPyramid(GUID, 1500);

    const body = JSON.parse((fetchSpy.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(typeof body.PyramidId).toBe("string");
  });

  it("strips non-entity fields from the write-back payload", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(jsonResponse(clubDetail))
      .mockResolvedValueOnce(jsonResponse({ ClubID: 2246, PyramidId: "1500" }));
    vi.stubGlobal("fetch", fetchSpy);

    await updateClubPyramid(GUID, 1500);

    const body = JSON.parse((fetchSpy.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(body.Socials).toBeUndefined();
    expect(body.ClubWikiLink).toBeUndefined();
  });

  it("resolves with the EditClub response on success", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(clubDetail))
      .mockResolvedValueOnce(jsonResponse({ ClubID: 2246, PyramidId: "1500" })));

    const result = await updateClubPyramid(GUID, 1500);

    expect(result).toMatchObject({ ClubID: 2246, PyramidId: "1500" });
  });

  it("throws with status and response body when EditClub returns non-OK", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(clubDetail))
      .mockResolvedValueOnce(jsonResponse(null, false, 500, "Internal Server Error", '{"Message":"An error has occurred."}')));

    const error = await updateClubPyramid(GUID, 1500).then(
      () => { throw new Error("expected rejection"); },
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(500);
    expect((error as HttpError).message).toContain("An error has occurred");
  });

  it("throws when the club detail fetch returns non-OK", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(null, false, 404, "Not Found", "")));

    await expect(updateClubPyramid(GUID, 1500)).rejects.toMatchObject({ status: 404 });
  });

  it("throws when EditClub responds with fluentErrors", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(clubDetail))
      .mockResolvedValueOnce(jsonResponse({
        ClubID: 2246,
        PyramidId: "1112",
        fluentErrors: [{ PropertyName: "PyramidId", ErrorMessage: "Invalid pyramid" }],
      })));

    await expect(updateClubPyramid(GUID, 1500)).rejects.toThrow("PyramidId: Invalid pyramid");
  });

  it("propagates network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network timeout")));

    await expect(updateClubPyramid(GUID, 1500)).rejects.toThrow("network timeout");
  });

  it("defaults a null ClubAddress to the tbc placeholder required by EditClub validation", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ...clubDetail, ClubAddress: null }))
      .mockResolvedValueOnce(jsonResponse({ ClubID: 2246, PyramidId: "1500" }));
    vi.stubGlobal("fetch", fetchSpy);

    await updateClubPyramid(GUID, 1500);

    const body = JSON.parse((fetchSpy.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(body.ClubAddress).toBe("tbc");
  });

  it("preserves an existing ClubAddress on write-back", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(jsonResponse(clubDetail))
      .mockResolvedValueOnce(jsonResponse({ ClubID: 2246, PyramidId: "1500" }));
    vi.stubGlobal("fetch", fetchSpy);

    await updateClubPyramid(GUID, 1500);

    const body = JSON.parse((fetchSpy.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(body.ClubAddress).toBe(clubDetail.ClubAddress);
  });
});
