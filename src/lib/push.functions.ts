import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Saves a device push token for the signed-in user. */
export const registerPushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string; userAgent?: string }) => ({
    token: String(input.token ?? "").slice(0, 4096).trim(),
    userAgent: String(input.userAgent ?? "").slice(0, 300),
  }))
  .handler(async ({ data, context }) => {
    if (!data.token) throw new Error("Missing push token.");
    const { error } = await context.supabase
      .from("push_tokens")
      .upsert(
        { user_id: context.userId, token: data.token, user_agent: data.userAgent },
        { onConflict: "user_id,token" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Sends a test notification to every device registered by the signed-in user. */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (!rows?.length) return { ok: false, detail: "No devices registered for push yet." };

    const { sendPush } = await import("./push.server");
    const results = await Promise.all(
      rows.map((row) =>
        sendPush({ token: row.token, title: "Orin", body: "Push notifications are working." }).catch((e: unknown) => ({
          ok: false,
          detail: e instanceof Error ? e.message : "send failed",
          stale: false,
        })),
      ),
    );
    const delivered = results.filter((r) => r.ok).length;
    const stale = rows.filter((_, i) => results[i]?.stale).map((r) => r.token);
    if (stale.length) {
      await context.supabase.from("push_tokens").delete().in("token", stale).eq("user_id", context.userId);
    }
    return {
      ok: delivered > 0,
      detail: delivered > 0 ? `Sent to ${delivered} device(s).` : (results[0]?.detail ?? "Delivery failed."),
    };
  });
