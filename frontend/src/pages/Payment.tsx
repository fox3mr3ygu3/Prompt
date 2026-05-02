import { FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ApiErr, api, Order } from "@/lib/api";
import { useCheckout } from "@/lib/checkout-context";
import { useDocumentTitle } from "@/lib/use-document-title";
import { fmtMoney } from "@/lib/format";

/** Format card number as 4-4-4-4 (or 4-6-5 for Amex 15-digit). */
function formatPan(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 19);
  if (d.startsWith("34") || d.startsWith("37")) {
    // Amex: 4-6-5
    return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(" ");
  }
  return d.match(/.{1,4}/g)?.join(" ") ?? d;
}

/** Auto-slash MM/YY: type "12" → "12/", backspace through the slash works. */
function formatExp(raw: string, prev: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 0) return "";
  if (digits.length < 2) return digits;
  // When deleting (raw is shorter than the previous formatted value), let
  // the user sit at "12" without re-inserting the slash so they can keep
  // backspacing into the month.
  const isDeleting = raw.length < prev.length;
  if (digits.length === 2 && isDeleting) return digits;
  return digits.slice(0, 2) + "/" + digits.slice(2);
}

export function Payment() {
  const { slug = "" } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { state, reset } = useCheckout();
  useDocumentTitle("Payment");

  const [card, setCard] = useState("");
  const [holder, setHolder] = useState("");
  const [exp, setExp] = useState("");
  const [cvv, setCvv] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!state.event_id || state.event_id !== slug || !state.hold_token) {
    return (
      <main className="mx-auto max-w-md px-4 py-12 text-slate-100">
        <p>Your hold expired. Start over from the event page.</p>
        <button
          type="button"
          onClick={() => nav(`/events/${slug}`)}
          className="mt-4 rounded-lg bg-sky-500 px-4 py-2 font-semibold"
        >
          Back to event
        </button>
      </main>
    );
  }

  function parseExp(value: string): { month: number; year: number } | null {
    const m = value.match(/^(\d{1,2})\s*[/-]?\s*(\d{2}|\d{4})$/);
    if (!m || !m[1] || !m[2]) return null;
    const month = parseInt(m[1], 10);
    let year = parseInt(m[2], 10);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12) return null;
    return { month, year };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const digits = card.replace(/\D/g, "");
    if (digits.length < 12 || digits.length > 19) {
      setErr("Enter a valid card number (12–19 digits)");
      return;
    }
    if (holder.trim().length < 1) {
      setErr("Enter the cardholder name");
      return;
    }
    const e2 = parseExp(exp);
    if (!e2) {
      setErr("Enter expiry as MM/YY");
      return;
    }
    if (cvv.replace(/\D/g, "").length < 3) {
      setErr("Enter the 3- or 4-digit CVV");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<Order>(`/events/${slug}/orders`, {
        hold_token: state.hold_token,
        holders: state.holders,
        payment: {
          card_number: digits,
          card_holder: holder.trim(),
          exp_month: e2.month,
          exp_year: e2.year,
          cvv: cvv.replace(/\D/g, ""),
        },
      });
      // Force the seat-map and event-detail caches to refetch on next mount
      // so the just-bought seat shows as ``sold`` instead of stale ``held``.
      qc.invalidateQueries({ queryKey: ["seats", slug] });
      qc.invalidateQueries({ queryKey: ["event", slug] });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      // Navigate BEFORE reset() so the guard (!state.event_id) never fires on
      // this still-mounted component — reset() runs after nav() unmounts it.
      nav(`/events/${slug}`, {
        state: { purchaseSuccess: true, orderId: r.data.id },
        replace: true,
      });
      reset();
    } catch (e: unknown) {
      const raw = (e as ApiErr).response?.data?.detail;
      const msg = typeof raw === "string" ? raw : "Payment failed. Please try again.";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-slate-100">
      <button
        type="button"
        onClick={() => nav(`/events/${slug}/holders`)}
        className="text-sm text-slate-400 hover:text-white"
      >
        ← back to attendee details
      </button>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Payment</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Card form */}
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
        >
          <label className="text-xs uppercase tracking-wide text-slate-400">
            Card number
          </label>
          <input
            value={card}
            onChange={(e) => setCard(formatPan(e.target.value))}
            placeholder="4242 4242 4242 4242"
            inputMode="numeric"
            autoComplete="cc-number"
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />

          <label className="mt-4 block text-xs uppercase tracking-wide text-slate-400">
            Cardholder name
          </label>
          <input
            value={holder}
            onChange={(e) => setHolder(e.target.value.toUpperCase())}
            placeholder="JANE DOE"
            autoComplete="cc-name"
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Expiry (MM/YY)
              </label>
              <input
                value={exp}
                onChange={(e) => setExp(formatExp(e.target.value, exp))}
                placeholder="12/29"
                inputMode="numeric"
                maxLength={5}
                autoComplete="cc-exp"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">
                CVV
              </label>
              <input
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="123"
                inputMode="numeric"
                autoComplete="cc-csc"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-lg bg-sky-500 px-4 py-2.5 font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {busy ? "Processing…" : `Pay ${fmtMoney(state.total_cents, state.currency)}`}
          </button>
          {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
          <p className="mt-3 text-[11px] text-slate-500">
            Demo only — no real charge is made. Card details are stored against the
            order so the organiser/admin side can reconcile refunds.
          </p>
        </form>

        {/* Summary */}
        <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Order summary
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Tickets</dt>
              <dd className="font-medium">{state.holders.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Subtotal</dt>
              <dd className="font-medium">
                {fmtMoney(state.total_cents, state.currency)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-800 pt-2">
              <dt className="font-semibold text-white">Total</dt>
              <dd className="font-bold text-sky-300">
                {fmtMoney(state.total_cents, state.currency)}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </main>
  );
}
