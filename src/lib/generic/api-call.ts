import { z } from "zod";
import { fetchJson, HttpError } from "./fetch-json.js";

export type ApiCallResult = { content: [{ type: "text"; text: string }]; isError?: true };

export async function apiCall<T>(
  url: string,
  options?: { method?: string; body?: unknown },
  schema?: z.ZodType<T>,
  transform?: (data: T) => unknown,
): Promise<ApiCallResult> {
  try {
    const data = await fetchJson<T>(url, options, schema);
    return { content: [{ type: "text", text: JSON.stringify(transform ? transform(data) : data) }] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        content: [{ type: "text", text: `Error: API response failed validation — ${error}` }],
        isError: true,
      };
    }
    if (error instanceof HttpError) {
      return {
        content: [{ type: "text", text: `Error: API returned ${error.message}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: `Error: fetch failed — ${error}` }],
      isError: true,
    };
  }
}
