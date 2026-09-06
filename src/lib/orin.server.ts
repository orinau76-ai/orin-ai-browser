import { chat, chatStream, type ChatMessage, type ToolDef } from "./gemini.server";
import { mapSite, scrapePage, webSearch } from "./firecrawl.server";
import {
  censusPopulation,
  gdeltNews,
  secEdgar,
  tavilySearch,
  wikidataSearch,
  wikipediaSummary,
  worldBank,
} from "./opendata.server";


export type Source = { url: string; title: string };
export type Step = { tool: string; detail: string };

export type AgentResult = {
  answer: string;
  sources: Source[];
  steps: Step[];
};

const MODEL = "google/gemini-3.7-flash";

const tools: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "research_scan",
      description:
        "PREFERRED first tool for any research, comparison or briefing task. Runs Orin's RAG pipeline: scans many indexers at once (live web, news, encyclopedic, fallback search), reads the best pages as text, then returns ranked passages each tagged with a strict [S#] source id. One call replaces several searches and page reads. Cite only [S#] ids that appear in the returned pack.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to scan the web for" },
          breadth: { type: "number", description: "How many documents to index, 3-10 (default 8)" },
          depth: { type: "number", description: "How many pages to read in full, 0-6 (default 4)" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the live web and return ranked results with titles, urls and snippets.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "How many results, 1-10" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function",
    function: {
      name: "read_page",
      description: "Fetch and read the main content of a web page as markdown.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "Absolute page URL" } },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "map_site",
      description: "List URLs available on a website, optionally filtered by a keyword.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          search: { type: "string" },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  simpleTool("wikidata", "Look up entities in Wikidata. Treat results as supporting evidence, not proof.", {
    query: { type: "string" },
  }),
  simpleTool("wikipedia", "Get the Wikimedia/Wikipedia summary for a topic or company.", {
    title: { type: "string" },
  }),
  simpleTool("news", "Live global news from GDELT for a company, person or topic.", {
    query: { type: "string" },
    hours: { type: "number", description: "Look-back window in hours, default 48" },
  }),
  simpleTool("world_bank", "World Bank economic indicator series for a country code (e.g. US, IN).", {
    country: { type: "string" },
    indicator: { type: "string", description: "Indicator code, default NY.GDP.MKTP.CD" },
  }),
  simpleTool("sec_edgar", "Search U.S. SEC EDGAR filings for a company.", {
    query: { type: "string" },
  }),
  simpleTool("us_census", "U.S. Census ACS population by state.", {
    year: { type: "number", description: "ACS year, default 2022" },
  }),
  {
    type: "function",
    function: {
      name: "browser_action",
      description:
        "Drive the remote browser session. action: navigate | read | screenshot. target must be a full http(s) URL. Observe the returned page content and verify the action before continuing.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string" },
          target: { type: "string" },
          value: { type: "string" },
        },
        required: ["action", "target"],
        additionalProperties: false,
      },
    },
  },
];

function simpleTool(
  name: string,
  description: string,
  properties: Record<string, Record<string, unknown>>,
): ToolDef {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required: [Object.keys(properties)[0]!],
        additionalProperties: false,
      },
    },
  };
}


const prompts: Record<string, string> = {
  research:
    "You are Orin, an autonomous research agent. Start with research_scan — one call indexes many sources at once. Widen with a second scan or read_page only if a real gap remains. Produce a structured markdown briefing with headings, key findings and a short conclusion.",
  search:
    "You are Orin, an AI search engine. Run one research_scan, then answer concisely and directly in markdown.",
  summarize:
    "You are Orin. Read the page(s) the user gives you (use read_page) and produce a tight summary: a one-line TL;DR, 5-7 bullet key points, and any numbers or dates that matter.",
  compare:
    "You are Orin. Scan each option with research_scan, then output a markdown comparison table followed by a clear recommendation and who each option suits.",
  extract:
    "You are Orin, a data extraction agent. Read the given page(s) and return the requested structured data as a clean markdown table. Never invent values; use '—' when a field is absent.",
  explain:
    "You are Orin. Explain the topic or page clearly: start simple, then go deeper, use analogies, and end with 'Why it matters'.",
  agent:
    "You are Orin in Agent Mode: an autonomous multi-step operator. Plan, lead with research_scan, then use your other tools until the task is genuinely complete. Verify with at least two independent sources before concluding. Finish with a markdown report: Plan, What I did, Findings, Result.",
  automation:
    "You are Orin in Automation Mode: you operate a remote browser. Plan the task, then use browser_action to navigate and read real pages, observing the result after every action and verifying it actually worked. If an action is unavailable or fails, say so plainly — never claim success you did not observe. Pause and ask for approval before purchases, sending messages, submitting important forms or anything irreversible. Finish with: Plan, Actions taken (with observed result of each), Verification, Result.",
  spy:
    "You are Orin in Spy Mode: competitive and company intelligence. Lead with research_scan, then add news, filings and official pages. Cross-check every claim against at least two independent sources, separate confirmed facts from signals, and finish with: Snapshot, Recent moves, Signals, What it means. Never state an unverified rumour as fact.",
};


export function systemPrompt(mode: string, privateMode: boolean) {
  const base = prompts[mode] ?? prompts["research"]!;
  const privacy = privateMode
    ? " Private Mode is on: nothing is stored, and all web access is proxied server-side. Do not ask for or retain personal data."
    : "";
  return `${base}${privacy} Today's date is ${new Date().toISOString().slice(0, 10)}. Use markdown. End with a "Sources" list of the urls you actually used.`;
}

export type AgentEvent =
  | { type: "phase"; label: string }
  | { type: "step"; step: Step; status: "start" | "done" | "error" }
  | { type: "delta"; text: string }
  | { type: "source"; source: Source };

// Step budgets are deliberately tight: every extra loop is another paid model
// call and several more seconds of waiting.
const budgets: Record<string, number> = {
  search: 3,
  summarize: 3,
  explain: 3,
  extract: 4,
  compare: 5,
  research: 5,
  spy: 6,
  automation: 8,
  agent: 8,
};

export async function runAgent(options: {
  mode: string;
  prompt: string;
  history: { role: "user" | "assistant"; content: string }[];
  privateMode: boolean;
  maxSteps?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}): Promise<AgentResult> {
  const emit = options.onEvent ?? (() => {});
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(options.mode, options.privateMode) },
    ...options.history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    { role: "user", content: options.prompt },
  ];

  const sources = new Map<string, Source>();
  const steps: Step[] = [];
  const maxSteps = options.maxSteps ?? budgets[options.mode] ?? 5;

  emit({ type: "phase", label: "Planning the task" });

  for (let i = 0; i < maxSteps; i++) {
    const reply = await chatStream(
      {
        model: MODEL,
        messages,
        tools,
        ...(options.signal ? { signal: options.signal } : {}),
      },
      (text) => emit({ type: "delta", text }),
    );
    messages.push(reply);

    const calls = reply.tool_calls ?? [];
    if (!calls.length) {
      emit({ type: "phase", label: "Writing the answer" });
      return { answer: reply.content ?? "", sources: [...sources.values()], steps };
    }


    // Run every tool call of this turn concurrently — big latency win on deep research.
    const results = await Promise.all(
      calls.map(async (call) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        const dataLabels: Record<string, string> = {
          wikidata: "Wikidata",
          wikipedia: "Wikipedia",
          news: "News",
          world_bank: "World Bank",
          sec_edgar: "SEC EDGAR",
          us_census: "US Census",
          browser_action: "Browser",
        };
        const label =
          call.function.name === "research_scan"
            ? { tool: "Scan", detail: String(args["query"] ?? "") }
            : call.function.name === "web_search"
            ? { tool: "Search", detail: String(args["query"] ?? "") }
            : call.function.name === "read_page"
              ? { tool: "Read", detail: String(args["url"] ?? "") }
              : call.function.name === "map_site"
                ? { tool: "Map", detail: String(args["url"] ?? "") }
                : {
                    tool: dataLabels[call.function.name] ?? call.function.name,
                    detail: String(args["query"] ?? args["title"] ?? args["target"] ?? args["country"] ?? "live data"),
                  };

        emit({ type: "step", step: label, status: "start" });
        let output = "";
        try {
          if (call.function.name === "research_scan") {
            const query = String(args["query"] ?? "");
            const { scan } = await import("./rag.server");
            const result = await scan(query, {
              ...(args["breadth"] !== undefined ? { breadth: Number(args["breadth"]) } : {}),
              ...(args["depth"] !== undefined ? { depth: Number(args["depth"]) } : {}),
            });
            result.sources.forEach((s) => {
              sources.set(s.url, s);
              emit({ type: "source", source: s });
            });
            const done = {
              tool: "Scan",
              detail: `${query} — ${result.passages.length} passages · ${result.sources.length} sources · ${result.indexers.join(", ") || "no indexer"}`,
            };
            steps.push(done);
            emit({ type: "step", step: done, status: "done" });
            output = result.evidence;
          } else if (call.function.name === "web_search") {

            const query = String(args["query"] ?? "");
            const hits = await webSearch(query, Number(args["limit"] ?? 5));
            hits.forEach((h) => {
              sources.set(h.url, { url: h.url, title: h.title });
              emit({ type: "source", source: { url: h.url, title: h.title } });
            });
            steps.push(label);
            emit({ type: "step", step: label, status: "done" });
            output = hits
              .map((h, n) => `[${n + 1}] ${h.title}\n${h.url}\n${h.description ?? ""}`)
              .join("\n\n");
            if (!hits.length) output = (await tavilySearch(query)) ?? "No results.";
          } else if (call.function.name === "read_page") {
            const page = await scrapePage(String(args["url"] ?? ""));
            sources.set(page.url, { url: page.url, title: page.title });
            const done = { tool: "Read", detail: page.title };
            steps.push(done);
            emit({ type: "source", source: { url: page.url, title: page.title } });
            emit({ type: "step", step: done, status: "done" });
            output = `# ${page.title}\n${page.url}\n\n${page.markdown}`;
          } else if (call.function.name === "map_site") {
            const links = await mapSite(
              String(args["url"] ?? ""),
              args["search"] ? String(args["search"]) : undefined,
            );
            steps.push(label);
            emit({ type: "step", step: label, status: "done" });
            output = links.join("\n");
          } else {
            const name = call.function.name;
            if (name === "wikidata") {
              output = await wikidataSearch(String(args["query"] ?? ""));
            } else if (name === "wikipedia") {
              output = await wikipediaSummary(String(args["title"] ?? args["query"] ?? ""));
            } else if (name === "news") {
              output = await gdeltNews(String(args["query"] ?? ""), Number(args["hours"] ?? 48));
            } else if (name === "world_bank") {
              output = await worldBank(
                String(args["country"] ?? "WLD"),
                String(args["indicator"] ?? "NY.GDP.MKTP.CD"),
              );
            } else if (name === "sec_edgar") {
              output = await secEdgar(String(args["query"] ?? ""));
            } else if (name === "us_census") {
              output = await censusPopulation(Number(args["year"] ?? 2022));
            } else if (name === "browser_action") {
              const { runBrowserAction } = await import("./browser.server");
              output = await runBrowserAction(
                String(args["action"] ?? "read"),
                String(args["target"] ?? ""),
                String(args["value"] ?? ""),
              );
            } else {
              output = "Unknown tool.";
            }
            steps.push(label);
            emit({ type: "step", step: label, status: "done" });
          }
        } catch (error) {
          output = `Tool failed: ${error instanceof Error ? error.message : String(error)}`;
          const failed = { tool: "Error", detail: output.slice(0, 120) };
          steps.push(failed);
          emit({ type: "step", step: failed, status: "error" });
        }
        return { call, output };
      }),
    );

    for (const { call, output } of results) {
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content:
          output.slice(0, call.function.name === "research_scan" ? 18000 : 12000) || "No results.",

      });
    }
  }


  const final = await chat({
    model: MODEL,
    messages: [
      ...messages,
      { role: "user", content: "Step budget reached. Write the final answer now from what you have." },
    ],
  });
  return { answer: final.content ?? "", sources: [...sources.values()], steps };
}

export async function titleFor(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ").slice(0, 70) || "New session";
}
