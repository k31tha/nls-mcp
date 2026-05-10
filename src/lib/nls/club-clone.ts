import { z } from "zod";
import { fetchJson } from "../generic/fetch-json.js";
import { NLS_API } from "./config.js";

const SourceClubSchema = z.object({
  ClubID: z.number(),
  ClubGuid: z.string(),
  ClubName: z.string(),
  ClubAddress: z.string().nullable(),
  ClubPostcode: z.string().nullable(),
  MainWebsite: z.string().nullable(),
  LongLat: z.unknown().optional(),
  ContactEmailAddr: z.string().nullable(),
  Nicknames: z.string().nullable(),
  MinorClub: z.boolean().nullable(),
  ClubWikiLink: z.string().nullable().optional(),
});

const SaveResponseSchema = z.object({
  ClubID: z.number(),
  ClubGuid: z.string().nullable(),
  fluentErrors: z.array(z.object({
    PropertyName: z.string(),
    ErrorMessage: z.string(),
  })).nullable().optional(),
});

const ClubSearchResultSchema = z.array(z.object({
  ClubID: z.number(),
  ClubGuid: z.string().nullable(),
  ClubName: z.string(),
}));

const ClubWikiLinkSchema = z.object({
  ClubWikiLink: z.string().nullable().optional(),
});

export type CloneResult =
  | { success: true; newClubId: number; newClubGuid: string; alreadyExisted?: boolean }
  | { success: false; errors: string[] };

function wikiPageName(url: string): string {
  return decodeURIComponent(url.split("/").pop() ?? url);
}

export async function cloneClub(
  sourceGuid: string,
  newName: string,
  wikiUrl?: string,
  pyramidId?: number,
): Promise<CloneResult> {
  const source = await fetchJson(
    `${NLS_API.v2}/ClubApi/ClubFullDetailByGuid/${sourceGuid}`,
    undefined,
    SourceClubSchema,
  );

  // Check if a club with this name already exists
  const searchResults = await fetchJson(
    `${NLS_API.v1}/ClubApi/ClubSearch/${encodeURIComponent(newName)}`,
    undefined,
    ClubSearchResultSchema,
  );
  const existing = searchResults.find(
    (c) => c.ClubName.toLowerCase() === newName.toLowerCase(),
  );

  let clubId: number;
  let clubGuid: string;
  let alreadyExisted = false;

  if (existing) {
    console.log(`Club "${newName}" already exists — ClubID: ${existing.ClubID}`);
    clubId = existing.ClubID;
    clubGuid = existing.ClubGuid ?? "";
    alreadyExisted = true;
  } else {
    const created = await fetchJson(
      `${NLS_API.v2}/ClubApi/AddClub`,
      {
        method: "POST",
        body: {
          ClubName: newName,
          ClubAddress: source.ClubAddress,
          ClubPostcode: source.ClubPostcode,
          MainWebsite: source.MainWebsite,
          LongLat: source.LongLat,
          ContactEmailAddr: source.ContactEmailAddr,
          Nicknames: source.Nicknames,
          MinorClub: source.MinorClub,
          Active: true,
          DisableAutoUpdate: true,
          StatusTypeId: 1,
          PyramidId: pyramidId !== undefined ? String(pyramidId) : null,
        },
      },
      SaveResponseSchema,
    );

    if (created.fluentErrors?.length) {
      return {
        success: false,
        errors: created.fluentErrors.map((e) => `${e.PropertyName}: ${e.ErrorMessage}`),
      };
    }

    if (!created.ClubID) {
      return { success: false, errors: ["AddClub returned ClubID 0 — club was not saved"] };
    }

    clubId = created.ClubID;
    clubGuid = created.ClubGuid ?? "";
  }

  const effectiveWikiUrl = wikiUrl ?? source.ClubWikiLink ?? null;
  if (!effectiveWikiUrl) {
    return { success: true, newClubId: clubId, newClubGuid: clubGuid, alreadyExisted };
  }

  // Check existing wiki social on the club
  const detail = await fetchJson(
    `${NLS_API.v2}/ClubApi/ClubFullDetailByGuid/${clubGuid}`,
    undefined,
    ClubWikiLinkSchema,
  );
  const existingWiki = detail.ClubWikiLink ?? null;

  if (existingWiki === effectiveWikiUrl) {
    console.log(`Wiki social already correct: ${effectiveWikiUrl}`);
  } else if (existingWiki) {
    console.log(`Wiki social mismatch — existing: ${existingWiki}, wanted: ${effectiveWikiUrl} (manual update required)`);
  } else {
    await fetchJson(`${NLS_API.v2}/ClubApi/AddClubSocial`, {
      method: "POST",
      body: {
        SocialMedia_SocialMediaID: 10,
        SocialURL: effectiveWikiUrl,
        SocialName: wikiPageName(effectiveWikiUrl),
        OwnerType: "O",
        Active: true,
        Club_ClubID: clubId,
        ClubGuid: clubGuid,
      },
    });
  }

  if (pyramidId !== undefined) {
    await fetch(`${NLS_API.v1}/ClubApi/UpdateClubPyramid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pyramidId, clubId }),
    });
  }

  return { success: true, newClubId: clubId, newClubGuid: clubGuid, alreadyExisted };
}
