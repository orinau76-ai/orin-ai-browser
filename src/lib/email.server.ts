export type EmailResult = { sent: boolean; reason?: string };

/**
 * Sends a plain HTML email through Resend when the project has an email
 * sending domain configured. When it is not configured yet the job result is
 * still stored and shown in the app, and we report why nothing was sent.
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<EmailResult> {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["ORIN_EMAIL_FROM"];
  if (!apiKey || !from) {
    return { sent: false, reason: "Email sending domain is not configured yet." };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [options.to],
      subject: options.subject,
      html: options.html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Email send failed [${response.status}]: ${text}`);
    return { sent: false, reason: `Email provider error (${response.status}).` };
  }
  return { sent: true };
}

export function jobEmailHtml(options: {
  prompt: string;
  mode: string;
  answer: string;
  sources: { url: string; title: string }[];
}) {
  const body = options.answer
    .split("\n")
    .map((line) => `<p style="margin:0 0 10px;line-height:1.6">${escapeHtml(line)}</p>`)
    .join("");
  const sources = options.sources
    .map(
      (s) =>
        `<li><a href="${escapeHtml(s.url)}" style="color:#b3488d">${escapeHtml(s.title)}</a></li>`,
    )
    .join("");
  return `<div style="font-family:Inter,Arial,sans-serif;color:#2b1f2a;max-width:640px">
  <h2 style="margin:0 0 4px">Orin finished your ${escapeHtml(options.mode)} task</h2>
  <p style="margin:0 0 18px;color:#7c6b78">${escapeHtml(options.prompt)}</p>
  ${body}
  ${sources ? `<h3>Sources</h3><ul>${sources}</ul>` : ""}
  <p style="margin-top:24px;color:#9b8b96;font-size:12px">Sent by Orin AI Browser</p>
</div>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
