import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  CircleDollarSign,
  LayoutDashboard,
  Ticket,
  UserRound,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  AttendeeProfile,
  MyTicket,
  OrganiserProfile,
  OrgEvent,
  Profile as ProfileData,
} from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { useDocumentTitle } from "@/lib/use-document-title";
import {
  EmptyState,
  ErrorState,
  Field,
  LinkButton,
  LoadingState,
  MetricCard,
  PageShell,
  Panel,
  StatusPill,
} from "@/components/ui";

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function Profile() {
  useDocumentTitle("Profile");
  const { data, isLoading, error } = useQuery({
    queryKey: ["me-profile"],
    queryFn: async () => (await api.get<ProfileData>("/me/profile")).data,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <LoadingState label="Loading profile" />;
  if (error || !data) return <ErrorState label="Failed to load profile." />;

  return (
    <PageShell>
      <Identity profile={data} />
      {data.attendee && <AttendeeBlock data={data.attendee} />}
      {data.organiser && <OrganiserBlock data={data.organiser} />}
    </PageShell>
  );
}

function Identity({ profile }: { profile: ProfileData }) {
  const initials =
    (profile.user.full_name || profile.user.email)
      .split(/\s+|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <Panel className="overflow-hidden p-6 sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-[1.5rem] border border-brass/30 bg-brass/12 font-display text-3xl font-bold text-brass shadow-brass">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-aqua">
            profile command center
          </p>
          <h1 className="mt-2 truncate font-display text-4xl font-bold text-ivory sm:text-5xl">
            {profile.user.full_name || profile.user.email}
          </h1>
          <div className="mt-2 truncate text-sm font-semibold text-ivory-muted">
            {profile.user.email}
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:items-end">
          <StatusPill status={profile.user.role}>{profile.user.role}</StatusPill>
          <span className="text-xs font-semibold text-ivory-muted">
            Member since {fmtDate(profile.user.created_at)}
          </span>
        </div>
      </div>
    </Panel>
  );
}

function AttendeeBlock({ data }: { data: AttendeeProfile }) {
  const { stats, recent_tickets } = data;
  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Tickets" value={stats.total.toLocaleString()} icon={Ticket} />
        <MetricCard
          label="Valid"
          value={stats.valid.toLocaleString()}
          icon={UserRound}
          tone="fern"
        />
        <MetricCard
          label="Used"
          value={stats.used.toLocaleString()}
          icon={CalendarDays}
          tone="brass"
        />
        <MetricCard
          label="Spent"
          value={fmtMoney(stats.spent_cents, stats.currency)}
          icon={CircleDollarSign}
          tone="ember"
        />
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-aqua">activity</p>
            <h2 className="mt-1 font-display text-3xl font-bold text-ivory">Recent purchases</h2>
          </div>
          <LinkButton to="/me/tickets" variant="secondary" size="sm" icon={Ticket}>
            View all
          </LinkButton>
        </div>
        {recent_tickets.length === 0 ? (
          <EmptyState
            title="No tickets yet"
            description="Browse the catalog and your purchases will show here."
            action={<LinkButton to="/">Browse events</LinkButton>}
          />
        ) : (
          <ul className="space-y-3">
            {recent_tickets.map((t) => (
              <RecentTicket key={t.id} ticket={t} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function RecentTicket({ ticket }: { ticket: MyTicket }) {
  return (
    <Panel className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-ivory-muted">
            {fmtWhen(ticket.event_starts_at)}
          </div>
          <div className="mt-1 truncate font-display text-xl font-bold text-ivory">
            {ticket.event_title}
          </div>
          <div className="mt-1 truncate text-sm text-ivory-muted">
            {ticket.venue_name} · {ticket.venue_city} · {ticket.room_name}
            {ticket.seat_label ? ` · seat ${ticket.seat_label}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          <StatusPill status={ticket.status}>{ticket.status}</StatusPill>
          <span className="text-sm font-bold text-aqua">
            {fmtMoney(ticket.price_cents, ticket.currency)}
          </span>
        </div>
      </div>
    </Panel>
  );
}

function OrganiserBlock({ data }: { data: OrganiserProfile }) {
  return (
    <>
      <Panel className="mt-6 p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-ivory-muted">
              Organisation
            </div>
            <div className="mt-1 font-display text-3xl font-bold text-ivory">
              {data.organisation_name || "—"}
            </div>
            {data.organisation_slug && (
              <div className="mt-1 text-sm font-semibold text-ivory-muted">
                /{data.organisation_slug}
              </div>
            )}
          </div>
          <LinkButton to="/org/events" icon={LayoutDashboard}>
            Open dashboard
          </LinkButton>
        </div>
      </Panel>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <MetricCard label="Events" value={data.event_count.toLocaleString()} icon={CalendarDays} />
        <MetricCard
          label="Attendees"
          value={data.attendee_count.toLocaleString()}
          icon={Users}
          tone="fern"
        />
        <MetricCard
          label="Gross"
          value={fmtMoney(data.gross_cents, data.currency)}
          icon={CircleDollarSign}
          tone="brass"
        />
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-aqua">
              organizer pulse
            </p>
            <h2 className="mt-1 font-display text-3xl font-bold text-ivory">My events</h2>
          </div>
          <LinkButton to="/org/events" variant="secondary" size="sm">
            View all
          </LinkButton>
        </div>
        {data.recent_events.length === 0 ? (
          <EmptyState
            title="No events yet"
            description="Submit an event from the organizer dashboard and approved events will appear here."
          />
        ) : (
          <ul className="space-y-3">
            {data.recent_events.map((event) => (
              <RecentEvent key={event.id} event={event} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function RecentEvent({ event }: { event: OrgEvent }) {
  return (
    <Panel className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            to={`/org/events/${event.slug}/attendees`}
            className="truncate font-display text-xl font-bold text-ivory hover:text-aqua"
          >
            {event.title}
          </Link>
          <div className="mt-1 truncate text-sm text-ivory-muted">
            {fmtWhen(event.starts_at)} · {event.venue_name} · {event.room_name}
          </div>
        </div>
        <StatusPill status={event.status}>{event.status}</StatusPill>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Attendees" value={`${event.attendee_count} / ${event.capacity}`} />
        <Field label="Scanned" value={event.scanned_count.toLocaleString()} />
        <Field label="Gross" value={fmtMoney(event.gross_cents, event.currency)} />
      </div>
    </Panel>
  );
}
