import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AdminTicket,
  ApiErr,
  EventProposal,
  api,
} from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { useDocumentTitle } from "@/lib/use-document-title";

function statusPill(status: string): { label: string; cls: string } {
  switch (status) {
    case "valid":
      return { label: "Valid", cls: "bg-emerald-500/15 text-emerald-300" };
    case "used":
      return { label: "Used", cls: "bg-slate-500/15 text-slate-300" };
    case "refunded":
      return { label: "Refunded", cls: "bg-amber-500/15 text-amber-300" };
    case "approved":
      return { label: "Approved", cls: "bg-emerald-500/15 text-emerald-300" };
    case "pending":
      return { label: "Pending", cls: "bg-amber-500/15 text-amber-300" };
    case "rejected":
      return { label: "Rejected", cls: "bg-red-500/15 text-red-300" };
    default:
      return { label: status, cls: "bg-slate-500/15 text-slate-300" };
  }
}

type Tab = "tickets" | "proposals";

export function Admin() {
  useDocumentTitle("Admin");
  const [tab, setTab] = useState<Tab>("tickets");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-slate-100">
      <h1 className="text-2xl font-bold">Admin</h1>
      <div className="mt-4 flex gap-2 border-b border-slate-800">
        <TabButton active={tab === "tickets"} onClick={() => setTab("tickets")}>
          Tickets
        </TabButton>
        <TabButton
          active={tab === "proposals"}
          onClick={() => setTab("proposals")}
        >
          Event proposals
        </TabButton>
      </div>

      {tab === "tickets" ? <TicketsPanel /> : <ProposalsPanel />}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
        active
          ? "border-sky-400 text-white"
          : "border-transparent text-slate-400 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function TicketsPanel() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-tickets"],
    queryFn: async () =>
      (await api.get<AdminTicket[]>("/admin/tickets")).data,
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
    <div className="mt-6">
      <p className="text-sm text-slate-400">
        Single SQL join over{" "}
        <code className="text-slate-300">tickets / orders / events / users</code>{" "}
        — refunds flip the order to{" "}
        <code className="text-slate-300">refunded</code> and propagate to every
        ticket on it.
      </p>
      {errMsg && (
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {errMsg}
        </p>
      )}

      {isLoading && <p className="mt-8 text-slate-400">Loading…</p>}
      {error && <p className="mt-8 text-red-400">Failed to load tickets.</p>}

      {data && data.length === 0 && (
        <p className="mt-12 text-center text-slate-500">No tickets yet.</p>
      )}

      {data && data.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
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
            <tbody className="divide-y divide-slate-800">
              {data.map((t) => {
                const pill = statusPill(t.ticket_status);
                const refundable =
                  t.order_status === "paid" && t.ticket_status === "valid";
                const isPending = pendingOrder === t.order_id;
                return (
                  <tr key={t.ticket_id} className="bg-slate-950/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">
                        {t.event_title}
                      </div>
                      <div className="text-xs text-slate-500">
                        {t.event_slug}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <div>{t.buyer_full_name || "—"}</div>
                      <div className="text-xs text-slate-500">
                        {t.buyer_email}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white">
                      {t.holder_first_name} {t.holder_last_name}
                    </td>
                    <td className="px-4 py-3 font-mono text-base text-white">
                      {t.seat_label ?? "GA"}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {fmtMoney(t.price_cents, t.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pill.cls}`}
                      >
                        {pill.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={!refundable || isPending}
                        onClick={() => refund.mutate(t.order_id)}
                        className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                      >
                        {isPending ? "Refunding…" : "Refund"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">(
    "pending",
  );
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-proposals", filter],
    queryFn: async () => {
      const url =
        filter === "all" ? "/admin/proposals" : `/admin/proposals?status=${filter}`;
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
    <div className="mt-6">
      <p className="text-sm text-slate-400">
        Organisers submit drafts here. Approving creates the venue, room, event
        and price tier in one DB transaction and publishes the event to
        attendees.
      </p>

      <div className="mt-4 flex gap-2 text-xs">
        {(["pending", "approved", "rejected", "all"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`rounded-full px-3 py-1 font-semibold transition ${
              filter === k
                ? "bg-sky-500/30 text-sky-100"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      {errMsg && (
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {errMsg}
        </p>
      )}

      {isLoading && <p className="mt-8 text-slate-400">Loading…</p>}
      {error && <p className="mt-8 text-red-400">Failed to load proposals.</p>}

      {data && data.length === 0 && (
        <p className="mt-12 text-center text-slate-500">
          No proposals in this view.
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {data?.map((p) => {
          const pill = statusPill(p.status);
          const isPending = pendingId === p.id;
          return (
            <li
              key={p.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-white">
                    {p.title}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {p.organisation_name ?? "—"} · {p.submitter_email ?? "—"}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill.cls}`}
                >
                  {pill.label}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Field label="Venue" value={`${p.venue_name}, ${p.city}`} />
                <Field label="Seats" value={String(p.seats)} />
                <Field
                  label="Price"
                  value={fmtMoney(p.price_cents, p.currency)}
                />
                <Field
                  label="Category"
                  value={p.category_slug || "—"}
                />
                <Field label="Starts" value={fmtWhen(p.starts_at)} />
                <Field label="Ends" value={fmtWhen(p.ends_at)} />
                <Field
                  label="Tags"
                  value={p.tags.length > 0 ? p.tags.join(", ") : "—"}
                />
                <Field
                  label="Submitted"
                  value={fmtWhen(p.created_at)}
                />
              </div>

              {p.description && (
                <p className="mt-3 text-sm text-slate-300">{p.description}</p>
              )}

              {p.cover_image_url && (
                <a
                  href={p.cover_image_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block text-xs text-sky-300 hover:underline"
                >
                  Cover image →
                </a>
              )}

              {p.status === "rejected" && p.reject_reason && (
                <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  <span className="font-semibold">Reason:</span>{" "}
                  {p.reject_reason}
                </p>
              )}

              {p.status === "pending" && (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => approve.mutate(p.id)}
                    className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    {isPending ? "Approving…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onReject(p.id)}
                    className="rounded-lg bg-red-500/20 px-3 py-1.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    Reject
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
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
