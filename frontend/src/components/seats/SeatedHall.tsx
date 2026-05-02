import { useMemo } from "react";
import { Seat, SeatMap } from "@/lib/api";
import {
  FREE_COLOR,
  HELD_COLOR,
  PICKED_COLOR,
  RowLabel,
  SOLD_COLOR,
  SeatBtn,
  Swatch,
} from "./SeatBtn";

/** Render the seated hall: stage at top, then rows of labelled seats.
 *  Every seat in an event costs the same, so the hall is one uniform
 *  block with a small free/picked/held/sold legend. */
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

  if (!seatMap || !grid)
    return <p className="text-slate-400">Loading seat map…</p>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/60 to-slate-900/20 p-5">
      <Stage roomName={seatMap.room.name} />

      <div className="mx-auto inline-block min-w-full text-center">
        {grid.map(([row, seats], rowIdx) => {
          const cols = seats.length;
          const middle = (cols - 1) / 2;
          const aisleAt = Math.floor(cols / 2);

          return (
            <div key={row} className="my-1 flex items-center justify-center gap-1">
              <RowLabel label={row} />
              {seats.map((s, colIdx) => {
                const arc =
                  Math.pow(Math.abs(colIdx - middle) / middle || 0, 2) * 8;
                const tx = `translateY(${arc + rowIdx * 0.4}px)`;
                const showAisle = colIdx === aisleAt;
                const isPicked = picked.includes(s.id);
                return (
                  <span key={s.id} className="inline-flex items-center">
                    {showAisle && (
                      <span className="inline-block w-4" aria-hidden />
                    )}
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

      <HallStateLegend />
    </div>
  );
}

function Stage({ roomName }: { roomName: string }) {
  return (
    <div className="mx-auto w-[min(420px,90%)]">
      <div
        className="mx-auto h-12 rounded-t-3xl bg-gradient-to-b from-sky-500/70 to-sky-500/20 text-center text-xs font-semibold uppercase leading-[3rem] tracking-[0.4em] text-white shadow-[0_8px_30px_rgba(56,189,248,0.25)]"
        style={{ clipPath: "polygon(8% 0, 92% 0, 100% 100%, 0 100%)" }}
      >
        ▼ STAGE ▼
      </div>
      <div className="mx-auto mb-2 h-[2px] w-2/3 bg-gradient-to-r from-transparent via-sky-500/40 to-transparent" />
      <div className="mb-4 text-center text-xs uppercase tracking-[0.3em] text-slate-500">
        {roomName}
      </div>
    </div>
  );
}

function HallStateLegend() {
  return (
    <div className="mx-auto mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-slate-800 pt-4 text-xs text-slate-400">
      <Swatch label="Available" color={FREE_COLOR} />
      <Swatch label="Selected" color={PICKED_COLOR} />
      <Swatch label="Held" color={HELD_COLOR} />
      <Swatch label="Sold" color={SOLD_COLOR} />
    </div>
  );
}
