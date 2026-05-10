import "dotenv/config";
import { writeFileSync } from "fs";
import { createInterface } from "readline";
import { fetchJson } from "../lib/generic/fetch-json.js";
import { NLS_API } from "../lib/nls/config.js";
import { cloneClub } from "../lib/nls/club-clone.js";
import { setClubInactive } from "../lib/nls/club-status.js";
import { fetchWikipediaPageHtml, fetchWikipediaPageHtmlByUrl, extractWikipediaSection, extractClubLeagueFromWikiPage } from "../lib/nls/wikipedia.js";
import { z } from "zod";

// ── Schemas ──────────────────────────────────────────────────────────────────

const ClubListSchema = z.object({
  ClubGuid: z.string(),
  ClubName: z.string(),
  Active: z.boolean().nullable(),
  PyramidId: z.string().nullable(),
  DisableAutoUpdate: z.boolean().nullable(),
  StatusTypeId: z.number().nullable().optional(),
});

const ClubDetailSchema = z.object({
  ClubGuid: z.string(),
  ClubWikiLink: z.string().nullable(),
});

const PyramidClubSchema = z.object({
  ClubGuid: z.string(),
  ClubName: z.string(),
  ClubWikiLink: z.string().nullable(),
  Active: z.boolean().nullable(),
  DisableAutoUpdate: z.boolean().nullable(),
});

const PyramidLeagueSchema = z.object({
  pyramidId: z.number(),
  leagueName: z.string(),
  pyramidStep: z.number(),
  pyramidStepInactive: z.boolean(),
  wikipedia: z.string().nullable(),
  wikiPageSection: z.string().nullable(),
  clubs: z.array(PyramidClubSchema),
});

// ── Types ─────────────────────────────────────────────────────────────────────

type NLSClub = {
  guid: string;
  name: string;
  wikiUrl: string | null;
  assignedLeague: string | null;
  assignedStep: number | null;
  disableAutoUpdate: boolean;
  nlsStatus: string;
};

type WikiClub = { name: string; url: string };

type Status =
  | "MATCHED"
  | "MATCHED_WRONG_LEAGUE"
  | "MATCHED_UNASSIGNED"
  | "URL_MISMATCH"
  | "WIKI_ONLY"
  | "PYRAMID_ONLY"
  | "UNASSIGNED"
  | "NO_WIKI_LEAGUE";

type Row = {
  wikiLeague: string;
  wikiStep: number | "";
  wikiClubName: string;
  wikiClubUrl: string;
  nlsClubName: string;
  nlsWikiUrl: string;
  nlsAssignedLeague: string;
  nlsAssignedStep: number | "";
  status: Status;
  foundElsewhere: string;
  disableAutoUpdate: string;
  wikiClubLeague: string;
  wikiClubLeagueStep: string;
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

function toRow(row: Row): string {
  return [
    row.wikiLeague, row.wikiStep, row.wikiClubName, row.wikiClubUrl,
    row.nlsClubName, row.nlsWikiUrl, row.nlsAssignedLeague, row.nlsAssignedStep,
    row.status, row.foundElsewhere, row.disableAutoUpdate, row.wikiClubLeague, row.wikiClubLeagueStep,
    row.nlsStatus,
  ].map(csvField).join(",");
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
  } catch {
    // fall back to raw IDs
  }
  return map;
}

// ── Cross-reference lookup ────────────────────────────────────────────────────

type ClubRef = { clubName: string; leagueName: string; step: number };

function buildRef(clubs: NLSClub[]): Map<string, ClubRef[]> {
  const index = new Map<string, ClubRef[]>();
  for (const c of clubs) {
    const norm = normalizeUrl(c.wikiUrl);
    if (!norm) continue;
    const list = index.get(norm) ?? [];
    list.push({ clubName: c.name, leagueName: c.assignedLeague ?? "unassigned", step: c.assignedStep ?? 0 });
    index.set(norm, list);
  }
  return index;
}

function foundElsewhere(
  url: string,
  excludeLeague: string,
  index: Map<string, ClubRef[]>,
): string {
  const norm = normalizeUrl(url);
  if (!norm) return "";
  const refs = (index.get(norm) ?? []).filter((r) => r.leagueName !== excludeLeague);
  return refs.map((r) => `${r.clubName} [${r.step}] ${r.leagueName}`).join("; ");
}

// ── Full outer join ───────────────────────────────────────────────────────────

function outerJoin(
  leagueName: string,
  step: number,
  wikiClubs: WikiClub[],
  assignedNlsClubs: NLSClub[],   // NLS clubs whose PyramidId maps to this league
  allNlsClubs: NLSClub[],         // all NLS clubs for URL lookups
  nlsUrlIndex: Map<string, ClubRef[]>,
): Row[] {
  const rows: Row[] = [];
  const matchedGuids = new Set<string>();

  // Build a URL -> NLSClub[] map across ALL NLS clubs
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

  for (const wClub of wikiClubs) {
    const norm = normalizeUrl(wClub.url);

    // 1. URL match anywhere in NLS — prefer a club assigned to this league, else fall back to lowest step
    const urlCandidates = norm ? allByUrl.get(norm) : undefined;
    const urlMatch = urlCandidates
      ? (urlCandidates.find((c) => c.assignedLeague === leagueName) ??
         urlCandidates.reduce((best, c) =>
           (c.assignedStep ?? Infinity) < (best.assignedStep ?? Infinity) ? c : best))
      : undefined;
    if (urlMatch) {
      matchedGuids.add(urlMatch.guid);
      const leagueMatch = urlMatch.assignedLeague === leagueName;
      const unassigned = !urlMatch.assignedLeague;
      const status: Status = unassigned
        ? "MATCHED_UNASSIGNED"
        : leagueMatch ? "MATCHED" : "MATCHED_WRONG_LEAGUE";

      rows.push({
        wikiLeague: leagueName, wikiStep: step, wikiClubName: wClub.name, wikiClubUrl: wClub.url,
        nlsClubName: urlMatch.name, nlsWikiUrl: urlMatch.wikiUrl ?? "",
        nlsAssignedLeague: urlMatch.assignedLeague ?? "", nlsAssignedStep: urlMatch.assignedStep ?? "",
        status,
        foundElsewhere: status !== "MATCHED" ? foundElsewhere(wClub.url, leagueName, nlsUrlIndex) : "",
        disableAutoUpdate: urlMatch.disableAutoUpdate ? "Y" : "",
        wikiClubLeague: "",
        wikiClubLeagueStep: "",
        nlsStatus: urlMatch.nlsStatus,
      });
      continue;
    }

    // 1.5 FC-pattern fallback: strip A.F.C./F.C. variants from wiki URL and retry, also check stripped NLS URLs
    const strippedWikiNorm = normalizeUrl(stripFCPatterns(wClub.url));
    const fcCandidates =
      (strippedWikiNorm && strippedWikiNorm !== norm ? allByUrl.get(strippedWikiNorm) : undefined) ??
      (norm ? allByStrippedUrl.get(norm) : undefined) ??
      (strippedWikiNorm && strippedWikiNorm !== norm ? allByStrippedUrl.get(strippedWikiNorm) : undefined);
    const fcMatch = fcCandidates
      ? (fcCandidates.find((c) => c.assignedLeague === leagueName) ??
         fcCandidates.reduce((best, c) =>
           (c.assignedStep ?? Infinity) < (best.assignedStep ?? Infinity) ? c : best))
      : undefined;
    if (fcMatch) {
      matchedGuids.add(fcMatch.guid);
      const leagueMatch = fcMatch.assignedLeague === leagueName;
      const unassigned = !fcMatch.assignedLeague;
      const status: Status = unassigned ? "MATCHED_UNASSIGNED" : leagueMatch ? "MATCHED" : "MATCHED_WRONG_LEAGUE";
      rows.push({
        wikiLeague: leagueName, wikiStep: step, wikiClubName: wClub.name, wikiClubUrl: wClub.url,
        nlsClubName: fcMatch.name, nlsWikiUrl: fcMatch.wikiUrl ?? "",
        nlsAssignedLeague: fcMatch.assignedLeague ?? "", nlsAssignedStep: fcMatch.assignedStep ?? "",
        status,
        foundElsewhere: status !== "MATCHED" ? foundElsewhere(wClub.url, leagueName, nlsUrlIndex) : "",
        disableAutoUpdate: fcMatch.disableAutoUpdate ? "Y" : "",
        wikiClubLeague: "", wikiClubLeagueStep: "", nlsStatus: fcMatch.nlsStatus,
      });
      continue;
    }

    // 2. Name match within this league's assigned clubs
    const nameMatch = assignedNlsClubs.find(
      (c) => c.name.toLowerCase().trim() === wClub.name.toLowerCase().trim(),
    );
    if (nameMatch) {
      matchedGuids.add(nameMatch.guid);
      rows.push({
        wikiLeague: leagueName, wikiStep: step, wikiClubName: wClub.name, wikiClubUrl: wClub.url,
        nlsClubName: nameMatch.name, nlsWikiUrl: nameMatch.wikiUrl ?? "",
        nlsAssignedLeague: nameMatch.assignedLeague ?? "", nlsAssignedStep: nameMatch.assignedStep ?? "",
        status: "URL_MISMATCH",
        foundElsewhere: foundElsewhere(wClub.url, leagueName, nlsUrlIndex),
        disableAutoUpdate: nameMatch.disableAutoUpdate ? "Y" : "",
        wikiClubLeague: "",
        wikiClubLeagueStep: "",
        nlsStatus: nameMatch.nlsStatus,
      });
      continue;
    }

    // 2.5 Stripped name fallback across all NLS clubs
    const strippedWikiName = stripNameFCSuffix(wClub.name).toLowerCase().trim();
    const nameFCCandidates = allByStrippedName.get(strippedWikiName);
    const nameFCMatch = nameFCCandidates
      ? (nameFCCandidates.find((c) => c.assignedLeague === leagueName) ??
         nameFCCandidates.reduce((best, c) =>
           (c.assignedStep ?? Infinity) < (best.assignedStep ?? Infinity) ? c : best))
      : undefined;
    if (nameFCMatch) {
      matchedGuids.add(nameFCMatch.guid);
      const leagueMatch = nameFCMatch.assignedLeague === leagueName;
      const unassigned = !nameFCMatch.assignedLeague;
      const status: Status = unassigned ? "MATCHED_UNASSIGNED" : leagueMatch ? "MATCHED" : "MATCHED_WRONG_LEAGUE";
      rows.push({
        wikiLeague: leagueName, wikiStep: step, wikiClubName: wClub.name, wikiClubUrl: wClub.url,
        nlsClubName: nameFCMatch.name, nlsWikiUrl: nameFCMatch.wikiUrl ?? "",
        nlsAssignedLeague: nameFCMatch.assignedLeague ?? "", nlsAssignedStep: nameFCMatch.assignedStep ?? "",
        status,
        foundElsewhere: status !== "MATCHED" ? foundElsewhere(wClub.url, leagueName, nlsUrlIndex) : "",
        disableAutoUpdate: nameFCMatch.disableAutoUpdate ? "Y" : "",
        wikiClubLeague: "", wikiClubLeagueStep: "", nlsStatus: nameFCMatch.nlsStatus,
      });
      continue;
    }

    // 3. Wiki only — no NLS club matched, so no status
    rows.push({
      wikiLeague: leagueName, wikiStep: step, wikiClubName: wClub.name, wikiClubUrl: wClub.url,
      nlsClubName: "", nlsWikiUrl: "", nlsAssignedLeague: "", nlsAssignedStep: "",
      status: "WIKI_ONLY",
      foundElsewhere: foundElsewhere(wClub.url, leagueName, nlsUrlIndex),
      disableAutoUpdate: "",
      wikiClubLeague: "",
      wikiClubLeagueStep: "",
      nlsStatus: "",
    });
  }

  // 4. NLS clubs assigned to this league not found on wiki page
  for (const c of assignedNlsClubs) {
    if (!matchedGuids.has(c.guid)) {
      rows.push({
        wikiLeague: "", wikiStep: "", wikiClubName: "", wikiClubUrl: "",
        nlsClubName: c.name, nlsWikiUrl: c.wikiUrl ?? "",
        nlsAssignedLeague: leagueName, nlsAssignedStep: step,
        status: "PYRAMID_ONLY",
        foundElsewhere: foundElsewhere(c.wikiUrl ?? "", leagueName, nlsUrlIndex),
        disableAutoUpdate: c.disableAutoUpdate ? "Y" : "",
        wikiClubLeague: "",
        wikiClubLeagueStep: "",
        nlsStatus: c.nlsStatus,
      });
    }
  }

  return rows;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const debug = process.argv.includes("--debug");
  const outFile = process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1]
    : "wiki-pyramid-check.csv";
  if (debug) process.env.DEBUG = "1";

  // 1. Fetch reference data for status type labels, then all active clubs
  console.log("Fetching reference data...");
  const statusTypes = await fetchStatusTypes();
  if (statusTypes.size > 0) {
    console.log(`  ${statusTypes.size} status types loaded`);
  } else {
    console.log("  (status type labels unavailable — will show raw IDs)");
  }

  console.log("Fetching club list...");
  const rawClubs = await fetchJson(`${NLS_API.v2}/ClubApi/ClubList`, undefined, z.array(ClubListSchema));
  const activeClubs = rawClubs.filter((c) => c.Active === true);
  console.log(`  ${activeClubs.length} active clubs`);

  // 2. Fetch pyramid data — used to get wiki links and league assignments
  console.log("Fetching pyramid...");
  const pyramid = await fetchJson(`${NLS_API.v3}/PyramidApi/Pyramids`, undefined, z.array(PyramidLeagueSchema));
  const activeLeagues = pyramid.filter((l) => !l.pyramidStepInactive);

  // Build guid → wikiUrl from pyramid embedded clubs
  const guidToWikiUrl = new Map<string, string>();
  for (const league of activeLeagues) {
    for (const c of league.clubs) {
      if (c.ClubWikiLink) guidToWikiUrl.set(c.ClubGuid, c.ClubWikiLink);
    }
  }

  // Build pyramidId (number) → { leagueName, step }
  const pyramidIdToLeague = new Map<number, { leagueName: string; step: number }>();
  for (const league of activeLeagues) {
    pyramidIdToLeague.set(league.pyramidId, { leagueName: league.leagueName, step: league.pyramidStep });
  }

  // Fetch wiki links for unassigned clubs — they don't appear in pyramid data so guidToWikiUrl misses them
  const unassignedGuids = activeClubs
    .filter((c) => {
      const pid = c.PyramidId ? Number(c.PyramidId) : null;
      return !pid || !pyramidIdToLeague.has(pid);
    })
    .map((c) => c.ClubGuid);
  console.log(`Fetching wiki links for ${unassignedGuids.length} unassigned clubs...`);
  for (const guid of unassignedGuids) {
    try {
      const detail = await fetchJson(`${NLS_API.v2}/ClubApi/ClubFullDetailByGuid/${guid}`, undefined, ClubDetailSchema);
      if (detail.ClubWikiLink) guidToWikiUrl.set(guid, detail.ClubWikiLink);
      process.stdout.write(".");
    } catch {
      process.stdout.write("x");
    }
  }
  console.log("\n");

  // 3. Build NLS club records
  const allNlsClubs: NLSClub[] = activeClubs.map((c) => {
    const pyramidId = c.PyramidId ? Number(c.PyramidId) : null;
    const league = pyramidId ? pyramidIdToLeague.get(pyramidId) : undefined;
    const statusId = c.StatusTypeId ?? null;
    const nlsStatus = statusId !== null
      ? (statusTypes.get(statusId) ?? String(statusId))
      : "";
    return {
      guid: c.ClubGuid,
      name: c.ClubName,
      wikiUrl: guidToWikiUrl.get(c.ClubGuid) ?? null,
      assignedLeague: league?.leagueName ?? null,
      assignedStep: league?.step ?? null,
      disableAutoUpdate: c.DisableAutoUpdate === true,
      nlsStatus,
    };
  });

  console.log(`  ${allNlsClubs.filter((c) => c.assignedLeague).length} clubs with league assignment`);
  console.log(`  ${allNlsClubs.filter((c) => !c.assignedLeague).length} clubs without league assignment`);
  console.log(`  ${allNlsClubs.filter((c) => c.wikiUrl).length} clubs with Wikipedia link\n`);

  // Build NLS URL index for cross-reference lookups
  const nlsUrlIndex = buildRef(allNlsClubs);

  // 4. Fetch Wikipedia pages
  const wikiLeagues = activeLeagues.filter(
    (l): l is typeof l & { wikipedia: string; wikiPageSection: string } =>
      l.wikipedia !== null && l.wikiPageSection !== null,
  );

  console.log(`Fetching ${wikiLeagues.length} Wikipedia pages...`);
  const leagueWikiClubs = new Map<number, WikiClub[]>();
  for (const league of wikiLeagues) {
    try {
      const html = await fetchWikipediaPageHtml(league.wikipedia);
      const { clubs } = extractWikipediaSection(html, league.wikiPageSection);
      leagueWikiClubs.set(league.pyramidId, clubs);
      process.stdout.write(".");
    } catch {
      leagueWikiClubs.set(league.pyramidId, []);
      process.stdout.write("x");
    }
  }
  console.log("\n");

  // 5. Full outer join per league
  const allRows: Row[] = [];

  for (const league of wikiLeagues) {
    process.stdout.write(`  [${league.pyramidStep}] ${league.leagueName}... `);

    const wikiClubs = leagueWikiClubs.get(league.pyramidId) ?? [];
    const assignedNlsClubs = allNlsClubs.filter((c) => c.assignedLeague === league.leagueName);

    const rows = outerJoin(league.leagueName, league.pyramidStep, wikiClubs, assignedNlsClubs, allNlsClubs, nlsUrlIndex);
    allRows.push(...rows);

    const counts = (s: Status) => rows.filter((r) => r.status === s).length;
    console.log(
      `wiki:${wikiClubs.length} nls:${assignedNlsClubs.length} ` +
      `matched:${counts("MATCHED")} wrong_league:${counts("MATCHED_WRONG_LEAGUE")} ` +
      `unassigned:${counts("MATCHED_UNASSIGNED")} url_mismatch:${counts("URL_MISMATCH")} ` +
      `wiki_only:${counts("WIKI_ONLY")} pyramid_only:${counts("PYRAMID_ONLY")}`,
    );
  }

  // 6. Add UNASSIGNED rows for active NLS clubs with no league assignment not already captured as MATCHED_UNASSIGNED
  const matchedUnassignedUrls = new Set(
    allRows
      .filter((r) => r.status === "MATCHED_UNASSIGNED" && r.nlsWikiUrl)
      .map((r) => normalizeUrl(r.nlsWikiUrl)),
  );
  for (const club of allNlsClubs.filter((c) => !c.assignedLeague)) {
    const norm = normalizeUrl(club.wikiUrl);
    if (norm && matchedUnassignedUrls.has(norm)) continue;
    allRows.push({
      wikiLeague: "", wikiStep: "", wikiClubName: "", wikiClubUrl: "",
      nlsClubName: club.name, nlsWikiUrl: club.wikiUrl ?? "",
      nlsAssignedLeague: "", nlsAssignedStep: "",
      status: "UNASSIGNED",
      foundElsewhere: foundElsewhere(club.wikiUrl ?? "", "", nlsUrlIndex),
      disableAutoUpdate: club.disableAutoUpdate ? "Y" : "",
      wikiClubLeague: "",
      wikiClubLeagueStep: "",
      nlsStatus: club.nlsStatus,
    });
  }

  // 6b. Add NO_WIKI_LEAGUE rows for clubs assigned to leagues with no Wikipedia page configured
  const wikiLeagueNames = new Set(wikiLeagues.map((l) => l.leagueName));
  for (const club of allNlsClubs) {
    if (!club.assignedLeague || wikiLeagueNames.has(club.assignedLeague)) continue;
    const league = activeLeagues.find((l) => l.leagueName === club.assignedLeague);
    allRows.push({
      wikiLeague: "", wikiStep: "", wikiClubName: "", wikiClubUrl: "",
      nlsClubName: club.name, nlsWikiUrl: club.wikiUrl ?? "",
      nlsAssignedLeague: club.assignedLeague, nlsAssignedStep: club.assignedStep ?? "",
      status: "NO_WIKI_LEAGUE",
      foundElsewhere: foundElsewhere(club.wikiUrl ?? "", club.assignedLeague, nlsUrlIndex),
      disableAutoUpdate: club.disableAutoUpdate ? "Y" : "",
      wikiClubLeague: "",
      wikiClubLeagueStep: league ? String(league.pyramidStep) : "",
      nlsStatus: club.nlsStatus,
    });
  }

  // 7. Enrich PYRAMID_ONLY and UNASSIGNED rows that have a NLS wiki URL with the league from the club's own Wikipedia page
  const wikiUrlToStep = new Map<string, number>();
  for (const league of activeLeagues) {
    if (league.wikipedia) wikiUrlToStep.set(normalizeUrl(league.wikipedia), league.pyramidStep);
  }

  const pyramidOnlyWithUrl = allRows.filter(
    (r) => (r.status === "PYRAMID_ONLY" || r.status === "UNASSIGNED" || r.status === "NO_WIKI_LEAGUE") && r.nlsWikiUrl,
  );
  console.log(`Fetching Wikipedia club pages for ${pyramidOnlyWithUrl.length} PYRAMID_ONLY/UNASSIGNED/NO_WIKI_LEAGUE clubs...`);
  for (const row of pyramidOnlyWithUrl) {
    try {
      const html = await fetchWikipediaPageHtmlByUrl(row.nlsWikiUrl);
      const league = extractClubLeagueFromWikiPage(html);
      if (league) {
        row.wikiClubLeague = league.name;
        const step = wikiUrlToStep.get(normalizeUrl(league.url));
        row.wikiClubLeagueStep = step !== undefined ? String(step) : "NOT IN PYRAMID";
      } else {
        row.wikiClubLeague = "NO_LEAGUE_LINK";
        row.wikiClubLeagueStep = "";
      }
      process.stdout.write(".");
    } catch {
      row.wikiClubLeague = "FETCH_ERROR";
      row.wikiClubLeagueStep = "";
      process.stdout.write("x");
    }
  }
  console.log("\n");

  const header = "WikiLeague,WikiStep,WikiClubName,WikiClubUrl,NLSClubName,NLSWikiUrl,NLSAssignedLeague,NLSAssignedStep,Status,FoundElsewhere,DisableAutoUpdate,WikiClubLeague,WikiClubLeagueStep,NLSStatus";
  writeFileSync(outFile, [header, ...allRows.map(toRow)].join("\n"), "utf8");

  const counts = (s: Status) => allRows.filter((r) => r.status === s).length;
  console.log(`\nOutput: ${outFile}`);
  console.log(
    `MATCHED:${counts("MATCHED")}  MATCHED_WRONG_LEAGUE:${counts("MATCHED_WRONG_LEAGUE")}  ` +
    `MATCHED_UNASSIGNED:${counts("MATCHED_UNASSIGNED")}  URL_MISMATCH:${counts("URL_MISMATCH")}  ` +
    `WIKI_ONLY:${counts("WIKI_ONLY")}  PYRAMID_ONLY:${counts("PYRAMID_ONLY")}  ` +
    `UNASSIGNED:${counts("UNASSIGNED")}  NO_WIKI_LEAGUE:${counts("NO_WIKI_LEAGUE")}`,
  );

  const doClone = process.argv.includes("--clone");
  const doDeactivate = process.argv.includes("--deactivate-no-league");
  const doFixWiki = process.argv.includes("--fix-matched-no-wiki");
  const bulk = process.argv.includes("--bulk");

  if (!doClone && !doDeactivate && !doFixWiki) return;

  // Shared lookup maps
  const urlToGuid = new Map<string, string>();
  const nameToGuid = new Map<string, string>();
  for (const c of allNlsClubs) {
    const norm = normalizeUrl(c.wikiUrl);
    if (norm && !urlToGuid.has(norm)) urlToGuid.set(norm, c.guid);
    if (!nameToGuid.has(c.name.toLowerCase())) nameToGuid.set(c.name.toLowerCase(), c.guid);
  }

  const rl = (!bulk) ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = (q: string) => new Promise<string>((resolve) => rl!.question(q, resolve));

  // ── Clone MATCHED_WRONG_LEAGUE rows ───────────────────────────────────────

  if (doClone) {
    const leagueNameToPyramidId = new Map<string, number>();
    for (const league of activeLeagues) {
      leagueNameToPyramidId.set(league.leagueName, league.pyramidId);
    }

    const cloneRows = allRows.filter(
      (r) => r.status === "MATCHED_WRONG_LEAGUE" && r.wikiClubName && r.wikiClubUrl && r.nlsWikiUrl,
    );

    if (cloneRows.length) {
      console.log(`\n${cloneRows.length} MATCHED_WRONG_LEAGUE rows. For each, clone the NLS club under the Wikipedia name?\n`);

      for (const row of cloneRows) {
        const sourceGuid = urlToGuid.get(normalizeUrl(row.nlsWikiUrl));
        if (!sourceGuid) {
          console.log(`  [skip] ${row.nlsClubName} — could not find source GUID`);
          continue;
        }

        if (!bulk) {
          const answer = await ask(
            `  Clone "${row.nlsClubName}" → "${row.wikiClubName}" [${row.wikiClubUrl}]? (y/n/q): `,
          );
          if (answer.toLowerCase() === "q") break;
          if (answer.toLowerCase() !== "y") continue;
        } else {
          console.log(`  Cloning "${row.nlsClubName}" → "${row.wikiClubName}"...`);
        }

        const pyramidId = row.wikiLeague ? leagueNameToPyramidId.get(row.wikiLeague) : undefined;
        const result = await cloneClub(sourceGuid, row.wikiClubName, row.wikiClubUrl, pyramidId);
        if (result.success) {
          console.log(`    ✓ Created ClubID ${result.newClubId} (${result.newClubGuid})`);
        } else {
          console.log(`    ✗ Failed: ${result.errors.join("; ")}`);
        }
      }
    } else {
      console.log("\nNo MATCHED_WRONG_LEAGUE rows eligible for cloning.");
    }
  }

  // ── Deactivate UNASSIGNED clubs with no Wikipedia league link ─────────────

  if (doDeactivate) {
    const deactivateRows = allRows.filter(
      (r) => r.status === "UNASSIGNED" && r.wikiClubLeague === "NO_LEAGUE_LINK" && r.nlsWikiUrl,
    );

    if (deactivateRows.length) {
      const modeLabel = bulk ? "bulk" : "interactive";
      console.log(`\n${deactivateRows.length} UNASSIGNED clubs with no Wikipedia league link (${modeLabel} mode).\n`);

      for (const row of deactivateRows) {
        const guid = urlToGuid.get(normalizeUrl(row.nlsWikiUrl));
        if (!guid) {
          console.log(`  [skip] ${row.nlsClubName} — could not find GUID`);
          continue;
        }

        if (!bulk) {
          const answer = await ask(`  Set "${row.nlsClubName}" to inactive? (y/n/q): `);
          if (answer.toLowerCase() === "q") break;
          if (answer.toLowerCase() !== "y") continue;
        } else {
          console.log(`  Deactivating "${row.nlsClubName}"...`);
        }

        const result = await setClubInactive(guid);
        if (result.success) {
          console.log(`    ✓ "${result.clubName}" set to inactive`);
        } else {
          console.log(`    ✗ Failed: ${result.errors.join("; ")}`);
        }
      }
    } else {
      console.log("\nNo UNASSIGNED/NO_LEAGUE_LINK rows to deactivate.");
    }
  }

  // ── Add wiki links to matched clubs that have none in NLS ────────────────

  if (doFixWiki) {
    const fixRows = allRows.filter(
      (r) =>
        (r.status === "MATCHED" || r.status === "MATCHED_WRONG_LEAGUE" || r.status === "MATCHED_UNASSIGNED") &&
        !r.nlsWikiUrl &&
        r.wikiClubUrl,
    );

    if (fixRows.length) {
      const modeLabel = bulk ? "bulk" : "interactive";
      console.log(`\n${fixRows.length} matched clubs with no NLS wiki link (${modeLabel} mode).\n`);

      const ClubIdSchema = z.object({ ClubID: z.number(), ClubGuid: z.string().nullable() });

      for (const row of fixRows) {
        const wikiValue = row.wikiClubUrl.replace("https://en.wikipedia.org/wiki/", "");

        if (!bulk) {
          const answer = await ask(
            `  Add wiki "${wikiValue}" to "${row.nlsClubName}" [${row.status}]? (y/n/q): `,
          );
          if (answer.toLowerCase() === "q") break;
          if (answer.toLowerCase() !== "y") continue;
        } else {
          console.log(`  Adding wiki "${wikiValue}" to "${row.nlsClubName}"...`);
        }

        const guid = nameToGuid.get(row.nlsClubName.toLowerCase());
        if (!guid) {
          console.log(`    [skip] ${row.nlsClubName} — could not find GUID`);
          continue;
        }

        try {
          const detail = await fetchJson(
            `${NLS_API.v2}/ClubApi/ClubFullDetailByGuid/${guid}`,
            undefined,
            ClubIdSchema,
          );
          await fetchJson(`${NLS_API.v2}/ClubApi/AddClubSocial`, {
            method: "POST",
            body: {
              SocialMedia_SocialMediaID: 10,
              SocialURL: wikiValue,
              SocialName: wikiValue,
              OwnerType: "O",
              Active: true,
              Club_ClubID: detail.ClubID,
              ClubGuid: guid,
            },
          });
          console.log(`    ✓ Wiki link added to "${row.nlsClubName}"`);
        } catch (e) {
          console.log(`    ✗ Failed: ${e instanceof Error ? e.message : e}`);
        }
      }
    } else {
      console.log("\nNo matched clubs without a wiki link.");
    }
  }

  rl?.close();
}

main().catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
