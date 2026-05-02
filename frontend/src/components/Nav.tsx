import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

export function Nav() {
  const { me, logout } = useAuth();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1 rounded ${isActive ? "bg-slate-700 text-white" : "text-slate-300 hover:text-white"}`;

  return (
    <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-bold tracking-tight text-white">
          quick-conf.app
        </Link>
        <div className="flex items-center gap-2">
          <NavLink to="/" end className={linkClass}>
            Browse
          </NavLink>
          {me && me.role === "attendee" && (
            <NavLink to="/me/tickets" className={linkClass}>
              My tickets
            </NavLink>
          )}
          {me && me.role === "organiser" && (
            <NavLink to="/org/events" className={linkClass}>
              My events
            </NavLink>
          )}
          {me && me.role === "gate" && (
            <NavLink to="/scan" className={linkClass}>
              Scan
            </NavLink>
          )}
          {me && me.role === "admin" && (
            <NavLink to="/admin" className={linkClass}>
              Admin
            </NavLink>
          )}
          {me ? (
            <button
              type="button"
              onClick={logout}
              className="ml-2 rounded bg-slate-800 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700"
            >
              Sign out ({me.email})
            </button>
          ) : (
            <NavLink to="/login" className={linkClass}>
              Sign in
            </NavLink>
          )}
        </div>
      </div>
    </nav>
  );
}
