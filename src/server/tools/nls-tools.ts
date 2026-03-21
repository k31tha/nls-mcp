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
}
