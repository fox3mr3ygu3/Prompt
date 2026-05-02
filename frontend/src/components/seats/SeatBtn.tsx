import { CSSProperties } from "react";
import { Seat } from "@/lib/api";

export const SOLD_COLOR = "#3f3f46";
export const FREE_COLOR = "#0000AA";
export const HELD_COLOR = "#f59e0b";
export const PICKED_COLOR = "#22c55e";

/** A single clickable seat. Disabled when sold or held by someone else. */
export function SeatBtn({
  seat,
  isPicked,
  onClick,
  style,
}: {
  seat: Seat;
  isPicked: boolean;
  onClick: () => void;
  style?: CSSProperties;
}) {
  let bg = FREE_COLOR;
  let title = `Row ${seat.row_label} seat ${seat.col_number}`;
  let ringClass = "";
  let cursor = "cursor-pointer";

  if (seat.state === "sold") {
    bg = SOLD_COLOR;
    title = "Sold";
    cursor = "cursor-not-allowed";
  } else if (seat.state === "held") {
    bg = HELD_COLOR;
    title = "Held by someone else";
    cursor = "cursor-not-allowed";
  } else if (isPicked) {
    bg = PICKED_COLOR;
    title = `Selected · row ${seat.row_label} seat ${seat.col_number}`;
    ringClass = "ring-2 ring-emerald-300/80";
  }

  const disabled = seat.state !== "free";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ background: bg, ...style }}
      className={`m-[1px] inline-block h-7 w-7 rounded-md text-[10px] font-medium text-white shadow-[0_1px_0_rgba(0,0,0,0.35)] transition ${cursor} ${ringClass} ${
        disabled ? "opacity-90" : "hover:-translate-y-0.5 hover:brightness-110"
      }`}
    >
      {seat.col_number}
    </button>
  );
}

export function RowLabel({ label }: { label: string }) {
  return (
    <span className="inline-block w-6 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {label}
    </span>
  );
}

export function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded" style={{ background: color }} />
      <span>{label}</span>
    </span>
  );
}
