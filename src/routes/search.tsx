import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Search as SearchIcon, ArrowLeft } from "lucide-react";
import { searchWeb, type SearchResult } from "@/lib/search.functions";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Orin Search — Private web search" },
      { name: "description", content: "Fast private web search from Orin, with direct source links and snippets." },
      { property: "og:title", content: "Orin Search — Private web search" },
      { property: "og:description", content: "Fast private web search with direct source links and snippets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const search = useServerFn(searchWeb);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await search({ data: { query: q } });
      setResults(res?.results ?? []);
      if (res?.error && !res.results?.length) setError("Search sources are busy right now. Try again shortly.");
    } catch {
      setResults([]);
      setError("Search failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Orin
        </Link>
        <h1 className="mb-4 text-2xl font-semibold sm:text-3xl">Orin Search</h1>
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the web privately…"
            className="min-w-0 flex-1 rounded-xl border border-border bg-card px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-3 text-primary-foreground disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
            <span className="hidden sm:inline">Search</span>
          </button>
        </form>

        <div className="mt-6 space-y-5">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}
          {!loading && error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && results && results.length === 0 && !error && (
            <p className="text-muted-foreground">No results found. Try different words.</p>
          )}
          {!loading &&
            results?.map((r, i) => (
              <article key={r.url + i} className="min-w-0 rounded-xl border border-border bg-card p-4">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="block break-words text-lg font-medium text-primary hover:underline">
                  {r.title || r.url}
                </a>
                <p className="truncate text-xs text-muted-foreground">{r.url}</p>
                {r.content && <p className="mt-2 text-sm text-foreground/80">{r.content}</p>}
              </article>
            ))}
        </div>
      </div>
    </div>
  );
}
