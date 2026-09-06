/**
 * Orin RAG pipeline.
 *
 * Text-only, no browser viewport is ever rendered: every indexer returns raw
 * text or markdown over HTTP, so a high-volume scan costs milliseconds of
 * parsing instead of seconds of Chromium paint time.
 *
 * scan(query) → fan-out to dedicated indexers → dedupe → chunk → rank →
 * strict source-mapped evidence pack where every chunk carries the exact
 * [S#] id and URL it came from. Nothing reaches the model unmapped.
 */
import { scrapePage, webSearch } from "./firecrawl.server";
import { gdeltNews, tavilySearch, wikipediaSummary } from "./opendata.server";

export type Passage = {
  id: string; // S1, S2, ...
  url: string;
  title: string;
  text: string;
  indexer: string;
  score: number;
};

export type ScanResult = {
  evidence: string;
  passages: Passage[];
  sources: { url: string; title: string }[];
  indexers: string[];
  documents: number;
};

type Doc = { url: string; title: string; text: string; indexer: string };

const STOP = new Set(
  "the a an of and or to in on for with is are was were be by from as at it this that what which how why when who whose whom about into over under".split(
    " ",
  ),
);

function terms(query: string) {
  return [
    ...new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2 && !STOP.has(t)),
    ),
  ];
}

function canonical(url: string) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

/** Split a document into overlapping passages small enough to rank precisely. */
function chunk(text: string, size = 900, overlap = 120) {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const out: string[] = [];
  for (let i = 0; i < clean.length && out.length < 40; i += size - overlap) {
    const piece = clean.slice(i, i + size).trim();
    if (piece.length > 120) out.push(piece);
  }
  return out;
}

/** BM25-flavoured lexical score: term frequency saturation + rare-term weighting. */
function score(passage: string, queryTerms: string[], df: Map<string, number>, docs: number) {
  const words = passage.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (!words.length) return 0;
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const len = words.length;
  let total = 0;
  for (const term of queryTerms) {
    const tf = counts.get(term) ?? 0;
    if (!tf) continue;
    const idf = Math.log(1 + (docs - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5));
    total += idf * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (len / 220))));
  }
  return total;
}

async function safe<T>(label: string, run: () => Promise<T>): Promise<{ label: string; value: T | null }> {
  try {
    return { label, value: await run() };
  } catch (error) {
    console.error(`RAG indexer ${label} failed:`, error instanceof Error ? error.message : error);
    return { label, value: null };
  }
}

/**
 * High-volume scan across the dedicated indexers, returning a ranked,
 * source-mapped evidence pack.
 */
export async function scan(
  query: string,
  options: { breadth?: number; depth?: number; passages?: number; news?: boolean } = {},
): Promise<ScanResult> {
  const breadth = Math.min(Math.max(options.breadth ?? 8, 3), 10);
  const depth = Math.min(Math.max(options.depth ?? 4, 0), 6);
  const wanted = Math.min(Math.max(options.passages ?? 14, 6), 24);
  const queryTerms = terms(query);
  const usedIndexers: string[] = [];

  // 1. Fan-out across indexers in parallel — all plain HTTP/JSON.
  const [web, news, encyclopedic, fallback] = await Promise.all([
    safe("firecrawl", () => webSearch(query, breadth, true)),
    options.news === false ? Promise.resolve({ label: "gdelt", value: null }) : safe("gdelt", () => gdeltNews(query, 72)),
    safe("wikipedia", () => wikipediaSummary(query)),
    safe("tavily", () => tavilySearch(query)),
  ]);

  const docs: Doc[] = [];
  const seen = new Set<string>();
  const push = (doc: Doc) => {
    const key = canonical(doc.url);
    if (!doc.text.trim() || seen.has(key)) return;
    seen.add(key);
    docs.push(doc);
  };

  if (web.value?.length) {
    usedIndexers.push("firecrawl");
    for (const hit of web.value) {
      push({
        url: hit.url,
        title: hit.title,
        text: hit.markdown || hit.description || hit.title,
        indexer: "firecrawl",
      });
    }
  }

  const textIndexers: [string, string | null][] = [
    ["gdelt", typeof news.value === "string" ? news.value : null],
    ["wikipedia", typeof encyclopedic.value === "string" ? encyclopedic.value : null],
    ["tavily", typeof fallback.value === "string" ? fallback.value : null],
  ];
  for (const [label, text] of textIndexers) {
    if (!text || !text.trim() || /^no results/i.test(text)) continue;
    usedIndexers.push(label);
    // These indexers return line-oriented digests; keep the whole digest as one
    // document but attribute each line's own URL where present.
    for (const block of text.split(/\n{2,}/)) {
      const url = block.match(/https?:\/\/\S+/)?.[0]?.replace(/[),.]+$/, "");
      push({
        url: url ?? `https://orin.local/${label}`,
        title: block.split("\n")[0]?.slice(0, 120) || label,
        text: block,
        indexer: label,
      });
    }
  }

  // 2. Deep read the most promising unread pages (markdown extraction, no render).
  if (depth > 0) {
    const shallow = docs
      .filter((d) => d.indexer === "firecrawl" && d.text.length < 1200 && /^https?:/.test(d.url))
      .slice(0, depth);
    const read = await Promise.all(
      shallow.map((d) => safe("read", () => scrapePage(d.url))),
    );
    for (const item of read) {
      if (!item.value?.markdown) continue;
      const target = docs.find((d) => canonical(d.url) === canonical(item.value!.url));
      if (target) {
        target.text = item.value.markdown;
        target.title = item.value.title || target.title;
      }
    }
  }

  // 3. Chunk + rank with strict provenance on every passage.
  const df = new Map<string, number>();
  const chunked = docs.flatMap((doc) =>
    chunk(doc.text).map((text) => ({ doc, text })),
  );
  for (const item of chunked) {
    const present = new Set(item.text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    for (const term of queryTerms) if (present.has(term)) df.set(term, (df.get(term) ?? 0) + 1);
  }

  const ranked = chunked
    .map((item) => ({ ...item, value: score(item.text, queryTerms, df, chunked.length || 1) }))
    .sort((a, b) => b.value - a.value);

  // Cap passages per document so one long page cannot crowd out other sources.
  const perDoc = new Map<string, number>();
  const picked: typeof ranked = [];
  for (const item of ranked) {
    const key = canonical(item.doc.url);
    const count = perDoc.get(key) ?? 0;
    if (count >= 3) continue;
    perDoc.set(key, count + 1);
    picked.push(item);
    if (picked.length >= wanted) break;
  }

  const sourceIds = new Map<string, string>();
  const sources: { url: string; title: string }[] = [];
  const passages: Passage[] = picked.map((item) => {
    const key = canonical(item.doc.url);
    let id = sourceIds.get(key);
    if (!id) {
      id = `S${sources.length + 1}`;
      sourceIds.set(key, id);
      sources.push({ url: item.doc.url, title: item.doc.title });
    }
    return {
      id,
      url: item.doc.url,
      title: item.doc.title,
      text: item.text,
      indexer: item.doc.indexer,
      score: Number(item.value.toFixed(3)),
    };
  });

  const evidence = passages.length
    ? [
        `EVIDENCE PACK — ${passages.length} ranked passages from ${sources.length} sources (indexers: ${[...new Set(usedIndexers)].join(", ") || "none"}).`,
        "Every fact you state must come from a passage below and cite its [S#] id. Never cite an id that is not listed. If the evidence does not answer part of the question, say so.",
        "",
        ...passages.map(
          (p) => `[${p.id}] ${p.title}\n${p.url} · via ${p.indexer} · relevance ${p.score}\n${p.text}`,
        ),
        "",
        "SOURCE MAP:",
        ...sources.map((s, i) => `[S${i + 1}] ${s.title} — ${s.url}`),
      ].join("\n\n")
    : "No indexer returned usable content for this query. Say so plainly instead of guessing.";

  return {
    evidence,
    passages,
    sources,
    indexers: [...new Set(usedIndexers)],
    documents: docs.length,
  };
}
