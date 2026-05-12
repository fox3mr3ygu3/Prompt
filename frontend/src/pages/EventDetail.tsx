import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, CheckCircle2, MapPin, Mic2, Ticket, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EventDetail as EventDetailT, api } from "@/lib/api";
import { useDocumentTitle } from "@/lib/use-document-title";
import { fmtMoney } from "@/lib/format";
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  LinkButton,
  LoadingState,
  PageShell,
  Panel,
  StatusPill,
} from "@/components/ui";

type PurchaseLocationState = { purchaseSuccess?: boolean; orderId?: string };

export function EventDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const loc = useLocation();
  const purchaseState = (loc.state ?? null) as PurchaseLocationState | null;
  const justBought = Boolean(purchaseState?.purchaseSuccess);

  const {
    data: detail,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["event", slug],
    queryFn: async () => (await api.get<EventDetailT>(`/events/${slug}`)).data,
    enabled: !!slug,
  });

  useDocumentTitle(detail?.title ?? "");

  if (isLoading) return <LoadingState label="Loading event" />;
  if (error || !detail) return <ErrorState label="Failed to load event." />;

  const cheapestTier =
    [...detail.price_tiers].sort((a, b) => a.price_cents - b.price_cents)[0] ?? null;
  const priciestTier =
    [...detail.price_tiers].sort((a, b) => b.price_cents - a.price_cents)[0] ?? null;
  const startsAt = new Date(detail.starts_at);
  const endsAt = new Date(detail.ends_at);

  return (
    <PageShell>
      <Hero detail={detail} startsAt={startsAt} onGetTickets={() => nav(`/events/${slug}/seats`)} />

      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {justBought && <PurchaseSuccessBanner />}

          <Panel className="p-6">
            <div className="mb-4 flex flex-wrap gap-2">
              <StatusPill status={detail.status}>{detail.status}</StatusPill>
              <span className="rounded-full border border-ivory/12 bg-ivory/7 px-2.5 py-1 text-xs font-bold text-ivory-muted">
                {detail.room.kind === "seated" ? "Assigned seating" : "General admission"}
              </span>
              {detail.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-ivory/10 bg-ink-2 px-2.5 py-1 text-xs font-semibold text-ivory-muted"
                >
                  #{tag}
                </span>
              ))}
            </div>
            <h2 className="font-display text-3xl font-bold text-ivory">About this event</h2>
            <p className="mt-3 whitespace-pre-line text-base leading-8 text-ivory-muted">
              {detail.description}
            </p>
          </Panel>

          <div className="grid gap-4 sm:grid-cols-3">
            <InfoTile
              icon={CalendarDays}
              label="Schedule"
              value={startsAt.toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              detail={`${startsAt.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })} to ${endsAt.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}`}
            />
            <InfoTile
              icon={MapPin}
              label="Venue"
              value={detail.venue.name}
              detail={`${detail.venue.city}, ${detail.venue.country}`}
            />
            <InfoTile
              icon={Users}
              label="Capacity"
              value={detail.room.capacity.toLocaleString()}
              detail={detail.room.name}
            />
          </div>

          {detail.speakers.length > 0 ? (
            <Panel className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-aqua">voices</p>
                  <h2 className="mt-1 font-display text-3xl font-bold text-ivory">Speakers</h2>
                </div>
                <Mic2 aria-hidden className="h-7 w-7 text-brass" />
              </div>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {detail.speakers.map((s) => (
                  <SpeakerRow key={s.id} name={s.name} affiliation={s.affiliation} />
                ))}
              </ul>
            </Panel>
          ) : (
            <EmptyState
              title="Speaker lineup coming soon"
              description="The organizer has not published the speaker list yet."
            />
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
    </PageShell>
  );
}

function Hero({
  detail,
  startsAt,
  onGetTickets,
}: {
  detail: EventDetailT;
  startsAt: Date;
  onGetTickets: () => void;
}) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-ivory/12 bg-ink-2 shadow-2xl">
      <div className="absolute inset-0 bg-scan-lines opacity-60" aria-hidden />
      <div className="grid min-h-[460px] lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="relative flex min-h-[420px] items-end overflow-hidden">
          {detail.cover_image_url ? (
            <img
              src={detail.cover_image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-ticket-grid bg-[length:42px_42px]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/45 to-ink/5" />
          <div className="relative max-w-4xl p-6 sm:p-8 lg:p-10">
            {detail.category && (
              <span className="inline-flex items-center gap-2 rounded-full border border-ivory/16 bg-ink/70 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-ivory backdrop-blur">
                {detail.category.icon} {detail.category.name}
              </span>
            )}
            <h1 className="mt-4 font-display text-5xl font-bold leading-[0.95] tracking-normal text-ivory sm:text-6xl">
              {detail.title}
            </h1>
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold text-ivory-muted">
              <span className="inline-flex items-center gap-2">
                <MapPin aria-hidden className="h-4 w-4 text-brass" />
                {detail.venue.name}, {detail.venue.city}
              </span>
              <span className="inline-flex items-center gap-2">
                <CalendarDays aria-hidden className="h-4 w-4 text-aqua" />
                {startsAt.toLocaleString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        </div>

        <div className="relative flex flex-col justify-end border-t border-ivory/10 bg-ink/76 p-6 backdrop-blur-xl lg:border-l lg:border-t-0 lg:p-8">
          <div className="mb-auto inline-flex w-fit rounded-full border border-aqua/20 bg-aqua/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-aqua">
            live checkout
          </div>
          <div className="mt-10 space-y-4">
            <Field label="Room" value={detail.room.name} />
            <Field
              label="Ticketing"
              value={detail.room.kind === "seated" ? "Pick exact seats" : "Quantity based"}
            />
            <Button type="button" onClick={onGetTickets} size="lg" icon={Ticket} className="w-full">
              Choose tickets
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PurchaseSuccessBanner() {
  return (
    <Panel className="border-emerald-300/24 bg-emerald-400/10 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 text-emerald-200" />
          <div>
            <div className="font-bold text-emerald-100">Payment successful</div>
            <div className="mt-1 text-sm text-emerald-100/75">
              Your ticket is issued and saved to your account.
            </div>
          </div>
        </div>
        <LinkButton to="/me/tickets" variant="success" size="sm" icon={ArrowRight}>
          View tickets
        </LinkButton>
      </div>
    </Panel>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Panel className="p-4">
      <Icon aria-hidden className="h-5 w-5 text-aqua" />
      <div className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-ivory-muted">
        {label}
      </div>
      <div className="mt-1 line-clamp-1 font-display text-xl font-bold text-ivory">{value}</div>
      <div className="mt-1 line-clamp-2 text-xs text-ivory-muted">{detail}</div>
    </Panel>
  );
}

function SpeakerRow({ name, affiliation }: { name: string; affiliation: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  return (
    <li className="rounded-2xl border border-ivory/10 bg-ink-2/72 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brass/14 text-sm font-black text-brass">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="truncate font-bold text-ivory">{name}</div>
          <div className="mt-0.5 truncate text-xs text-ivory-muted">{affiliation}</div>
        </div>
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
    !!cheapestTier && !!priciestTier && priciestTier.price_cents > cheapestTier.price_cents;
  return (
    <aside className="lg:col-span-1">
      <Panel className="sticky top-24 overflow-hidden p-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-aqua via-brass to-ember" />
        <div className="text-xs font-bold uppercase tracking-[0.22em] text-ivory-muted">
          Reserve access
        </div>
        <div className="mt-5 rounded-2xl border border-ivory/10 bg-ink-2/72 p-4">
          <Field label="Hall" value={roomName} />
          <div className="mt-3 text-xs text-ivory-muted">at {venueName}</div>
        </div>

        <div className="mt-5">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-ivory-muted">
            {hasRange ? "From" : "Ticket price"}
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-2 text-ivory">
            <span className="font-display text-4xl font-bold">
              {cheapestTier ? fmtMoney(cheapestTier.price_cents, cheapestTier.currency) : "—"}
            </span>
            {hasRange && priciestTier && (
              <span className="text-sm font-semibold text-ivory-muted">
                to {fmtMoney(priciestTier.price_cents, priciestTier.currency)}
              </span>
            )}
          </div>
        </div>

        <Button
          type="button"
          onClick={onGetTickets}
          disabled={!cheapestTier}
          icon={Ticket}
          size="lg"
          className="mt-5 w-full"
        >
          {cheapestTier ? "Get tickets" : "Not on sale"}
        </Button>
        <p className="mt-4 text-sm leading-6 text-ivory-muted">
          {roomKind === "seated"
            ? "Seat color maps to tier price; selected seats are held before payment."
            : "General admission tickets are held by quantity before payment."}
        </p>
      </Panel>
    </aside>
  );
}
