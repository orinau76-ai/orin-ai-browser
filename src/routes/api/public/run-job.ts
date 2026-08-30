import { createFileRoute } from "@tanstack/react-router";
import { runAgent } from "@/lib/orin.server";
import { jobEmailHtml, sendEmail } from "@/lib/email.server";

/**
 * Fired with navigator.sendBeacon when the user leaves the page while a task is
 * running. The caller is authenticated by the job's single-use random token,
 * so no session is required — the work continues server-side and the result is
 * emailed to the account that queued it.
 */
export const Route = createFileRoute("/api/public/run-job")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let token = "";
        try {
          token = String(((await request.json()) as { token?: string }).token ?? "");
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        if (!token || token.length < 24) return new Response("Bad request", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: job } = await supabaseAdmin
          .from("jobs")
          .select("id, prompt, mode, email, status")
          .eq("token", token)
          .maybeSingle();

        if (!job) return new Response("Not found", { status: 404 });
        if (job.status !== "queued") return new Response("ok");

        await supabaseAdmin
          .from("jobs")
          .update({ status: "running", updated_at: new Date().toISOString() })
          .eq("id", job.id);

        try {
          const result = await runAgent({
            mode: job.mode,
            prompt: job.prompt,
            history: [],
            privateMode: false,
          });

          const email = await sendEmail({
            to: job.email,
            subject: `Orin finished: ${job.prompt.slice(0, 60)}`,
            html: jobEmailHtml({
              prompt: job.prompt,
              mode: job.mode,
              answer: result.answer,
              sources: result.sources,
            }),
          });

          await supabaseAdmin
            .from("jobs")
            .update({
              status: "done",
              answer: result.answer,
              sources: result.sources as unknown as never,
              steps: result.steps as unknown as never,
              emailed_at: email.sent ? new Date().toISOString() : null,
              error: email.sent ? null : (email.reason ?? null),
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        } catch (error) {
          await supabaseAdmin
            .from("jobs")
            .update({
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        }

        return new Response("ok");
      },
    },
  },
});
