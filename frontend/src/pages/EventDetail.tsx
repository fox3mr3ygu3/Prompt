import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { EventDetail as EventDetailT, api } from "@/lib/api";
import { useDocumentTitle } from "@/lib/use-document-title";
import { fmtMoney } from "@/lib/format";

type PurchaseLocationState = { purchaseSuccess?: boolean; orderId?: string };

export function EventDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const loc = useLocation();
  const purchaseState = (loc.state ?? null) as PurchaseLocationState | null;
  const justBought = Boolean(purchaseState?.purchaseSuccess);

  const { data: detail, isLoading, error } = useQuery({
    queryKey: ["event", slug],
    queryFn: async () => (await api.get<EventDetailT>(`/events/${slug}`)).data,
    enabled: !!slug,
  });

  useDocumentTitle(detail?.title ?? "");

  if (isLoading)
    return <p className="mx-auto max-w-4xl px-4 py-12 text-slate-400">Loading…</p>;
  if (error || !detail)
    return <p className="mx-auto max-w-4xl px-4 py-12 text-red-400">Failed to load event.</p>;

  // Pick the cheapest tier for the "From" headline price; the seat picker
  // shows the per-tier breakdown once the buyer enters the hall.
  const cheapestTier =
    [...detail.price_tiers].sort((a, b) => a.price_cents - b.price_cents)[0] ??
    null;
  const priciestTier =
    [...detail.price_tiers].sort((a, b) => b.price_cents - a.price_cents)[0] ??
    null;
  const startsAt = new Date(detail.starts_at);

  return (
    <main className="text-slate-100">
      <Hero detail={detail} startsAt={startsAt} />

      <div className="mx-auto grid max-w-4xl gap-8 px-4 py-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {justBought && <PurchaseSuccessBanner />}
          <h2 className="text-xl font-semibold">About this event</h2>
          <p className="mt-2 leading-relaxed text-slate-300">{detail.description}</p>

          {detail.speakers.length > 0 && (
            <Section title="Speakers">
              <ul className="mt-3 space-y-2">
                {detail.speakers.map((s) => (
                  <SpeakerRow key={s.id} name={s.name} affiliation={s.affiliation} />
                ))}
              </ul>
            </Section>
          )}
        </div>

        <CtaCard
          cheapestTier={cheapestTier}
          priciestTier={priciestTier}
          roomKind={detail.room.kind}
          roomName={detail.room.name}
          venueName={detail.venue.name}
          onGetTickets={() => nav(`/events/${slug}/seats`)}
        />
      </div>
    </main>
  );
}

function Hero({
  detail,
  startsAt,
}: {
  detail: EventDetailT;
  startsAt: Date;
}) {
  return (
    <div
      className="relative h-72 w-full bg-slate-800 bg-cover bg-center sm:h-96"
      style={
        detail.cover_image_url
          ? { backgroundImage: `url(${detail.cover_image_url})` }
          : undefined
      }
    >
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-4xl px-4 pb-6">
        {detail.category && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1 text-xs uppercase tracking-wide text-slate-200 backdrop-blur">
            {detail.category.icon} {detail.category.name}
          </span>
        )}
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
          {detail.title}
        </h1>
        <p className="mt-1 text-slate-300">
          {detail.venue.name} · {detail.venue.city} · {detail.room.name} ·{" "}
          {startsAt.toLocaleString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

function PurchaseSuccessBanner() {
  return (
    <div className="mb-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-emerald-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">Payment successful</div>
          <div className="mt-0.5 text-sm text-emerald-200/80">
            Your ticket is issued and saved against your account.
          </div>
        </div>
        <Link
          to="/me/tickets"
          className="shrink-0 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/30"
        >
          View my tickets →
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 className="mt-8 text-xl font-semibold">{title}</h2>
      {children}
    </>
  );
}

function SpeakerRow({ name, affiliation }: { name: string; affiliation: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold">
        {initials}
      </div>
      <div>
        <div className="font-medium text-white">{name}</div>
        <div className="text-xs text-slate-400">{affiliation}</div>
      </div>
    </li>
  );
}

function CtaCard({
  cheapestTier,
  priciestTier,
  roomKind,
  roomName,
  venueName,
  onGetTickets,
}: {
  cheapestTier: { price_cents: number; currency: string } | null;
  priciestTier: { price_cents: number; currency: string } | null;
  roomKind: "seated" | "general";
  roomName: string;
  venueName: string;
  onGetTickets: () => void;
}) {
  const hasRange =
    !!cheapestTier &&
    !!priciestTier &&
    priciestTier.price_cents > cheapestTier.price_cents;
  return (
    <aside className="lg:col-span-1">
      <div className="sticky top-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="text-xs uppercase tracking-wide text-slate-400">Hall</div>
        <div className="mt-0.5 text-sm font-medium text-slate-100">{roomName}</div>
        <div className="text-xs text-slate-500">at {venueName}</div>

        <div className="mt-4 text-xs uppercase tracking-wide text-slate-400">
          {hasRange ? "From" : "Ticket price"}
        </div>
        <div className="mt-1 flex items-baseline gap-2 text-white">
          <span className="text-3xl font-bold">
            {cheapestTier
              ? fmtMoney(cheapestTier.price_cents, cheapestTier.currency)
              : "—"}
          </span>
          {hasRange && priciestTier && (
            <span className="text-sm text-slate-400">
              up to {fmtMoney(priciestTier.price_cents, priciestTier.currency)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onGetTickets}
          disabled={!cheapestTier}
          className="mt-4 w-full rounded-lg bg-sky-500 px-4 py-2.5 font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {cheapestTier ? "Get tickets →" : "Not on sale"}
        </button>
        <p className="mt-3 text-xs text-slate-500">
          {roomKind === "seated"
            ? hasRange
              ? "Closer rows cost more — pick exactly the seats you want."
              : "Pick exactly the seats you want."
            : "General admission, by quantity."}
        </p>
      </div>
    </aside>
  );
}
