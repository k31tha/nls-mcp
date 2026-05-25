# Server

MCP tool servers. Two entry points: `nls.ts` (stdio) and `http.ts` (Streamable HTTP via Express). Both register the same tool sets from `tools/`.

## Adding a tool

Register inside the relevant `register*Tools` function in `tools/`. Pattern:

```ts
server.tool("tool_name", "description", { input: z.string() }, async ({ input }) => {
  // ...
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});
```

Validate all NLS API responses with Zod before returning — see `src/lib/generic/fetch-json.ts` for the typed fetch helper.

## League scraper tools

@tools/LEAGUE-SCRAPER.md
