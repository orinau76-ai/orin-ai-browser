import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveVoice } from "@/hooks/use-live-voice";
import { useVisionCapture } from "@/hooks/use-vision-capture";
import { VoiceVisionPanel } from "@/components/voice-vision-panel";
type VoiceDraft = { id: string; prompt: string; mode: string; steps: string[]; needs_approval_reason: string };
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
  Mail,
  Plug,
  CheckCircle2,
  Eye,
  Download,
  Bell,
  Mic,
  MicOff,
} from "lucide-react";
import heroRibbon from "@/assets/hero-ribbon.jpg";
import weatherBg from "@/assets/weather-bg.jpg";
import { useAuth } from "@/hooks/useAuth";
import { OrinMarkdown } from "@/components/orin-markdown";
import { streamAgent, type LiveStep } from "@/lib/agent-client";
import { listJobs, queueBackgroundJob } from "@/lib/jobs.functions";
import {
  clearHistory,
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

type Mode = "search" | "research" | "summarize" | "compare" | "extract" | "explain" | "agent" | "automation" | "spy";

const PUBLISHED_URL = "https://orin-ai-browser.lovable.app";

const quickModes: { label: string; mode: Mode; icon: typeof Search }[] = [
  { label: "Research", mode: "research", icon: Search },
  { label: "Automation", mode: "automation", icon: Bot },
  { label: "Spy", mode: "spy", icon: Eye },
];

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
type JobRow = {
  id: string;
  prompt: string;
  mode: string;
  status: string;
  error: string | null;
  emailed_at: string | null;
  created_at: string;
};


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
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const vision = useVisionCapture();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [captions, setCaptions] = useState<{ role: string; text: string }[]>([]);
  const [visualBusy, setVisualBusy] = useState(false);
  const [visualAnswer, setVisualAnswer] = useState("");
  const lastFrame = useRef(0);
  const call = useLiveVoice({
    onEvent(event) {
      if (event.type === "app.task.draft") setDraft(event["draft"] as VoiceDraft);
      if (event.type === "app.delegation.pending") setPhase("Orin is drafting your task…");
      if (event.type === "session.input_transcript.delta" || event.type === "session.output_transcript.delta") {
        const role = event.type === "session.input_transcript.delta" ? "user" : "assistant";
        const text = typeof event["delta"] === "string" ? event["delta"] : "";
        if (text) setCaptions((previous) => {
          const last = previous[previous.length - 1];
          return last?.role === role ? [...previous.slice(0, -1), { role, text: last.text + text }] : [...previous, { role, text }];
        });
        if (role === "user") {
          setDraft(null);
          if (Date.now() - lastFrame.current > 5000) {
            const frame = vision.snapshot();
            if (frame && call.shareVision(frame)) lastFrame.current = Date.now();
          }
        }
      }
      if (event.type === "app.vision.done") {
        setVisualBusy(false);
        setVisualAnswer(typeof event["text"] === "string" ? event["text"] : "");
      }
      if (event.type === "app.request.error") {
        setVisualBusy(false);
        setError(event.error?.message ?? "Orin could not finish that request.");
      }
      if (event.type === "app.closed" || event.type === "app.stopping") {
        vision.stop();
        setVisualBusy(false);
      }
    },
  });
  const listening = call.status === "connecting" || call.status === "connected";
  const speakNextRef = useRef(false);
  const narrateRef = useRef(call.narrate);
  narrateRef.current = call.narrate;
  const [elapsed, setElapsed] = useState(0);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [handoff, setHandoff] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const installPrompt = useRef<{ prompt: () => Promise<void> } | null>(null);
  const [liveText, setLiveText] = useState("");
  const activeTask = useRef<{ prompt: string; mode: Mode } | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      installPrompt.current = e as unknown as { prompt: () => Promise<void> };
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if ("serviceWorker" in navigator && window.self === window.top) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const refreshSessions = useCallback(async () => {
    if (!user) return;
    try {
      setSessions(((await listSessions()) ?? []) as SessionRow[]);
    } catch {
      /* ignore */
    }
  }, [user]);

  const refreshJobs = useCallback(async () => {
    if (!user) return;
    try {
      setJobs(((await listJobs()) ?? []) as JobRow[]);
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
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setError(null);
      setHandoff(null);
      setLiveSteps([]);
      setLiveSources([]);
      setViewerUrl(null);
      setLiveText("");
      setPhase("Connecting to Orin");
      setMode(runMode);
      setTurns((prev) => [...prev, { role: "user", content: prompt }]);
      setInput("");
      let gotDone = false;
      try {
        await streamAgent(
          { prompt, mode: runMode, sessionId },
          (event) => {
            if (event.type === "session") setSessionId(event.sessionId);
            else if (event.type === "phase") setPhase(event.label);
            else if (event.type === "browser") setViewerUrl(event.viewerUrl);
            else if (event.type === "delta") setLiveText((t) => t + event.text);
            else if (event.type === "source")
              setLiveSources((prev) =>
                prev.some((s) => s.url === event.source.url) ? prev : [...prev, event.source],
              );
            else if (event.type === "step") {
              if (event.status === "start") setLiveText("");
              if (event.status !== "start") narrateRef.current(`Step ${event.status === "error" ? "failed" : "done"}: ${event.step.tool} ${event.step.detail}`.slice(0, 200));
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
              gotDone = true;
              setSessionId(event.sessionId);
              setTurns((prev) => [
                ...prev,
                { role: "assistant", content: event.answer, sources: event.sources, steps: event.steps },
              ]);
              void refreshSessions();
              {
                const plain = event.answer.replace(/\[S\d+\]|[#*_`>|]/g, "").split(/\n+sources/i)[0]!;
                narrateRef.current(`Task finished. Result: ${plain.slice(0, 330)}`);
              }
            } else if (event.type === "error") {
              setError(event.message);
            }
          },
          controller.signal,
        );
        if (!gotDone && !controller.signal.aborted) {
          setError("The connection dropped before Orin finished. Please try again.");
        }
      } catch (err) {
        if (controller.signal.aborted) {
          setTurns((prev) => [...prev, { role: "assistant", content: "_Stopped._" }]);
        } else {
          setError(err instanceof Error ? err.message : "Orin could not complete that.");
        }
      } finally {
        activeTask.current = null;
        abortRef.current = null;
        setBusy(false);
        setPhase("");
        setLiveText("");
        void refreshJobs();
      }
    },
    [busy, sessionId, user, refreshSessions, refreshJobs],
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [turns, liveText, liveSteps.length, busy]);

  function toggleVoice() {
    if (call.status === "connecting" || call.status === "connected") {
      call.stop();
      return;
    }
    if (!user) {
      setError("Sign in to talk to Orin.");
      return;
    }
    setDraft(null);
    setCaptions([]);
    setVoiceOpen(true);
    call.start();
  }

  function approveDraft() {
    if (!draft) return;
    const d = draft;
    setDraft(null);
    call.narrate(`The user approved. Starting the ${d.mode} task now.`);
    void run(d.prompt, d.mode as Mode);
  }

  async function wipeHistory() {
    if (!confirm("Delete all your Orin history?")) return;
    try {
      await clearHistory();
      setSessions([]);
      setTurns([]);
      setSessionId(null);
    } catch {
      setError("Could not clear history.");
    }
  }

  async function install() {
    const p = installPrompt.current;
    if (p) {
      await p.prompt();
      installPrompt.current = null;
    } else {
      window.open(PUBLISHED_URL, "_blank", "noopener");
    }
  }


  async function openSession(id: string) {
    setSessionId(id);
    setError(null);
    try {
      const rows = await getSession({ data: { sessionId: id } });
      setTurns((rows ?? []) as Turn[]);
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

  const active = turns.length > 0 || busy;
  const voicePanel = <VoiceVisionPanel
    open={voiceOpen} status={call.status} videoRef={vision.videoRef} source={vision.source}
    pending={vision.pending} muted={call.muted} playbackBlocked={call.playbackBlocked}
    visualBusy={visualBusy} visualAnswer={visualAnswer} captions={captions}
    error={vision.error ?? call.error ?? error} draft={draft} busy={busy} viewerUrl={viewerUrl} phase={phase}
    onShare={(source) => void vision.start(source)} onStopSharing={vision.stop}
    onLook={() => {
      const frame = vision.snapshot();
      if (frame && call.shareVision(frame, true)) { setVisualBusy(true); setError(null); }
      else setError("The shared video is not ready yet.");
    }}
    onMute={() => call.setMuted(!call.muted)} onMinimize={() => setVoiceOpen(false)}
    onEnd={() => { vision.stop(); call.stop(); abortRef.current?.abort(); setDraft(null); setVoiceOpen(false); }}
    onPlay={call.resumePlayback} onApprove={approveDraft}
    onDecline={() => { setDraft(null); call.narrate("The user declined that task draft."); }}
    onCancel={() => abortRef.current?.abort()}
  />;

  const modeToggles = (
    <div className="flex flex-wrap items-center gap-1.5">
      {quickModes.map(({ label, mode: m, icon: Icon }) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          aria-pressed={mode === m}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === m
              ? "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-[var(--shadow-soft)]"
              : "bg-white/60 text-muted-foreground hover:bg-white/80"
          }`}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );

  const composer = (
    <div className="w-full shrink-0 border-t border-border bg-background/70 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-xl sm:p-4">
      <div className="mx-auto max-w-3xl">
        {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
        <div className="mb-2">{modeToggles}</div>
        <audio ref={call.audioRef} className="hidden" />
        {listening ? <button type="button" onClick={() => setVoiceOpen(true)} className="mb-2 text-xs font-semibold text-primary">Open Orin Live</button> : null}
        {listening || call.error ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl bg-white/60 px-4 py-2 text-xs">
            <span className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${call.status === "connected" ? "animate-pulse bg-primary" : "bg-muted-foreground"}`} />
              {call.error ?? (call.status === "connected" ? "Voice on — talk to Orin" : "Connecting voice…")}
            </span>
            {call.playbackBlocked ? (
              <button type="button" onClick={call.resumePlayback} className="font-semibold text-primary">Play audio</button>
            ) : null}
          </div>
        ) : null}
        {draft ? (
          <div className="glass mb-2 rounded-2xl p-4 text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Task ready · {draft.mode}</div>
            <p className="mb-3 font-medium">{draft.prompt}</p>
            <ol className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {draft.steps.map((step, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full border-2 border-primary" />
                  {step}
                  {i < draft.steps.length - 1 ? <span className="h-px w-4 bg-primary/40" /> : null}
                </li>
              ))}
            </ol>
            {draft.needs_approval_reason ? <p className="mb-3 text-xs text-muted-foreground">{draft.needs_approval_reason}</p> : null}
            <div className="flex gap-2">
              <button type="button" onClick={approveDraft} disabled={busy} className="rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-xs font-semibold text-primary-foreground">Approve & run</button>
              <button type="button" onClick={() => { setDraft(null); call.narrate("The user declined that task draft."); }} className="rounded-full bg-white/70 px-4 py-2 text-xs font-semibold">Decline</button>
            </div>
          </div>
        ) : null}
        <form
          className="glass flex w-full items-center gap-2 rounded-full py-2 pl-4 pr-2 sm:gap-3 sm:pl-5"
          onSubmit={(e) => {
            e.preventDefault();
            void run(input, mode);
          }}
        >
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
            placeholder="Search, research, or give Orin a task…"
          />
          {!busy ? (
            <button
              type="button"
              onClick={toggleVoice}
              aria-label={listening ? "End voice" : "Talk to Orin"}
              className={`grid size-10 shrink-0 place-items-center rounded-full ${listening ? "animate-pulse bg-primary text-primary-foreground" : "bg-white/70 text-foreground"}`}
            >
              {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </button>
          ) : null}
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-semibold text-background"
              aria-label="Cancel"
            >
              <Square className="size-3.5 fill-current" /> Cancel
            </button>
          ) : (
            <button
              type="submit"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-[var(--shadow-soft)]"
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );

  if (active) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden">
        {voicePanel}
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background/70 px-3 py-2.5 backdrop-blur-xl sm:px-5">
          <button
            onClick={() => {
              if (busy) abortRef.current?.abort();
              setTurns([]);
              setSessionId(null);
            }}
            className="rounded-full p-2 hover:bg-secondary"
            aria-label="Back to home"
          >
            <ArrowLeft className="size-4" />
          </button>
          <span className="font-semibold tracking-tight">Orin</span>
          <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
            {mode}
          </span>
          {privateMode ? (
            <span className="hidden rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 sm:inline">
              Private — not saved
            </span>
          ) : null}
          <button
            onClick={() => {
              if (busy) abortRef.current?.abort();
              setTurns([]);
              setSessionId(null);
            }}
            className="ml-auto flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium"
          >
            <Plus className="size-3.5" /> New
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-5 px-3 py-5 sm:px-6">
            {turns.map((turn, i) =>
              turn.role === "user" ? (
                <div key={i} className="ml-auto max-w-[85%] rounded-2xl bg-foreground px-4 py-3 text-sm text-background">
                  {turn.content}
                </div>
              ) : (
                <article key={i} className="min-w-0">
                  <OrinMarkdown text={turn.content} />
                  {turn.sources?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {turn.sources.map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="max-w-[240px] truncate rounded-full bg-white/70 px-3 py-1 text-[11px] text-primary hover:underline"
                        >
                          {source.title}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </article>
              ),
            )}

                  {viewerUrl ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
                      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
                        <span>{busy ? "Live browser" : "Browser (stays open a few minutes)"}</span>
                        <a href={viewerUrl} target="_blank" rel="noreferrer" className="underline">Open</a>
                      </div>
                      <iframe src={viewerUrl} title="Live browser" className="aspect-video w-full" sandbox="allow-scripts allow-same-origin" />
                    </div>
                  ) : null}
            {busy ? (
              <div className="space-y-3">
                <div className="glass-soft rounded-2xl p-4">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold">{phase || "Orin is working"}</p>
                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
                      {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
                    </span>
                  </div>
                  {liveSteps.length ? (
                    <ol className="mt-4 flex items-start overflow-x-auto pb-1">
                      {liveSteps.map((step, i) => (
                        <li key={`${step.tool}-${i}`} className="flex min-w-[84px] flex-1 flex-col items-center text-center">
                          <div className="flex w-full items-center">
                            <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : "bg-primary/30"}`} />
                            <span
                              className={`grid size-3.5 shrink-0 place-items-center rounded-full ring-4 ${
                                step.status === "error"
                                  ? "bg-destructive ring-destructive/20"
                                  : step.status === "done"
                                    ? "bg-primary ring-primary/15"
                                    : "animate-pulse bg-primary-glow ring-primary/30"
                              }`}
                            />
                            <span className={`h-0.5 flex-1 ${i === liveSteps.length - 1 ? "opacity-0" : "bg-primary/30"}`} />
                          </div>
                          <span className="mt-1.5 text-[11px] font-semibold">{step.tool}</span>
                          <span className="line-clamp-2 max-w-[110px] px-1 text-[10px] text-muted-foreground">{step.detail}</span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {liveSources.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {liveSources.slice(-10).map((source) => (
                        <span key={source.url} className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                          {(() => {
                            try {
                              return new URL(source.url).hostname.replace("www.", "");
                            } catch {
                              return source.title;
                            }
                          })()}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {handoff ? (
                    <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Mail className="size-3.5" /> Safe to leave — Orin emails {handoff} when done.
                    </p>
                  ) : null}
                </div>
                {liveText ? <OrinMarkdown text={liveText} /> : null}
              </div>
            ) : null}
            <div ref={chatEndRef} />
          </div>
        </div>
        {composer}
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden p-0 sm:p-6">
      {voicePanel}
      <div className="glass mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col overflow-hidden sm:rounded-3xl">
        <header className="flex items-center gap-2 px-3 py-3 sm:gap-4 sm:px-5">
          <div className="hidden items-center gap-2 sm:flex">
            <span className="size-3 rounded-full bg-primary" />
            <span className="size-3 rounded-full bg-amber-400" />
            <span className="size-3 rounded-full bg-amber-300" />
          </div>
          <span className="font-semibold tracking-tight sm:hidden">Orin</span>
          <div className="mx-auto hidden w-full max-w-2xl items-center gap-3 rounded-full px-4 py-2.5 md:flex glass-soft">
            <Search className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Orin AI Browser</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-muted-foreground sm:gap-2">
            <Link
              to="/search"
              className="flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-xs font-medium"
              title="Private web search"
            >
              <Search className="size-4" /> <span className="hidden sm:inline">Search</span>
            </Link>
            <button
              onClick={async () => {
                const { enablePush } = await import("@/lib/push-client");
                const r = await enablePush();
                const msg: Record<string, string> = {
                  registered: "Notifications are on.",
                  "granted-local": "Notifications allowed on this device.",
                  "open-in-new-tab": "Open Orin in its own tab or the installed app to turn on notifications.",
                  denied: "Notifications are blocked — allow them in your browser's site settings.",
                  unsupported: "This browser doesn't support notifications.",
                  "not-configured": "Notifications aren't set up yet.",
                };
                setError(msg[r.status] ?? null);
              }}
              className="flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-xs font-medium"
              title="Turn on notifications"
            >
              <Bell className="size-4" /> <span className="hidden sm:inline">Alerts</span>
            </button>
            <button
              onClick={() => void install()}
              className="flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-xs font-medium"
              title="Install Orin as an app"
            >
              <Download className="size-4" /> <span className="hidden sm:inline">Install</span>
            </button>
            <button
              onClick={() => void togglePrivate()}
              disabled={!user}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                privateMode ? "bg-emerald-400/25 text-emerald-700" : "bg-white/60"
              } disabled:opacity-50`}
            >
              {privateMode ? <ShieldCheck className="size-4" /> : <Shield className="size-4" />}
              <span className="hidden sm:inline">{privateMode ? "Private On" : "Private Off"}</span>
            </button>
            {user ? (
              <button onClick={() => void signOut()} className="rounded-full p-2 hover:bg-secondary" aria-label="Sign out">
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
          </div>
        </header>

        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden px-2 pb-0 sm:p-4">
          <nav className="glass-soft hidden w-16 shrink-0 flex-col items-center gap-2 rounded-3xl py-4 md:flex">
            <span className="mb-2 text-sm font-semibold tracking-tight">Orin</span>
            {sideIcons.map((Icon, i) => (
              <span
                key={i}
                className={`grid size-10 place-items-center rounded-2xl ${
                  i === 0 ? "bg-white/80 text-primary shadow-[var(--shadow-soft)]" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-4" />
              </span>
            ))}
            <span className="mt-auto grid size-10 place-items-center rounded-2xl text-muted-foreground">
              <Settings className="size-4" />
            </span>
          </nav>

          <aside className="glass-soft hidden min-h-0 w-[300px] shrink-0 flex-col gap-4 overflow-y-auto rounded-3xl p-5 lg:flex">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
                <Compass className="size-5" />
              </span>
              <div>
                <h2 className="text-xl font-bold tracking-tight">ORIN</h2>
                <p className="text-[10px] tracking-[0.2em] text-muted-foreground">AI BROWSER</p>
              </div>
            </div>
            <div>
              <h1 className="text-lg font-semibold">Hello{user?.email ? `, ${user.email.split("@")[0]}` : ""} 👋</h1>
              <p className="text-sm text-muted-foreground">
                {authLoading ? "Waking up…" : user ? "How can I help you today?" : "Sign in to start working."}
              </p>
            </div>
            <div className="divide-y divide-border overflow-hidden rounded-2xl bg-white/60">
              {actions.map(({ title, sub, icon: Icon, tint, mode: m }) => (
                <button
                  key={title}
                  onClick={() => setMode(m)}
                  className={`flex w-full items-center gap-3 p-3.5 text-left hover:bg-white/70 ${mode === m ? "bg-white/80" : ""}`}
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
          </aside>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto pb-4">
              <section className="glass-soft relative overflow-hidden rounded-3xl p-6 sm:p-10">
                <img
                  src={heroRibbon}
                  alt=""
                  width={1200}
                  height={640}
                  className="pointer-events-none absolute -right-10 -top-16 w-[70%] opacity-90 mix-blend-multiply sm:w-[55%]"
                />
                <div className="relative max-w-2xl">
                  <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
                    You have the ideas.
                    <br />
                    <span className="text-gradient">Orin</span> finds the way.
                  </h2>
                  <div className="mt-6 flex flex-wrap gap-2 sm:mt-8 sm:gap-3">
                    {chips.map(({ label, icon: Icon, prompt, mode: m }) => (
                      <button
                        key={label}
                        onClick={() => void run(prompt, m)}
                        className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-soft)] sm:px-4 sm:py-2 sm:text-sm"
                      >
                        <Icon className="size-4 text-foreground/70" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-3">
                <article className="glass-soft rounded-3xl p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">Recent Sessions</h3>
                    {sessions.length ? (
                      <button
                        onClick={() => void wipeHistory()}
                        className="flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-destructive"
                      >
                        <Trash2 className="size-3.5" /> Clear all
                      </button>
                    ) : null}
                  </div>
                  <ul className="mt-3 divide-y divide-border">
                    {sessions.length ? (
                      sessions.map((session) => (
                        <li key={session.id} className="flex items-center gap-3 py-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/80 text-foreground/70">
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
                    ) : (
                      <li className="py-3 text-sm text-muted-foreground">
                        {user ? "No sessions yet — ask Orin anything below." : "Sign in to keep your sessions."}
                      </li>
                    )}
                  </ul>
                </article>

                <article className="glass-soft rounded-3xl p-5 sm:p-6">
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

                <article className="relative hidden overflow-hidden rounded-3xl sm:block">
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
                      <p className="text-5xl font-semibold leading-none">
                        24<span className="align-top text-2xl">°C</span>
                      </p>
                      <Cloud className="size-12 opacity-90" />
                    </div>
                  </div>
                </article>
              </section>
            </div>
            {composer}
          </main>
        </div>
      </div>
    </div>
  );
}
