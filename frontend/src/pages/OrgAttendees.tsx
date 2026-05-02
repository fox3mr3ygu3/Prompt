import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, Attendee } from "@/lib/api";
import { useDocumentTitle } from "@/lib/use-document-title";

function statusPill(status: string): { label: string; cls: string } {
  switch (status) {
    case "valid":
      return { label: "Valid", cls: "bg-emerald-500/15 text-emerald-300" };
    case "used":
      return { label: "Scanned", cls: "bg-slate-500/15 text-slate-300" };
    case "refunded":
      return { label: "Refunded", cls: "bg-amber-500/15 text-amber-300" };
    default:
      return { label: status, cls: "bg-slate-500/15 text-slate-300" };
  }
}

export function OrgAttendees() {
  const { slug = "" } = useParams<{ slug: string }>();
  useDocumentTitle("Attendees");
  const { data, isLoading, error } = useQuery({
    queryKey: ["org-attendees", slug],
    queryFn: async () =>
      (await api.get<Attendee[]>(`/org/events/${slug}/attendees`)).data,
    enabled: !!slug,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 text-slate-100">
      <Link
        to="/org/events"
        className="text-sm text-slate-400 hover:text-white"
      >
        ← back to my events
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Attendees</h1>
      <p className="mt-1 text-sm text-slate-400">
        Direct DB query — joined from{" "}
        <code className="text-slate-300">tickets / orders / users / seats</code>.
      </p>

      {isLoading && <p className="mt-8 text-slate-400">Loading…</p>}
      {error && (
        <p className="mt-8 text-red-400">Failed to load attendee list.</p>
      )}
      {data && data.length === 0 && (
        <p className="mt-12 text-center text-slate-500">
          No tickets sold for this event yet.
        </p>
      )}

      {data && data.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Seat</th>
                <th className="px-4 py-3">Holder</th>
                <th className="px-4 py-3">Buyer email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Issued</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.map((a) => {
                const pill = statusPill(a.status);
                return (
                  <tr key={a.ticket_id} className="bg-slate-950/40">
                    <td className="px-4 py-3 font-mono text-base text-white">
                      {a.seat_label ?? "GA"}
                    </td>
                    <td className="px-4 py-3 text-white">
                      {a.first_name} {a.last_name}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{a.buyer_email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pill.cls}`}
                      >
                        {pill.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(a.issued_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
