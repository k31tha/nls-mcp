import { z } from "zod";

function log(...args: unknown[]) {
  if (process.env.DEBUG === "1" || process.env.DEBUG === "true") console.error("[fetchJson]", ...args);
}

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export async function fetchJson<T = unknown>(
  url: string,
  options?: { method?: string; body?: unknown },
  schema?: z.ZodType<T>,
): Promise<T> {
  const method = options?.method ?? "GET";
  const init: RequestInit = {
    method,
    headers: {
      Accept: "application/json",
      ...(options?.body !== undefined && { "Content-Type": "application/json" }),
    },
    ...(options?.body !== undefined && { body: JSON.stringify(options.body) }),
  };

  log(`→ ${method} ${url}`);
  if (options?.body !== undefined) log("  body:", JSON.stringify(options.body).slice(0, 500));

  const response = await fetch(url, init);

  log(`← ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "(could not read body)");
    log("  error body:", bodyText.slice(0, 1000));
    const bodySnippet = bodyText.trim() ? ` — ${bodyText.trim().slice(0, 300)}` : "";
    throw new HttpError(response.status, `${response.status} ${response.statusText} — ${method} ${url}${bodySnippet}`);
  }

  const raw = await response.json();

  return schema ? schema.parse(raw) : (raw as T);
}
