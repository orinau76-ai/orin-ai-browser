import { createFileRoute } from "@tanstack/react-router";
import { authFromRequest } from "@/lib/api-auth.server";
import { runAgent, titleFor, type AgentEvent } from "@/lib/orin.server";

/**
 * Streaming agent endpoint (NDJSON). The browser sends its Supabase bearer
 * token; the handler verifies it, then streams live task-graph events while
 * the agent searches and reads the web.
 */
export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authFromRequest(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        let body: { prompt?: string; mode?: string; sessionId?: string | null };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const prompt = String(body.prompt ?? "").trim();
        const mode = String(body.mode ?? "research");
        if (!prompt) return new Response("Bad request", { status: 400 });

        const { supabase, userId } = auth;
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            const send = (event: AgentEvent | Record<string, unknown>) =>
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

            try {
              const { data: settings } = await supabase
                .from("settings")
                .select("private_mode")
                .eq("user_id", userId)
                .maybeSingle();
              const privateMode = settings?.private_mode ?? false;

              let sessionId = body.sessionId ?? null;
              let history: { role: "user" | "assistant"; content: string }[] = [];

              if (!privateMode) {
                if (sessionId) {
                  const { data: prior } = await supabase
                    .from("messages")
                    .select("role, content")
                    .eq("session_id", sessionId)
                    .order("created_at", { ascending: true })
                    .limit(20);
                  history = (prior ?? []).map((m) => ({
                    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
                    content: m.content,
                  }));
                } else {
                  const { data: created } = await supabase
                    .from("sessions")
                    .insert({ user_id: userId, mode, title: await titleFor(prompt) })
                    .select("id")
                    .single();
                  sessionId = created?.id ?? null;
                }
                if (sessionId) {
                  await supabase
                    .from("messages")
                    .insert({ session_id: sessionId, user_id: userId, role: "user", content: prompt });
                }
              }

              send({ type: "session", sessionId, privateMode });

              const result = await runAgent({
                mode,
                prompt,
                history,
                privateMode,
                signal: request.signal,
                onEvent: (event) => send(event),
              });

              if (!privateMode && sessionId) {
                await supabase.from("messages").insert({
                  session_id: sessionId,
                  user_id: userId,
                  role: "assistant",
                  content: result.answer,
                  sources: result.sources as unknown as never,
                  steps: result.steps as unknown as never,
                });
                await supabase
                  .from("sessions")
                  .update({ updated_at: new Date().toISOString(), mode })
                  .eq("id", sessionId);
              }

              send({ type: "done", ...result, sessionId, privateMode });
            } catch (error) {
              send({
                type: "error",
                message: error instanceof Error ? error.message : "Orin could not complete that.",
              });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
