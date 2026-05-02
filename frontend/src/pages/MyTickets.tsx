import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, MyTicket } from "@/lib/api";
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

function statusPill(status: string): { label: string; cls: string } {
  switch (status) {
    case "valid":
      return { label: "Valid", cls: "bg-emerald-500/15 text-emerald-300" };
    case "used":
      return { label: "Used", cls: "bg-slate-500/15 text-slate-300" };
    case "refunded":
      return { label: "Refunded", cls: "bg-amber-500/15 text-amber-300" };
    default:
      return { label: status, cls: "bg-slate-500/15 text-slate-300" };
  }
}

export function MyTickets() {
  useDocumentTitle("My tickets");
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: async () => (await api.get<MyTicket[]>("/me/tickets")).data,
    // Re-query every 10 s so an admin-initiated refund flips the ticket's
    // status pill here without a manual reload.
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <p className="p-8 text-slate-400">Loading…</p>;
  if (error) return <p className="p-8 text-red-400">Failed to load tickets.</p>;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-slate-100">
      <h1 className="text-2xl font-bold">My tickets</h1>
      <p className="mt-1 text-sm text-slate-400">
        Show this page at the gate — the operator scans you against the seat
        and visitor name.
      </p>
      {data && data.length === 0 && (
        <p className="mt-8 text-slate-400">
          No tickets yet —{" "}
          <Link to="/" className="text-sky-300 hover:text-sky-200">
            browse events
          </Link>{" "}
          to book one.
        </p>
      )}
      <ul className="mt-6 space-y-3">
        {data?.map((t) => (
          <TicketCard key={t.id} t={t} />
        ))}
      </ul>
    </main>
  );
}

function TicketCard({ t }: { t: MyTicket }) {
  const pill = statusPill(t.status);
  return (
    <li className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-5 shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {fmtWhen(t.event_starts_at)}
          </div>
          <h2 className="mt-1 truncate text-lg font-semibold text-white">
            {t.event_title}
          </h2>
          <div className="mt-1 text-sm text-slate-400">
            {t.venue_name} · {t.venue_city} · {t.room_name}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill.cls}`}
        >
          {pill.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field
          label="Seat"
          value={t.seat_label ?? "General admission"}
          mono
        />
        <Field
          label="Visitor"
          value={`${t.first_name} ${t.last_name}`.trim() || "—"}
        />
        <Field
          label="Price"
          value={fmtMoney(t.price_cents, t.currency)}
        />
      </div>
    </li>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div
        className={`mt-0.5 truncate ${mono ? "font-mono text-base" : "text-sm"} text-white`}
      >
        {value}
      </div>
    </div>
  );
}
