import { z } from "zod";
import { fetchJson } from "../generic/fetch-json.js";
import { NLS_API } from "./config.js";

const ClubFullSchema = z.object({
  ClubID: z.number(),
  ClubGuid: z.string().nullable(),
  ClubName: z.string(),
  ClubAddress: z.string().nullable(),
  ClubPostcode: z.string().nullable(),
  MainWebsite: z.string().nullable(),
  LongLat: z.unknown().optional(),
  Source: z.string().nullable().optional(),
  ContactEmailAddr: z.string().nullable(),
  Nicknames: z.string().nullable(),
  MinorClub: z.boolean().nullable(),
  DisableAutoUpdate: z.boolean().nullable(),
  StatusTypeId: z.number().nullable().optional(),
  PyramidId: z.string().nullable().optional(),
  UrlFriendlyName: z.string().nullable().optional(),
  Active: z.boolean().nullable(),
});

const EditResponseSchema = z.object({
  ClubID: z.number().optional(),
  fluentErrors: z.array(z.object({
    PropertyName: z.string(),
    ErrorMessage: z.string(),
  })).nullable().optional(),
});

export type StatusResult =
  | { success: true; clubName: string }
  | { success: false; errors: string[] };

export async function setClubInactive(guid: string): Promise<StatusResult> {
  const club = await fetchJson(
    `${NLS_API.v2}/ClubApi/ClubFullDetailByGuid/${guid}`,
    undefined,
    ClubFullSchema,
  );

  const updated = await fetchJson(
    `${NLS_API.v2}/ClubApi/EditClub`,
    {
      method: "POST",
      body: {
        ...club,
        Active: false,
        ClubAddress: club.ClubAddress?.trim() || "tbc",
      },
    },
    EditResponseSchema,
  );

  if (updated.fluentErrors?.length) {
    return {
      success: false,
      errors: updated.fluentErrors.map((e) => `${e.PropertyName}: ${e.ErrorMessage}`),
    };
  }

  return { success: true, clubName: club.ClubName };
}
