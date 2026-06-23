---
name: sdk-callTool-already-typed
description: The MCP SDK's client.callTool() already validates through CallToolResultSchema internally — don't re-parse the result
metadata:
  type: project
---

The SDK's `Client.callTool()` (v1.29.0) applies `CallToolResultSchema` validation internally before returning. Its return type is the fully-typed union of content block variants. Any code that calls `CallToolResultSchema.parse(raw)` on the result of `client.callTool()` is double-validating and can be removed.

**Why:** Discovered during the type-safety improvement review of `src/client/gateway.ts`. The original type-safe improvement added the parse call unnecessarily.

**How to apply:** When reviewing gateway.ts or any wrapper around `client.callTool()`, check for redundant Zod parses of the return value. The import of `CallToolResultSchema` from `@modelcontextprotocol/sdk/types.js` is also unnecessary in that context.

Note: `filter((c) => c.type === "text")` does NOT narrow the union type in `.map()`. Use a type predicate: `.filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")`. The original `for...of` with `if (c.type === "text")` also correctly narrows via control flow.
