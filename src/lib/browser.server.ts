/**
 * Steel remote browser bridge.
 *
 * The app server runs in an edge worker, so Playwright cannot be launched
 * locally. Steel's hosted REST API is used instead: it drives a real Chrome
 * session remotely and returns rendered page content. Anything Steel cannot do
 * over REST is reported honestly rather than faked.
 */
import { execute, ProviderError, type ProviderId } from "./providers.server";

const STEEL: ProviderId = "steel";
const BASE = process.env["STEEL_API_URL"] ?? "https://api.steel.dev/v1";

async function steelFetch(path: string, key: string, body: unknown): Promise<string> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "steel-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new ProviderError(STEEL, response.status === 429 ? "rate_limit" : "unavailable", `Steel responded ${response.status}: ${text.slice(0, 200)}`, response.status);
  }
  return text;
}

function extractContent(raw: string): string {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const content = data["content"];
    if (typeof content === "string") return content;
    if (content && typeof content === "object") {
      const inner = content as Record<string, unknown>;
      for (const field of ["markdown", "readability", "cleaned_html", "html"]) {
        const value = inner[field];
        if (typeof value === "string") return value;
        if (value && typeof value === "object") {
          const text = (value as Record<string, unknown>)["textContent"];
          if (typeof text === "string") return text;
        }
      }
    }
    if (typeof data["markdown"] === "string") return data["markdown"] as string;
    return raw;
  } catch {
    return raw;
  }
}

/**
 * Runs one browser action. `navigate`/`read` render the page through Steel;
 * interaction verbs are not exposed over Steel's REST surface and say so.
 */
export async function runBrowserAction(action: string, target: string, value: string): Promise<string> {
  const verb = action.toLowerCase().trim();

  if (verb === "navigate" || verb === "read" || verb === "screenshot") {
    if (!/^https?:\/\//i.test(target)) {
      return `Browser action "${verb}" needs a full http(s) URL, received "${target}".`;
    }
    const raw = await execute(STEEL, verb, async ({ key }) =>
      steelFetch(verb === "screenshot" ? "/screenshot" : "/scrape", key!, {
        url: target,
        format: verb === "screenshot" ? undefined : ["markdown"],
      }),
    );
    if (verb === "screenshot") return `Screenshot captured for ${target}.`;
    const content = extractContent(raw).slice(0, 12000);
    return `Rendered ${target} through the Steel browser:\n\n${content}`;
  }

  return `Browser action "${verb}"${value ? ` with value "${value}"` : ""} on "${target}" is not available: the remote browser session only supports rendering and reading pages here, not scripted interaction. Report this limitation instead of assuming it succeeded.`;
}
