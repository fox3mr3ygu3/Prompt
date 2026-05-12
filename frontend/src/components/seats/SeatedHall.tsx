import { useMemo } from "react";
import { Seat, SeatMap } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { RowLabel, SeatBtn, Swatch } from "./SeatBtn";
import { HELD_COLOR, PICKED_COLOR, SOLD_COLOR, TIER_COLORS } from "./seat-colors";
import { Panel } from "@/components/ui";

/** Render the seated hall: stage at top, then rows of labelled seats.
 *  Seats are colored by their price tier — closer to the stage costs more,
 *  and the legend lists every tier with its current price. */
export function SeatedHall({
  seatMap,
  picked,
  onToggle,
}: {
  seatMap: SeatMap | undefined;
  picked: string[];
  onToggle: (s: Seat) => void;
}) {
  const grid = useMemo(() => {
    if (!seatMap) return null;
    const byRow = new Map<string, Seat[]>();
    for (const s of seatMap.seats) {
      const arr = byRow.get(s.row_label) ?? [];
      arr.push(s);
      byRow.set(s.row_label, arr);
    }
    return [...byRow.entries()]
      .map(([row, seats]): [string, Seat[]] => [
        row,
        seats.slice().sort((a, b) => a.col_number - b.col_number),
      ])
      .sort(([a], [b]) => a.localeCompare(b));
  }, [seatMap]);

  const tierSummary = useMemo(() => {
    if (!seatMap) return [] as { name: string; price_cents: number; currency: string }[];
    const seen = new Map<string, { name: string; price_cents: number; currency: string }>();
    for (const s of seatMap.seats) {
      if (!s.tier_name || seen.has(s.tier_name)) continue;
      seen.set(s.tier_name, {
        name: s.tier_name,
        price_cents: s.price_cents,
        currency: s.currency,
      });
    }
    const order = ["Front", "Middle", "Back"];
    return [...seen.values()].sort(
      (a, b) =>
        (order.indexOf(a.name) === -1 ? 99 : order.indexOf(a.name)) -
        (order.indexOf(b.name) === -1 ? 99 : order.indexOf(b.name)),
    );
  }, [seatMap]);

  if (!seatMap || !grid) return <Panel className="p-6 text-ivory-muted">Loading seat map…</Panel>;

  return (
    <div className="overflow-x-auto rounded-[1.75rem] border border-ivory/12 bg-ink-2/72 p-5 shadow-2xl">
      <Stage roomName={seatMap.room.name} />

      <div className="mx-auto inline-block min-w-full rounded-3xl bg-ticket-grid bg-[length:34px_34px] px-2 py-5 text-center">
        {grid.map(([row, seats], rowIdx) => {
          const cols = seats.length;
          const middle = (cols - 1) / 2;
          const aisleAt = Math.floor(cols / 2);

          return (
            <div key={row} className="my-1.5 flex items-center justify-center gap-1">
              <RowLabel label={row} />
              {seats.map((s, colIdx) => {
                const arc = Math.pow(Math.abs(colIdx - middle) / middle || 0, 2) * 8;
                const tx = `translateY(${arc + rowIdx * 0.4}px)`;
                const showAisle = colIdx === aisleAt;
                const isPicked = picked.includes(s.id);
                return (
                  <span key={s.id} className="inline-flex items-center">
                    {showAisle && <span className="inline-block w-5" aria-hidden />}
                    <SeatBtn
                      seat={s}
                      isPicked={isPicked}
                      onClick={() => onToggle(s)}
                      style={{ transform: tx }}
                    />
                  </span>
                );
              })}
              <RowLabel label={row} />
            </div>
          );
        })}
      </div>

      <TierLegend tiers={tierSummary} />
      <HallStateLegend />
    </div>
  );
}

function Stage({ roomName }: { roomName: string }) {
  return (
    <div className="mx-auto w-[min(520px,92%)]">
      <div
        className="mx-auto h-14 rounded-t-[2rem] bg-gradient-to-b from-aqua/80 to-aqua/18 text-center text-xs font-black uppercase leading-[3.5rem] tracking-[0.42em] text-ink shadow-glow"
        style={{ clipPath: "polygon(8% 0, 92% 0, 100% 100%, 0 100%)" }}
      >
        Stage
      </div>
      <div className="mx-auto mb-2 h-[2px] w-2/3 bg-gradient-to-r from-transparent via-aqua/45 to-transparent" />
      <div className="mb-4 text-center text-xs font-bold uppercase tracking-[0.3em] text-ivory-muted">
        {roomName}
      </div>
    </div>
  );
}

function TierLegend({
  tiers,
}: {
  tiers: { name: string; price_cents: number; currency: string }[];
}) {
  if (tiers.length === 0) return null;
  return (
    <div className="mx-auto mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-ivory-muted">
      {tiers.map((t) => (
        <span key={t.name} className="inline-flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded"
            style={{ background: TIER_COLORS[t.name] ?? "#54D6CF" }}
          />
          <span className="font-bold text-ivory">{t.name}</span>
          <span className="text-ivory-muted">{fmtMoney(t.price_cents, t.currency)}</span>
        </span>
      ))}
    </div>
  );
}

function HallStateLegend() {
  return (
    <div className="mx-auto mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-ivory/10 pt-4 text-xs font-semibold text-ivory-muted">
      <Swatch label="Selected" color={PICKED_COLOR} />
      <Swatch label="Held" color={HELD_COLOR} />
      <Swatch label="Sold" color={SOLD_COLOR} />
    </div>
  );
}
