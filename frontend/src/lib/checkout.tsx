import { ReactNode, useCallback, useEffect, useState } from "react";
import {
  CheckoutContext,
  CheckoutState,
  Holder,
  initialCheckout,
} from "@/lib/checkout-context";

const KEY = "qc.checkout";

function load(): CheckoutState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return initialCheckout;
    return { ...initialCheckout, ...(JSON.parse(raw) as CheckoutState) };
  } catch {
    return initialCheckout;
  }
}

function save(s: CheckoutState): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sessionStorage may throw in private mode; checkout still works in-memory.
  }
}

export function CheckoutProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CheckoutState>(load);

  useEffect(() => {
    save(state);
  }, [state]);

  const set = useCallback((patch: Partial<CheckoutState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setHolder = useCallback((idx: number, patch: Partial<Holder>) => {
    setState((prev) => {
      const holders = prev.holders.slice();
      const cur = holders[idx] ?? { seat_id: null, first_name: "", last_name: "" };
      holders[idx] = {
        seat_id: patch.seat_id !== undefined ? patch.seat_id : cur.seat_id,
        first_name: patch.first_name ?? cur.first_name,
        last_name: patch.last_name ?? cur.last_name,
      };
      return { ...prev, holders };
    });
  }, []);

  const reset = useCallback(() => {
    sessionStorage.removeItem(KEY);
    setState(initialCheckout);
  }, []);

  return (
    <CheckoutContext.Provider value={{ state, set, setHolder, reset }}>
      {children}
    </CheckoutContext.Provider>
  );
}
