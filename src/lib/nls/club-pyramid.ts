import { z } from "zod";
import { fetchJson } from "../generic/fetch-json.js";
import { NLS_API } from "./config.js";

// The v2 ClubEntity contract (docs/NLS.yaml) — the exact field set EditClub binds.
// Parsing with this schema strips the extra fields ClubFullDetailByGuid returns
// (Socials, wiki links, …) so the write-back payload contains only entity fields.
const ClubEntitySchema = z.object({
  ClubID: z.number(),
  ClubName: z.string(),
  ClubAddress: z.string().nullable(),
  ContactEmailAddr: z.string().nullable(),
  MainWebsite: z.string().nullable(),
  LongLat: z.unknown(),
  Source: z.string().nullable(),
  ClubPostcode: z.string().nullable(),
  UrlFriendlyName: z.string().nullable(),
  PyramidId: z.string().nullable(),
  Nicknames: z.string().nullable(),
  Active: z.boolean().nullable(),
  ClubGuid: z.string().nullable(),
  MinorClub: z.boolean().nullable(),
  DisableAutoUpdate: z.boolean().nullable(),
  StatusTypeId: z.number().nullable(),
});

export type ClubEntity = z.infer<typeof ClubEntitySchema>;

const EditClubResponseSchema = z.object({
  ClubID: z.number(),
  PyramidId: z.string().nullable(),
  fluentErrors: z.array(z.object({
    PropertyName: z.string(),
    ErrorMessage: z.string(),
  })).nullable().optional(),
});

export type EditClubResponse = z.infer<typeof EditClubResponseSchema>;

/**
 * Moves a club to a different pyramid league.
 *
 * `POST /api/ClubApi/UpdateClubPyramid` is broken server-side — it fails with
 * an Entity Framework "multiple instances of IEntityChangeTracker" error on
 * every call — so this reads the club's current ClubEntity fields and writes
 * them back through `POST /api/v2/ClubApi/EditClub` with only PyramidId
 * changed (as a string, per the ClubEntity contract).
 *
 * Note: EditClub does not run the server's DisableAutoUpdate check, so callers
 * must decide themselves whether a club should be moved.
 */
export async function updateClubPyramid(clubGuid: string, pyramidId: number): Promise<EditClubResponse> {
  const current = await fetchJson(
    `${NLS_API.v2}/ClubApi/ClubFullDetailByGuid/${clubGuid}`,
    undefined,
    ClubEntitySchema,
  );

  // EditClub validation requires ClubAddress; older records have none. Use the
  // same "tbc" placeholder the AddClub flow writes for address-less clubs.
  const clubAddress = current.ClubAddress?.trim() ? current.ClubAddress : "tbc";

  const updated = await fetchJson(
    `${NLS_API.v2}/ClubApi/EditClub`,
    { method: "POST", body: { ...current, ClubAddress: clubAddress, PyramidId: String(pyramidId) } },
    EditClubResponseSchema,
  );

  if (updated.fluentErrors?.length) {
    const details = updated.fluentErrors.map((e) => `${e.PropertyName}: ${e.ErrorMessage}`).join("; ");
    // Observed live: EditClub can persist the change and still return
    // fluentErrors, so flag the uncertainty rather than claiming a clean reject
    throw new Error(`EditClub reported validation errors for club ${clubGuid} (the update may still have been applied): ${details}`);
  }

  return updated;
}
