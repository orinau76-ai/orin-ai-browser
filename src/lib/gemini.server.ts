const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type Completion = {
  choices?: { message?: ChatMessage; finish_reason?: string }[];
};

export class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Gemini rejects conversations that end on a model turn, drops assistant
 * messages that carry neither text nor tool calls, and errors on tool results
 * that have no matching assistant tool call. Normalise all three so a stored
 * empty answer or an interrupted tool round can never break a run.
 */
function sanitize(messages: ChatMessage[]): ChatMessage[] {
  const cleaned: ChatMessage[] = [];
  const answered = new Set<string>();

  for (const message of messages) {
    if (message.role === "tool") {
      // Only keep a tool result whose assistant call is still present.
      const id = message.tool_call_id;
      const hasCall = cleaned.some((m) => m.tool_calls?.some((c) => c.id === id));
      if (!id || !hasCall) continue;
      answered.add(id);
      cleaned.push({ ...message, content: message.content?.trim() ? message.content : "No result." });
      continue;
    }
    if (message.role === "assistant") {
      const hasText = Boolean(message.content?.trim());
      const hasCalls = Boolean(message.tool_calls?.length);
      if (!hasText && !hasCalls) continue;
      cleaned.push(message);
      continue;
    }
    if (message.content?.trim()) cleaned.push(message);
  }

  // Drop trailing assistant tool calls that never received results.
  for (let i = cleaned.length - 1; i >= 0; i--) {
    const message = cleaned[i]!;
    if (message.role !== "assistant" || !message.tool_calls?.length) break;
    const unanswered = message.tool_calls.some((c) => !answered.has(c.id));
    if (!unanswered) break;
    cleaned.splice(i, 1);
  }

  // The conversation may never end on a model turn.
  const last = cleaned[cleaned.length - 1];
  if (!last || last.role === "assistant") {
    cleaned.push({ role: "user", content: "Continue and give the final answer now." });
  }
  return cleaned;
}

async function post(options: {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  signal?: AbortSignal;
  stream?: boolean;
}) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this app.");

  const response = await fetch(AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    ...(options.signal ? { signal: options.signal } : {}),
    body: JSON.stringify({
      model: options.model,
      messages: sanitize(options.messages),
      ...(options.stream ? { stream: true } : {}),
      ...(options.tools?.length ? { tools: options.tools, tool_choice: "auto" } : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`AI gateway failed [${response.status}]`);
    if (response.status === 429) {
      throw new GatewayError(429, "Orin is rate limited right now. Try again in a moment.");
    }
    if (response.status === 402) {
      throw new GatewayError(402, "AI credits are exhausted. Add credits to keep using Orin.");
    }
    throw new GatewayError(response.status, `AI request failed: ${text.slice(0, 200)}`);
  }
  return response;
}

export async function chat(options: {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  signal?: AbortSignal;
}): Promise<ChatMessage> {
  const response = await post(options);
  const json = (await response.json()) as Completion;
  const message = json.choices?.[0]?.message;
  if (!message) throw new Error("The AI returned an empty response.");
  return message;
}

type DeltaChunk = {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: {
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
};

/**
 * Streaming variant: emits text as the model writes it so the UI is live
 * instead of waiting for the whole answer. Tool call deltas are reassembled
 * into the same shape `chat()` returns.
 */
export async function chatStream(
  options: {
    model: string;
    messages: ChatMessage[];
    tools?: ToolDef[];
    signal?: AbortSignal;
  },
  onText: (text: string) => void,
): Promise<ChatMessage> {
  const response = await post({ ...options, stream: true });
  if (!response.body) throw new Error("The AI returned an empty response.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const calls: ToolCall[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let chunk: DeltaChunk;
      try {
        chunk = JSON.parse(payload) as DeltaChunk;
      } catch {
        continue;
      }
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        content += delta.content;
        onText(delta.content);
      }
      for (const part of delta.tool_calls ?? []) {
        const index = part.index ?? 0;
        const existing = calls[index] ?? {
          id: part.id ?? `call_${index}`,
          type: "function" as const,
          function: { name: "", arguments: "" },
        };
        if (part.id) existing.id = part.id;
        if (part.function?.name) existing.function.name = part.function.name;
        if (part.function?.arguments) existing.function.arguments += part.function.arguments;
        calls[index] = existing;
      }
    }
  }

  const filled = calls.filter(Boolean);
  return {
    role: "assistant",
    content: content || null,
    ...(filled.length ? { tool_calls: filled } : {}),
  };
}
