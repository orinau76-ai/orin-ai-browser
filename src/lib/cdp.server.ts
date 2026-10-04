/**
 * Minimal Chrome DevTools Protocol client for Steel cloud browsers.
 * Playwright cannot run inside the edge worker, so this speaks CDP (the same
 * protocol Playwright's connectOverCDP uses) directly over Steel's websocket.
 */
const STEEL_API = "https://api.steel.dev/v1";

function steelKey() {
  const key = process.env["STEEL_API_KEY"] ?? process.env["STEEL_API_KEY_1"];
  if (!key) throw new Error("Steel browser is not configured (add STEEL_API_KEY in Secrets).");
  return key;
}

export type BrowserSession = {
  id: string;
  viewerUrl: string;
  send: (method: string, params?: Record<string, unknown>) => Promise<any>;
  close: () => Promise<void>;
};

export async function openBrowser(): Promise<BrowserSession> {
  const key = steelKey();
  const res = await fetch(`${STEEL_API}/sessions`, {
    method: "POST",
    headers: { "steel-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ timeout: 300000 }),
  });
  if (!res.ok) throw new Error(`Steel session failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  const s = (await res.json()) as { id: string; websocketUrl: string; debugUrl: string };

  const ws = new WebSocket(s.websocketUrl);
  await new Promise<void>((ok, fail) => {
    ws.addEventListener("open", () => ok(), { once: true });
    ws.addEventListener("error", () => fail(new Error("Could not connect to the remote browser.")), { once: true });
  });

  let nextId = 1;
  const pending = new Map<number, { ok: (v: any) => void; fail: (e: Error) => void }>();
  ws.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(String(ev.data));
      const p = msg.id ? pending.get(msg.id) : undefined;
      if (!p) return;
      pending.delete(msg.id);
      msg.error ? p.fail(new Error(msg.error.message)) : p.ok(msg.result);
    } catch {
      /* ignore */
    }
  });

  const raw = (method: string, params: Record<string, unknown> = {}, sessionId?: string) =>
    new Promise<any>((ok, fail) => {
      const id = nextId++;
      pending.set(id, { ok, fail });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      setTimeout(() => {
        if (pending.delete(id)) fail(new Error(`${method} timed out`));
      }, 30000);
    });

  const { targetInfos } = await raw("Target.getTargets");
  let target = (targetInfos as { type: string; targetId: string }[]).find((t) => t.type === "page");
  if (!target) target = { type: "page", targetId: (await raw("Target.createTarget", { url: "about:blank" })).targetId };
  const { sessionId } = await raw("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  await raw("Page.enable", {}, sessionId);

  return {
    id: s.id,
    viewerUrl: s.debugUrl,
    send: (m, p) => raw(m, p, sessionId),
    close: async () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      await fetch(`${STEEL_API}/sessions/${s.id}/release`, { method: "POST", headers: { "steel-api-key": key } }).catch(() => {});
    },
  };
}

async function evaluate(b: BrowserSession, expression: string) {
  const r = await b.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "Script error");
  return r.result?.value;
}

async function waitForLoad(b: BrowserSession) {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      if ((await evaluate(b, "document.readyState")) === "complete") return;
    } catch {
      /* navigating */
    }
  }
}

async function observe(b: BrowserSession) {
  return (await evaluate(
    b,
    `(() => {
      const els = [...document.querySelectorAll('a,button,input,textarea,select,[role=button]')].filter(e => e.offsetParent).slice(0, 40);
      const list = els.map((e, i) => { e.setAttribute('data-orin', i); return '[' + i + '] ' + e.tagName.toLowerCase() + ' ' + (e.getAttribute('aria-label') || e.placeholder || e.name || e.innerText || '').trim().slice(0, 60); }).join('\\n');
      return 'URL: ' + location.href + '\\nTitle: ' + document.title + '\\n\\nInteractive elements (use target "#N"):\\n' + list + '\\n\\nPage text:\\n' + document.body.innerText.slice(0, 6000);
    })()`,
  )) as string;
}

function selectorFor(target: string) {
  const m = target.match(/^#?(\d+)$/);
  return JSON.stringify(m ? `[data-orin="${m[1]}"]` : target);
}

/** Runs one action and returns what was actually observed afterwards. */
export async function act(b: BrowserSession, action: string, target: string, value: string): Promise<string> {
  const verb = action.toLowerCase().trim();
  const sel = selectorFor(target);
  if (verb === "navigate") {
    const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
    await b.send("Page.navigate", { url });
    await waitForLoad(b);
  } else if (verb === "click") {
    const ok = await evaluate(b, `(() => { const e = document.querySelector(${sel}); if (!e) return false; e.scrollIntoView({block:'center'}); e.click(); return true; })()`);
    if (!ok) return `Click failed: no element matches "${target}". Observe again and pick a valid element.`;
    await waitForLoad(b);
  } else if (verb === "type") {
    const ok = await evaluate(
      b,
      `(() => { const e = document.querySelector(${sel}); if (!e) return false; e.focus(); const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e), 'value')?.set; set ? set.call(e, ${JSON.stringify(value)}) : (e.value = ${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`,
    );
    if (!ok) return `Type failed: no input matches "${target}".`;
  } else if (verb === "press") {
    const key = value || target || "Enter";
    await b.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: key === "Enter" ? 13 : 0, text: key === "Enter" ? "\r" : "" });
    await b.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key });
    await waitForLoad(b);
  } else if (verb === "scroll") {
    await evaluate(b, `window.scrollBy(0, ${value === "up" ? -700 : 700})`);
  } else if (verb !== "read" && verb !== "observe") {
    return `Unknown action "${verb}". Use navigate, click, type, press, scroll or read.`;
  }
  return `Action ${verb} done. Observed page:\n${await observe(b)}`;
}
