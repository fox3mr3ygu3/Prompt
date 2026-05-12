import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, UserRound } from "lucide-react";
import { useCheckout } from "@/lib/checkout-context";
import { useDocumentTitle } from "@/lib/use-document-title";
import { fmtMoney } from "@/lib/format";
import { BackLink, Button, Field, PageHeader, PageShell, Panel, TextInput } from "@/components/ui";

/** Step 2 of checkout — collect first/last name per held seat (or per GA slot).
 *  The page itself scrolls so a 20-seat order doesn't blow up the layout. */
export function Holders() {
  const { slug = "" } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const { state, setHolder } = useCheckout();
  useDocumentTitle("Attendee details");

  // Guard: if checkout state was lost (refresh after sessionStorage cleared,
  // or direct nav), kick the user back to seat selection.
  if (!state.event_id || state.event_id !== slug || state.holders.length === 0) {
    return (
      <PageShell narrow>
        <Panel className="p-6">
          <p className="text-ivory-muted">Your hold expired. Pick your seats again.</p>
          <Button type="button" onClick={() => nav(`/events/${slug}/seats`)} className="mt-4">
            Back to seats
          </Button>
        </Panel>
      </PageShell>
    );
  }

  const allFilled = state.holders.every(
    (h) => h.first_name.trim().length > 0 && h.last_name.trim().length > 0,
  );

  function onContinue() {
    if (!allFilled) return;
    nav(`/events/${slug}/payment`);
  }

  return (
    <PageShell narrow className="pb-36">
      <BackLink to={`/events/${slug}/seats`}>Back to seats</BackLink>
      <PageHeader
        eyebrow="checkout 02"
        title="Attendee details"
        description="Each ticket is named to one attendee. Names are printed on the QR-code ticket and shown to the gate operator on scan."
      />

      <div className="mt-8 space-y-5">
        {state.holders.map((h, idx) => (
          <Panel key={idx} className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-ivory-muted">
                <UserRound aria-hidden className="h-4 w-4 text-aqua" />
                Ticket {idx + 1}
                {h.seat_id ? (
                  <span className="ml-2 rounded-full border border-ivory/10 bg-ink-2 px-2 py-1 text-[10px] text-ivory-muted">
                    seat {h.seat_id.slice(0, 8)}…
                  </span>
                ) : null}
              </h2>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TextInput
                value={h.first_name}
                onChange={(e) => setHolder(idx, { first_name: e.target.value })}
                placeholder="First name"
                required
              />
              <TextInput
                value={h.last_name}
                onChange={(e) => setHolder(idx, { last_name: e.target.value })}
                placeholder="Last name"
                required
              />
            </div>
          </Panel>
        ))}
      </div>

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ivory/10 bg-ink/90 px-4 py-3 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-2 gap-5">
            <Field label="Total" value={fmtMoney(state.total_cents, state.currency)} />
            <Field
              label="Tickets"
              value={`${state.holders.length} ticket${state.holders.length === 1 ? "" : "s"}`}
            />
          </div>
          <Button
            type="button"
            disabled={!allFilled}
            onClick={onContinue}
            icon={ArrowRight}
            className="w-full sm:w-auto"
          >
            Go to payment
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
