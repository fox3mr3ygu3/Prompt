import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, Mail, UserRound } from "lucide-react";
import { ApiErr, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useDocumentTitle } from "@/lib/use-document-title";
import { Button, PageShell, Panel, TextInput } from "@/components/ui";

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
    <PageShell narrow className="grid min-h-[calc(100vh-90px)] place-items-center">
      <Panel className="w-full max-w-md p-6 sm:p-7">
        <div className="mb-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-aqua">
            attendee access
          </p>
          <h1 className="font-display text-4xl font-bold text-ivory">Create your account</h1>
          <p className="mt-2 text-sm leading-6 text-ivory-muted">
            Buy tickets, manage your bookings, and scan in at the door.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <TextInput
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            placeholder="Full name"
            autoComplete="name"
            icon={UserRound}
          />
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            autoComplete="email"
            icon={Mail}
          />
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="Password (min 8 chars)"
            autoComplete="new-password"
            icon={LockKeyhole}
          />
          <Button type="submit" disabled={busy} className="w-full" icon={ArrowRight}>
            {busy ? "Creating account…" : "Create account"}
          </Button>
          {err && <p className="text-sm font-semibold text-red-200">{err}</p>}
        </form>
        <p className="mt-6 text-sm text-ivory-muted">
          Already have an account?{" "}
          <Link to="/login" className="font-bold text-aqua hover:text-[#7ce4de]">
            Sign in
          </Link>
        </p>
      </Panel>
    </PageShell>
  );
}
