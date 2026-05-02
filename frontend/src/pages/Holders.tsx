import { useNavigate, useParams } from "react-router-dom";
import { useCheckout } from "@/lib/checkout-context";
import { useDocumentTitle } from "@/lib/use-document-title";
import { fmtMoney } from "@/lib/format";

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
      <main className="mx-auto max-w-md px-4 py-12 text-slate-100">
        <p className="text-slate-300">Your hold expired. Pick your seats again.</p>
        <button
          type="button"
          onClick={() => nav(`/events/${slug}/seats`)}
          className="mt-4 rounded-lg bg-sky-500 px-4 py-2 font-semibold"
        >
          Back to seats
        </button>
      </main>
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
    <main className="mx-auto max-w-2xl px-4 pb-32 pt-8 text-slate-100">
      <button
        type="button"
        onClick={() => nav(`/events/${slug}/seats`)}
        className="text-sm text-slate-400 hover:text-white"
      >
        ← back to seats
      </button>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Attendee details</h1>
      <p className="mt-1 text-slate-400">
        Each ticket is named to one attendee. Names are printed on the QR-code
        ticket and shown to the gate operator on scan.
      </p>

      <div className="mt-8 space-y-5">
        {state.holders.map((h, idx) => (
          <section
            key={idx}
            className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Ticket {idx + 1}
                {h.seat_id ? (
                  <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                    seat {h.seat_id.slice(0, 8)}…
                  </span>
                ) : null}
              </h2>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                value={h.first_name}
                onChange={(e) => setHolder(idx, { first_name: e.target.value })}
                placeholder="First name"
                required
                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
              <input
                value={h.last_name}
                onChange={(e) => setHolder(idx, { last_name: e.target.value })}
                placeholder="Last name"
                required
                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </section>
        ))}
      </div>

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="text-sm text-slate-300">
            Total{" "}
            <span className="font-semibold text-sky-300">
              {fmtMoney(state.total_cents, state.currency)}
            </span>
            <span className="ml-2 text-xs text-slate-500">
              {state.holders.length} ticket
              {state.holders.length === 1 ? "" : "s"}
            </span>
          </div>
          <button
            type="button"
            disabled={!allFilled}
            onClick={onContinue}
            className="rounded-lg bg-sky-500 px-5 py-2.5 font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            Go to payment →
          </button>
        </div>
      </div>
    </main>
  );
}
