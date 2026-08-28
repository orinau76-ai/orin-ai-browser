const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";

function keys() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connKey = process.env["FIRECRAWL_API_KEY"];
  if (!lovableKey || !connKey) {
    throw new Error("Web data provider is not configured for this app.");
  }
  return { lovableKey, connKey };
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const { lovableKey, connKey } = keys();
  const response = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(`Firecrawl ${path} failed [${response.status}]: ${text}`);
    throw new Error(`Web request failed [${response.status}]: ${text.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

export type SearchHit = {
  url: string;
  title: string;
  description?: string;
  markdown?: string;
};

type SearchResponse = {
  data?: SearchHit[] | { web?: SearchHit[] };
};

export async function webSearch(
  query: string,
  limit = 6,
  withContent = false,
): Promise<SearchHit[]> {
  const json = await call<SearchResponse>("/search", {
    query,
    limit: Math.min(Math.max(limit, 1), 10),
    ...(withContent ? { scrapeOptions: { formats: ["markdown"] } } : {}),
  });
  const raw = Array.isArray(json.data) ? json.data : (json.data?.web ?? []);
  return raw.map((hit) => ({
    url: hit.url,
    title: hit.title ?? hit.url,
    description: hit.description,
    markdown: hit.markdown ? hit.markdown.slice(0, 6000) : undefined,
  }));
}

type ScrapeResponse = {
  markdown?: string;
  summary?: string;
  metadata?: { title?: string; sourceURL?: string };
  data?: {
    markdown?: string;
    summary?: string;
    metadata?: { title?: string; sourceURL?: string };
  };
};

export async function scrapePage(url: string, wantSummary = false) {
  const json = await call<ScrapeResponse>("/scrape", {
    url,
    formats: wantSummary ? ["markdown", "summary"] : ["markdown"],
    onlyMainContent: true,
  });
  const doc = json.data ?? json;
  return {
    url: doc.metadata?.sourceURL ?? url,
    title: doc.metadata?.title ?? url,
    summary: doc.summary,
    markdown: (doc.markdown ?? "").slice(0, 20000),
  };
}

type MapResponse = { links?: (string | { url: string })[] };

export async function mapSite(url: string, search?: string, limit = 30) {
  const json = await call<MapResponse>("/map", { url, search, limit });
  return (json.links ?? []).map((link) => (typeof link === "string" ? link : link.url));
}
