import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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

function statusPill(status: string): { label: string; cls: string } {
  switch (status) {
    case "valid":
      return { label: "Valid", cls: "bg-emerald-500/15 text-emerald-300" };
    case "used":
      return { label: "Used", cls: "bg-slate-500/15 text-slate-300" };
    case "refunded":
      return { label: "Refunded", cls: "bg-amber-500/15 text-amber-300" };
    case "approved":
    case "published":
      return { label: status, cls: "bg-emerald-500/15 text-emerald-300" };
    case "draft":
      return { label: "Draft", cls: "bg-slate-500/15 text-slate-300" };
    case "cancelled":
      return { label: "Cancelled", cls: "bg-red-500/15 text-red-300" };
    case "completed":
      return { label: "Completed", cls: "bg-sky-500/15 text-sky-300" };
    default:
      return { label: status, cls: "bg-slate-500/15 text-slate-300" };
  }
}

export function Profile() {
  useDocumentTitle("Profile");
  const { data, isLoading, error } = useQuery({
    queryKey: ["me-profile"],
    queryFn: async () => (await api.get<ProfileData>("/me/profile")).data,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <p className="p-8 text-slate-400">Loading…</p>;
  if (error || !data)
    return <p className="p-8 text-red-400">Failed to load profile.</p>;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-slate-100">
      <Identity profile={data} />
      {data.attendee && <AttendeeBlock data={data.attendee} />}
      {data.organiser && <OrganiserBlock data={data.organiser} />}
    </main>
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
    <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-6">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-xl font-bold text-sky-200">
          {initials}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-white">
            {profile.user.full_name || profile.user.email}
          </h1>
          <div className="mt-0.5 truncate text-sm text-slate-400">
            {profile.user.email}
          </div>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-200">
          {profile.user.role}
        </span>
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Member since {fmtDate(profile.user.created_at)} · all stats below are
        computed live from the database on every load.
      </p>
    </section>
  );
}

// ── Attendee branch ────────────────────────────────────────────────────────
function AttendeeBlock({ data }: { data: AttendeeProfile }) {
  const { stats, recent_tickets } = data;
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Tickets" value={stats.total.toLocaleString()} />
        <Kpi label="Valid" value={stats.valid.toLocaleString()} />
        <Kpi label="Used" value={stats.used.toLocaleString()} />
        <Kpi label="Spent" value={fmtMoney(stats.spent_cents, stats.currency)} />
      </div>

      <section className="mt-8">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-bold">Recent purchases</h2>
          <Link
            to="/me/tickets"
            className="text-sm text-sky-300 hover:text-sky-200"
          >
            View all →
          </Link>
        </div>
        {recent_tickets.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No tickets yet —{" "}
            <Link to="/" className="text-sky-300 hover:text-sky-200">
              browse events
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {recent_tickets.map((t) => (
              <RecentTicket key={t.id} t={t} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function RecentTicket({ t }: { t: MyTicket }) {
  const pill = statusPill(t.status);
  return (
    <li className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {fmtWhen(t.event_starts_at)}
          </div>
          <div className="mt-1 truncate text-base font-semibold text-white">
            {t.event_title}
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-400">
            {t.venue_name} · {t.venue_city} · {t.room_name}
            {t.seat_label ? ` · seat ${t.seat_label}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill.cls}`}
          >
            {pill.label}
          </span>
          <span className="text-xs text-slate-400">
            {fmtMoney(t.price_cents, t.currency)}
          </span>
        </div>
      </div>
    </li>
  );
}

// ── Organiser branch ───────────────────────────────────────────────────────
function OrganiserBlock({ data }: { data: OrganiserProfile }) {
  return (
    <>
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="text-xs uppercase tracking-wider text-slate-500">
          Organisation
        </div>
        <div className="mt-1 text-lg font-semibold text-white">
          {data.organisation_name || "—"}
        </div>
        {data.organisation_slug && (
          <div className="mt-0.5 text-xs text-slate-400">
            /{data.organisation_slug}
          </div>
        )}
      </section>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Kpi label="Events" value={data.event_count.toLocaleString()} />
        <Kpi label="Attendees" value={data.attendee_count.toLocaleString()} />
        <Kpi label="Gross" value={fmtMoney(data.gross_cents, data.currency)} />
      </div>

      <section className="mt-8">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-bold">My events</h2>
          <Link
            to="/org/events"
            className="text-sm text-sky-300 hover:text-sky-200"
          >
            View all →
          </Link>
        </div>
        {data.recent_events.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No events yet — submit one from the{" "}
            <Link to="/org/events" className="text-sky-300 hover:text-sky-200">
              My events
            </Link>{" "}
            page.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {data.recent_events.map((e) => (
              <RecentEvent key={e.id} e={e} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function RecentEvent({ e }: { e: OrgEvent }) {
  const pill = statusPill(e.status);
  return (
    <li className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/org/events/${e.slug}/attendees`}
            className="truncate text-base font-semibold text-white hover:text-sky-300"
          >
            {e.title}
          </Link>
          <div className="mt-0.5 truncate text-xs text-slate-400">
            {fmtWhen(e.starts_at)} · {e.venue_name} · {e.room_name}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill.cls}`}
        >
          {pill.label}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Field
          label="Attendees"
          value={`${e.attendee_count} / ${e.capacity}`}
        />
        <Field label="Scanned" value={e.scanned_count.toLocaleString()} />
        <Field label="Gross" value={fmtMoney(e.gross_cents, e.currency)} />
      </div>
    </li>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-white">{value}</div>
    </div>
  );
}
