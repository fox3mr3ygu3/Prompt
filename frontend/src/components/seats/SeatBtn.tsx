import { CSSProperties } from "react";
import { Seat } from "@/lib/api";
import { cn } from "@/lib/cn";
import { HELD_COLOR, PICKED_COLOR, SOLD_COLOR, tierColor } from "./seat-colors";

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
  const priceTag = seat.price_cents
    ? ` — ${(seat.price_cents / 100).toFixed(0)} ${seat.currency}`
    : "";
  let bg = tierColor(seat.tier_name);
  let title = `${seat.tier_name ?? "Seat"} · row ${seat.row_label} seat ${seat.col_number}${priceTag}`;
  let ringClass = "ring-1 ring-black/25";
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
    title = `Selected · ${seat.tier_name ?? "Seat"} · row ${seat.row_label} seat ${seat.col_number}${priceTag}`;
    ringClass = "ring-2 ring-aqua/90 ring-offset-2 ring-offset-ink";
  }

  const disabled = seat.state !== "free";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isPicked}
      aria-label={title}
      title={title}
      style={{ background: bg, ...style }}
      className={cn(
        "m-[2px] inline-flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-black text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_8px_18px_rgba(0,0,0,0.26)] transition",
        cursor,
        ringClass,
        disabled ? "opacity-70 grayscale" : "hover:-translate-y-0.5 hover:brightness-110",
        seat.state === "sold" && "text-ivory-muted",
        seat.state === "held" && "text-ink",
      )}
    >
      {seat.col_number}
    </button>
  );
}

export function RowLabel({ label }: { label: string }) {
  return (
    <span className="inline-block w-7 text-center text-[10px] font-bold uppercase tracking-wider text-ivory-muted/70">
      {label}
    </span>
  );
}

export function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded ring-1 ring-black/20"
        style={{ background: color }}
      />
      <span>{label}</span>
    </span>
  );
}
