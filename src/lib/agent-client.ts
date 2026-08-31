import { supabase } from "@/integrations/supabase/client";

export type LiveStep = { tool: string; detail: string; status: "start" | "done" | "error" };
export type StreamEvent =
  | { type: "session"; sessionId: string | null; privateMode: boolean }
  | { type: "phase"; label: string }
  | { type: "step"; step: { tool: string; detail: string }; status: LiveStep["status"] }
  | { type: "source"; source: { url: string; title: string } }
  | {
      type: "done";
      answer: string;
      sources: { url: string; title: string }[];
      steps: { tool: string; detail: string }[];
      sessionId: string | null;
      privateMode: boolean;
    }
  | { type: "error"; message: string };

export async function streamAgent(
  body: { prompt: string; mode: string; sessionId: string | null },
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to run Orin.");

  const response = await fetch("/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok || !response.body) {
    throw new Error(response.status === 401 ? "Sign in to run Orin." : "Orin could not start that task.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line) as StreamEvent);
      } catch {
        /* partial line */
      }
    }
  }
}
