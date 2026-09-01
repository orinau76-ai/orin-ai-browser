import { chat, type ChatMessage, type ToolDef } from "./gemini.server";
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
    "You are Orin, an autonomous research agent. Always search the live web before answering, read the most relevant pages, cross-check facts, and produce a structured markdown briefing with headings, key findings and a short conclusion. Cite claims inline as [n] matching the sources you used.",
  search:
    "You are Orin, an AI search engine. Search the web, then answer concisely and directly in markdown with inline [n] citations.",
  summarize:
    "You are Orin. Read the page(s) the user gives you (use read_page) and produce a tight summary: a one-line TL;DR, 5-7 bullet key points, and any numbers or dates that matter.",
  compare:
    "You are Orin. Research each option with searches and page reads, then output a markdown comparison table followed by a clear recommendation and who each option suits.",
  extract:
    "You are Orin, a data extraction agent. Read the given page(s) and return the requested structured data as a clean markdown table. Never invent values; use '—' when a field is absent.",
  explain:
    "You are Orin. Explain the topic or page clearly: start simple, then go deeper, use analogies, and end with 'Why it matters'.",
  agent:
    "You are Orin in Agent Mode: an autonomous multi-step operator. Plan, then use your tools repeatedly (search, read pages, map sites) until the task is genuinely complete. Verify with at least two independent sources before concluding. Finish with a markdown report: Plan, What I did, Findings, Result.",
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
  | { type: "source"; source: Source };

export async function runAgent(options: {
  mode: string;
  prompt: string;
  history: { role: "user" | "assistant"; content: string }[];
  privateMode: boolean;
  maxSteps?: number;
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
  const maxSteps = options.maxSteps ?? (options.mode === "agent" ? 10 : 6);

  emit({ type: "phase", label: "Planning the task" });

  for (let i = 0; i < maxSteps; i++) {
    const reply = await chat({ model: MODEL, messages, tools });
    messages.push(reply);

    const calls = reply.tool_calls ?? [];
    if (!calls.length) {
      emit({ type: "phase", label: "Writing the answer" });
      return { answer: reply.content ?? "", sources: [...sources.values()], steps };
    }


    for (const call of calls) {
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
      };
      const label =
        call.function.name === "web_search"
          ? { tool: "Search", detail: String(args["query"] ?? "") }
          : call.function.name === "read_page"
            ? { tool: "Read", detail: String(args["url"] ?? "") }
            : call.function.name === "map_site"
              ? { tool: "Map", detail: String(args["url"] ?? "") }
              : {
                  tool: dataLabels[call.function.name] ?? call.function.name,
                  detail: String(args["query"] ?? args["title"] ?? args["country"] ?? "live data"),
                };

      emit({ type: "step", step: label, status: "start" });
      let output = "";
      try {
        if (call.function.name === "web_search") {
          const query = String(args["query"] ?? "");
          const hits = await webSearch(query, Number(args["limit"] ?? 6));
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
        }
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


      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: output.slice(0, 24000) || "No results.",
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
