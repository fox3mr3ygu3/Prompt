import { CSSProperties } from "react";
import { Seat } from "@/lib/api";

export const SOLD_COLOR = "#3f3f46";
export const HELD_COLOR = "#f59e0b";
export const PICKED_COLOR = "#22c55e";

// Tier colors — closer to stage = warmer / more expensive. Free seats use
// the tier color so the price tier is visible at a glance on the hall.
export const TIER_COLORS: Record<string, string> = {
  Front: "#e11d48", // rose-600 — closest, priciest
  Middle: "#2563eb", // blue-600
  Back: "#0d9488", // teal-600 — back, cheapest
};

export const FREE_FALLBACK_COLOR = "#1d4ed8";

export function tierColor(tierName: string | null | undefined): string {
  if (!tierName) return FREE_FALLBACK_COLOR;
  return TIER_COLORS[tierName] ?? FREE_FALLBACK_COLOR;
}

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
    title = `Selected · ${seat.tier_name ?? "Seat"} · row ${seat.row_label} seat ${seat.col_number}${priceTag}`;
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
