import { ReactNode, useEffect, useState } from "react";
import { api, AUTH_CLEARED_EVENT, getToken, setToken } from "@/lib/api";
import { AuthContext, Me } from "@/lib/auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      setLoading(false);
      return;
    }
    api
      .get<Me>("/auth/me")
      .then((r) => setMe(r.data))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  // The 401 interceptor in api.ts clears the bearer token; mirror that
  // here so ``me`` resets too — otherwise the SPA shows the user as
  // signed-in until they reload.
  useEffect(() => {
    const onCleared = () => setMe(null);
    window.addEventListener(AUTH_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(AUTH_CLEARED_EVENT, onCleared);
  }, []);

  async function login(email: string, password: string): Promise<void> {
    const form = new URLSearchParams();
    form.set("username", email);
    form.set("password", password);
    const tokenRes = await api.post<{ access_token: string }>("/auth/token", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    setToken(tokenRes.data.access_token);
    const meRes = await api.get<Me>("/auth/me");
    setMe(meRes.data);
  }

  function logout(): void {
    setToken(null);
    setMe(null);
  }

  return (
    <AuthContext.Provider value={{ me, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
