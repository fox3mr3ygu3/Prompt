import { Minus, Plus, Ticket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button, Panel } from "@/components/ui";

/** Quantity stepper for general-admission events (no seat map). */
export function GAPicker({
  tierPriceCents,
  tierCurrency,
  qty,
  onChange,
  min = 1,
  max = 20,
}: {
  tierPriceCents: number;
  tierCurrency: string;
  qty: number;
  onChange: (q: number) => void;
  min?: number;
  max?: number;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <Panel className="mt-6 p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-aqua/10 text-aqua">
          <Ticket aria-hidden className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-2xl font-bold text-ivory">General admission</h2>
          <p className="mt-1 text-sm text-ivory-muted">
            Pick a quantity ({min}–{max}). Seats are not assigned for this event.
          </p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <QtyButton
          onClick={() => onChange(clamp(qty - 1))}
          icon={Minus}
          label="Decrease quantity"
        />
        <input
          type="number"
          min={min}
          max={max}
          value={qty}
          onChange={(e) => {
            const n = parseInt(e.target.value || String(min), 10);
            onChange(Number.isFinite(n) ? clamp(n) : min);
          }}
          className="h-12 w-24 rounded-xl border border-ivory/12 bg-ink-2 text-center font-display text-xl font-bold text-ivory outline-none focus:border-aqua/70"
        />
        <QtyButton onClick={() => onChange(clamp(qty + 1))} icon={Plus} label="Increase quantity" />
        <div className="ml-0 text-sm font-semibold text-ivory-muted sm:ml-4">
          ×{" "}
          <span className="text-ivory">
            {(tierPriceCents / 100).toFixed(2)} {tierCurrency}
          </span>
        </div>
      </div>
    </Panel>
  );
}

function QtyButton({
  onClick,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant="secondary"
      className="h-12 w-12 p-0"
      aria-label={label}
    >
      <Icon aria-hidden className="h-5 w-5" />
    </Button>
  );
}
