/**
 * Firebase Cloud Messaging sender.
 *
 * Preferred path is the HTTP v1 API, which needs a service-account JSON stored
 * in FCM_SERVER_KEY (or FIREBASE_SERVICE_ACCOUNT). If the secret is a legacy
 * server key instead, the legacy endpoint is used. Nothing is faked: when no
 * usable credential exists the caller gets an explicit failure.
 */

type ServiceAccount = { client_email: string; private_key: string; project_id: string };

function readSecret(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function parseServiceAccount(raw: string): ServiceAccount | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (parsed.client_email && parsed.private_key && parsed.project_id) return parsed as ServiceAccount;
  } catch {
    /* not JSON — legacy server key */
  }
  return null;
}

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(body);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) buffer[i] = binary.charCodeAt(i);
  return buffer.buffer;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(account.private_key.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const assertion = `${header}.${claims}.${base64url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = (await response.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(`Google token exchange failed [${response.status}]: ${payload.error_description ?? "unknown error"}`);
  }
  cachedToken = { value: payload.access_token, expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

export type PushMessage = { token: string; title: string; body: string; link?: string };

export async function sendPush(message: PushMessage): Promise<{ ok: boolean; detail: string; stale?: boolean }> {
  const secret = readSecret("FCM_SERVER_KEY", "FCM_SERVER_KEY_1", "FIREBASE_SERVICE_ACCOUNT", "FCM_SERVICE_ACCOUNT");
  if (!secret) return { ok: false, detail: "Push is not configured: no FCM credential is stored." };

  const account = parseServiceAccount(secret);
  if (account) {
    const projectId = readSecret("FIREBASE_PROJECT_ID") ?? account.project_id;
    const token = await accessToken(account);
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: message.token,
          notification: { title: message.title, body: message.body },
          ...(message.link ? { data: { link: message.link } } : {}),
        },
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      const stale = response.status === 404 || (response.status === 400 && text.includes("registration-token"));
      return { ok: false, detail: `FCM v1 failed [${response.status}]: ${text.slice(0, 300)}`, stale };
    }
    return { ok: true, detail: "Notification sent via FCM HTTP v1." };
  }

  // Legacy server key path.
  const response = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: { Authorization: `key=${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: message.token, notification: { title: message.title, body: message.body } }),
  });
  const text = await response.text();
  if (!response.ok) return { ok: false, detail: `Legacy FCM failed [${response.status}]: ${text.slice(0, 300)}` };
  return { ok: true, detail: "Notification sent via legacy FCM." };
}
