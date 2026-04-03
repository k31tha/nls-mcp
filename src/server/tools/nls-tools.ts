import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

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

const NLS_API_BASE = "https://nonleaguesocial.co.uk/api/v2";
const NLS_API_BASE_V1 = "https://nonleaguesocial.co.uk/api";

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
    async ({ filter }) => {
      let raw: unknown;
      try {
        const response = await fetch(`${NLS_API_BASE}/ClubApi/ClubList`);
        if (!response.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: API returned ${response.status} ${response.statusText}`,
              },
            ],
            isError: true,
          };
        }
        raw = await response.json();
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: fetch failed — ${error}` }],
          isError: true,
        };
      }

      let clubs: z.infer<typeof ClubSchema>[];
      try {
        clubs = z.array(ClubSchema).parse(raw);
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: API response failed validation — ${error}`,
            },
          ],
          isError: true,
        };
      }

      const result = filter === "active" ? clubs.filter((c) => c.Active === true) : clubs;

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },
  );

  server.registerTool(
    "get_pyramid",
    {
      description:
        "Get the full Non League football pyramid. Returns all leagues/divisions (pyramidStep, leagueName) each with their embedded clubs.",
      inputSchema: {},
    },
    async () => {
      try {
        const response = await fetch(`${NLS_API_BASE_V1}/PyramidApi/GetPyramid`);
        if (!response.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: API returned ${response.status} ${response.statusText}`,
              },
            ],
            isError: true,
          };
        }
        const data = await response.json();
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: fetch failed — ${error}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_wiki_page",
    {
      description: "Get the NLS wiki page for a club or entity by its wiki page ID.",
      inputSchema: {
        wikiPageId: z.string().describe("The ID of the NLS wiki page"),
      },
    },
    async ({ wikiPageId }) => {
      try {
        const response = await fetch(`${NLS_API_BASE}/WikiPageApi/WikiPage/${wikiPageId}`);
        if (!response.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: API returned ${response.status} ${response.statusText}`,
              },
            ],
            isError: true,
          };
        }
        const data = await response.json();
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: fetch failed — ${error}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_reference_data",
    {
      description: "Get all NLS reference data (lookup values, enumerations, and configuration used across the platform).",
      inputSchema: {},
    },
    async () => {
      try {
        const response = await fetch(`${NLS_API_BASE}/ReferenceDataApi/ReferenceData/`);
        if (!response.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: API returned ${response.status} ${response.statusText}`,
              },
            ],
            isError: true,
          };
        }
        const data = await response.json();
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: fetch failed — ${error}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "club_detail",
    {
      description: "Get full details for a club by its URL-friendly name.",
      inputSchema: {
        urlFriendlyName: z.string().describe("The URL-friendly name of the club"),
      },
    },
    async ({ urlFriendlyName }) => {
      try {
        const response = await fetch(`${NLS_API_BASE}/ClubApi/ClubFullDetail/${urlFriendlyName}`);
        if (!response.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: API returned ${response.status} ${response.statusText}`,
              },
            ],
            isError: true,
          };
        }
        const data = await response.json();
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: fetch failed — ${error}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "club_detail_by_guid",
    {
      description: "Get full details for a club by its GUID.",
      inputSchema: {
        guid: z.string().describe("The GUID of the club"),
      },
    },
    async ({ guid }) => {
      try {
        const response = await fetch(`${NLS_API_BASE}/ClubApi/ClubFullDetailByGuid/${guid}`);
        if (!response.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: API returned ${response.status} ${response.statusText}`,
              },
            ],
            isError: true,
          };
        }
        const data = await response.json();
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: fetch failed — ${error}` }],
          isError: true,
        };
      }
    },
  );
}
