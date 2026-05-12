export const SOLD_COLOR = "#343A46";
export const HELD_COLOR = "#C8A15A";
export const PICKED_COLOR = "#54D6CF";

// Tier colors: closer to stage = warmer and more expensive.
export const TIER_COLORS: Record<string, string> = {
  Front: "#FF6B4A",
  Middle: "#C8A15A",
  Back: "#9DCC71",
};

export const FREE_FALLBACK_COLOR = "#54D6CF";

export function tierColor(tierName: string | null | undefined): string {
  if (!tierName) return FREE_FALLBACK_COLOR;
  return TIER_COLORS[tierName] ?? FREE_FALLBACK_COLOR;
}
