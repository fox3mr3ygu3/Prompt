import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useDocumentTitle } from "@/lib/use-document-title";
import { Button, PageShell, Panel, TextInput } from "@/components/ui";

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
    <PageShell narrow className="grid min-h-[calc(100vh-90px)] place-items-center">
      <Panel className="w-full max-w-md p-6 sm:p-7">
        <div className="mb-6">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-aqua/20 bg-aqua/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-aqua">
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
            demo ready
          </p>
          <h1 className="font-display text-4xl font-bold text-ivory">Sign in</h1>
          <p className="mt-2 text-sm leading-6 text-ivory-muted">
            Demo accounts are seeded. Password is{" "}
            <code className="rounded bg-ink-2 px-1.5 py-0.5 text-ivory">demo1234</code>.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            autoComplete="email"
            icon={Mail}
          />
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            autoComplete="current-password"
            icon={LockKeyhole}
          />
          <Button type="submit" disabled={busy} className="w-full" icon={ArrowRight}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          {err && <p className="text-sm font-semibold text-red-200">{err}</p>}
        </form>
        <p className="mt-6 text-sm text-ivory-muted">
          New here?{" "}
          <Link to="/register" className="font-bold text-aqua hover:text-[#7ce4de]">
            Create an account
          </Link>
        </p>
      </Panel>
    </PageShell>
  );
}
