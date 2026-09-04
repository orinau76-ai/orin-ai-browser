import { createServerFn } from "@tanstack/react-start";

export type SearchResult = {
  title: string;
  url: string;
  content: string;
  engine: string;
};

export type SearchResponse = {
  results: SearchResult[];
  source: string;
  error?: string;
};

const SEARX_INSTANCES = ["https://searx.be", "https://searxng.site", "https://priv.au"];

function normalize(raw: unknown, engine: string): SearchResult[] {
  const list = Array.isArray((raw as { results?: unknown })?.results)
    ? ((raw as { results: unknown[] }).results as Record<string, unknown>[])
    : [];
  return list
    .map((item) => ({
      title: String(item["title"] ?? "").trim(),
      url: String(item["url"] ?? "").trim(),
      content: String(item["content"] ?? item["snippet"] ?? "").trim(),
      engine: String(item["engine"] ?? engine),
    }))
    .filter((r) => r.title && r.url);
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "OrinBrowser/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}

/** Queries SearXNG (self-hosted first, then public instances), falling back to Tavily. */
export const searchWeb = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) => ({ query: String(input.query ?? "").slice(0, 400).trim() }))
  .handler(async ({ data }): Promise<SearchResponse> => {
    if (!data.query) return { results: [], source: "none" };

    const bases = [process.env["SEARXNG_URL"], ...SEARX_INSTANCES].filter(Boolean) as string[];
    const failures: string[] = [];

    for (const base of bases) {
      const url = `${base.replace(/\/$/, "")}/search?q=${encodeURIComponent(data.query)}&format=json`;
      try {
        const results = normalize(await fetchJson(url), new URL(base).hostname);
        if (results.length) return { results, source: new URL(base).hostname };
        failures.push(`${new URL(base).hostname}: no results`);
      } catch (error) {
        failures.push(`${new URL(base).hostname}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }

    // Public SearXNG instances often block anonymous JSON output; Tavily covers that gap.
    const tavilyKey = (process.env["TAVILY_API_KEY"] ?? process.env["TAVILY_API_KEY_1"] ?? "").split(",")[0]?.trim();
    if (tavilyKey) {
      try {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: tavilyKey, query: data.query, max_results: 10 }),
          signal: AbortSignal.timeout(15_000),
        });
        if (response.ok) {
          const payload = (await response.json()) as { results?: Record<string, unknown>[] };
          const results = (payload.results ?? [])
            .map((item) => ({
              title: String(item["title"] ?? ""),
              url: String(item["url"] ?? ""),
              content: String(item["content"] ?? ""),
              engine: "tavily",
            }))
            .filter((r) => r.title && r.url);
          if (results.length) return { results, source: "tavily" };
        }
        failures.push(`tavily: ${response.status}`);
      } catch (error) {
        failures.push(`tavily: ${error instanceof Error ? error.message : "failed"}`);
      }
    }

    return { results: [], source: "none", error: failures.join(" · ") };
  });
