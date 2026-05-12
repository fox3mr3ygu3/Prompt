import { FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CreditCard, LockKeyhole, Receipt, ShieldCheck } from "lucide-react";
import { ApiErr, api, Order } from "@/lib/api";
import { useCheckout } from "@/lib/checkout-context";
import { useDocumentTitle } from "@/lib/use-document-title";
import { fmtMoney } from "@/lib/format";
import { BackLink, Button, Field, PageHeader, PageShell, Panel, TextInput } from "@/components/ui";

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
      <PageShell narrow>
        <Panel className="p-6">
          <p className="text-ivory-muted">Your hold expired. Start over from the event page.</p>
          <Button type="button" onClick={() => nav(`/events/${slug}`)} className="mt-4">
            Back to event
          </Button>
        </Panel>
      </PageShell>
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
    <PageShell narrow>
      <BackLink to={`/events/${slug}/holders`}>Back to attendee details</BackLink>
      <PageHeader
        eyebrow="checkout 03"
        title="Payment"
        description="Demo payment is validated in the app flow and then atomically converts the hold into issued tickets."
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Card form */}
        <form onSubmit={onSubmit} className="glass-panel rounded-2xl p-5">
          <div className="mb-5 rounded-2xl border border-ivory/12 bg-gradient-to-br from-ivory/12 to-aqua/8 p-5">
            <div className="flex items-center justify-between">
              <CreditCard aria-hidden className="h-6 w-6 text-aqua" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-ivory-muted">
                mock secure
              </span>
            </div>
            <div className="mt-8 font-mono text-xl font-bold tracking-[0.16em] text-ivory">
              {card || "4242 4242 4242 4242"}
            </div>
            <div className="mt-5 flex items-end justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-ivory-muted">
                  Holder
                </div>
                <div className="mt-1 truncate text-sm font-bold text-ivory">
                  {holder || "JANE DOE"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-ivory-muted">
                  Exp
                </div>
                <div className="mt-1 text-sm font-bold text-ivory">{exp || "12/29"}</div>
              </div>
            </div>
          </div>

          <TextInput
            label="Card number"
            value={card}
            onChange={(e) => setCard(formatPan(e.target.value))}
            placeholder="4242 4242 4242 4242"
            inputMode="numeric"
            autoComplete="cc-number"
            icon={CreditCard}
            inputClassName="font-mono"
          />

          <TextInput
            label="Cardholder name"
            value={holder}
            onChange={(e) => setHolder(e.target.value.toUpperCase())}
            placeholder="JANE DOE"
            autoComplete="cc-name"
            className="mt-4"
          />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <TextInput
              label="Expiry"
              value={exp}
              onChange={(e) => setExp(formatExp(e.target.value, exp))}
              placeholder="12/29"
              inputMode="numeric"
              maxLength={5}
              autoComplete="cc-exp"
              icon={LockKeyhole}
            />
            <TextInput
              label="CVV"
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="123"
              inputMode="numeric"
              autoComplete="cc-csc"
              icon={ShieldCheck}
            />
          </div>

          <Button type="submit" disabled={busy} className="mt-6 w-full" icon={ArrowRight}>
            {busy ? "Processing…" : `Pay ${fmtMoney(state.total_cents, state.currency)}`}
          </Button>
          {err && (
            <p className="mt-3 rounded-xl border border-red-300/24 bg-red-400/12 px-3 py-2 text-sm font-semibold text-red-100">
              {err}
            </p>
          )}
          <p className="mt-3 text-xs leading-5 text-ivory-muted">
            Demo only — no real charge is made. Card details are stored against the order so the
            organiser/admin side can reconcile refunds.
          </p>
        </form>

        {/* Summary */}
        <Panel className="h-fit p-5">
          <div className="flex items-center gap-2">
            <Receipt aria-hidden className="h-5 w-5 text-brass" />
            <h2 className="font-display text-2xl font-bold text-ivory">Order summary</h2>
          </div>
          <div className="mt-5 space-y-4">
            <Field label="Tickets" value={state.holders.length.toLocaleString()} />
            <Field label="Subtotal" value={fmtMoney(state.total_cents, state.currency)} />
            <div className="border-t border-ivory/10 pt-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-ivory-muted">
                Total
              </div>
              <div className="mt-1 font-display text-3xl font-bold text-aqua">
                {fmtMoney(state.total_cents, state.currency)}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
