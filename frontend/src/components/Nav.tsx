import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  ChevronDown,
  LayoutGrid,
  LogOut,
  Menu,
  ScanLine,
  ShieldCheck,
  Ticket,
  User,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button, LinkButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth-context";
import type { Me } from "@/lib/auth-context";

export function Nav() {
  const { me, logout } = useAuth();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);

  const primary = primaryLinksFor(me);

  return (
    <nav className="sticky top-0 z-40 border-b border-ivory/10 bg-ink/78 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Brand />

        <div className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {primary.map((l) => (
            <PrimaryNavItem key={l.to} item={l} />
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {me ? (
            <UserMenu me={me} onSignOut={logout} />
          ) : (
            <>
              <LinkButton to="/login" variant="ghost" size="sm">
                Sign in
              </LinkButton>
              <LinkButton to="/register" size="sm" icon={Ticket}>
                Get started
              </LinkButton>
            </>
          )}
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="ml-1 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-ivory/12 bg-ivory/6 text-ivory transition hover:bg-ivory/10 md:hidden"
          >
            {mobileOpen ? (
              <X aria-hidden className="h-5 w-5" />
            ) : (
              <Menu aria-hidden className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-ivory/10 bg-ink/96 px-4 py-3 shadow-2xl md:hidden">
          <div className="flex flex-col gap-1">
            {primary.map((l) => (
              <PrimaryNavItem key={l.to} item={l} mobile />
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-3">
      <span className="relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-aqua/30 bg-aqua/12 text-sm font-black text-aqua shadow-glow">
        <span className="absolute inset-x-1 top-1 h-px bg-aqua/60" />
        qc
      </span>
      <span className="leading-none">
        <span className="block font-display text-lg font-bold tracking-normal text-ivory">
          quick-conf
        </span>
        <span className="hidden text-[10px] font-bold uppercase tracking-[0.26em] text-ivory-muted sm:block">
          live ticket ops
        </span>
      </span>
    </Link>
  );
}

function PrimaryNavItem({ item, mobile = false }: { item: NavLinkSpec; mobile?: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "inline-flex items-center gap-2 rounded-xl text-sm font-bold transition",
          mobile ? "px-3 py-2.5" : "px-3 py-2",
          isActive
            ? "bg-ivory text-ink shadow-brass"
            : "text-ivory-muted hover:bg-ivory/8 hover:text-ivory",
        )
      }
    >
      {Icon && <Icon aria-hidden className="h-4 w-4" />}
      {item.label}
    </NavLink>
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
        className="flex items-center gap-2 rounded-2xl border border-ivory/12 bg-ivory/7 px-1.5 py-1 pr-3 text-sm font-semibold text-ivory transition hover:bg-ivory/12"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brass/18 text-[11px] font-black text-brass">
          {initials}
        </span>
        <span className="hidden max-w-[12ch] truncate sm:inline">{me.full_name || me.email}</span>
        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 text-ivory-muted transition", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="glass-panel absolute right-0 mt-2 w-72 overflow-hidden rounded-2xl"
        >
          <div className="border-b border-ivory/10 px-4 py-4">
            <div className="truncate text-sm font-bold text-ivory">{me.full_name || me.email}</div>
            <div className="mt-0.5 truncate text-xs text-ivory-muted">{me.email}</div>
            <span className="mt-3 inline-flex rounded-full border border-aqua/20 bg-aqua/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-aqua">
              {me.role}
            </span>
          </div>
          <div className="py-1.5">
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <NavLink
                  key={it.to}
                  to={it.to}
                  role="menuitem"
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition",
                      isActive
                        ? "bg-ivory/12 text-ivory"
                        : "text-ivory-muted hover:bg-ivory/8 hover:text-ivory",
                    )
                  }
                >
                  {Icon && <Icon aria-hidden className="h-4 w-4" />}
                  {it.label}
                </NavLink>
              );
            })}
          </div>
          <div className="border-t border-ivory/10 p-2">
            <Button
              type="button"
              role="menuitem"
              onClick={onSignOut}
              variant="danger"
              size="sm"
              icon={LogOut}
              className="w-full justify-start"
            >
              Sign out
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

type NavLinkSpec = { to: string; label: string; end?: boolean; icon?: LucideIcon };

function primaryLinksFor(me: Me | null): NavLinkSpec[] {
  const links: NavLinkSpec[] = [{ to: "/", label: "Browse", end: true, icon: LayoutGrid }];
  if (!me) return links;
  if (me.role === "attendee") {
    links.push({ to: "/me/tickets", label: "Tickets", icon: Ticket });
  }
  if (me.role === "organiser") {
    links.push({ to: "/org/events", label: "Organizer", icon: BarChart3 });
  }
  if (me.role === "gate") {
    links.push({ to: "/scan", label: "Gate scan", icon: ScanLine });
  }
  if (me.role === "admin") {
    links.push({ to: "/admin", label: "Admin", icon: ShieldCheck });
  }
  return links;
}

function userMenuItemsFor(me: Me): NavLinkSpec[] {
  const items: NavLinkSpec[] = [];
  if (me.role === "attendee" || me.role === "organiser") {
    items.push({ to: "/me/profile", label: "Profile", icon: User });
  }
  if (me.role === "attendee") {
    items.push({ to: "/me/tickets", label: "My tickets", icon: Ticket });
  }
  if (me.role === "organiser") {
    items.push({ to: "/org/events", label: "My events", icon: BarChart3 });
  }
  if (me.role === "gate") {
    items.push({ to: "/scan", label: "Scanner", icon: ScanLine });
  }
  if (me.role === "admin") {
    items.push({ to: "/admin", label: "Admin console", icon: ShieldCheck });
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
