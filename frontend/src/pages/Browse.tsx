import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, CategoryTreeNode, EventListItem } from "@/lib/api";
import { useDocumentTitle } from "@/lib/use-document-title";
import { fmtMoney } from "@/lib/format";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function Browse() {
  useDocumentTitle("Discover events");
  const [topCat, setTopCat] = useState<string | null>(null);
  const [subCat, setSubCat] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [q, setQ] = useState("");

  const { data: tree } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await api.get<CategoryTreeNode[]>("/categories")).data,
    staleTime: 5 * 60_000,
  });

  // Active category slug for the API filter — sub if picked, else top.
  const activeCat = subCat ?? topCat;

  const { data, isLoading, error } = useQuery({
    queryKey: ["events", activeCat, city, q],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (q) params.q = q;
      if (activeCat) params.category = activeCat;
      if (city) params.city = city;
      const r = await api.get<EventListItem[]>("/events", { params });
      return r.data;
    },
  });

  const subCatsForTop = useMemo(() => {
    if (!topCat || !tree) return [];
    const t = tree.find((n) => n.slug === topCat);
    return t?.children ?? [];
  }, [topCat, tree]);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-10">
      {/* Hero */}
      <header className="mb-10">
        <h1 className="bg-gradient-to-br from-sky-300 to-indigo-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
          Find your next event
        </h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Browse conferences, concerts, sports nights and more across Tashkent. Pick
          a seat, scan in at the door — done.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search events…"
            className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none sm:max-w-md"
          />
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City (e.g. Tashkent)"
            className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />
        </div>
      </header>

      {/* Top-level category chips */}
      {tree && tree.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Chip
            active={topCat === null}
            onClick={() => {
              setTopCat(null);
              setSubCat(null);
            }}
            label="All"
            icon="✨"
          />
          {tree.map((c) => (
            <Chip
              key={c.id}
              active={topCat === c.slug}
              onClick={() => {
                setTopCat(c.slug);
                setSubCat(null);
              }}
              label={c.name}
              icon={c.icon}
            />
          ))}
        </div>
      )}

      {/* Sub-category chips */}
      {subCatsForTop.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2 border-t border-slate-800/60 pt-3">
          <Chip
            small
            active={subCat === null}
            onClick={() => setSubCat(null)}
            label={`All ${topCat}`}
            icon="•"
          />
          {subCatsForTop.map((c) => (
            <Chip
              key={c.id}
              small
              active={subCat === c.slug}
              onClick={() => setSubCat(c.slug)}
              label={c.name}
              icon={c.icon}
            />
          ))}
        </div>
      )}

      {/* Event cards */}
      {isLoading && <p className="mt-6 text-slate-400">Loading…</p>}
      {error && <p className="mt-6 text-red-400">Failed to load events.</p>}
      {data && data.length === 0 && (
        <p className="mt-12 text-center text-slate-500">No events match those filters.</p>
      )}
      <div className="mt-2 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((ev) => (
          <Link
            key={ev.id}
            to={`/events/${ev.slug}`}
            className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 transition hover:border-sky-500/60 hover:bg-slate-900/70"
          >
            <div
              className="h-44 w-full bg-slate-800 bg-cover bg-center"
              style={
                ev.cover_image_url
                  ? { backgroundImage: `url(${ev.cover_image_url})` }
                  : undefined
              }
            />
            <div className="p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="inline-flex items-center gap-1">
                  {ev.category_icon ?? "🎫"}{" "}
                  <span className="uppercase tracking-wide">
                    {ev.category_name ?? "Event"}
                  </span>
                </span>
                <span>{fmtDate(ev.starts_at)}</span>
              </div>
              <h3 className="mt-2 line-clamp-2 text-lg font-semibold text-white group-hover:text-sky-300">
                {ev.title}
              </h3>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-slate-400">
                  {ev.venue_name}
                  {ev.venue_city ? ` · ${ev.venue_city}` : ""}
                </span>
                <span className="rounded-md bg-sky-500/15 px-2 py-0.5 font-medium text-sky-300">
                  from {fmtMoney(ev.min_price_cents, "USD", { compact: true })}
                </span>
              </div>
              {ev.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ev.tags.slice(0, 4).map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

function Chip({
  active,
  onClick,
  label,
  icon,
  small = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
  small?: boolean;
}) {
  const base = small ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border transition ${base} ${
        active
          ? "border-sky-500/80 bg-sky-500/15 text-sky-200"
          : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600 hover:text-white"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
