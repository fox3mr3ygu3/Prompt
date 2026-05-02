import { createContext, useContext } from "react";

/** Multi-step checkout state, mirrored to sessionStorage so a refresh
 *  (or a back-nav and re-entry) doesn't lose what the user picked. */
export type Holder = {
  seat_id: string | null;
  first_name: string;
  last_name: string;
};

export type CheckoutState = {
  event_id: string | null;
  hold_token: string | null;
  /** Picked seat IDs in the order the user clicked them. Empty for GA. */
  seat_ids: string[];
  /** GA-only: number of tickets being booked. 0 for seated. */
  ga_quantity: number;
  /** Total price in cents (seat count × tier price), captured at hold time. */
  total_cents: number;
  currency: string;
  /** Per-seat (or per-quantity slot) holder details. Length = seat_ids.length || ga_quantity. */
  holders: Holder[];
};

export type CheckoutCtx = {
  state: CheckoutState;
  reset: () => void;
  set: (patch: Partial<CheckoutState>) => void;
  setHolder: (idx: number, patch: Partial<Holder>) => void;
};

export const initialCheckout: CheckoutState = {
  event_id: null,
  hold_token: null,
  seat_ids: [],
  ga_quantity: 0,
  total_cents: 0,
  currency: "USD",
  holders: [],
};

export const CheckoutContext = createContext<CheckoutCtx | null>(null);

export function useCheckout(): CheckoutCtx {
  const ctx = useContext(CheckoutContext);
  if (!ctx) throw new Error("useCheckout outside of CheckoutProvider");
  return ctx;
}
