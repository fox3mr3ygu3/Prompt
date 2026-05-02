import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { useDocumentTitle } from "@/lib/use-document-title";

export function Login() {
  useDocumentTitle("Sign in");
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("attendee@quick-conf.app");
  const [password, setPassword] = useState("demo1234");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(email, password);
      // Honour any redirect breadcrumb left by a route that bounced the
      // user here (e.g. ``/events/foo/seats`` → /login → back to seats).
      const target = sessionStorage.getItem("qc.redirect");
      if (target) {
        sessionStorage.removeItem("qc.redirect");
        nav(target);
      } else {
        nav("/");
      }
    } catch {
      setErr("invalid credentials");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16 text-slate-100">
      <h1 className="bg-gradient-to-br from-sky-300 to-indigo-400 bg-clip-text text-3xl font-extrabold text-transparent">
        Sign in
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Demo accounts are seeded. Password is <code className="rounded bg-slate-800 px-1.5 py-0.5">demo1234</code>.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          placeholder="email"
          autoComplete="email"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          placeholder="password"
          autoComplete="current-password"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-sky-500 px-3 py-2.5 font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {err && <p className="text-sm text-red-400">{err}</p>}
      </form>
      <p className="mt-6 text-sm text-slate-400">
        New here?{" "}
        <Link to="/register" className="font-medium text-sky-300 hover:text-sky-200">
          Create an account
        </Link>
      </p>
    </main>
  );
}
