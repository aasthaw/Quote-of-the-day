import { useEffect, useMemo, useState } from "react";

/** --------- Types & constants --------- */
type Quote = { q: string; a: string };

const LS = {
  THEME: "qotd-theme",
  FAVS: "qotd-favorites",
  DAYS: "qotd-visited-days",                 // array of YYYY-MM-DD strings
  TODAY_CACHE: (key: string) => `qotd-today-${key}`,
};

const THROTTLE_MS = 3500;
const BACKOFF_429_MS = 12_000;

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getVisitedDays(): string[] {
  try {
    const raw = localStorage.getItem(LS.DAYS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function addVisitedDay(key: string): number {
  const days = getVisitedDays();
  if (!days.includes(key)) {
    days.push(key);
    localStorage.setItem(LS.DAYS, JSON.stringify(days));
  }
  return days.length;
}

/** --------- App --------- */
export default function App() {
  /** Menu state */
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
  const [daysVisited, setDaysVisited] = useState<number>(() => getVisitedDays().length);

  // Mark today as visited once when the app opens
  useEffect(() => {
    const count = addVisitedDay(todayKey());
    setDaysVisited(count);
  }, []);

  /** Lock scroll when menu open */
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  /** Fetch on first load */
  useEffect(() => { load("today"); }, []);

  /** Fetch helper with throttle & caching */
  let lastCall = 0;
  async function load(which: "today" | "random") {
    const now = Date.now();
    if (now - lastCall < THROTTLE_MS) return;
    lastCall = now;

    setLoading(true);
    setError(null);

    const tKey = todayKey();

    try {
      // show cache fast for today's quote (doesn't affect day streak)
      if (which === "today") {
        const cached = localStorage.getItem(LS.TODAY_CACHE(tKey));
        if (cached) {
          try { setQuote(JSON.parse(cached)); } catch {}
        }
      }

      const res = await fetch(`/zen/api/${which}`);
      if (res.status === 429) {
        setError("Rate limited by ZenQuotes. Please wait a few seconds and try again.");
        lastCall = Date.now() + BACKOFF_429_MS;
        return;
      }
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);

      const data = await res.json();
      if (!Array.isArray(data) || !data[0]?.q || !data[0]?.a) throw new Error("Unexpected API response");

      const q = { q: data[0].q, a: data[0].a };
      setQuote(q);

      if (which === "today") localStorage.setItem(LS.TODAY_CACHE(tKey), JSON.stringify(q));
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch quote");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen">
      {/* Top bar */}
      <header className="topbar">
        <button
          className="iconbtn"
          onClick={() => { setMenuOpen(true); }}
          aria-label="Open menu"
        >
          ☰
        </button>
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

          {/* Root menu */}
          <div className="menu-grid">
            <button className="menubtn" onClick={() => { setMenuOpen(false); load("today"); }}>
              Today’s Quote
            </button>
            <button className="menubtn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              Switch mode ({theme === "dark" ? "Dark → Light" : "Light → Dark"})
            </button>
            <button className="menubtn" onClick={() => {/* favorites list is below */}}>
              Favorites ({favorites.length})
            </button>
          </div>

          {/* Favorites list */}
          <div className="panel-scroll">
            <h3>Favorites ({favorites.length})</h3>
            {favorites.length === 0 && <p className="muted">No favorites yet.</p>}
            <ul className="list">
              {favorites.map((f, i) => (
                <li key={i} className="list-item">
                  <button
                    className="link"
                    onClick={() => { setQuote(f); setMenuOpen(false); }}
                    title="Show this favorite"
                  >
                    “{f.q}” — {f.a}
                  </button>
                  <button
                    className="smallbtn"
                    onClick={() => saveFavorites(favorites.filter(x => !(x.q === f.q && x.a === f.a)))}
                    title="Remove"
                  >
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
  );
}
