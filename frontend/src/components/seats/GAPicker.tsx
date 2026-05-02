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
    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-lg font-semibold">General admission</h2>
      <p className="mt-1 text-sm text-slate-400">
        Pick a quantity ({min}–{max}). Seats are not assigned for this event.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <QtyButton onClick={() => onChange(clamp(qty - 1))} symbol="−" />
        <input
          type="number"
          min={min}
          max={max}
          value={qty}
          onChange={(e) => {
            const n = parseInt(e.target.value || String(min), 10);
            onChange(Number.isFinite(n) ? clamp(n) : min);
          }}
          className="h-10 w-20 rounded-lg border border-slate-800 bg-slate-900 text-center text-white"
        />
        <QtyButton onClick={() => onChange(clamp(qty + 1))} symbol="+" />
        <div className="ml-4 text-sm text-slate-400">
          ×{" "}
          <span className="text-white">
            {(tierPriceCents / 100).toFixed(2)} {tierCurrency}
          </span>
        </div>
      </div>
    </div>
  );
}

function QtyButton({ onClick, symbol }: { onClick: () => void; symbol: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-10 w-10 rounded-lg border border-slate-800 bg-slate-900 text-xl text-white hover:border-slate-600"
    >
      {symbol}
    </button>
  );
}
