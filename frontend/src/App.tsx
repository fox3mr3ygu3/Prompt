import { Navigate, Route, Routes } from "react-router-dom";
import { Nav } from "@/components/Nav";
import { useAuth } from "@/lib/auth-context";
import { Browse } from "@/pages/Browse";
import { EventDetail } from "@/pages/EventDetail";
import { Seats } from "@/pages/Seats";
import { Holders } from "@/pages/Holders";
import { Payment } from "@/pages/Payment";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { MyTickets } from "@/pages/MyTickets";
import { OrgEvents } from "@/pages/OrgEvents";
import { OrgAttendees } from "@/pages/OrgAttendees";
import { Admin } from "@/pages/Admin";
import { GateScan } from "@/pages/GateScan";

function Private({ children }: { children: JSX.Element }) {
  const { me, loading } = useAuth();
  if (loading) return <p className="p-8 text-slate-500">Loading…</p>;
  if (!me) return <Navigate to="/login" replace />;
  return children;
}

function RoleGuard({
  roles,
  children,
}: {
  roles: string[];
  children: JSX.Element;
}) {
  const { me, loading } = useAuth();
  if (loading) return <p className="p-8 text-slate-500">Loading…</p>;
  if (!me) return <Navigate to="/login" replace />;
  // Admin always passes — mirrors backend RBAC semantics.
  if (me.role !== "admin" && !roles.includes(me.role)) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-slate-100">
        <h1 className="text-2xl font-bold">Forbidden</h1>
        <p className="mt-2 text-slate-400">
          This page is restricted to {roles.join(", ")} accounts.
        </p>
      </main>
    );
  }
  return children;
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <Routes>
        <Route path="/" element={<Browse />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/events/:slug" element={<EventDetail />} />
        <Route path="/events/:slug/seats" element={<Seats />} />
        <Route
          path="/events/:slug/holders"
          element={
            <Private>
              <Holders />
            </Private>
          }
        />
        <Route
          path="/events/:slug/payment"
          element={
            <Private>
              <Payment />
            </Private>
          }
        />
        <Route
          path="/me/tickets"
          element={
            <Private>
              <MyTickets />
            </Private>
          }
        />
        <Route
          path="/org/events"
          element={
            <RoleGuard roles={["organiser"]}>
              <OrgEvents />
            </RoleGuard>
          }
        />
        <Route
          path="/org/events/:slug/attendees"
          element={
            <RoleGuard roles={["organiser"]}>
              <OrgAttendees />
            </RoleGuard>
          }
        />
        <Route
          path="/admin"
          element={
            <RoleGuard roles={["admin"]}>
              <Admin />
            </RoleGuard>
          }
        />
        <Route
          path="/scan"
          element={
            <RoleGuard roles={["gate"]}>
              <GateScan />
            </RoleGuard>
          }
        />
      </Routes>
    </div>
  );
}
