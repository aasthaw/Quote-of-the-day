import { useEffect, useMemo, useRef, useState } from "react";

/** --------- Types & constants --------- */
type Quote = { q: string; a: string };

const LS = {
  THEME: "qotd-theme",
  FAVS: "qotd-favorites",
  DAYS: "qotd-visited-days", // array of YYYY-MM-DD strings
  TODAY_CACHE: (key: string) => `qotd-today-${key}`,
  ALL_QUOTES: (key: string) => `qotd-allquotes-${key}`,
};

const THROTTLE_MS = 3500;
const BACKOFF_429_MS = 12_000;
const RECENT_MAX = 10;

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** ------- Fetch helpers (dev + prod fallbacks) ------- **/
const isLocal =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.hostname.startsWith("192.168.");

const API_BASE = (import.meta as any).env?.VITE_API_BASE?.trim?.() || "";

/** timeout wrapper so we never hang forever */
async function fetchWithTimeout(url: string, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

/** small helper for trying a url with different parse modes */
async function tryUrl(url: string, mode: "json" | "allorigins-get") {
  const r = await fetchWithTimeout(url, 10000);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (mode === "json") return r.json();
  // allorigins/get returns { contents: "<raw text>" }
  const wrapper = await r.json();
  return JSON.parse(wrapper.contents);
}

/** build the list of candidate URLs (with cache-busting support) */
function buildCandidates(path: string, bustQuery = ""): Array<{ url: string; mode: "json" | "allorigins-get" }> {
  const upstream = `https://zenquotes.io/${path}${bustQuery}`;
  const candidates: Array<{ url: string; mode: "json" | "allorigins-get" }> = [];

  if (isLocal) {
    // Vite dev proxy
    candidates.push({ url: `/zen/${path}${bustQuery}`, mode: "json" });
  } else {
    // your own proxy (Vercel/Netlify) if provided
    if (API_BASE) {
      const proxied = `/api/zenquotes?path=${encodeURIComponent(path)}${bustQuery ? `&b=${encodeURIComponent(bustQuery)}` : ""}`;
      candidates.push({ url: `${API_BASE}${proxied}`, mode: "json" });
    }
    // public fallbacks for GitHub Pages demos
    candidates.push({ url: `https://api.allorigins.win/raw?url=${encodeURIComponent(upstream)}`, mode: "json" });
    candidates.push({ url: `https://api.allorigins.win/get?url=${encodeURIComponent(upstream)}`, mode: "allorigins-get" });
    // Jina read-only fetch (very permissive CORS). Use http target per their spec.
    candidates.push({ url: `https://r.jina.ai/http://zenquotes.io/${path}${bustQuery}`, mode: "json" });
  }
  return candidates;
}

/** fetches zenquotes for /api/today or /api/random */
async function fetchZen(which: "today" | "random", attempt = 0) {
  const bust =
    which === "random"
      ? `?t=${Date.now()}-${attempt}-${Math.random().toString(36).slice(2)}`
      : "";
  const candidates = buildCandidates(`api/${which}`, bust);

  let lastErr: any = null;
  for (const c of candidates) {
    try {
      const data = await tryUrl(c.url, c.mode);
      return data; // array with one item
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("All fetch attempts failed");
}

/** fetch the full quotes list (cached for the day) */
async function fetchAllQuotesForDay(dayKey: string): Promise<Quote[]> {
  // 1) try local cache first
  try {
    const raw = localStorage.getItem(LS.ALL_QUOTES(dayKey));
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch {}

  // 2) else fetch fresh (with a small cache-buster to avoid proxy caches)
  const bust = `?t=${Date.now()}`;
  const candidates = buildCandidates("api/quotes", bust);

  let lastErr: any = null;
  for (const c of candidates) {
    try {
      const data = await tryUrl(c.url, c.mode);
      // ZenQuotes returns an array of { q, a, ... }
      if (Array.isArray(data) && data.length) {
        const cleaned = data.map((x: any) => ({ q: x.q, a: x.a })).filter((x: any) => x?.q && x?.a);
        localStorage.setItem(LS.ALL_QUOTES(dayKey), JSON.stringify(cleaned));
        return cleaned;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Failed to fetch quotes list");
}

/** pick a random quote from a list, avoiding any in the recent set */
function pickDistinctRandom(list: Quote[], recent: Set<string>, maxTries = 30): Quote | null {
  if (!list.length) return null;
  for (let i = 0; i < maxTries; i++) {
    const q = list[Math.floor(Math.random() * list.length)];
    if (!recent.has(q.q)) return q;
  }
  // as a last resort, just return any
  return list[Math.floor(Math.random() * list.length)];
}

/** --------- App --------- */
export default function App() {
  /** Menu open/close */
  const [menuOpen, setMenuOpen] = useState(false);

  /** Theme */
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem(LS.THEME);
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    localStorage.setItem(LS.THEME, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  /** Quote data */
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Favorites */
  const [favorites, setFavorites] = useState<Quote[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS.FAVS) || "[]"); } catch { return []; }
  });
  function saveFavorites(next: Quote[]) {
    setFavorites(next);
    localStorage.setItem(LS.FAVS, JSON.stringify(next));
  }
  const isFavorite = useMemo(() => {
    if (!quote) return false;
    return favorites.some(f => f.q === quote.q && f.a === quote.a);
  }, [quote, favorites]);
  function toggleFavorite() {
    if (!quote) return;
    if (isFavorite) {
      saveFavorites(favorites.filter(f => !(f.q === quote.q && f.a === quote.a)));
    } else {
      saveFavorites([{ q: quote.q, a: quote.a }, ...favorites].slice(0, 200));
    }
  }

  /** Day-based streak (unique days visited) */
  const [daysVisited, setDaysVisited] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(LS.DAYS);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.length : 0;
    } catch { return 0; }
  });
  useEffect(() => {
    const key = todayKey();
    try {
      const raw = localStorage.getItem(LS.DAYS);
      const arr: string[] = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) {
        localStorage.setItem(LS.DAYS, JSON.stringify([key]));
        setDaysVisited(1);
      } else if (!arr.includes(key)) {
        const next = [...arr, key];
        localStorage.setItem(LS.DAYS, JSON.stringify(next));
        setDaysVisited(next.length);
      } else if (!raw) {
        localStorage.setItem(LS.DAYS, JSON.stringify([key]));
        setDaysVisited(1);
      }
    } catch {
      localStorage.setItem(LS.DAYS, JSON.stringify([key]));
      setDaysVisited(1);
    }
  }, []);

  /** Lock scroll when menu open */
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  /** Throttle & recent quote memory */
  const lastCallRef = useRef(0);
  const recentRef = useRef<string[]>([]); // store recent quote texts to avoid repeats

  /** Fetch on first load */
  useEffect(() => { load("today"); }, []);

  /** Fetch helper with throttle & caching + smart random */
  async function load(which: "today" | "random") {
    const now = Date.now();
    const minGap = which === "random" ? 450 : THROTTLE_MS; // quicker for random
    if (now - lastCallRef.current < minGap) return;
    lastCallRef.current = now;

    setLoading(true);
    setError(null);

    const tKey = todayKey();

    try {
      // Show cached "today" fast
      if (which === "today") {
        const cached = localStorage.getItem(LS.TODAY_CACHE(tKey));
        if (cached) {
          try { setQuote(JSON.parse(cached)); } catch {}
        }
      }

      let next: Quote | null = null;

      if (which === "today") {
        const data = await fetchZen("today", 0);
        if (!Array.isArray(data) || !data[0]?.q || !data[0]?.a) throw new Error("Unexpected API response");
        next = { q: data[0].q, a: data[0].a };
        localStorage.setItem(LS.TODAY_CACHE(tKey), JSON.stringify(next));
      } else {
        // RANDOM: first try API with bust; retry once if same/recent
        let data = await fetchZen("random", 0);
        if (!Array.isArray(data) || !data[0]?.q || !data[0]?.a) throw new Error("Unexpected API response");
        next = { q: data[0].q, a: data[0].a };

        const recentSet = new Set<string>([...(quote ? [quote.q] : []), ...recentRef.current]);

        if (recentSet.has(next.q)) {
          // try once more via API (different bust)
          data = await fetchZen("random", 1);
          if (Array.isArray(data) && data[0]?.q && data[0]?.a) {
            const candidate = { q: data[0].q, a: data[0].a };
            if (!recentSet.has(candidate.q)) {
              next = candidate;
            } else {
              next = null; // will fall back to local list
            }
          }
        }

        // Fallback: select a fresh one from the full list (cached daily)
        if (!next || (quote && next.q === quote.q)) {
          const all = await fetchAllQuotesForDay(tKey);
          const pick = pickDistinctRandom(all, new Set<string>(recentSet));
          if (pick) next = pick;
        }
      }

      if (!next) throw new Error("Could not find a new quote. Please try again.");

      // Update UI + recent memory
      setQuote(next);
      if (!recentRef.current.includes(next.q)) {
        recentRef.current = [next.q, ...recentRef.current].slice(0, RECENT_MAX);
      }
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("429")) {
        setError("Rate limited by ZenQuotes. Please wait a few seconds and try again.");
        lastCallRef.current = Date.now() + BACKOFF_429_MS;
      } else if (msg.includes("aborted")) {
        setError("The request timed out. Please try again.");
      } else {
        setError(msg || "Failed to fetch quote");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-bg">
      <div className="screen">
        {/* Top bar */}
        <header className="topbar">
          <button className="iconbtn" onClick={() => setMenuOpen(true)} aria-label="Open menu">☰</button>
          <h1 className="brand">Quote of the Day</h1>
          <button
            className="iconbtn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            title="Toggle dark mode"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </header>

        {/* Drawer */}
        <aside className={`drawer ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <span />
              <button className="closebtn" onClick={() => setMenuOpen(false)}>✕</button>
            </div>

            <div className="menu-grid">
              <button className="menubtn" onClick={() => { setMenuOpen(false); load("today"); }}>
                Today’s Quote
              </button>
              <button className="menubtn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                Switch mode ({theme === "dark" ? "Dark → Light" : "Light → Dark"})
              </button>
              <button className="menubtn" onClick={() => { /* favorites listed below */ }}>
                Favorites ({favorites.length})
              </button>
            </div>

            <div className="panel-scroll">
              <h3>Favorites ({favorites.length})</h3>
              {favorites.length === 0 && <p className="muted">No favorites yet.</p>}
              <ul className="list">
                {favorites.map((f, i) => (
                  <li key={i} className="list-item">
                    <button className="link" onClick={() => { setQuote(f); setMenuOpen(false); }}>
                      “{f.q}” — {f.a}
                    </button>
                    <button className="smallbtn" onClick={() => saveFavorites(favorites.filter(x => !(x.q === f.q && x.a === f.a)))}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main>
          <div className="card">
            <div className="row">
              <div className="pill">🔥 You’ve visited <b>{daysVisited}</b> day{daysVisited === 1 ? "" : "s"}</div>
              <button className={`pill ${isFavorite ? "active" : ""}`} onClick={toggleFavorite}>
                {isFavorite ? "★ Favorited" : "☆ Save to favorites"}
              </button>
            </div>

            {loading && <p className="muted">Loading…</p>}

            {!loading && error && (
              <>
                <p className="error">Error: {error}</p>
                <div className="actions">
                  <button className="btn" onClick={() => load("today")} disabled={loading}>Retry</button>
                </div>
              </>
            )}

            {!loading && !error && quote && (
              <>
                <p className="quote">“{quote.q}”</p>
                <p className="author">— {quote.a}</p>
                <div className="actions">
                  <button className="btn" onClick={() => load("today")} disabled={loading}>Today’s Quote</button>
                  <button className="btn" onClick={() => load("random")} disabled={loading}>New Random Quote</button>
                </div>
              </>
            )}

            <p className="source">
              Quotes by <a href="https://zenquotes.io/" target="_blank" rel="noreferrer">ZenQuotes.io</a>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

