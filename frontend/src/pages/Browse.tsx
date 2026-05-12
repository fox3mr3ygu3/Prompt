import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarDays, MapPin, SlidersHorizontal, Sparkles, Ticket } from "lucide-react";
import { api, CategoryTreeNode, EventListItem } from "@/lib/api";
import { useDocumentTitle } from "@/lib/use-document-title";
import { fmtMoney } from "@/lib/format";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PageShell,
  Panel,
  SearchInput,
  TextInput,
} from "@/components/ui";
import { cn } from "@/lib/cn";

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

  const cityCount = useMemo(() => {
    if (!data) return 0;
    return new Set(data.map((ev) => ev.venue_city).filter(Boolean)).size;
  }, [data]);

  const minPrice = useMemo(() => {
    if (!data || data.length === 0) return null;
    const cheapest = data.reduce((min, ev) => Math.min(min, ev.min_price_cents), Infinity);
    return Number.isFinite(cheapest) ? cheapest : null;
  }, [data]);

  const featured = data?.[0] ?? null;

  return (
    <PageShell>
      <header className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] lg:items-end">
        <div className="animate-fade-up">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-aqua/20 bg-aqua/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-aqua">
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
            Ticketing that stays live
          </p>
          <h1 className="max-w-4xl font-display text-5xl font-bold leading-[0.95] tracking-normal text-ivory sm:text-6xl lg:text-7xl">
            Find the room, pick the seat, walk in with a clean scan.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-ivory-muted sm:text-lg">
            Discover conferences and live programs across the city with seat maps, named tickets,
            real-time holds, and gate-ready QR workflows.
          </p>
        </div>

        <Panel className="animate-fade-up overflow-hidden p-5 [animation-delay:90ms]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-ivory-muted">
                Live board
              </div>
              <div className="mt-2 font-display text-3xl font-bold text-ivory">
                {data?.length ?? 0} events
              </div>
            </div>
            <span className="rounded-full border border-fern/25 bg-fern/10 px-3 py-1 text-xs font-bold text-fern">
              realtime seat holds
            </span>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <MiniStat label="Cities" value={cityCount.toLocaleString()} />
            <MiniStat
              label="From"
              value={minPrice === null ? "—" : fmtMoney(minPrice, "USD", { compact: true })}
            />
            <MiniStat label="Mode" value="Seat / GA" />
          </div>
          {featured && (
            <Link
              to={`/events/${featured.slug}`}
              className="mt-5 block rounded-2xl border border-ivory/10 bg-ink-2/75 p-4 transition hover:border-aqua/35 hover:bg-ink-2"
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-aqua">
                Next highlight
              </div>
              <div className="mt-1 line-clamp-1 font-display text-xl font-bold text-ivory">
                {featured.title}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ivory-muted">
                <span>{fmtDate(featured.starts_at)}</span>
                <span>{featured.venue_city ?? "City TBA"}</span>
                <span>{fmtMoney(featured.min_price_cents, "USD", { compact: true })}</span>
              </div>
            </Link>
          )}
        </Panel>
      </header>

      <Panel className="p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
          <SearchInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search events, venues, tags"
            aria-label="Search events"
          />
          <TextInput
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            aria-label="City"
            icon={MapPin}
          />
          <div className="flex items-center gap-2 rounded-xl border border-ivory/12 bg-ink-2/65 px-3 text-sm font-semibold text-ivory-muted">
            <SlidersHorizontal aria-hidden className="h-4 w-4 text-aqua" />
            smart filters
          </div>
        </div>

        {tree && tree.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip
              active={topCat === null}
              onClick={() => {
                setTopCat(null);
                setSubCat(null);
              }}
              label="All"
              icon="All"
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

        {subCatsForTop.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-ivory/10 pt-3">
            <Chip
              small
              active={subCat === null}
              onClick={() => setSubCat(null)}
              label={`All ${topCat}`}
              icon="All"
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
      </Panel>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Seat confidence"
          value="5 min"
          detail="Redis-backed hold window"
          icon={Ticket}
          tone="aqua"
        />
        <MetricCard
          label="Gate flow"
          value="1 scan"
          detail="Signed single-use ticket"
          icon={CalendarDays}
          tone="brass"
        />
        <MetricCard
          label="Venue scope"
          value={cityCount > 0 ? `${cityCount} city${cityCount === 1 ? "" : "ies"}` : "Live"}
          detail="Search by city, tag, category"
          icon={MapPin}
          tone="ember"
        />
      </div>

      {isLoading && <LoadingState label="Loading events" />}
      {error && <ErrorState label="Failed to load events." />}
      {data && data.length === 0 && (
        <EmptyState
          title="No matching events"
          description="Try clearing the city or category filter; the catalog updates as soon as organizers publish new events."
        />
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {data?.map((ev, idx) => (
          <EventCard key={ev.id} event={ev} index={idx} />
        ))}
      </div>
    </PageShell>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ivory/10 bg-ivory/[0.045] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ivory-muted">
        {label}
      </div>
      <div className="mt-1 truncate font-display text-lg font-bold text-ivory">{value}</div>
    </div>
  );
}

function EventCard({ event, index }: { event: EventListItem; index: number }) {
  return (
    <Link
      to={`/events/${event.slug}`}
      className="group glass-panel animate-fade-up overflow-hidden rounded-2xl transition duration-300 hover:-translate-y-1 hover:border-aqua/35 hover:shadow-glow"
      style={{ animationDelay: `${Math.min(index * 45, 240)}ms` }}
    >
      <div className="relative h-56 overflow-hidden bg-ink-3">
        {event.cover_image_url ? (
          <img
            src={event.cover_image_url}
            alt=""
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-ticket-grid bg-[length:34px_34px]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
        <div className="absolute left-4 top-4 rounded-full border border-ivory/12 bg-ink/70 px-3 py-1 text-xs font-bold text-ivory backdrop-blur">
          {event.category_icon ?? "•"} {event.category_name ?? "Event"}
        </div>
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-ivory-muted">
              <CalendarDays aria-hidden className="h-3.5 w-3.5 text-aqua" />
              {fmtDate(event.starts_at)}
            </div>
            <h3 className="mt-1 line-clamp-2 font-display text-2xl font-bold leading-tight text-ivory">
              {event.title}
            </h3>
          </div>
          <span className="shrink-0 rounded-xl bg-aqua px-3 py-2 text-sm font-black text-ink shadow-glow">
            {fmtMoney(event.min_price_cents, "USD", { compact: true })}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-4 text-sm">
          <div className="min-w-0 text-ivory-muted">
            <div className="truncate font-semibold text-ivory">
              {event.venue_name ?? "Venue TBA"}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <MapPin aria-hidden className="h-3.5 w-3.5 text-brass" />
              {event.venue_city ?? "City TBA"}
            </div>
          </div>
          <span className="rounded-full border border-ivory/10 bg-ivory/7 px-2.5 py-1 text-xs font-bold text-ivory-muted">
            live
          </span>
        </div>

        {event.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {event.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded-full border border-ivory/10 bg-ink-2 px-2 py-1 text-[11px] font-semibold text-ivory-muted"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-full border font-bold transition",
        small ? "px-3 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
        active
          ? "border-aqua/55 bg-aqua/14 text-aqua"
          : "border-ivory/12 bg-ivory/6 text-ivory-muted hover:border-ivory/24 hover:text-ivory",
      )}
    >
      <span className="max-w-[8rem] truncate">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
