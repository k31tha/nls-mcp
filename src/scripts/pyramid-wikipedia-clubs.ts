import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import { fetchJson } from "../lib/generic/fetch-json.js";
import { NLS_API } from "../lib/nls/config.js";
import { fetchWikipediaPageHtmlByUrl, extractWikipediaSection, extractClubWebsiteFromWikiPage } from "../lib/nls/wikipedia.js";
import { updateClubPyramid } from "../lib/nls/club-pyramid.js";
import { z } from "zod";

const IN_FILE = "pyramid-wikipedia.csv";
const OUT_FILE = "pyramid-wikipedia-clubs.csv";

// ── Schemas ───────────────────────────────────────────────────────────────────

const ClubListSchema = z.object({
  ClubGuid: z.string(),
  ClubName: z.string(),
  Active: z.boolean().nullable(),
  PyramidId: z.string().nullable(),
  DisableAutoUpdate: z.boolean().nullable(),
  StatusTypeId: z.number().nullable().optional(),
});

const SocialSchema = z.object({
  SocialMedia_SocialMediaID: z.number(),
  SocialURL: z.string(),
  Active: z.boolean().nullable(),
});

const ClubDetailSchema = z.object({
  ClubGuid: z.string(),
  Socials: z.array(SocialSchema).nullable().optional(),
});

const WIKI_SOCIAL_ID = 10;

function activeWikiUrl(detail: z.infer<typeof ClubDetailSchema>): string | null {
  return detail.Socials?.find(
    (s) => s.SocialMedia_SocialMediaID === WIKI_SOCIAL_ID && s.Active === true,
  )?.SocialURL ?? null;
}

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

const PyramidLeagueSchema = z.object({
  pyramidId: z.number(),
  leagueName: z.string(),
  pyramidStep: z.number(),
  pyramidStepInactive: z.boolean(),
  clubs: z.array(z.object({
    ClubGuid: z.string(),
    ClubWikiLink: z.string().nullable(),
  })),
});

// ── Types ─────────────────────────────────────────────────────────────────────

type NLSClub = {
  guid: string;
  name: string;
  wikiUrl: string | null;
  assignedLeague: string | null;
  assignedStep: number | null;
  active: boolean | null;
  disableAutoUpdate: boolean;
  nlsStatus: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url.trim().toLowerCase().replace(/^http:/, "https:").replace(/\/+$/, "").replace(/ /g, "_");
}

function stripFCPatterns(url: string): string {
  return url
    .replace(/_A\.F\.C\./g, "")
    .replace(/A\.F\.C\._/g, "")
    .replace(/_\.F\.C\./g, "")
    .replace(/F\.C\._/g, "")
    .replace(/_F\.C\./g, "");
}

function stripNameFCSuffix(name: string): string {
  return name
    .replace(/\s+A\.F\.C\.$/i, "")
    .replace(/\s+F\.C\.$/i, "")
    .replace(/\s+AFC$/i, "")
    .replace(/\s+FC$/i, "")
    .trim();
}

function csvField(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === "," && !inQuotes) {
        fields.push(current);
        current = "";
      } else {
        current += c;
      }
    }
    fields.push(current);
    return Object.fromEntries(headers.map((h, i) => [h.trim(), fields[i]?.trim() ?? ""]));
  });
}

async function fetchStatusTypes(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const raw = await fetchJson(`${NLS_API.v2}/ReferenceDataApi/ReferenceData/`) as Record<string, unknown>;
    const candidates = ["StatusTypes", "statusTypes", "ClubStatusTypes", "clubStatusTypes"];
    for (const key of candidates) {
      const arr = raw[key];
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (item && typeof item === "object") {
            const obj = item as Record<string, unknown>;
            const id = obj["StatusTypeId"] ?? obj["statusTypeId"];
            const name = obj["StatusTypeName"] ?? obj["statusTypeName"] ?? obj["Name"] ?? obj["name"];
            if (typeof id === "number" && typeof name === "string") map.set(id, name);
          }
        }
        if (map.size > 0) break;
      }
    }
  } catch { /* fall back to raw IDs */ }
  return map;
}

// ── Matching ──────────────────────────────────────────────────────────────────

type MatchStatus = "MATCHED" | "MATCHED_WRONG_LEAGUE" | "MATCHED_UNASSIGNED" | "WIKI_ONLY";

type WikiOnlyClub = { pyramidId: number | string; leagueName: string; step: number; name: string; url: string };

export type WrongLeagueCandidate = {
  guid: string;
  clubName: string;
  fromLeague: string | null;
  fromStep: number | null;
  toLeague: string;
  toStep: number;
  toPyramidId: number | string;
  disableAutoUpdate: boolean;
  active: boolean | null;
};

// Partitions MATCHED_WRONG_LEAGUE candidates into those safe to reassign and
// those to skip (with a reason). Duplicate (guid, target league) pairs are
// collapsed to one. In bulk mode, ambiguous targets (same club wrong-league
// under two different leagues) and inactive clubs are skipped; interactively
// the user decides at the prompt. DisableAutoUpdate clubs are never eligible.
export function selectWrongLeagueFixes(
  candidates: WrongLeagueCandidate[],
  opts: { bulk: boolean },
): { eligible: WrongLeagueCandidate[]; skipped: Array<{ candidate: WrongLeagueCandidate; reason: string }> } {
  const eligible: WrongLeagueCandidate[] = [];
  const skipped: Array<{ candidate: WrongLeagueCandidate; reason: string }> = [];

  const targetsByGuid = new Map<string, Set<string>>();
  for (const c of candidates) {
    const targets = targetsByGuid.get(c.guid) ?? new Set<string>();
    targets.add(c.toLeague);
    targetsByGuid.set(c.guid, targets);
  }

  const seen = new Set<string>();
  for (const c of candidates) {
    const key = `${c.guid}|${c.toLeague}`;
    if (seen.has(key)) {
      skipped.push({ candidate: c, reason: "duplicate row for the same target league" });
      continue;
    }
    seen.add(key);

    if (c.disableAutoUpdate) {
      skipped.push({ candidate: c, reason: "DisableAutoUpdate is set" });
      continue;
    }
    if (typeof c.toPyramidId !== "number") {
      skipped.push({ candidate: c, reason: `no pyramidId found for "${c.toLeague}"` });
      continue;
    }
    const targets = targetsByGuid.get(c.guid)!;
    if (opts.bulk && targets.size > 1) {
      skipped.push({ candidate: c, reason: `ambiguous target — club is wrong-league under ${targets.size} leagues` });
      continue;
    }
    if (opts.bulk && c.active !== true) {
      skipped.push({ candidate: c, reason: "club is not active" });
      continue;
    }
    eligible.push(c);
  }

  return { eligible, skipped };
}

function normalizeClubName(name: string): string {
  return name.replace(/\s*&\s*/g, " and ").trim();
}

function pickBestCandidate(candidates: NLSClub[], leagueName: string): NLSClub {
  return (
    candidates.find((c) => c.assignedLeague === leagueName) ??
    candidates.reduce((best, c) =>
      (c.assignedStep ?? Infinity) < (best.assignedStep ?? Infinity) ? c : best)
  );
}

function matchNlsClub(
  wikiUrl: string,
  wikiName: string,
  leagueName: string,
  assignedNlsClubs: NLSClub[],
  allByUrl: Map<string, NLSClub[]>,
  allByStrippedUrl: Map<string, NLSClub[]>,
  allByStrippedName: Map<string, NLSClub[]>,
): NLSClub | undefined {
  const norm = normalizeUrl(wikiUrl);

  // 1. Exact URL match — prefer same league, else lowest step
  const urlCandidates = norm ? allByUrl.get(norm) : undefined;
  if (urlCandidates?.length) return pickBestCandidate(urlCandidates, leagueName);

  // 1.5 FC-pattern URL fallback
  const strippedWikiNorm = normalizeUrl(stripFCPatterns(wikiUrl));
  const fcCandidates =
    (strippedWikiNorm && strippedWikiNorm !== norm ? allByUrl.get(strippedWikiNorm) : undefined) ??
    (norm ? allByStrippedUrl.get(norm) : undefined) ??
    (strippedWikiNorm && strippedWikiNorm !== norm ? allByStrippedUrl.get(strippedWikiNorm) : undefined);
  if (fcCandidates?.length) return pickBestCandidate(fcCandidates, leagueName);

  // 2. Exact name match within this league's assigned clubs
  const nameMatch = assignedNlsClubs.find(
    (c) => c.name.toLowerCase().trim() === wikiName.toLowerCase().trim(),
  );
  if (nameMatch) return nameMatch;

  // 2.5 Stripped name match across all NLS clubs
  const strippedWikiName = stripNameFCSuffix(wikiName).toLowerCase().trim();
  const nameFCCandidates = allByStrippedName.get(strippedWikiName);
  if (nameFCCandidates?.length) return pickBestCandidate(nameFCCandidates, leagueName);

  return undefined;
}

function matchStatus(match: NLSClub | undefined, leagueName: string): MatchStatus {
  if (!match) return "WIKI_ONLY";
  if (!match.assignedLeague) return "MATCHED_UNASSIGNED";
  return match.assignedLeague === leagueName ? "MATCHED" : "MATCHED_WRONG_LEAGUE";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const debug = args.includes("--debug");
  if (debug) process.env.DEBUG = "1";

  const sourceRows = parseCsv(readFileSync(IN_FILE, "utf8")).filter(
    (r) => r.SeasonLink?.startsWith("http") && r.Section && !r.Section.startsWith("("),
  );
  console.log(`Read ${sourceRows.length} leagues from ${IN_FILE}`);

  // ── Fetch NLS data ─────────────────────────────────────────────────────────

  console.log("Fetching reference data...");
  const statusTypes = await fetchStatusTypes();

  console.log("Fetching club list...");
  const allClubs = await fetchJson(`${NLS_API.v2}/ClubApi/ClubList`, undefined, z.array(ClubListSchema));
  const activeClubs = allClubs.filter((c) => c.Active === true);
  console.log(`  ${activeClubs.length} active, ${allClubs.length - activeClubs.length} inactive`);

  console.log("Fetching pyramid...");
  const pyramid = await fetchJson(`${NLS_API.v3}/PyramidApi/Pyramids`, undefined, z.array(PyramidLeagueSchema));
  const activeLeagues = pyramid.filter((l) => !l.pyramidStepInactive);

  // guid → wikiUrl from embedded pyramid clubs
  const guidToWikiUrl = new Map<string, string>();
  for (const league of activeLeagues) {
    for (const c of league.clubs) {
      if (c.ClubWikiLink) guidToWikiUrl.set(c.ClubGuid, c.ClubWikiLink);
    }
  }

  // pyramidId → { leagueName, step }
  const pyramidIdToLeague = new Map<number, { leagueName: string; step: number }>();
  for (const league of activeLeagues) {
    pyramidIdToLeague.set(league.pyramidId, { leagueName: league.leagueName, step: league.pyramidStep });
  }

  // Fetch wiki links for clubs not in any active league (both active and inactive clubs)
  const unassignedGuids = allClubs
    .filter((c) => {
      const pid = c.PyramidId ? Number(c.PyramidId) : null;
      return !pid || !pyramidIdToLeague.has(pid);
    })
    .map((c) => c.ClubGuid);
  process.stdout.write(`Fetching wiki links for ${unassignedGuids.length} unassigned clubs...`);
  for (const guid of unassignedGuids) {
    try {
      const detail = await fetchJson(`${NLS_API.v2}/ClubApi/ClubFullDetailByGuid/${guid}`, undefined, ClubDetailSchema);
      const wikiUrl = activeWikiUrl(detail);
      if (wikiUrl) guidToWikiUrl.set(guid, wikiUrl);
      process.stdout.write(".");
    } catch {
      process.stdout.write("x");
    }
  }
  console.log("\n");

  // Build NLS club records — includes inactive clubs so matching catches recently-inactivated entries
  const allNlsClubs: NLSClub[] = allClubs.map((c) => {
    const pyramidId = c.PyramidId ? Number(c.PyramidId) : null;
    const league = pyramidId ? pyramidIdToLeague.get(pyramidId) : undefined;
    const statusId = c.StatusTypeId ?? null;
    return {
      guid: c.ClubGuid,
      name: c.ClubName,
      wikiUrl: guidToWikiUrl.get(c.ClubGuid) ?? null,
      assignedLeague: league?.leagueName ?? null,
      assignedStep: league?.step ?? null,
      active: c.Active,
      disableAutoUpdate: c.DisableAutoUpdate === true,
      nlsStatus: statusId !== null ? (statusTypes.get(statusId) ?? String(statusId)) : "",
    };
  });

  // Build lookup indexes
  const allByUrl = new Map<string, NLSClub[]>();
  const allByStrippedUrl = new Map<string, NLSClub[]>();
  const allByStrippedName = new Map<string, NLSClub[]>();
  for (const c of allNlsClubs) {
    const norm = normalizeUrl(c.wikiUrl);
    if (norm) {
      const list = allByUrl.get(norm) ?? [];
      list.push(c);
      allByUrl.set(norm, list);
    }
    const strippedNorm = normalizeUrl(stripFCPatterns(c.wikiUrl ?? ""));
    if (strippedNorm && strippedNorm !== norm) {
      const list = allByStrippedUrl.get(strippedNorm) ?? [];
      list.push(c);
      allByStrippedUrl.set(strippedNorm, list);
    }
    const strippedName = stripNameFCSuffix(c.name).toLowerCase().trim();
    if (strippedName) {
      const list = allByStrippedName.get(strippedName) ?? [];
      list.push(c);
      allByStrippedName.set(strippedName, list);
    }
  }

  // pyramidName → pyramidId (from source pyramid fetch for the CSV lookup)
  const nameToId = new Map(pyramid.map((l) => [l.leagueName, l.pyramidId]));

  // ── Process leagues ────────────────────────────────────────────────────────

  const HEADER = "PyramidId,WikiLeague,WikiStep,WikiClubName,WikiClubUrl,NLSClubName,NLSWikiUrl,NLSAssignedLeague,NLSAssignedStep,Status,FoundElsewhere,DisableAutoUpdate,WikiClubLeague,WikiClubLeagueStep,NLSStatus,NLSActive";
  const outputRows: string[] = [HEADER];
  const wikiOnlyClubs: WikiOnlyClub[] = [];
  const wrongLeagueClubs: WrongLeagueCandidate[] = [];
  const urlToMinStep = new Map<string, number>(); // tracks lowest pyramid step seen for each wiki URL

  const htmlCache = new Map<string, string>();

  for (const row of sourceRows) {
    const { League, Step, SeasonLink, Section } = row;
    const pyramidId = nameToId.get(League) ?? "";
    const baseUrl = SeasonLink.split("#")[0];
    const assignedNlsClubs = allNlsClubs.filter((c) => c.assignedLeague === League);

    process.stdout.write(`  [${Step}] ${League}... `);

    try {
      if (!htmlCache.has(baseUrl)) {
        htmlCache.set(baseUrl, await fetchWikipediaPageHtmlByUrl(baseUrl));
      }
      const html = htmlCache.get(baseUrl)!;
      const { clubs } = extractWikipediaSection(html, Section);

      const counts = { MATCHED: 0, MATCHED_WRONG_LEAGUE: 0, MATCHED_UNASSIGNED: 0, WIKI_ONLY: 0 };

      for (const club of clubs) {
        const match = matchNlsClub(
          club.url, club.name, League,
          assignedNlsClubs, allByUrl, allByStrippedUrl, allByStrippedName,
        );
        const status = matchStatus(match, League);
        counts[status]++;

        const clubStep = Number(Step);
        const normUrl = normalizeUrl(club.url);
        if (normUrl) {
          const prev = urlToMinStep.get(normUrl);
          if (prev === undefined || clubStep < prev) urlToMinStep.set(normUrl, clubStep);
        }

        if (status === "WIKI_ONLY") wikiOnlyClubs.push({ pyramidId, leagueName: League, step: clubStep, name: club.name, url: club.url });

        if (status === "MATCHED_WRONG_LEAGUE" && match) {
          wrongLeagueClubs.push({
            guid: match.guid,
            clubName: match.name,
            fromLeague: match.assignedLeague,
            fromStep: match.assignedStep,
            toLeague: League,
            toStep: clubStep,
            toPyramidId: pyramidId,
            disableAutoUpdate: match.disableAutoUpdate,
            active: match.active,
          });
        }

        outputRows.push([
          pyramidId,
          League,
          Step,
          club.name,
          club.url,
          match?.name ?? "",
          match?.wikiUrl ?? "",
          match?.assignedLeague ?? "",
          match?.assignedStep ?? "",
          status,
          "",  // FoundElsewhere
          match?.disableAutoUpdate ? "Y" : "",
          "",  // WikiClubLeague
          "",  // WikiClubLeagueStep
          match?.nlsStatus ?? "",
          match ? (match.active === true ? "Y" : match.active === false ? "N" : "") : "",
        ].map(csvField).join(","));
      }

      console.log(
        `${clubs.length} clubs  matched:${counts.MATCHED} wrong_league:${counts.MATCHED_WRONG_LEAGUE} ` +
        `unassigned:${counts.MATCHED_UNASSIGNED} wiki_only:${counts.WIKI_ONLY}`,
      );
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  writeFileSync(OUT_FILE, outputRows.join("\n"), "utf8");
  console.log(`\nOutput: ${OUT_FILE} (${outputRows.length - 1} clubs across ${sourceRows.length} leagues)`);
  console.log(`WIKI_ONLY: ${wikiOnlyClubs.length}`);

  const doAdd = args.includes("--add-wiki-only");
  const doFixWrongLeague = args.includes("--fix-wrong-league");
  const bulk = args.includes("--bulk");

  if (!doAdd && !doFixWrongLeague) return;

  const rl = !bulk ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = (q: string) => new Promise<string>((resolve) => rl!.question(q, resolve));

  if (doAdd) await addWikiOnlyClubs(wikiOnlyClubs, urlToMinStep, bulk, ask);
  if (doFixWrongLeague) await fixWrongLeagueClubs(wrongLeagueClubs, bulk, ask);

  rl?.close();
}

async function addWikiOnlyClubs(
  wikiOnlyClubs: WikiOnlyClub[],
  urlToMinStep: Map<string, number>,
  bulk: boolean,
  ask: (q: string) => Promise<string>,
) {
  if (!wikiOnlyClubs.length) {
    console.log("\nNo WIKI_ONLY clubs to add.");
    return;
  }

  console.log(`\n${wikiOnlyClubs.length} WIKI_ONLY clubs. Add each to NLS?\n`);

  for (const club of wikiOnlyClubs) {
    const wikiValue = club.url.replace("https://en.wikipedia.org/wiki/", "");
    const clubName = normalizeClubName(club.name);

    // Fetch club's Wikipedia page to extract website from infobox
    let mainWebsite: string | null = null;
    try {
      const clubHtml = await fetchWikipediaPageHtmlByUrl(club.url);
      mainWebsite = extractClubWebsiteFromWikiPage(clubHtml);
    } catch { /* proceed without website */ }

    if (!bulk) {
      console.log(`\n  Club:    ${clubName}`);
      console.log(`  Address: (none)`);
      console.log(`  Website: ${mainWebsite ?? "(none)"}`);
      console.log(`  Wiki:    ${wikiValue}`);
      console.log(`  League:  ${club.leagueName} (pyramidId: ${club.pyramidId})`);
      const answer = await ask(`  Add? (y/n/q): `);
      if (answer.toLowerCase() === "q") break;
      if (answer.toLowerCase() !== "y") continue;
    } else {
      console.log(`  Adding "${clubName}"${mainWebsite ? ` (${mainWebsite})` : ""}...`);
    }

    try {
      const searchResults = await fetchJson(
        `${NLS_API.v1}/ClubApi/ClubSearch/${encodeURIComponent(clubName)}`,
        undefined,
        ClubSearchResultSchema,
      );
      const existing = searchResults.find((c) => c.ClubName.toLowerCase() === clubName.toLowerCase());
      if (existing) {
        console.log(`    [skip] "${clubName}" already exists (ClubID: ${existing.ClubID})`);
        continue;
      }
    } catch { /* proceed with creation */ }

    // Disable auto-updates if the same wiki URL appears in a league higher in the pyramid
    const minStep = urlToMinStep.get(normalizeUrl(club.url)) ?? club.step;
    const disableAutoUpdate = minStep < club.step;

    if (disableAutoUpdate) console.log(`    (wiki URL also used at step ${minStep} — DisableAutoUpdate will be set)`);

    try {
      const created = await fetchJson(
        `${NLS_API.v2}/ClubApi/AddClub`,
        {
          method: "POST",
          body: {
            ClubName: clubName,
            ClubAddress: "tbc",
            MainWebsite: mainWebsite ?? null,
            Active: true,
            DisableAutoUpdate: disableAutoUpdate,
            StatusTypeId: 1,
            PyramidId: club.pyramidId ? String(club.pyramidId) : null,
          },
        },
        SaveResponseSchema,
      );

      if (created.fluentErrors?.length) {
        console.log(`    ✗ Failed: ${created.fluentErrors.map((e) => `${e.PropertyName}: ${e.ErrorMessage}`).join("; ")}`);
        continue;
      }
      if (!created.ClubID) {
        console.log(`    ✗ AddClub returned ClubID 0`);
        continue;
      }

      await fetchJson(`${NLS_API.v2}/ClubApi/AddClubSocial`, {
        method: "POST",
        body: {
          SocialMedia_SocialMediaID: 10,
          SocialURL: wikiValue,
          SocialName: wikiValue,
          OwnerType: "O",
          Active: true,
          Club_ClubID: created.ClubID,
          ClubGuid: created.ClubGuid ?? "",
        },
      });

      console.log(`    ✓ Created ClubID ${created.ClubID} "${clubName}" with wiki "${wikiValue}"`);
    } catch (e) {
      console.log(`    ✗ Failed: ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function fixWrongLeagueClubs(
  wrongLeagueClubs: WrongLeagueCandidate[],
  bulk: boolean,
  ask: (q: string) => Promise<string>,
) {
  const { eligible, skipped } = selectWrongLeagueFixes(wrongLeagueClubs, { bulk });

  if (skipped.length) {
    console.log(`\n${skipped.length} MATCHED_WRONG_LEAGUE rows skipped:`);
    for (const { candidate, reason } of skipped) {
      console.log(`  [skip] ${candidate.clubName} (${candidate.fromLeague ?? "unassigned"} → ${candidate.toLeague}): ${reason}`);
    }
  }

  if (!eligible.length) {
    console.log("\nNo MATCHED_WRONG_LEAGUE clubs eligible for reassignment.");
    return;
  }

  // Same club eligible under more than one target league (interactive mode only)
  const guidCount = new Map<string, number>();
  for (const c of eligible) guidCount.set(c.guid, (guidCount.get(c.guid) ?? 0) + 1);

  console.log(`\n${eligible.length} MATCHED_WRONG_LEAGUE clubs. Reassign each to its Wikipedia league?\n`);

  for (const club of eligible) {
    // selectWrongLeagueFixes only passes numeric pyramid ids through; narrow for TS
    if (typeof club.toPyramidId !== "number") continue;

    const move = `${club.fromLeague ?? "(unassigned)"} (step ${club.fromStep ?? "?"}) → ${club.toLeague} (step ${club.toStep})`;

    if (!bulk) {
      const flags = [
        club.active !== true ? "INACTIVE" : null,
        (guidCount.get(club.guid) ?? 0) > 1 ? "ALSO LISTED UNDER ANOTHER LEAGUE" : null,
      ].filter(Boolean).join(", ");
      const answer = await ask(`  Reassign "${club.clubName}"${flags ? ` [${flags}]` : ""}: ${move}? (y/n/q): `);
      if (answer.toLowerCase() === "q") break;
      if (answer.toLowerCase() !== "y") continue;
    } else {
      console.log(`  Reassigning "${club.clubName}": ${move}...`);
    }

    try {
      await updateClubPyramid(club.guid, club.toPyramidId);
      console.log(`    ✓ "${club.clubName}" reassigned: ${move}`);
    } catch (e) {
      console.log(`    ✗ Failed: ${e instanceof Error ? e.message : e}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
