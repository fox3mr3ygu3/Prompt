import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, Ticket as TicketIcon, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, MyTicket } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { useDocumentTitle } from "@/lib/use-document-title";
import {
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  PageHeader,
  PageShell,
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

export function MyTickets() {
  useDocumentTitle("My tickets");
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: async () => (await api.get<MyTicket[]>("/me/tickets")).data,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <LoadingState label="Loading tickets" />;
  if (error) return <ErrorState label="Failed to load tickets." />;

  return (
    <PageShell narrow>
      <PageHeader
        eyebrow="attendee wallet"
        title="My tickets"
        description="Gate-ready tickets, live status, and seat assignments in one place."
      />
      {data && data.length === 0 && (
        <EmptyState
          title="No tickets yet"
          description="Book your first event and it will appear here with a live scan status."
          action={
            <LinkButton to="/" icon={TicketIcon}>
              Browse events
            </LinkButton>
          }
        />
      )}
      <ul className="space-y-4">
        {data?.map((t) => (
          <TicketCard key={t.id} ticket={t} />
        ))}
      </ul>
    </PageShell>
  );
}

function TicketCard({ ticket }: { ticket: MyTicket }) {
  return (
    <li className="ticket-edge overflow-hidden rounded-[1.75rem] border border-ivory/12 bg-ivory text-ink shadow-2xl">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_190px]">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-ink/55">
                <CalendarDays aria-hidden className="h-4 w-4" />
                {fmtWhen(ticket.event_starts_at)}
              </div>
              <h2 className="mt-2 truncate font-display text-3xl font-bold text-ink">
                {ticket.event_title}
              </h2>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-ink/62">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin aria-hidden className="h-4 w-4" />
                  {ticket.venue_name}, {ticket.venue_city}
                </span>
                <span>{ticket.room_name}</span>
              </div>
            </div>
            <StatusPill status={ticket.status}>{ticket.status}</StatusPill>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <DarkField
              icon={TicketIcon}
              label="Seat"
              value={ticket.seat_label ?? "General admission"}
            />
            <DarkField
              icon={UserRound}
              label="Visitor"
              value={`${ticket.first_name} ${ticket.last_name}`.trim() || "—"}
            />
            <DarkField
              icon={TicketIcon}
              label="Price"
              value={fmtMoney(ticket.price_cents, ticket.currency)}
            />
          </div>
        </div>
        <div className="flex flex-col justify-between border-t border-dashed border-ink/18 bg-ink px-5 py-6 text-ivory lg:border-l lg:border-t-0">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-aqua">
              ticket id
            </div>
            <div className="mt-2 break-all font-mono text-xs text-ivory-muted">{ticket.id}</div>
          </div>
          <div className="mt-6 grid grid-cols-5 gap-1">
            {Array.from({ length: 25 }, (_, i) => (
              <span
                key={i}
                className={
                  i % 3 === 0 || i % 7 === 0 ? "aspect-square bg-aqua" : "aspect-square bg-ivory/18"
                }
              />
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}

function DarkField({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-ink/[0.055] p-3">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-ink/55">
        <Icon aria-hidden className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-black text-ink">{value}</div>
    </div>
  );
}
