import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const queueBackgroundJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { prompt: string; mode: string }) => input)
  .handler(async ({ data, context }) => {
    const email = (context.claims["email"] as string | undefined) ?? "";
    if (!email) throw new Error("Your account has no email address to send results to.");
    if (!data.prompt.trim()) throw new Error("Nothing to run in the background.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("jobs")
      .insert({
        user_id: context.userId,
        prompt: data.prompt.trim(),
        mode: data.mode,
        email,
      })
      .select("id, token")
      .single();
    if (error) throw error;
    return { jobId: row.id, token: row.token as string, email };
  });

export const listJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("jobs")
      .select("id, prompt, mode, status, answer, error, emailed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    return data ?? [];
  });
