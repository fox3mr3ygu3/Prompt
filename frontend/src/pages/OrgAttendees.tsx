import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api, Attendee } from "@/lib/api";
import { useDocumentTitle } from "@/lib/use-document-title";
import {
  BackLink,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  StatusPill,
  TableFrame,
} from "@/components/ui";

export function OrgAttendees() {
  const { slug = "" } = useParams<{ slug: string }>();
  useDocumentTitle("Attendees");
  const { data, isLoading, error } = useQuery({
    queryKey: ["org-attendees", slug],
    queryFn: async () => (await api.get<Attendee[]>(`/org/events/${slug}/attendees`)).data,
    enabled: !!slug,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });

  return (
    <PageShell>
      <BackLink to="/org/events">Back to my events</BackLink>
      <PageHeader
        eyebrow="event manifest"
        title="Attendees"
        description="Live attendee list joined from tickets, orders, users, and seat assignments."
      />

      {isLoading && <LoadingState label="Loading attendee list" />}
      {error && <ErrorState label="Failed to load attendee list." />}
      {data && data.length === 0 && (
        <EmptyState
          title="No tickets sold yet"
          description="Attendees appear here as soon as orders are paid."
        />
      )}

      {data && data.length > 0 && (
        <TableFrame>
          <table className="w-full text-left text-sm">
            <thead className="bg-ivory/7 text-xs uppercase tracking-[0.18em] text-ivory-muted">
              <tr>
                <th className="px-4 py-3">Seat</th>
                <th className="px-4 py-3">Holder</th>
                <th className="px-4 py-3">Buyer email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Issued</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ivory/10">
              {data.map((a) => {
                return (
                  <tr key={a.ticket_id} className="bg-ink/30 transition hover:bg-ivory/[0.045]">
                    <td className="px-4 py-3 font-mono text-base font-bold text-aqua">
                      {a.seat_label ?? "GA"}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ivory">
                      {a.first_name} {a.last_name}
                    </td>
                    <td className="px-4 py-3 text-ivory-muted">{a.buyer_email}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={a.status}>
                        {a.status === "used" ? "Scanned" : a.status}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3 text-xs text-ivory-muted">
                      {new Date(a.issued_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableFrame>
      )}
    </PageShell>
  );
}
