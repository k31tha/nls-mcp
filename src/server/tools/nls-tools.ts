import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiCall } from "../../lib/generic/api-call.js";
import { fetchJson } from "../../lib/generic/fetch-json.js";
import { NLS_API } from "../../lib/nls/config.js";
import { cloneClub } from "../../lib/nls/club-clone.js";
import { setClubInactive } from "../../lib/nls/club-status.js";
import { fetchWikipediaPageHtml, extractWikipediaSection } from "../../lib/nls/wikipedia.js";

const PyramidLeagueClubSchema = z.object({
  pyramidId: z.number(),
  leagueName: z.string(),
  leagueUrl: z.string(),
  pyramidStep: z.number(),
  pyramidStepInactive: z.boolean(),
  wikipedia: z.string(),
  wikiPageSection: z.string(),
  websiteClubsPage: z.string().nullable(),
  clubs: z.array(z.unknown()),
});

const ClubSchema = z.object({
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
  ClubGuid: z.string(),
  MinorClub: z.boolean().nullable(),
  DisableAutoUpdate: z.boolean().nullable(),
  StatusTypeId: z.number().nullable(),
});

export function registerNlsTools(server: McpServer): void {
  server.registerTool(
    "club_list",
    {
      description:
        'Get a list of clubs from Non League Social. Use filter "active" for active clubs only or "all" for every club.',
      inputSchema: {
        filter: z
          .enum(["active", "all"])
          .default("all")
          .describe('Filter clubs: "active" for active clubs only, "all" for every club'),
      },
    },
    async ({ filter }) =>
      apiCall(
        `${NLS_API.v2}/ClubApi/ClubList`,
        undefined,
        z.array(ClubSchema),
        (clubs) => (filter === "active" ? clubs.filter((c) => c.Active === true) : clubs),
      ),
  );

  server.registerTool(
    "get_pyramid",
    {
      description:
        "Get the full Non League football pyramid. Returns all leagues/divisions (pyramidStep, leagueName) each with their embedded clubs.",
      inputSchema: {},
    },
    () => apiCall(`${NLS_API.v1}/PyramidApi/GetPyramid`),
  );

  server.registerTool(
    "get_wiki_page",
    {
      description: "Get the NLS wiki page for a club or entity by name.",
      inputSchema: {
        name: z.string().describe("The name of the NLS wiki page"),
      },
    },
    ({ name }) => apiCall(`${NLS_API.v3}/WikiPageApi/WikiPages/${name}`),
  );

  server.registerTool(
    "get_reference_data",
    {
      description: "Get all NLS reference data (lookup values, enumerations, and configuration used across the platform).",
      inputSchema: {},
    },
    () => apiCall(`${NLS_API.v2}/ReferenceDataApi/ReferenceData/`),
  );

  server.registerTool(
    "club_search",
    {
      description: "Search for clubs by name or term.",
      inputSchema: {
        term: z.string().describe("The search term to find clubs"),
      },
    },
    ({ term }) => apiCall(`${NLS_API.v1}/ClubApi/ClubSearch/${encodeURIComponent(term)}`),
  );

  server.registerTool(
    "club_detail",
    {
      description: "Get full details for a club by its URL-friendly name.",
      inputSchema: {
        urlFriendlyName: z.string().describe("The URL-friendly name of the club"),
      },
    },
    ({ urlFriendlyName }) => apiCall(`${NLS_API.v2}/ClubApi/ClubFullDetail/${urlFriendlyName}`),
  );

  server.registerTool(
    "club_detail_by_guid",
    {
      description: "Get full details for a club by its GUID.",
      inputSchema: {
        guid: z.string().describe("The GUID of the club"),
      },
    },
    ({ guid }) => apiCall(`${NLS_API.v2}/ClubApi/ClubFullDetailByGuid/${guid}`),
  );

  server.registerTool(
    "search_pyramids",
    {
      description:
        "Search the Non League pyramid using optional filters. Provide one or more filters to narrow results; omit all to return the full pyramid list.",
      inputSchema: {
        pyramidId: z.number().optional().describe("Filter by pyramid ID"),
        leagueName: z.string().optional().describe("Filter by league name"),
        leagueUrl: z.string().optional().describe("Filter by league URL"),
        pyramidStep: z.number().optional().describe("Filter by pyramid step level"),
        wikipedia: z.string().optional().describe("Filter by Wikipedia article name"),
      },
    },
    ({ pyramidId, leagueName, leagueUrl, pyramidStep, wikipedia }) => {
      const params = new URLSearchParams();
      if (pyramidId !== undefined) params.append("pyramidId", String(pyramidId));
      if (leagueName !== undefined) params.append("leagueName", leagueName);
      if (leagueUrl !== undefined) params.append("leagueUrl", leagueUrl);
      if (pyramidStep !== undefined) params.append("pyramidStep", String(pyramidStep));
      if (wikipedia !== undefined) params.append("wikipedia", wikipedia);
      const qs = params.toString();
      return apiCall(`${NLS_API.v3}/PyramidApi/Pyramids${qs ? `?${qs}` : ""}`, undefined, z.array(PyramidLeagueClubSchema));
    },
  );

  server.registerTool(
    "clone_club",
    {
      description:
        "Clone an NLS club record under a new name and add a Wikipedia social link. Copies address, website, and contact details from the source club. Use for MATCHED_WRONG_LEAGUE rows where Wikipedia lists the club under a different name than NLS.",
      inputSchema: {
        sourceClubGuid: z.string().describe("GUID of the NLS club to clone from"),
        newClubName: z.string().describe("Name for the new club record (e.g. the WikiClubName from the report)"),
        wikiUrl: z.string().optional().describe("Wikipedia URL to add as a social link. Defaults to the source club's existing Wikipedia link."),
        pyramidId: z.number().optional().describe("Pyramid ID of the league to assign the new club to."),
      },
    },
    async ({ sourceClubGuid, newClubName, wikiUrl, pyramidId }) => {
      try {
        const result = await cloneClub(sourceClubGuid, newClubName, wikiUrl, pyramidId);
        if (result.success) {
          const prefix = result.alreadyExisted ? "Club already existed" : "Created club";
          return {
            content: [{
              type: "text",
              text: `${prefix} "${newClubName}" — ClubID: ${result.newClubId}, GUID: ${result.newClubGuid}`,
            }],
          };
        }
        return {
          content: [{ type: "text", text: `Failed: ${result.errors.join("; ")}` }],
          isError: true,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "set_club_inactive",
    {
      description: "Set an NLS club record to inactive by GUID. Fetches current club data and re-saves it with Active set to false.",
      inputSchema: {
        guid: z.string().describe("The GUID of the club to set inactive"),
      },
    },
    async ({ guid }) => {
      try {
        const result = await setClubInactive(guid);
        if (result.success) {
          return {
            content: [{ type: "text", text: `"${result.clubName}" (${guid}) set to inactive.` }],
          };
        }
        return {
          content: [{ type: "text", text: `Failed: ${result.errors.join("; ")}` }],
          isError: true,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_pyramid_wikipedia_section",
    {
      description:
        "Look up a pyramid league by name or ID, then fetch and extract the relevant section from its Wikipedia article using the wikipedia and wikiPageSection fields from the pyramid record. Returns paragraphs, links, and table rows from that section.",
      inputSchema: {
        pyramidId: z.number().optional().describe("Pyramid league ID"),
        leagueName: z.string().optional().describe("Pyramid league name (partial match supported)"),
      },
    },
    async ({ pyramidId, leagueName }) => {
      try {
        const params = new URLSearchParams();
        if (pyramidId !== undefined) params.append("pyramidId", String(pyramidId));
        if (leagueName !== undefined) params.append("leagueName", leagueName);
        const qs = params.toString();

        const leagues = await fetchJson(
          `${NLS_API.v3}/PyramidApi/Pyramids${qs ? `?${qs}` : ""}`,
          undefined,
          z.array(PyramidLeagueClubSchema),
        );

        if (!leagues.length) {
          return { content: [{ type: "text", text: "No matching pyramid league found." }] };
        }

        const league = leagues[0];
        const { wikipedia, wikiPageSection, leagueName: name } = league;

        if (!wikipedia) {
          return { content: [{ type: "text", text: `League "${name}" has no Wikipedia article linked.` }] };
        }

        const html = await fetchWikipediaPageHtml(wikipedia);
        const result = extractWikipediaSection(html, wikiPageSection);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ league: name, wikipedia, wikiPageSection, ...result }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
