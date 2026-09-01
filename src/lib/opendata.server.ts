/**
 * Free, keyless public data sources Orin can query directly.
 * Every helper returns compact text the model can reason over, and each is
 * bounded in size so a single tool call can never blow the context budget.
 */

const UA = "Orin AI Browser (research agent)";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Data source failed [${response.status}] for ${new URL(url).hostname}`);
  }
  return (await response.json()) as T;
}

/** Wikidata entity search — evidence, not a truth oracle. */
export async function wikidataSearch(query: string, limit = 5) {
  type Res = { search?: { id: string; label?: string; description?: string }[] };
  const json = await getJson<Res>(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=${limit}&search=${encodeURIComponent(query)}`,
  );
  const rows = (json.search ?? []).map(
    (e) => `${e.id} — ${e.label ?? "(no label)"}: ${e.description ?? "no description"}`,
  );
  return rows.length
    ? `Wikidata supports the following entities (evidence, not proof):\n${rows.join("\n")}`
    : "Wikidata returned no matching entity.";
}

/** Wikimedia/Wikipedia page summary. */
export async function wikipediaSummary(title: string) {
  type Res = { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
  const json = await getJson<Res>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, "_"))}`,
  );
  if (!json.extract) return "Wikipedia has no summary for that title.";
  return `${json.title}\n${json.content_urls?.desktop?.page ?? ""}\n\n${json.extract}`;
}

/** GDELT global news, last N hours. */
export async function gdeltNews(query: string, hours = 48, max = 10) {
  type Res = { articles?: { title?: string; url?: string; seendate?: string; domain?: string }[] };
  const json = await getJson<Res>(
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=${max}&format=json&timespan=${hours}h`,
  );
  const rows = (json.articles ?? []).map(
    (a) => `${a.seendate ?? ""} ${a.domain ?? ""} — ${a.title ?? ""}\n${a.url ?? ""}`,
  );
  return rows.length ? `GDELT news (last ${hours}h):\n\n${rows.join("\n\n")}` : "GDELT found no articles.";
}

/** World Bank indicator series for a country (ISO2/ISO3 code). */
export async function worldBank(country: string, indicator = "NY.GDP.MKTP.CD", years = 6) {
  type Row = { date: string; value: number | null; indicator?: { value?: string } };
  const json = await getJson<[unknown, Row[] | null]>(
    `https://api.worldbank.org/v2/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(indicator)}?format=json&per_page=${years}`,
  );
  const rows = json[1] ?? [];
  if (!rows.length) return "World Bank returned no data for that country/indicator.";
  const name = rows[0]?.indicator?.value ?? indicator;
  return `World Bank — ${name} (${country}):\n${rows
    .map((r) => `${r.date}: ${r.value ?? "no data"}`)
    .join("\n")}`;
}

/** SEC EDGAR full-text search over recent filings. */
export async function secEdgar(query: string, max = 8) {
  type Res = {
    hits?: { hits?: { _source?: { display_names?: string[]; file_type?: string; file_date?: string }; _id?: string }[] };
  };
  const json = await getJson<Res>(
    `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${query}"`)}&forms=&hits=${max}`,
  );
  const hits = json.hits?.hits ?? [];
  if (!hits.length) return "SEC EDGAR full-text search returned no filings.";
  return `SEC EDGAR filings:\n${hits
    .slice(0, max)
    .map((h) => {
      const id = h._id ?? "";
      const [adsh, doc] = id.split(":");
      const acc = (adsh ?? "").replace(/-/g, "");
      const url = adsh ? `https://www.sec.gov/Archives/edgar/data/${acc}/${doc ?? ""}` : "";
      return `${h._source?.file_date ?? ""} ${h._source?.file_type ?? ""} — ${(h._source?.display_names ?? []).join(", ")}\n${url}`;
    })
    .join("\n\n")}`;
}

/** U.S. Census population data by state (ACS 5-year). */
export async function censusPopulation(year = 2022) {
  type Row = string[];
  const json = await getJson<Row[]>(
    `https://api.census.gov/data/${year}/acs/acs5?get=NAME,B01001_001E&for=state:*`,
  );
  const rows = json.slice(1, 60).map((r) => `${r[0]}: ${r[1]}`);
  return `U.S. Census ACS ${year} population by state:\n${rows.join("\n")}`;
}

/** Tavily live web search — only when the workspace has a key configured. */
export async function tavilySearch(query: string, max = 6) {
  const key = process.env["TAVILY_API_KEY"];
  if (!key) return null;
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, max_results: max, search_depth: "advanced" }),
  });
  if (!response.ok) throw new Error(`Tavily failed [${response.status}]`);
  const json = (await response.json()) as {
    answer?: string;
    results?: { title?: string; url?: string; content?: string }[];
  };
  const rows = (json.results ?? []).map(
    (r) => `${r.title ?? r.url}\n${r.url}\n${(r.content ?? "").slice(0, 500)}`,
  );
  return [json.answer ? `Tavily answer: ${json.answer}` : "", ...rows].filter(Boolean).join("\n\n");
}
