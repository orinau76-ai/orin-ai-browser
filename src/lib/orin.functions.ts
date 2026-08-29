import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runAgent, titleFor, type Source, type Step } from "./orin.server";

export const askOrin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { prompt: string; mode: string; sessionId?: string | null }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: settings } = await supabase
      .from("settings")
      .select("private_mode")
      .eq("user_id", userId)
      .maybeSingle();
    const privateMode = settings?.private_mode ?? false;

    let sessionId = data.sessionId ?? null;
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
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));
      } else {
        const { data: created } = await supabase
          .from("sessions")
          .insert({ user_id: userId, mode: data.mode, title: await titleFor(data.prompt) })
          .select("id")
          .single();
        sessionId = created?.id ?? null;
      }
      if (sessionId) {
        await supabase
          .from("messages")
          .insert({ session_id: sessionId, user_id: userId, role: "user", content: data.prompt });
      }
    }

    const result = await runAgent({
      mode: data.mode,
      prompt: data.prompt,
      history,
      privateMode,
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
        .update({ updated_at: new Date().toISOString(), mode: data.mode })
        .eq("id", sessionId);
    }

    return { ...result, sessionId, privateMode };
  });

export const listSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("sessions")
      .select("id, title, mode, updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);
    return data ?? [];
  });

export const getSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("messages")
      .select("id, role, content, sources, steps, created_at")
      .eq("session_id", data.sessionId)
      .order("created_at", { ascending: true });
    return (rows ?? []).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      sources: (row.sources ?? []) as unknown as Source[],
      steps: (row.steps ?? []) as unknown as Step[],
    }));
  });

export const deleteSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string }) => input)
  .handler(async ({ data, context }) => {
    await context.supabase.from("sessions").delete().eq("id", data.sessionId);
    return { ok: true };
  });

export const getSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("settings")
      .select("private_mode")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { privateMode: data?.private_mode ?? false };
  });

export const setPrivateMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { privateMode: boolean }) => input)
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("settings")
      .upsert(
        { user_id: context.userId, private_mode: data.privateMode, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    return { privateMode: data.privateMode };
  });
