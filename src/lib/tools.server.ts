/**
 * Orin tool catalog.
 *
 * Every tool is bound to exactly one provider, runs through the provider
 * orchestrator (health, key pool, retries, telemetry) and returns compact text
 * plus any sources it discovered. Agents are granted a subset of these tools —
 * no agent gets the whole catalog.
 */
import { execute, providerJson, isConfigured, missingSecrets, ProviderError, type ProviderId, type Telemetry } from "./providers.server";
import { mapSite, scrapePage, webSearch } from "./firecrawl.server";
import {
  censusPopulation,
  gdeltNews,
  secEdgar,
  wikidataSearch,
  wikipediaSummary,
  worldBank,
} from "./opendata.server";
import type { ToolDef } from "./gemini.server";

export type Source = { url: string; title: string };
export type ToolOutput = { text: string; sources?: Source[] };

export type ToolSpec = {
  name: string;
  provider: ProviderId;
  label: string;
  description: string;
  parameters: Record<string, { type: string; description?: string }>;
  required: string[];
  run: (args: Record<string, unknown>, ctx: { onTelemetry?: (t: Telemetry) => void }) => Promise<ToolOutput>;
};

const UA = "Orin AI Browser (research agent)";

function tel(ctx: { onTelemetry?: (t: Telemetry) => void }) {
  return ctx.onTelemetry ? { onTelemetry: ctx.onTelemetry } : {};
}

/* ------------------------------- search ------------------------------- */

async function tavily(query: string, max: number, ctx: Parameters<ToolSpec["run"]>[1]): Promise<ToolOutput> {
  return execute(
    "tavily",
    "search",
    async ({ key }) => {
      const json = await providerJson<{
        answer?: string;
        results?: { title?: string; url?: string; content?: string }[];
      }>("tavily", "https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ query, max_results: max, search_depth: "advanced" }),
      });
      const results = json.results ?? [];
      if (!results.length) throw new ProviderError("tavily", "empty_result", "Tavily returned no results.");
      return {
        text: [json.answer ? `Tavily answer: ${json.answer}` : "", ...results.map(
          (r) => `${r.title ?? r.url}\n${r.url}\n${(r.content ?? "").slice(0, 500)}`,
        )]
          .filter(Boolean)
          .join("\n\n"),
        sources: results
          .filter((r) => r.url)
          .map((r) => ({ url: r.url!, title: r.title ?? r.url! })),
      };
    },
    { retries: 1, ...tel(ctx) },
  );
}

async function brave(query: string, max: number, ctx: Parameters<ToolSpec["run"]>[1]): Promise<ToolOutput> {
  return execute(
    "brave",
    "search",
    async ({ key }) => {
      const json = await providerJson<{
        web?: { results?: { title?: string; url?: string; description?: string }[] };
      }>(
        "brave",
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}`,
        { headers: { Accept: "application/json", "X-Subscription-Token": key! } },
      );
      const results = json.web?.results ?? [];
      if (!results.length) throw new ProviderError("brave", "empty_result", "Brave returned no results.");
      return {
        text: results.map((r) => `${r.title ?? r.url}\n${r.url}\n${r.description ?? ""}`).join("\n\n"),
        sources: results.filter((r) => r.url).map((r) => ({ url: r.url!, title: r.title ?? r.url! })),
      };
    },
    { retries: 1, ...tel(ctx) },
  );
}

async function searxng(query: string, max: number, ctx: Parameters<ToolSpec["run"]>[1]): Promise<ToolOutput> {
  return execute(
    "searxng",
    "search",
    async ({ key }) => {
      const base = (key ?? "").replace(/\/+$/, "");
      const json = await providerJson<{ results?: { title?: string; url?: string; content?: string }[] }>(
        "searxng",
        `${base}/search?q=${encodeURIComponent(query)}&format=json`,
        { headers: { Accept: "application/json", "User-Agent": UA } },
      );
      const results = (json.results ?? []).slice(0, max);
      if (!results.length) throw new ProviderError("searxng", "empty_result", "SearXNG returned no results.");
      return {
        text: results.map((r) => `${r.title ?? r.url}\n${r.url}\n${(r.content ?? "").slice(0, 400)}`).join("\n\n"),
        sources: results.filter((r) => r.url).map((r) => ({ url: r.url!, title: r.title ?? r.url! })),
      };
    },
    { retries: 1, ...tel(ctx) },
  );
}

/**
 * Search with provider fallback: Tavily → Brave → SearXNG → Firecrawl.
 * Never returns silently empty — it reports which providers failed and why.
 */
async function searchWithFallback(query: string, max: number, ctx: Parameters<ToolSpec["run"]>[1]): Promise<ToolOutput> {
  const chain: [ProviderId, () => Promise<ToolOutput>][] = [
    ["tavily", () => tavily(query, max, ctx)],
    ["brave", () => brave(query, max, ctx)],
    ["searxng", () => searxng(query, max, ctx)],
    [
      "firecrawl",
      async () => {
        const hits = await execute("firecrawl", "search", () => webSearch(query, max), { ...tel(ctx) });
        if (!hits.length) throw new ProviderError("firecrawl", "empty_result", "Firecrawl returned no results.");
        return {
          text: hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.url}\n${h.description ?? ""}`).join("\n\n"),
          sources: hits.map((h) => ({ url: h.url, title: h.title })),
        };
      },
    ],
  ];

  const problems: string[] = [];
  for (const [id, fn] of chain) {
    if (!isConfigured(id)) {
      problems.push(`${id}: not configured (${missingSecrets(id).join(", ") || "credentials"})`);
      continue;
    }
    try {
      return await fn();
    } catch (error) {
      problems.push(`${id}: ${error instanceof Error ? error.message.slice(0, 160) : "failed"}`);
    }
  }
  return {
    text: `SEARCH INCOMPLETE — every search provider failed. Report this transparently to the user:\n${problems.join("\n")}`,
  };
}

/* ------------------------------ the catalog ------------------------------ */

export const TOOLS: ToolSpec[] = [
  {
    name: "web_search",
    provider: "tavily",
    label: "Web search",
    description: "Search the live web (Tavily, falling back to Brave, SearXNG and Firecrawl).",
    parameters: { query: { type: "string" }, limit: { type: "number", description: "1-10" } },
    required: ["query"],
    run: (args, ctx) => searchWithFallback(String(args["query"] ?? ""), Math.min(Number(args["limit"] ?? 5) || 5, 10), ctx),
  },
  {
    name: "read_page",
    provider: "firecrawl",
    label: "Page extraction",
    description: "Extract the readable content of a web page as markdown (Firecrawl).",
    parameters: { url: { type: "string" } },
    required: ["url"],
    run: async (args, ctx) => {
      const page = await execute("firecrawl", "scrape", () => scrapePage(String(args["url"] ?? "")), { ...tel(ctx) });
      return {
        text: `# ${page.title}\n${page.url}\n\n${page.markdown}`,
        sources: [{ url: page.url, title: page.title }],
      };
    },
  },
  {
    name: "map_site",
    provider: "firecrawl",
    label: "Site map",
    description: "List the URLs available on a website, optionally filtered by keyword (Firecrawl).",
    parameters: { url: { type: "string" }, search: { type: "string" } },
    required: ["url"],
    run: async (args, ctx) => {
      const links = await execute(
        "firecrawl",
        "map",
        () => mapSite(String(args["url"] ?? ""), args["search"] ? String(args["search"]) : undefined),
        { ...tel(ctx) },
      );
      return { text: links.join("\n") || "No URLs found." };
    },
  },
  {
    name: "news",
    provider: "gdelt",
    label: "GDELT news",
    description: "Global live news and event monitoring for an entity or topic (GDELT).",
    parameters: { query: { type: "string" }, hours: { type: "number" } },
    required: ["query"],
    run: async (args, ctx) => ({
      text: await execute(
        "gdelt",
        "news",
        () => gdeltNews(String(args["query"] ?? ""), Number(args["hours"] ?? 48)),
        { retries: 1, ...tel(ctx) },
      ),
    }),
  },
  {
    name: "sec_edgar",
    provider: "sec_edgar",
    label: "SEC EDGAR",
    description: "Search U.S. SEC EDGAR filings for a public company (primary-source evidence).",
    parameters: { query: { type: "string" } },
    required: ["query"],
    run: async (args, ctx) => ({
      text: await execute("sec_edgar", "filings", () => secEdgar(String(args["query"] ?? "")), { retries: 1, ...tel(ctx) }),
    }),
  },
  {
    name: "world_bank",
    provider: "world_bank",
    label: "World Bank",
    description: "World Bank indicator series for a country code (e.g. US, IN). Default indicator NY.GDP.MKTP.CD.",
    parameters: { country: { type: "string" }, indicator: { type: "string" } },
    required: ["country"],
    run: async (args, ctx) => ({
      text: await execute(
        "world_bank",
        "indicator",
        () => worldBank(String(args["country"] ?? "WLD"), String(args["indicator"] ?? "NY.GDP.MKTP.CD")),
        { retries: 1, ...tel(ctx) },
      ),
    }),
  },
  {
    name: "wikidata",
    provider: "wikidata",
    label: "Wikidata",
    description: "Structured entity lookup in Wikidata. Supporting evidence — cross-check important claims.",
    parameters: { query: { type: "string" } },
    required: ["query"],
    run: async (args, ctx) => ({
      text: await execute("wikidata", "entities", () => wikidataSearch(String(args["query"] ?? "")), { ...tel(ctx) }),
    }),
  },
  {
    name: "wikimedia",
    provider: "wikimedia",
    label: "Wikimedia",
    description: "Wikimedia/Wikipedia article summary for a topic, company or person.",
    parameters: { title: { type: "string" } },
    required: ["title"],
    run: async (args, ctx) => ({
      text: await execute("wikimedia", "summary", () => wikipediaSummary(String(args["title"] ?? "")), { ...tel(ctx) }),
    }),
  },
  {
    name: "us_census",
    provider: "us_census",
    label: "U.S. Census",
    description: "U.S. Census ACS population by state.",
    parameters: { year: { type: "number" } },
    required: [],
    run: async (args, ctx) => ({
      text: await execute("us_census", "acs", () => censusPopulation(Number(args["year"] ?? 2022)), { ...tel(ctx) }),
    }),
  },
  {
    name: "weather",
    provider: "open_meteo",
    label: "Open-Meteo",
    description: "Current weather and multi-day forecast for a latitude/longitude (Open-Meteo).",
    parameters: {
      latitude: { type: "number" },
      longitude: { type: "number" },
      place: { type: "string", description: "Name of the place, for labelling" },
    },
    required: ["latitude"],
    run: async (args, ctx) => {
      const lat = Number(args["latitude"]);
      const lon = Number(args["longitude"]);
      const json = await execute(
        "open_meteo",
        "forecast",
        () =>
          providerJson<{
            current?: Record<string, unknown>;
            daily?: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_sum?: number[] };
          }>(
            "open_meteo",
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=7&timezone=auto`,
          ),
        { retries: 1, ...tel(ctx) },
      );
      const daily = json.daily;
      const rows = (daily?.time ?? []).map(
        (d, i) =>
          `${d}: ${daily?.temperature_2m_min?.[i] ?? "?"}–${daily?.temperature_2m_max?.[i] ?? "?"}°C, precip ${daily?.precipitation_sum?.[i] ?? 0}mm`,
      );
      return {
        text: `Open-Meteo for ${args["place"] ?? `${lat},${lon}`}\nCurrent: ${JSON.stringify(json.current ?? {})}\n\n${rows.join("\n")}`,
      };
    },
  },
  {
    name: "geocode",
    provider: "nominatim",
    label: "Nominatim",
    description: "Geocode a place name or address to coordinates (OpenStreetMap Nominatim).",
    parameters: { query: { type: "string" } },
    required: ["query"],
    run: async (args, ctx) => {
      const rows = await execute(
        "nominatim",
        "geocode",
        () =>
          providerJson<{ display_name?: string; lat?: string; lon?: string; type?: string }[]>(
            "nominatim",
            `https://nominatim.openstreetmap.org/search?format=json&limit=3&q=${encodeURIComponent(String(args["query"] ?? ""))}`,
            { headers: { "User-Agent": UA, Accept: "application/json" } },
          ),
        { retries: 1, ...tel(ctx) },
      );
      if (!rows.length) return { text: "Nominatim found no matching place." };
      return {
        text: rows.map((r) => `${r.display_name} (${r.type}) — lat ${r.lat}, lon ${r.lon}`).join("\n"),
      };
    },
  },
  {
    name: "sheets_append",
    provider: "google_sheets",
    label: "Google Sheets",
    description: "Append a row of values to a Google Sheet (spreadsheet_id, range, values).",
    parameters: {
      spreadsheet_id: { type: "string" },
      range: { type: "string", description: "e.g. Sheet1!A:D" },
      values: { type: "string", description: "Comma-separated cell values" },
    },
    required: ["spreadsheet_id"],
    run: async (args, ctx) => {
      const id = String(args["spreadsheet_id"] ?? "");
      const range = String(args["range"] ?? "Sheet1!A:Z");
      const values = String(args["values"] ?? "").split(",");
      await execute(
        "google_sheets",
        "append",
        async ({ key }) =>
          providerJson<unknown>(
            "google_sheets",
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
              body: JSON.stringify({ values: [values] }),
            },
          ),
        { ...tel(ctx) },
      );
      return { text: `Appended 1 row to ${range}.` };
    },
  },
  {
    name: "draft_outreach_email",
    provider: "brevo",
    label: "Brevo draft",
    description:
      "Prepare a personalized outreach email for user approval. This NEVER sends — it returns the draft for the approval gate.",
    parameters: {
      to: { type: "string" },
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["to"],
    run: async (args) => {
      const configured = isConfigured("brevo");
      return {
        text: `DRAFT PREPARED (not sent — awaiting user approval)\nProvider: Brevo ${
          configured ? "(configured)" : `(NOT configured — missing ${missingSecrets("brevo").join(", ")})`
        }\nTo: ${args["to"]}\nSubject: ${args["subject"]}\n\n${args["body"]}`,
      };
    },
  },
  {
    name: "notify",
    provider: "fcm",
    label: "Push notification",
    description: "Send an Orin push notification about a verified, important signal (Firebase Cloud Messaging).",
    parameters: { title: { type: "string" }, message: { type: "string" }, importance: { type: "number" } },
    required: ["title"],
    run: async (args, ctx) => {
      if (!isConfigured("fcm")) {
        return {
          text: `Notification not sent — Firebase Cloud Messaging is not configured (missing ${missingSecrets("fcm").join(", ")}). Tell the user which secret to add.`,
        };
      }
      await execute(
        "fcm",
        "send",
        async ({ key }) =>
          providerJson<unknown>("fcm", "https://fcm.googleapis.com/fcm/send", {
            method: "POST",
            headers: { Authorization: `key=${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              to: process.env["FCM_DEFAULT_TOPIC"] ?? "/topics/orin",
              notification: { title: String(args["title"] ?? "Orin signal"), body: String(args["message"] ?? "") },
            }),
          }),
        { ...tel(ctx) },
      );
      return { text: "Notification delivered via FCM." };
    },
  },
  {
    name: "browser_action",
    provider: "steel",
    label: "Steel + Playwright",
    description:
      "Control the remote Steel browser through Playwright: navigate, click, type, scroll, read, screenshot.",
    parameters: {
      action: { type: "string", description: "navigate | click | type | scroll | read" },
      target: { type: "string", description: "URL or selector/description" },
      value: { type: "string" },
    },
    required: ["action"],
    run: async (args) => {
      if (!isConfigured("steel")) {
        return {
          text: `Browser action "${args["action"]}" could not run — the Steel remote browser is not configured (missing ${missingSecrets("steel").join(", ")}). Report this to the user instead of pretending the action succeeded.`,
        };
      }
      const { runBrowserAction } = await import("./browser.server");
      return { text: await runBrowserAction(String(args["action"]), String(args["target"] ?? ""), String(args["value"] ?? "")) };
    },
  },
];

export function toolByName(name: string) {
  return TOOLS.find((t) => t.name === name);
}

export function toolDefs(names: string[]): ToolDef[] {
  return names
    .map((name) => toolByName(name))
    .filter((t): t is ToolSpec => Boolean(t))
    .map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: "object",
          properties: t.parameters,
          required: t.required,
          additionalProperties: false,
        },
      },
    }));
}
