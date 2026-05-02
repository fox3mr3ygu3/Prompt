import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiErr, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useDocumentTitle } from "@/lib/use-document-title";

/** Sign-up form. POSTs to /api/auth/register, then auto-logs-in via the
 *  same /auth/token endpoint so the new user lands signed-in on /. */
export function Register() {
  useDocumentTitle("Create account");
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (password.length < 8) {
        setErr("password must be at least 8 characters");
        return;
      }
      await api.post("/auth/register", {
        email,
        password,
        full_name: fullName,
      });
      // Auto-login so the user goes straight to a usable session.
      await login(email, password);
      nav("/");
    } catch (e: unknown) {
      const detail = (e as ApiErr).response?.data?.detail;
      setErr(detail ?? "registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16 text-slate-100">
      <h1 className="bg-gradient-to-br from-sky-300 to-indigo-400 bg-clip-text text-3xl font-extrabold text-transparent">
        Create your account
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Buy tickets, manage your bookings, and scan-in at the door.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          placeholder="Full name"
          autoComplete="name"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          placeholder="you@example.com"
          autoComplete="email"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          placeholder="Password (min 8 chars)"
          autoComplete="new-password"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-sky-500 px-3 py-2.5 font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {busy ? "Creating account…" : "Create account"}
        </button>
        {err && <p className="text-sm text-red-400">{err}</p>}
      </form>
      <p className="mt-6 text-sm text-slate-400">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-sky-300 hover:text-sky-200">
          Sign in
        </Link>
      </p>
    </main>
  );
}
