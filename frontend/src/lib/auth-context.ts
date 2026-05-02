import { createContext, useContext } from "react";

export type Me = { id: string; email: string; full_name: string; role: string };

export type AuthCtx = {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside of AuthProvider");
  return ctx;
}
