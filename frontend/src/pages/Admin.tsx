import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ShieldCheck, Ticket, Undo2, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AdminTicket, ApiErr, EventProposal, api } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { useDocumentTitle } from "@/lib/use-document-title";
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  PageShell,
  Panel,
  StatusPill,
  TableFrame,
} from "@/components/ui";
import { cn } from "@/lib/cn";

type Tab = "tickets" | "proposals";

export function Admin() {
  useDocumentTitle("Admin");
  const [tab, setTab] = useState<Tab>("tickets");

  return (
    <PageShell>
      <PageHeader
        eyebrow="admin control"
        title="Admin"
        description="Refund paid orders, review event proposals, and keep the published catalog clean."
      />
      <div className="mb-6 inline-flex rounded-2xl border border-ivory/12 bg-ink-2/72 p-1">
        <TabButton active={tab === "tickets"} onClick={() => setTab("tickets")} icon={Ticket}>
          Tickets
        </TabButton>
        <TabButton
          active={tab === "proposals"}
          onClick={() => setTab("proposals")}
          icon={ShieldCheck}
        >
          Event proposals
        </TabButton>
      </div>

      {tab === "tickets" ? <TicketsPanel /> : <ProposalsPanel />}
    </PageShell>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition",
        active ? "bg-ivory text-ink shadow-brass" : "text-ivory-muted hover:text-ivory",
      )}
    >
      <Icon aria-hidden className="h-4 w-4" />
      {children}
    </button>
  );
}

function TicketsPanel() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-tickets"],
    queryFn: async () => (await api.get<AdminTicket[]>("/admin/tickets")).data,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });

  const [pendingOrder, setPendingOrder] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const refund = useMutation({
    mutationFn: async (orderId: string) => {
      setPendingOrder(orderId);
      setErrMsg(null);
      await api.post("/admin/refunds", { order_id: orderId });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-tickets"] }),
    onError: (e: unknown) => {
      const msg = (e as ApiErr).response?.data?.detail ?? "Refund failed";
      setErrMsg(typeof msg === "string" ? msg : "Refund failed");
    },
    onSettled: () => setPendingOrder(null),
  });

  return (
    <section>
      <Panel className="mb-5 p-4 text-sm leading-6 text-ivory-muted">
        Refunds flip the order to refunded and propagate status to every ticket in the order.
      </Panel>
      {errMsg && (
        <p className="mb-4 rounded-xl border border-red-300/24 bg-red-400/12 px-3 py-2 text-sm font-semibold text-red-100">
          {errMsg}
        </p>
      )}

      {isLoading && <LoadingState label="Loading tickets" />}
      {error && <ErrorState label="Failed to load tickets." />}
      {data && data.length === 0 && (
        <EmptyState title="No tickets yet" description="Orders will appear here after checkout." />
      )}

      {data && data.length > 0 && (
        <TableFrame>
          <table className="w-full text-left text-sm">
            <thead className="bg-ivory/7 text-xs uppercase tracking-[0.18em] text-ivory-muted">
              <tr>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3">Holder</th>
                <th className="px-4 py-3">Seat</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ivory/10">
              {data.map((ticketRow) => {
                const refundable =
                  ticketRow.order_status === "paid" && ticketRow.ticket_status === "valid";
                const isPending = pendingOrder === ticketRow.order_id;
                return (
                  <tr
                    key={ticketRow.ticket_id}
                    className="bg-ink/30 transition hover:bg-ivory/[0.045]"
                  >
                    <td className="px-4 py-3">
                      <div className="font-bold text-ivory">{ticketRow.event_title}</div>
                      <div className="text-xs text-ivory-muted">{ticketRow.event_slug}</div>
                    </td>
                    <td className="px-4 py-3 text-ivory-muted">
                      <div>{ticketRow.buyer_full_name || "—"}</div>
                      <div className="text-xs">{ticketRow.buyer_email}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-ivory">
                      {ticketRow.holder_first_name} {ticketRow.holder_last_name}
                    </td>
                    <td className="px-4 py-3 font-mono text-base font-bold text-aqua">
                      {ticketRow.seat_label ?? "GA"}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ivory-muted">
                      {fmtMoney(ticketRow.price_cents, ticketRow.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={ticketRow.ticket_status}>
                        {ticketRow.ticket_status}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        disabled={!refundable || isPending}
                        onClick={() => refund.mutate(ticketRow.order_id)}
                        variant="warning"
                        size="sm"
                        icon={Undo2}
                      >
                        {isPending ? "Refunding" : "Refund"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableFrame>
      )}
    </section>
  );
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ProposalsPanel() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-proposals", filter],
    queryFn: async () => {
      const url = filter === "all" ? "/admin/proposals" : `/admin/proposals?status=${filter}`;
      return (await api.get<EventProposal[]>(url)).data;
    },
    refetchInterval: 5_000,
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      setPendingId(id);
      setErrMsg(null);
      await api.post(`/admin/proposals/${id}/approve`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-proposals"] }),
    onError: (e: unknown) => {
      const msg = (e as ApiErr).response?.data?.detail ?? "Approve failed";
      setErrMsg(typeof msg === "string" ? msg : "Approve failed");
    },
    onSettled: () => setPendingId(null),
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      setPendingId(id);
      setErrMsg(null);
      await api.post(`/admin/proposals/${id}/reject`, { reason });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-proposals"] }),
    onError: (e: unknown) => {
      const msg = (e as ApiErr).response?.data?.detail ?? "Reject failed";
      setErrMsg(typeof msg === "string" ? msg : "Reject failed");
    },
    onSettled: () => setPendingId(null),
  });

  function onReject(id: string) {
    const reason = window.prompt("Reason for rejection (required):", "");
    if (!reason || !reason.trim()) {
      setErrMsg("Rejection reason is required.");
      return;
    }
    reject.mutate({ id, reason: reason.trim() });
  }

  return (
    <section>
      <Panel className="mb-5 p-4 text-sm leading-6 text-ivory-muted">
        Approving creates the venue, room, event, and price tier in one DB transaction, then
        publishes the event to attendees.
      </Panel>

      <div className="mb-5 flex flex-wrap gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-bold capitalize transition",
              filter === k
                ? "border-aqua/50 bg-aqua/14 text-aqua"
                : "border-ivory/12 bg-ivory/6 text-ivory-muted hover:text-ivory",
            )}
          >
            {k}
          </button>
        ))}
      </div>

      {errMsg && (
        <p className="mb-4 rounded-xl border border-red-300/24 bg-red-400/12 px-3 py-2 text-sm font-semibold text-red-100">
          {errMsg}
        </p>
      )}

      {isLoading && <LoadingState label="Loading proposals" />}
      {error && <ErrorState label="Failed to load proposals." />}
      {data && data.length === 0 && (
        <EmptyState
          title="No proposals in this view"
          description="Change the filter or wait for organizer submissions."
        />
      )}

      <ul className="space-y-4">
        {data?.map((proposal) => {
          const isPending = pendingId === proposal.id;
          return (
            <li key={proposal.id}>
              <Panel className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="font-display text-2xl font-bold text-ivory">
                      {proposal.title}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-ivory-muted">
                      {proposal.organisation_name ?? "—"} · {proposal.submitter_email ?? "—"}
                    </div>
                  </div>
                  <StatusPill status={proposal.status}>{proposal.status}</StatusPill>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Venue" value={`${proposal.venue_name}, ${proposal.city}`} />
                  <Field label="Seats" value={proposal.seats.toLocaleString()} />
                  <Field label="Price" value={fmtMoney(proposal.price_cents, proposal.currency)} />
                  <Field label="Category" value={proposal.category_slug || "—"} />
                  <Field label="Starts" value={fmtWhen(proposal.starts_at)} />
                  <Field label="Ends" value={fmtWhen(proposal.ends_at)} />
                  <Field
                    label="Tags"
                    value={proposal.tags.length > 0 ? proposal.tags.join(", ") : "—"}
                  />
                  <Field label="Submitted" value={fmtWhen(proposal.created_at)} />
                </div>

                {proposal.description && (
                  <p className="mt-4 text-sm leading-6 text-ivory-muted">{proposal.description}</p>
                )}

                {proposal.cover_image_url && (
                  <a
                    href={proposal.cover_image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-block text-sm font-bold text-aqua hover:text-[#7ce4de]"
                  >
                    Cover image
                  </a>
                )}

                {proposal.status === "rejected" && proposal.reject_reason && (
                  <p className="mt-4 rounded-xl border border-red-300/24 bg-red-400/12 px-3 py-2 text-sm font-semibold text-red-100">
                    Reason: {proposal.reject_reason}
                  </p>
                )}

                {proposal.status === "pending" && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={isPending}
                      onClick={() => approve.mutate(proposal.id)}
                      variant="success"
                      size="sm"
                      icon={CheckCircle2}
                    >
                      {isPending ? "Approving" : "Approve"}
                    </Button>
                    <Button
                      type="button"
                      disabled={isPending}
                      onClick={() => onReject(proposal.id)}
                      variant="danger"
                      size="sm"
                      icon={XCircle}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </Panel>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
