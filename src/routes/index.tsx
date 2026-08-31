import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Clock,
  Compass,
  Database,
  FileText,
  Flame,
  GraduationCap,
  History,
  Home,
  Laptop,
  Layers,
  Loader2,
  LogOut,
  Plus,
  RotateCw,
  Scale,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Trash2,
  Newspaper,
  Youtube,
  MessageCircle,
  BookOpen,
  ChevronRight,
  ChevronDown,
  X,
  Cloud,
  Apple,
  Bot,
} from "lucide-react";
import heroRibbon from "@/assets/hero-ribbon.jpg";
import weatherBg from "@/assets/weather-bg.jpg";
import { useAuth } from "@/hooks/useAuth";
import { OrinMarkdown } from "@/components/orin-markdown";
import { streamAgent, type LiveStep } from "@/lib/agent-client";
import { listJobs, queueBackgroundJob } from "@/lib/jobs.functions";
import {
  deleteSession,
  getSession,
  getSettings,
  listSessions,
  setPrivateMode as setPrivateModeFn,
} from "@/lib/orin.functions";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Orin — AI Browser with Research Agents" },
      {
        name: "description",
        content:
          "Orin is an AI-powered browser that searches, researches, summarizes, compares and extracts across the live web, with autonomous agent mode and private no-log browsing.",
      },
      { property: "og:title", content: "Orin — AI Browser with Research Agents" },
      {
        property: "og:description",
        content:
          "Search, research, summarize, compare and automate across the live web with Orin's AI agent mode and private mode.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const sideIcons = [Home, Star, Layers, Clock, History, FileText];

type Mode = "search" | "research" | "summarize" | "compare" | "extract" | "explain" | "agent";

const actions: { title: string; sub: string; icon: typeof Search; tint: string; mode: Mode }[] = [
  { title: "Research", sub: "Deep research on any topic", icon: Search, tint: "from-primary to-primary-glow", mode: "research" },
  { title: "Summarize", sub: "Paste a URL to summarize", icon: FileText, tint: "from-sky-400 to-sky-300", mode: "summarize" },
  { title: "Compare", sub: "Compare products, prices, etc.", icon: Scale, tint: "from-amber-400 to-amber-300", mode: "compare" },
  { title: "Extract", sub: "Extract data from pages", icon: Database, tint: "from-violet-400 to-violet-300", mode: "extract" },
  { title: "Explain", sub: "Explain any content", icon: Sparkles, tint: "from-fuchsia-400 to-fuchsia-300", mode: "explain" },
  { title: "Agent Mode", sub: "Multi-step autonomous tasks", icon: Bot, tint: "from-emerald-400 to-emerald-300", mode: "agent" },
];

const chips: { label: string; icon: typeof Compass; prompt: string; mode: Mode }[] = [
  { label: "AI Research", icon: Compass, prompt: "Deep research the most important AI breakthroughs this month", mode: "research" },
  { label: "Top Stories", icon: Newspaper, prompt: "What are today's top world news stories?", mode: "search" },
  { label: "YouTube", icon: Youtube, prompt: "Find the best YouTube videos published this week about AI agents", mode: "search" },
  { label: "Reddit", icon: MessageCircle, prompt: "What is Reddit saying right now about AI browsers?", mode: "research" },
  { label: "X (Twitter)", icon: X, prompt: "Summarize what's trending on X about AI today", mode: "search" },
  { label: "Academics", icon: BookOpen, prompt: "Find recent peer-reviewed papers on autonomous web agents", mode: "research" },
];

const features = [
  { title: "AI Research Assistant", sub: "Deep research with real-time results", tint: "from-primary/70 to-primary-glow/40", icon: Square },
  { title: "Smart Summarizer", sub: "Summarize long articles instantly", tint: "from-sky-400/70 to-sky-200/40", icon: FileText },
  { title: "Compare Anything", sub: "Compare products, prices, and more", tint: "from-violet-400/70 to-violet-200/40", icon: Scale },
];

const fallbackSessions = [
  { title: "Best Pharm.D Universities in India", meta: "Research • sample", icon: GraduationCap },
  { title: "RTX 5070 Laptops Under ₹1 Lakh", meta: "Comparison • sample", icon: Laptop },
  { title: "Apple Event 2025 Summary", meta: "Summary • sample", icon: Apple },
];

const suggestions = [
  { title: "Latest AI Tools in 2026", meta: "Trending now", icon: Sparkles, mode: "research" as Mode },
  { title: "Top Colleges Accepting Pharmacy Graduates", meta: "Recommended", icon: GraduationCap, mode: "research" as Mode },
  { title: "Car Photography Tips", meta: "For you", icon: Camera, mode: "explain" as Mode },
];

const tabs = [
  { label: "Orin Research" },
  { label: "AI News" },
  { label: "Product Hunt" },
];

type Source = { url: string; title: string };
type Step = { tool: string; detail: string };
type Turn = { role: string; content: string; sources?: Source[]; steps?: Step[] };
type SessionRow = { id: string; title: string; mode: string; updated_at: string };

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function Index() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [mode, setMode] = useState<Mode>("research");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [privateMode, setPrivate] = useState(false);
  const [phase, setPhase] = useState("");
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([]);
  const [liveSources, setLiveSources] = useState<Source[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [handoff, setHandoff] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const activeTask = useRef<{ prompt: string; mode: Mode } | null>(null);

  const refreshSessions = useCallback(async () => {
    if (!user) return;
    try {
      setSessions((await listSessions()) as SessionRow[]);
    } catch {
      /* ignore */
    }
  }, [user]);

  const refreshJobs = useCallback(async () => {
    if (!user) return;
    try {
      setJobs((await listJobs()) as JobRow[]);
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSessions([]);
      setJobs([]);
      return;
    }
    void refreshSessions();
    void refreshJobs();
    void getSettings()
      .then((s) => setPrivate(s.privateMode))
      .catch(() => {});
  }, [user, refreshSessions, refreshJobs]);

  // Live elapsed timer for the task graph
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  // Hand the running task off to the server when the user leaves the page.
  useEffect(() => {
    if (!busy || !user || privateMode) return;
    let cancelled = false;
    let token: string | null = null;
    const task = activeTask.current;
    if (!task) return;

    void queueBackgroundJob({ data: { prompt: task.prompt, mode: task.mode } })
      .then((job) => {
        if (cancelled) return;
        token = job.token;
        setHandoff(job.email);
      })
      .catch(() => {});

    const onHide = () => {
      if (document.visibilityState === "hidden" && token) {
        navigator.sendBeacon(
          "/api/public/run-job",
          new Blob([JSON.stringify({ token })], { type: "application/json" }),
        );
        token = null;
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [busy, user, privateMode]);

  const run = useCallback(
    async (prompt: string, runMode: Mode) => {
      if (!prompt.trim() || busy) return;
      if (!user) {
        setError("Sign in to run Orin — your tasks, sessions and results are tied to your account.");
        return;
      }
      activeTask.current = { prompt, mode: runMode };
      setBusy(true);
      setError(null);
      setHandoff(null);
      setLiveSteps([]);
      setLiveSources([]);
      setPhase("Connecting to Orin");
      setMode(runMode);
      setTurns((prev) => [...prev, { role: "user", content: prompt }]);
      setInput("");
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }));
      try {
        await streamAgent({ prompt, mode: runMode, sessionId }, (event) => {
          if (event.type === "session") setSessionId(event.sessionId);
          else if (event.type === "phase") setPhase(event.label);
          else if (event.type === "source")
            setLiveSources((prev) =>
              prev.some((s) => s.url === event.source.url) ? prev : [...prev, event.source],
            );
          else if (event.type === "step") {
            setPhase(`${event.step.tool}: ${event.step.detail}`.slice(0, 90));
            setLiveSteps((prev) => {
              const idx = prev.findIndex(
                (s) => s.tool === event.step.tool && s.detail === event.step.detail,
              );
              const next: LiveStep = { ...event.step, status: event.status };
              if (idx === -1) return [...prev, next];
              const copy = [...prev];
              copy[idx] = next;
              return copy;
            });
          } else if (event.type === "done") {
            setSessionId(event.sessionId);
            setTurns((prev) => [
              ...prev,
              {
                role: "assistant",
                content: event.answer,
                sources: event.sources,
                steps: event.steps,
              },
            ]);
            void refreshSessions();
          } else if (event.type === "error") {
            setError(event.message);
          }
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Orin could not complete that.");
      } finally {
        activeTask.current = null;
        setBusy(false);
        setPhase("");
        void refreshJobs();
      }
    },
    [busy, sessionId, user, refreshSessions, refreshJobs],
  );


  async function openSession(id: string) {
    setSessionId(id);
    setError(null);
    try {
      const rows = await getSession({ data: { sessionId: id } });
      setTurns(rows as Turn[]);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch {
      setError("Could not open that session.");
    }
  }

  async function removeSession(id: string) {
    await deleteSession({ data: { sessionId: id } });
    if (id === sessionId) {
      setSessionId(null);
      setTurns([]);
    }
    void refreshSessions();
  }

  async function togglePrivate() {
    const next = !privateMode;
    setPrivate(next);
    try {
      await setPrivateModeFn({ data: { privateMode: next } });
      if (next) void refreshSessions();
    } catch {
      setPrivate(!next);
    }
  }

  const active = turns.length > 0;

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="glass mx-auto max-w-[1500px] overflow-hidden rounded-3xl">
        {/* Browser chrome */}
        <header className="flex items-center gap-4 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-primary" />
            <span className="size-3 rounded-full bg-amber-400" />
            <span className="size-3 rounded-full bg-amber-300" />
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <button className="rounded-full p-1.5 hover:bg-secondary" aria-label="Back">
              <ArrowLeft className="size-4" />
            </button>
            <button className="rounded-full p-1.5 hover:bg-secondary" aria-label="Forward">
              <ArrowRight className="size-4" />
            </button>
            <button
              className="rounded-full p-1.5 hover:bg-secondary"
              aria-label="Reload"
              onClick={() => {
                setTurns([]);
                setSessionId(null);
              }}
            >
              <RotateCw className="size-4" />
            </button>
          </div>
          <form
            className="glass-soft mx-auto flex w-full max-w-2xl items-center gap-3 rounded-full px-4 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void run(input, mode);
            }}
          >
            <Search className="size-4 text-muted-foreground" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search, enter a URL, or ask Orin"
            />
            <Sparkles className="size-4 text-primary" />
          </form>
          <div className="ml-auto flex items-center gap-2 text-muted-foreground">
            <button
              onClick={() => void togglePrivate()}
              disabled={!user}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                privateMode ? "bg-emerald-400/25 text-emerald-700" : "bg-white/60"
              } disabled:opacity-50`}
              title="Private Mode: requests are proxied server-side and nothing is saved"
            >
              {privateMode ? <ShieldCheck className="size-4" /> : <Shield className="size-4" />}
              {privateMode ? "Private On" : "Private Off"}
            </button>
            <button className="rounded-full p-2 hover:bg-secondary" aria-label="Bookmarks">
              <Star className="size-4" />
            </button>
            {user ? (
              <button
                onClick={() => void signOut()}
                className="rounded-full p-2 hover:bg-secondary"
                aria-label="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            ) : (
              <Link
                to="/auth"
                className="rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                Sign in
              </Link>
            )}
            <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
              <Sparkles className="size-4" />
            </span>
          </div>
        </header>

        {/* Tab strip */}
        <div className="flex items-end gap-1 px-4">
          <div className="glass-soft flex min-w-56 items-center gap-2 rounded-t-2xl px-4 py-3 text-sm font-medium">
            <span className="size-2.5 rounded-full bg-primary" />
            New Tab
            <X className="ml-auto size-4 text-muted-foreground" />
          </div>
          {tabs.map((t) => (
            <div
              key={t.label}
              className="flex min-w-48 items-center gap-2 rounded-t-2xl px-4 py-3 text-sm text-muted-foreground hover:bg-white/25"
            >
              <span className="size-2.5 rounded-full bg-accent-foreground/25" />
              {t.label}
            </div>
          ))}
          <button className="mb-1 rounded-full p-2 text-muted-foreground hover:bg-secondary" aria-label="New tab">
            <Plus className="size-4" />
          </button>
        </div>

        <div className="flex gap-4 p-4">
          {/* Rail */}
          <nav className="glass-soft flex w-16 shrink-0 flex-col items-center gap-2 rounded-3xl py-4">
            <span className="mb-2 text-sm font-semibold tracking-tight">Orin</span>
            {sideIcons.map((Icon, i) => (
              <button
                key={i}
                aria-label="Rail item"
                className={`grid size-10 place-items-center rounded-2xl transition-colors ${
                  i === 0
                    ? "bg-white/80 text-primary shadow-[var(--shadow-soft)]"
                    : "text-muted-foreground hover:bg-white/50"
                }`}
              >
                <Icon className="size-4" />
              </button>
            ))}
            <button className="mt-auto grid size-10 place-items-center rounded-2xl text-muted-foreground hover:bg-white/50" aria-label="Settings">
              <Settings className="size-4" />
            </button>
            <button
              onClick={() => {
                setTurns([]);
                setSessionId(null);
              }}
              className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-primary-glow/30 text-primary"
              aria-label="New session"
            >
              <Plus className="size-4" />
            </button>
          </nav>

          {/* Assistant panel */}
          <aside className="glass-soft flex w-[330px] shrink-0 flex-col gap-4 rounded-3xl p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
                <Compass className="size-5" />
              </span>
              <div>
                <h2 className="text-xl font-bold tracking-tight">ORIN</h2>
                <p className="text-[10px] tracking-[0.2em] text-muted-foreground">AI BROWSER</p>
              </div>
              <button className="ml-auto grid size-8 place-items-center rounded-full bg-white/70 text-muted-foreground" aria-label="History">
                <Clock className="size-4" />
              </button>
            </div>

            <div>
              <h1 className="text-lg font-semibold">
                Hello{user?.email ? `, ${user.email.split("@")[0]}` : ""} 👋
              </h1>
              <p className="text-sm text-muted-foreground">
                {authLoading ? "Waking up…" : user ? "How can I help you today?" : "Sign in to start working."}
              </p>
            </div>

            <button
              onClick={() => setMode("agent")}
              className="flex items-start gap-3 rounded-2xl bg-gradient-to-br from-primary/12 to-primary-glow/10 p-4 text-left"
            >
              <div>
                <p className="text-sm font-semibold">
                  🧠 {mode === "agent" ? "Agent Mode is active" : "Switch Orin to Agent Mode"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  I browse, research, compare and complete multi-step tasks for you.
                </p>
              </div>
              <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </button>

            <div className="divide-y divide-border overflow-hidden rounded-2xl bg-white/60">
              {actions.map(({ title, sub, icon: Icon, tint, mode: m }) => (
                <button
                  key={title}
                  onClick={() => setMode(m)}
                  className={`flex w-full items-center gap-3 p-3.5 text-left hover:bg-white/70 ${
                    mode === m ? "bg-white/80" : ""
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-xs text-muted-foreground">{sub}</p>
                  </div>
                  <span className={`ml-auto grid size-9 place-items-center rounded-xl bg-gradient-to-br ${tint} text-primary-foreground`}>
                    <Icon className="size-4" />
                  </span>
                </button>
              ))}
            </div>

            <form
              className="mt-auto rounded-2xl bg-white/60 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(input, mode);
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder={`Ask Orin to ${mode}…`}
              />
              <div className="mt-6 flex items-center justify-end gap-3">
                <span className="mr-auto rounded-full bg-white/70 px-3 py-1 text-[11px] font-medium capitalize text-muted-foreground">
                  {mode}
                </span>
                <button
                  type="submit"
                  disabled={busy}
                  className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-[var(--shadow-soft)] disabled:opacity-60"
                  aria-label="Send"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                </button>
              </div>
            </form>
          </aside>

          {/* Main */}
          <main className="flex min-w-0 flex-1 flex-col gap-4">
            <section className="glass-soft relative overflow-hidden rounded-3xl p-10">
              <img
                src={heroRibbon}
                alt=""
                width={1200}
                height={640}
                className="pointer-events-none absolute -right-10 -top-16 w-[55%] opacity-90 mix-blend-multiply"
              />
              <div className="relative max-w-2xl">
                <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                  You have the ideas.
                  <br />
                  <span className="text-gradient">Orin</span> finds the way.
                </h2>
                <form
                  className="glass mt-8 flex items-center gap-3 rounded-full py-2.5 pl-5 pr-2.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(input, mode);
                  }}
                >
                  <Search className="size-4 text-muted-foreground" />
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    placeholder="Ask Orin to search, research or do anything..."
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-[var(--shadow-soft)] disabled:opacity-60"
                    aria-label="Ask Orin"
                  >
                    {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-5" />}
                  </button>
                </form>
                <div className="mt-6 flex flex-wrap gap-3">
                  {chips.map(({ label, icon: Icon, prompt, mode: m }) => (
                    <button
                      key={label}
                      onClick={() => void run(prompt, m)}
                      className="flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm font-medium shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5"
                    >
                      <Icon className="size-4 text-foreground/70" />
                      {label}
                    </button>
                  ))}
                </div>
                {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
              </div>
            </section>

            {active ? (
              <section ref={resultRef} className="glass-soft rounded-3xl p-6">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold capitalize">{mode} workspace</h3>
                  {privateMode ? (
                    <span className="rounded-full bg-emerald-400/20 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                      Private — not saved
                    </span>
                  ) : null}
                  <button
                    className="ml-auto rounded-full bg-white/70 px-3 py-1 text-xs font-medium"
                    onClick={() => {
                      setTurns([]);
                      setSessionId(null);
                    }}
                  >
                    New session
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  {turns.map((turn, i) =>
                    turn.role === "user" ? (
                      <div key={i} className="ml-auto max-w-[80%] rounded-2xl bg-gradient-to-br from-primary/15 to-primary-glow/10 px-4 py-3 text-sm">
                        {turn.content}
                      </div>
                    ) : (
                      <article key={i} className="rounded-2xl bg-white/60 p-4">
                        {turn.steps?.length ? (
                          <div className="mb-3 flex flex-wrap gap-2">
                            {turn.steps.map((step, j) => (
                              <span
                                key={j}
                                className="max-w-[260px] truncate rounded-full bg-white/80 px-3 py-1 text-[11px] text-muted-foreground"
                              >
                                {step.tool}: {step.detail}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <OrinMarkdown text={turn.content} />
                        {turn.sources?.length ? (
                          <div className="mt-4 border-t border-border pt-3">
                            <p className="text-xs font-semibold text-muted-foreground">Sources</p>
                            <ul className="mt-2 space-y-1">
                              {turn.sources.map((source) => (
                                <li key={source.url} className="truncate text-xs">
                                  <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="text-primary underline-offset-2 hover:underline"
                                  >
                                    {source.title}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </article>
                    ),
                  )}
                  {busy ? (
                    <div className="flex items-center gap-2 rounded-2xl bg-white/60 p-4 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Orin is browsing the live web…
                    </div>
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="grid gap-4 lg:grid-cols-3">
                {features.map(({ title, sub, tint, icon: Icon }) => (
                  <article key={title} className="glass-soft flex items-center gap-4 rounded-3xl p-6">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{title}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">{sub}</p>
                    </div>
                    <span className={`ml-auto grid size-24 shrink-0 place-items-center rounded-3xl bg-gradient-to-br ${tint} text-white/90`}>
                      <Icon className="size-9" />
                    </span>
                  </article>
                ))}
              </section>
            )}

            <section className="grid gap-4 lg:grid-cols-3">
              <article className="glass-soft rounded-3xl p-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Recent Sessions</h3>
                  <button
                    onClick={() => void refreshSessions()}
                    className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium"
                  >
                    Refresh
                  </button>
                </div>
                <ul className="mt-4 divide-y divide-border">
                  {sessions.length
                    ? sessions.map((session) => (
                        <li key={session.id} className="flex items-center gap-3 py-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/80 text-foreground/70">
                            <History className="size-4" />
                          </span>
                          <button className="min-w-0 flex-1 text-left" onClick={() => void openSession(session.id)}>
                            <p className="truncate text-sm font-medium">{session.title}</p>
                            <p className="text-xs capitalize text-muted-foreground">
                              {session.mode} • {relative(session.updated_at)}
                            </p>
                          </button>
                          <button
                            aria-label="Delete session"
                            onClick={() => void removeSession(session.id)}
                            className="rounded-full p-2 text-muted-foreground hover:bg-white/70"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </li>
                      ))
                    : fallbackSessions.map(({ title, meta, icon: Icon }) => (
                        <li key={title} className="flex items-center gap-3 py-3 opacity-70">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/80 text-foreground/70">
                            <Icon className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{title}</p>
                            <p className="text-xs text-muted-foreground">{meta}</p>
                          </div>
                        </li>
                      ))}
                </ul>
              </article>

              <article className="glass-soft rounded-3xl p-6">
                <h3 className="flex items-center gap-2 font-semibold">
                  AI Suggestions for You <Flame className="size-4 text-primary" />
                </h3>
                <ul className="mt-4 space-y-3">
                  {suggestions.map(({ title, meta, icon: Icon, mode: m }) => (
                    <li key={title}>
                      <button className="flex w-full items-center gap-3 text-left" onClick={() => void run(title, m)}>
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/25 to-primary-glow/20 text-primary">
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{title}</p>
                          <p className="text-xs text-muted-foreground">{meta}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="relative overflow-hidden rounded-3xl">
                <img
                  src={weatherBg}
                  alt="Pastel sunset over mountains near Srinagar"
                  width={700}
                  height={560}
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover"
                />
                <div className="relative flex h-full flex-col justify-between bg-gradient-to-b from-black/10 to-black/35 p-6 text-white">
                  <div className="flex items-center gap-1 text-sm">
                    Srinagar <ChevronDown className="size-4" />
                  </div>
                  <div className="mt-6 flex items-end justify-between">
                    <div>
                      <p className="text-5xl font-semibold leading-none">
                        24<span className="text-2xl align-top">°C</span>
                      </p>
                      <p className="mt-2 text-sm">Partly Cloudy</p>
                    </div>
                    <Cloud className="size-12 opacity-90" />
                  </div>
                  <dl className="mt-8 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="opacity-80">Humidity</dt>
                      <dd className="font-semibold">58%</dd>
                    </div>
                    <div>
                      <dt className="opacity-80">Wind</dt>
                      <dd className="font-semibold">12 km/h</dd>
                    </div>
                    <div>
                      <dt className="opacity-80">AQI</dt>
                      <dd className="font-semibold">42</dd>
                    </div>
                  </dl>
                </div>
              </article>
            </section>

            <p className="py-2 text-center text-sm text-muted-foreground">
              Orin AI Browser — Your AI-Powered Gateway to Everything 💗
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}
