/**
 * Orin Model Router — one interface over Gemini, Groq and DeepSeek.
 *
 * All three speak the OpenAI chat-completions shape, so the router only has to
 * pick a healthy provider, run the call through the provider orchestrator, and
 * fall back down the chain when a provider is unhealthy or fails.
 */
import { chat as geminiChat, type ChatMessage, type ToolDef } from "./gemini.server";
import {
  execute,
  isHealthy,
  ProviderError,
  classifyError,
  type ProviderId,
  type Telemetry,
} from "./providers.server";

export type { ChatMessage, ToolDef };

export type ModelTier = "reasoning" | "fast";

type ModelSpec = { provider: ProviderId; model: string; url?: string; secret?: string };

const REASONING_CHAIN: ModelSpec[] = [
  { provider: "gemini", model: "google/gemini-3.7-flash" },
  { provider: "deepseek", model: "deepseek-chat", url: "https://api.deepseek.com/chat/completions" },
  { provider: "groq", model: "llama-3.3-70b-versatile", url: "https://api.groq.com/openai/v1/chat/completions" },
];

const FAST_CHAIN: ModelSpec[] = [
  { provider: "groq", model: "llama-3.1-8b-instant", url: "https://api.groq.com/openai/v1/chat/completions" },
  { provider: "gemini", model: "google/gemini-3.1-flash-lite" },
  { provider: "deepseek", model: "deepseek-chat", url: "https://api.deepseek.com/chat/completions" },
];

async function openAiCompatible(
  spec: ModelSpec,
  key: string,
  messages: ChatMessage[],
  tools?: ToolDef[],
  signal?: AbortSignal,
): Promise<ChatMessage> {
  const response = await fetch(spec.url!, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      model: spec.model,
      messages,
      ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ProviderError(
      spec.provider,
      classifyError(text, response.status),
      `${spec.provider} responded ${response.status}: ${text.slice(0, 200)}`,
      response.status,
    );
  }
  const json = (await response.json()) as { choices?: { message?: ChatMessage }[] };
  const message = json.choices?.[0]?.message;
  if (!message) throw new ProviderError(spec.provider, "empty_result", `${spec.provider} returned no message`);
  return message;
}

export type ModelResult = { message: ChatMessage; provider: ProviderId; model: string };

export async function runModel(options: {
  tier?: ModelTier;
  messages: ChatMessage[];
  tools?: ToolDef[];
  signal?: AbortSignal;
  onTelemetry?: (t: Telemetry) => void;
}): Promise<ModelResult> {
  const chain = options.tier === "fast" ? FAST_CHAIN : REASONING_CHAIN;
  const candidates = chain.filter((spec) => isHealthy(spec.provider));
  const ordered = candidates.length ? candidates : chain.slice(0, 1);

  let lastError: unknown;
  for (const spec of ordered) {
    try {
      const message = await execute(
        spec.provider,
        `chat:${spec.model}`,
        async ({ key }) => {
          if (spec.provider === "gemini") {
            return geminiChat({
              model: spec.model,
              messages: options.messages,
              ...(options.tools ? { tools: options.tools } : {}),
              ...(options.signal ? { signal: options.signal } : {}),
            });
          }
          return openAiCompatible(spec, key!, options.messages, options.tools, options.signal);
        },
        { retries: 1, ...(options.onTelemetry ? { onTelemetry: options.onTelemetry } : {}) },
      );
      return { message, provider: spec.provider, model: spec.model };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("No AI model provider is available right now.");
}
