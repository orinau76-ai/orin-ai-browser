import { createFileRoute } from "@tanstack/react-router";
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
  Mic,
  Plus,
  RotateCw,
  Scale,
  Search,
  Settings,
  Sparkles,
  Square,
  Star,
  Newspaper,
  Youtube,
  MessageCircle,
  BookOpen,
  ChevronRight,
  ChevronDown,
  X,
  Cloud,
  Apple,
} from "lucide-react";
import heroRibbon from "@/assets/hero-ribbon.jpg";
import weatherBg from "@/assets/weather-bg.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Orin — AI Browser Home" },
      {
        name: "description",
        content:
          "Orin is an AI-powered browser that researches, summarizes, compares and extracts across the web from one calm workspace.",
      },
      { property: "og:title", content: "Orin — AI Browser Home" },
      {
        property: "og:description",
        content:
          "Research, summarize, compare and extract anything on the web with Orin's agent mode.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const sideIcons = [Home, Star, Layers, Clock, History, FileText];

const actions = [
  { title: "Research", sub: "Deep research on any topic", icon: Search, tint: "from-primary to-primary-glow" },
  { title: "Summarize", sub: "Summarize any webpage", icon: FileText, tint: "from-sky-400 to-sky-300" },
  { title: "Compare", sub: "Compare products, prices, etc.", icon: Scale, tint: "from-amber-400 to-amber-300" },
  { title: "Extract", sub: "Extract data from pages", icon: Database, tint: "from-violet-400 to-violet-300" },
  { title: "Explain", sub: "Explain any content", icon: Sparkles, tint: "from-fuchsia-400 to-fuchsia-300" },
];

const chips = [
  { label: "AI Research", icon: Compass },
  { label: "Top Stories", icon: Newspaper },
  { label: "YouTube", icon: Youtube },
  { label: "Reddit", icon: MessageCircle },
  { label: "X (Twitter)", icon: X },
  { label: "Academics", icon: BookOpen },
];

const features = [
  {
    title: "AI Research Assistant",
    sub: "Deep research with real-time results",
    tint: "from-primary/70 to-primary-glow/40",
    icon: Square,
  },
  {
    title: "Smart Summarizer",
    sub: "Summarize long articles instantly",
    tint: "from-sky-400/70 to-sky-200/40",
    icon: FileText,
  },
  {
    title: "Compare Anything",
    sub: "Compare products, prices, and more",
    tint: "from-violet-400/70 to-violet-200/40",
    icon: Scale,
  },
];

const sessions = [
  { title: "Best Pharm.D Universities in India", meta: "Research • 2 minutes ago", icon: GraduationCap },
  { title: "RTX 5070 Laptops Under ₹1 Lakh", meta: "Comparison • 1 hour ago", icon: Laptop },
  { title: "Apple Event 2025 Summary", meta: "Summary • 3 hours ago", icon: Apple },
];

const suggestions = [
  { title: "Latest AI Tools in 2025", meta: "Trending now", icon: Sparkles },
  { title: "Top Colleges Accepting Pharmacy Graduates", meta: "Recommended", icon: GraduationCap },
  { title: "Car Photography Tips", meta: "For you", icon: Camera },
];

const tabs = [
  { label: "Orin Research", active: false },
  { label: "AI News", active: false },
  { label: "Product Hunt", active: false },
];

function Index() {
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
            <button className="rounded-full p-1.5 hover:bg-secondary" aria-label="Reload">
              <RotateCw className="size-4" />
            </button>
          </div>
          <div className="glass-soft mx-auto flex w-full max-w-2xl items-center gap-3 rounded-full px-4 py-2.5">
            <Search className="size-4 text-muted-foreground" />
            <input
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search or enter a URL"
            />
            <Sparkles className="size-4 text-primary" />
          </div>
          <div className="ml-auto flex items-center gap-2 text-muted-foreground">
            <button className="rounded-full p-2 hover:bg-secondary" aria-label="Bookmarks">
              <Star className="size-4" />
            </button>
            <button className="rounded-full p-2 hover:bg-secondary" aria-label="Split view">
              <Layers className="size-4" />
            </button>
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
            <button className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-primary-glow/30 text-primary" aria-label="Add">
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
              <button className="ml-auto grid size-8 place-items-center rounded-full bg-white/70 text-muted-foreground" aria-label="Info">
                <Clock className="size-4" />
              </button>
            </div>

            <div>
              <h1 className="text-lg font-semibold">Good Morning, Tawseef 👋</h1>
              <p className="text-sm text-muted-foreground">How can I help you today?</p>
            </div>

            <button className="flex items-start gap-3 rounded-2xl bg-gradient-to-br from-primary/12 to-primary-glow/10 p-4 text-left">
              <div>
                <p className="text-sm font-semibold">🧠 Orin is in Agent Mode</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  I can browse, research, compare and complete tasks for you.
                </p>
              </div>
              <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </button>

            <div className="divide-y divide-border overflow-hidden rounded-2xl bg-white/60">
              {actions.map(({ title, sub, icon: Icon, tint }) => (
                <button key={title} className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-white/70">
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

            <div className="mt-auto rounded-2xl bg-white/60 p-4">
              <input
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Ask Orin anything..."
              />
              <div className="mt-6 flex items-center justify-end gap-3">
                <button className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-[var(--shadow-soft)]" aria-label="Voice input">
                  <Mic className="size-4" />
                </button>
                <button className="grid size-10 place-items-center rounded-full bg-white/80 text-foreground" aria-label="Send">
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </div>
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
                <div className="glass mt-8 flex items-center gap-3 rounded-full py-2.5 pl-5 pr-2.5">
                  <Search className="size-4 text-muted-foreground" />
                  <input
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    placeholder="Ask Orin to search, research or do anything..."
                  />
                  <button className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-[var(--shadow-soft)]" aria-label="Ask Orin">
                    <ArrowUp className="size-5" />
                  </button>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  {chips.map(({ label, icon: Icon }) => (
                    <button
                      key={label}
                      className="flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm font-medium shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5"
                    >
                      <Icon className="size-4 text-foreground/70" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

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

            <section className="grid gap-4 lg:grid-cols-3">
              <article className="glass-soft rounded-3xl p-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Recent Sessions</h3>
                  <button className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium">View All</button>
                </div>
                <ul className="mt-4 divide-y divide-border">
                  {sessions.map(({ title, meta, icon: Icon }) => (
                    <li key={title} className="flex items-center gap-3 py-3">
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
                  {suggestions.map(({ title, meta, icon: Icon }) => (
                    <li key={title} className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/25 to-primary-glow/20 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{title}</p>
                        <p className="text-xs text-muted-foreground">{meta}</p>
                      </div>
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
