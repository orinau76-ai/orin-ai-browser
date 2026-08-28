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

export async function chat(options: {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  signal?: AbortSignal;
}): Promise<ChatMessage> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this app.");

  const response = await fetch(AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    signal: options.signal,
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      ...(options.tools?.length ? { tools: options.tools, tool_choice: "auto" } : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`AI gateway failed [${response.status}]: ${text}`);
    if (response.status === 429) {
      throw new GatewayError(429, "The AI is rate limited right now. Try again in a moment.");
    }
    if (response.status === 402) {
      throw new GatewayError(402, "AI credits are exhausted. Add credits to keep using Orin.");
    }
    throw new GatewayError(response.status, `AI request failed: ${text.slice(0, 300)}`);
  }

  const json = (await response.json()) as Completion;
  const message = json.choices?.[0]?.message;
  if (!message) throw new Error("The AI returned an empty response.");
  return message;
}
