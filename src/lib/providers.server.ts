/**
 * Orin Provider Orchestrator.
 *
 * One place that knows every external provider, which secret(s) it needs,
 * whether it is healthy, which key in its pool to use next, how to classify a
 * failure, and how long to cool a broken key down. Nothing outside this module
 * reads provider secrets, and no key value ever leaves the server.
 */

export type ProviderId =
  | "gemini"
  | "groq"
  | "deepseek"
  | "tavily"
  | "brave"
  | "searxng"
  | "firecrawl"
  | "gdelt"
  | "sec_edgar"
  | "world_bank"
  | "wikidata"
  | "wikimedia"
  | "us_census"
  | "open_meteo"
  | "nominatim"
  | "brevo"
  | "fcm"
  | "google_sheets"
  | "lemon_squeezy"
  | "steel"
  | "supabase";

export type ProviderKind =
  | "model"
  | "search"
  | "extraction"
  | "news"
  | "filings"
  | "data"
  | "geo"
  | "weather"
  | "email"
  | "push"
  | "sheets"
  | "billing"
  | "browser"
  | "backend";

type ProviderSpec = {
  id: ProviderId;
  label: string;
  kind: ProviderKind;
  /** Env var holding one key, or several comma-separated keys (a key pool). */
  secret?: string;
  /** Extra env vars that must also be present for the provider to work. */
  alsoRequires?: string[];
  /** Keyless public APIs are always "configured". */
  keyless?: boolean;
  owners: string[];
  note?: string;
};

const SPECS: ProviderSpec[] = [
  { id: "gemini", label: "Google Gemini", kind: "model", secret: "LOVABLE_API_KEY", owners: ["all"] },
  { id: "groq", label: "Groq", kind: "model", secret: "GROQ_API_KEY", owners: ["all"] },
  { id: "deepseek", label: "DeepSeek", kind: "model", secret: "DEEPSEEK_API_KEY", owners: ["all"] },
  { id: "tavily", label: "Tavily", kind: "search", secret: "TAVILY_API_KEY", owners: ["research", "signals"] },
  { id: "brave", label: "Brave Search", kind: "search", secret: "BRAVE_API_KEY", owners: ["research", "spy", "signals"] },
  {
    id: "searxng",
    label: "SearXNG",
    kind: "search",
    secret: "SEARXNG_URL",
    owners: ["research", "spy", "signals"],
    note: "Set SEARXNG_URL to your SearXNG instance base URL.",
  },
  { id: "firecrawl", label: "Firecrawl", kind: "extraction", secret: "FIRECRAWL_API_KEY", alsoRequires: ["LOVABLE_API_KEY"], owners: ["research", "spy", "signals"] },
  { id: "gdelt", label: "GDELT", kind: "news", keyless: true, owners: ["spy", "signals", "research"] },
  { id: "sec_edgar", label: "SEC EDGAR", kind: "filings", keyless: true, owners: ["research", "spy", "signals"] },
  { id: "world_bank", label: "World Bank", kind: "data", keyless: true, owners: ["research", "signals"] },
  { id: "wikidata", label: "Wikidata", kind: "data", keyless: true, owners: ["research", "signals"] },
  { id: "wikimedia", label: "Wikimedia REST", kind: "data", keyless: true, owners: ["research", "browser", "signals"] },
  { id: "us_census", label: "U.S. Census", kind: "data", keyless: true, owners: ["research"] },
  { id: "open_meteo", label: "Open-Meteo", kind: "weather", keyless: true, owners: ["research", "signals", "automation"] },
  { id: "nominatim", label: "OpenStreetMap / Nominatim", kind: "geo", keyless: true, owners: ["research", "browser", "automation"] },
  { id: "brevo", label: "Brevo", kind: "email", secret: "BREVO_API_KEY", alsoRequires: ["ORIN_EMAIL_FROM"], owners: ["outreach"] },
  { id: "fcm", label: "Firebase Cloud Messaging", kind: "push", secret: "FCM_SERVER_KEY", owners: ["signals", "spy", "automation", "outreach"] },
  { id: "google_sheets", label: "Google Sheets", kind: "sheets", secret: "GOOGLE_SHEETS_ACCESS_TOKEN", owners: ["automation", "outreach", "research"] },
  { id: "lemon_squeezy", label: "Lemon Squeezy", kind: "billing", secret: "LEMON_SQUEEZY_API_KEY", owners: ["billing"] },
  { id: "steel", label: "Steel remote browser", kind: "browser", secret: "STEEL_API_KEY", owners: ["browser"] },
  { id: "supabase", label: "Orin backend", kind: "backend", keyless: true, owners: ["all"] },
];

export type FailureClass =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "network"
  | "invalid_request"
  | "unavailable"
  | "empty_result"
  | "malformed"
  | "unknown";

const RETRYABLE: FailureClass[] = ["rate_limit", "timeout", "network", "unavailable"];
/** Failure classes that should cool the *key* down, not just the request. */
const KEY_COOLDOWN: FailureClass[] = ["auth", "rate_limit"];

type KeyHealth = { index: number; failures: number; cooldownUntil: number; lastError?: string };
type ProviderHealth = {
  failures: number;
  successes: number;
  cooldownUntil: number;
  lastLatencyMs?: number;
  lastError?: string;
  keys: KeyHealth[];
};

const health = new Map<ProviderId, ProviderHealth>();

function specOf(id: ProviderId): ProviderSpec {
  const spec = SPECS.find((s) => s.id === id);
  if (!spec) throw new Error(`Unknown provider ${id}`);
  return spec;
}

function keyPool(spec: ProviderSpec): string[] {
  if (!spec.secret) return [];
  const raw = process.env[spec.secret];
  if (!raw) return [];
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export function isConfigured(id: ProviderId): boolean {
  const spec = specOf(id);
  const extras = (spec.alsoRequires ?? []).every((v) => Boolean(process.env[v]));
  if (spec.keyless) return extras;
  return keyPool(spec).length > 0 && extras;
}

export function missingSecrets(id: ProviderId): string[] {
  const spec = specOf(id);
  const missing: string[] = [];
  if (!spec.keyless && keyPool(spec).length === 0 && spec.secret) missing.push(spec.secret);
  for (const extra of spec.alsoRequires ?? []) if (!process.env[extra]) missing.push(extra);
  return missing;
}

function healthOf(id: ProviderId): ProviderHealth {
  let entry = health.get(id);
  if (!entry) {
    entry = { failures: 0, successes: 0, cooldownUntil: 0, keys: [] };
    health.set(id, entry);
  }
  const pool = keyPool(specOf(id));
  while (entry.keys.length < pool.length) {
    entry.keys.push({ index: entry.keys.length, failures: 0, cooldownUntil: 0 });
  }
  return entry;
}

export function isHealthy(id: ProviderId): boolean {
  if (!isConfigured(id)) return false;
  const entry = healthOf(id);
  if (entry.cooldownUntil > Date.now()) return false;
  const pool = keyPool(specOf(id));
  if (!pool.length) return true;
  return entry.keys.some((k) => k.cooldownUntil <= Date.now());
}

function pickKey(id: ProviderId): { key: string; slot: KeyHealth } | null {
  const pool = keyPool(specOf(id));
  if (!pool.length) return null;
  const entry = healthOf(id);
  const now = Date.now();
  const usable = entry.keys
    .filter((k) => k.cooldownUntil <= now && pool[k.index])
    .sort((a, b) => a.failures - b.failures);
  const slot = usable[0];
  if (!slot) return null;
  return { key: pool[slot.index]!, slot };
}

export function classifyError(error: unknown, status?: number): FailureClass {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 400 || status === 422) return "invalid_request";
  if (status && status >= 500) return "unavailable";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  if (message.includes("abort") || message.includes("timeout")) return "timeout";
  if (message.includes("fetch") || message.includes("network") || message.includes("enotfound")) return "network";
  if (message.includes("json") || message.includes("unexpected token")) return "malformed";
  if (message.includes("no results") || message.includes("empty")) return "empty_result";
  return "unknown";
}

export class ProviderError extends Error {
  provider: ProviderId;
  failureClass: FailureClass;
  status: number | undefined;
  constructor(provider: ProviderId, failureClass: FailureClass, message: string, status?: number) {
    super(message);
    this.provider = provider;
    this.failureClass = failureClass;
    this.status = status;
  }
}

export type Telemetry = {
  provider: ProviderId;
  providerLabel: string;
  operation: string;
  startedAt: number;
  endedAt: number;
  latencyMs: number;
  success: boolean;
  retries: number;
  status?: number | undefined;
  errorClass?: FailureClass | undefined;
  error?: string | undefined;
  cost: "Unknown";
};

const telemetry: Telemetry[] = [];
export function recentTelemetry(limit = 100): Telemetry[] {
  return telemetry.slice(-limit);
}

export type ExecuteContext = { key: string | null; attempt: number };

/**
 * Run one provider operation with health-aware key selection, bounded retries
 * for retryable failure classes only, cooldowns, and telemetry.
 */
export async function execute<T>(
  id: ProviderId,
  operation: string,
  run: (ctx: ExecuteContext) => Promise<T>,
  options: { retries?: number; onTelemetry?: (t: Telemetry) => void } = {},
): Promise<T> {
  const spec = specOf(id);
  if (!isConfigured(id)) {
    throw new ProviderError(
      id,
      "auth",
      `${spec.label} is not configured. Missing: ${missingSecrets(id).join(", ") || "credentials"}.`,
    );
  }
  const entry = healthOf(id);
  if (entry.cooldownUntil > Date.now()) {
    throw new ProviderError(id, "unavailable", `${spec.label} is cooling down after repeated failures.`);
  }

  const maxAttempts = (options.retries ?? 1) + 1;
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    const picked = pickKey(id);
    if (spec.secret && !spec.keyless && !picked) {
      throw new ProviderError(id, "rate_limit", `All ${spec.label} keys are cooling down.`);
    }
    const startedAt = Date.now();
    try {
      const value = await run({ key: picked?.key ?? null, attempt });
      const endedAt = Date.now();
      entry.successes += 1;
      entry.failures = 0;
      entry.lastLatencyMs = endedAt - startedAt;
      if (picked) picked.slot.failures = 0;
      const record: Telemetry = {
        provider: id,
        providerLabel: spec.label,
        operation,
        startedAt,
        endedAt,
        latencyMs: endedAt - startedAt,
        success: true,
        retries: attempt,
        cost: "Unknown",
      };
      telemetry.push(record);
      options.onTelemetry?.(record);
      return value;
    } catch (error) {
      const endedAt = Date.now();
      const status = error instanceof ProviderError ? error.status : undefined;
      const failureClass = error instanceof ProviderError ? error.failureClass : classifyError(error, status);
      lastError = new ProviderError(
        id,
        failureClass,
        error instanceof Error ? error.message : String(error),
        status,
      );
      entry.failures += 1;
      entry.lastError = (lastError as Error).message.slice(0, 200);
      if (picked && KEY_COOLDOWN.includes(failureClass)) {
        picked.slot.failures += 1;
        picked.slot.cooldownUntil = Date.now() + (failureClass === "auth" ? 15 * 60_000 : 60_000);
      }
      if (entry.failures >= 4) entry.cooldownUntil = Date.now() + 2 * 60_000;

      const record: Telemetry = {
        provider: id,
        providerLabel: spec.label,
        operation,
        startedAt,
        endedAt,
        latencyMs: endedAt - startedAt,
        success: false,
        retries: attempt,
        status,
        errorClass: failureClass,
        error: entry.lastError,
        cost: "Unknown",
      };
      telemetry.push(record);
      options.onTelemetry?.(record);

      attempt += 1;
      if (!RETRYABLE.includes(failureClass) || attempt >= maxAttempts) break;
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
  throw lastError;
}

/** Small helper for JSON HTTP providers so status codes classify correctly. */
export async function providerJson<T>(
  id: ProviderId,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ProviderError(
      id,
      classifyError(text, response.status),
      `${id} responded ${response.status}: ${text.slice(0, 200)}`,
      response.status,
    );
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ProviderError(id, "malformed", `${id} returned malformed JSON`, response.status);
  }
}

export type ProviderStatus = {
  id: ProviderId;
  label: string;
  kind: ProviderKind;
  owners: string[];
  configured: boolean;
  healthy: boolean;
  missing: string[];
  keys: number;
  lastLatencyMs?: number | undefined;
  lastError?: string | undefined;
  note?: string | undefined;
};

export function providerStatuses(): ProviderStatus[] {
  return SPECS.map((spec) => {
    const entry = healthOf(spec.id);
    return {
      id: spec.id,
      label: spec.label,
      kind: spec.kind,
      owners: spec.owners,
      configured: isConfigured(spec.id),
      healthy: isHealthy(spec.id),
      missing: missingSecrets(spec.id),
      keys: keyPool(spec).length,
      lastLatencyMs: entry.lastLatencyMs,
      lastError: entry.lastError,
      note: spec.note,
    };
  });
}
