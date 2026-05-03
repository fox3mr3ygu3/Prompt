import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import type { Me } from "@/lib/auth-context";

export function Nav() {
  const { me, logout } = useAuth();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile sheet whenever the route changes — feels broken
  // otherwise on phones (you tap a link, the underlying page swaps in,
  // but the menu sheet stays up).
  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);

  const primary = primaryLinksFor(me);

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Brand />

        <div className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {primary.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {me ? (
            <UserMenu me={me} onSignOut={logout} />
          ) : (
            <>
              <NavLink
                to="/login"
                className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white"
              >
                Sign in
              </NavLink>
              <NavLink
                to="/register"
                className="rounded-full bg-sky-500 px-3.5 py-1.5 text-sm font-semibold text-white shadow-[0_2px_12px_rgba(56,189,248,0.35)] transition hover:bg-sky-400"
              >
                Get started
              </NavLink>
            </>
          )}
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-slate-200 hover:bg-white/5 md:hidden"
          >
            <BurgerIcon open={mobileOpen} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/10 bg-slate-950/95 px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {primary.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 via-indigo-500 to-violet-500 text-base font-black text-white shadow-[0_4px_20px_rgba(99,102,241,0.45)]">
        q
      </span>
      <span className="text-base font-bold tracking-tight text-white">
        quick<span className="text-sky-400">·</span>conf
      </span>
    </Link>
  );
}

function BurgerIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      {open ? (
        <>
          <line x1="4" y1="4" x2="14" y2="14" />
          <line x1="14" y1="4" x2="4" y2="14" />
        </>
      ) : (
        <>
          <line x1="3" y1="5" x2="15" y2="5" />
          <line x1="3" y1="9" x2="15" y2="9" />
          <line x1="3" y1="13" x2="15" y2="13" />
        </>
      )}
    </svg>
  );
}

function UserMenu({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = userMenuItemsFor(me);
  const initials = initialsFor(me);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-1.5 py-1 pr-3 text-sm text-slate-200 transition hover:bg-white/10"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-[11px] font-bold text-white">
          {initials}
        </span>
        <span className="hidden max-w-[12ch] truncate sm:inline">
          {me.full_name || me.email}
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur"
        >
          <div className="border-b border-white/10 px-4 py-3">
            <div className="truncate text-sm font-semibold text-white">
              {me.full_name || me.email}
            </div>
            <div className="mt-0.5 truncate text-xs text-slate-400">{me.email}</div>
            <span className="mt-2 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-200">
              {me.role}
            </span>
          </div>
          <div className="py-1">
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                role="menuitem"
                className={({ isActive }) =>
                  `block px-4 py-2 text-sm transition ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-slate-200 hover:bg-white/5"
                  }`
                }
              >
                {it.label}
              </NavLink>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={onSignOut}
            className="block w-full border-t border-white/10 px-4 py-2.5 text-left text-sm text-rose-300 hover:bg-rose-500/10"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${open ? "rotate-180" : ""}`}
    >
      <polyline points="3 4.5 6 7.5 9 4.5" />
    </svg>
  );
}

type NavLinkSpec = { to: string; label: string; end?: boolean };

function primaryLinksFor(me: Me | null): NavLinkSpec[] {
  const links: NavLinkSpec[] = [{ to: "/", label: "Browse", end: true }];
  if (!me) return links;
  if (me.role === "attendee") {
    links.push({ to: "/me/tickets", label: "My tickets" });
  }
  if (me.role === "organiser") {
    links.push({ to: "/org/events", label: "My events" });
  }
  if (me.role === "gate") {
    links.push({ to: "/scan", label: "Scan" });
  }
  if (me.role === "admin") {
    links.push({ to: "/admin", label: "Admin" });
  }
  return links;
}

function userMenuItemsFor(me: Me): NavLinkSpec[] {
  const items: NavLinkSpec[] = [];
  if (me.role === "attendee" || me.role === "organiser") {
    items.push({ to: "/me/profile", label: "Profile" });
  }
  if (me.role === "attendee") {
    items.push({ to: "/me/tickets", label: "My tickets" });
  }
  if (me.role === "organiser") {
    items.push({ to: "/org/events", label: "My events" });
  }
  if (me.role === "gate") {
    items.push({ to: "/scan", label: "Scanner" });
  }
  if (me.role === "admin") {
    items.push({ to: "/admin", label: "Admin console" });
  }
  return items;
}

function initialsFor(me: Me): string {
  const source = (me.full_name || me.email).trim();
  const parts = source.split(/\s+|@/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
