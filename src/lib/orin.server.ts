import { chat, type ChatMessage, type ToolDef } from "./gemini.server";
import { mapSite, scrapePage, webSearch } from "./firecrawl.server";

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
];

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

export async function runAgent(options: {
  mode: string;
  prompt: string;
  history: { role: "user" | "assistant"; content: string }[];
  privateMode: boolean;
  maxSteps?: number;
}): Promise<AgentResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(options.mode, options.privateMode) },
    ...options.history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    { role: "user", content: options.prompt },
  ];

  const sources = new Map<string, Source>();
  const steps: Step[] = [];
  const maxSteps = options.maxSteps ?? (options.mode === "agent" ? 10 : 6);

  for (let i = 0; i < maxSteps; i++) {
    const reply = await chat({ model: MODEL, messages, tools });
    messages.push(reply);

    const calls = reply.tool_calls ?? [];
    if (!calls.length) {
      return { answer: reply.content ?? "", sources: [...sources.values()], steps };
    }

    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      let output = "";
      try {
        if (call.function.name === "web_search") {
          const hits = await webSearch(String(args["query"] ?? ""), Number(args["limit"] ?? 6));
          hits.forEach((h) => sources.set(h.url, { url: h.url, title: h.title }));
          steps.push({ tool: "Search", detail: String(args["query"] ?? "") });
          output = hits
            .map((h, n) => `[${n + 1}] ${h.title}\n${h.url}\n${h.description ?? ""}`)
            .join("\n\n");
        } else if (call.function.name === "read_page") {
          const page = await scrapePage(String(args["url"] ?? ""));
          sources.set(page.url, { url: page.url, title: page.title });
          steps.push({ tool: "Read", detail: page.title });
          output = `# ${page.title}\n${page.url}\n\n${page.markdown}`;
        } else if (call.function.name === "map_site") {
          const links = await mapSite(
            String(args["url"] ?? ""),
            args["search"] ? String(args["search"]) : undefined,
          );
          steps.push({ tool: "Map", detail: String(args["url"] ?? "") });
          output = links.join("\n");
        } else {
          output = "Unknown tool.";
        }
      } catch (error) {
        output = `Tool failed: ${error instanceof Error ? error.message : String(error)}`;
        steps.push({ tool: "Error", detail: output.slice(0, 120) });
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
