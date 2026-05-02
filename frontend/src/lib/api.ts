import axios, { AxiosError, AxiosInstance } from "axios";

const TOKEN_KEY = "qc.token";

/** Dispatched on 401 so the AuthProvider can clear its in-memory ``me``. */
export const AUTH_CLEARED_EVENT = "qc:auth-cleared";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string | null): void {
  if (t === null) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, t);
}

export const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? "/api",
  timeout: 10_000,
});

api.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t && cfg.headers) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (e: AxiosError) => {
    if (e.response?.status === 401) {
      setToken(null);
      window.dispatchEvent(new Event(AUTH_CLEARED_EVENT));
    }
    return Promise.reject(e);
  },
);

/** Shape of FastAPI's ``HTTPException`` body. Reused across pages that
 *  show a server-side error message in the UI. */
export type ApiErr = { response?: { data?: { detail?: string } } };

// ── Domain types ────────────────────────────────────────────────────────────

export type Category = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  parent_id: string | null;
};

export type CategoryTreeNode = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  children: Category[];
};

export type EventListItem = {
  id: string;
  slug: string;
  title: string;
  cover_image_url: string;
  starts_at: string;
  ends_at: string;
  status: string;
  tags: string[];
  venue_name: string | null;
  venue_city: string | null;
  category_slug: string | null;
  category_name: string | null;
  category_icon: string | null;
  min_price_cents: number;
  max_price_cents: number;
};

export type PriceTier = {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  capacity: number;
};

export type EventDetail = {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover_image_url: string;
  starts_at: string;
  ends_at: string;
  status: string;
  tags: string[];
  venue: { id: string; name: string; city: string; country: string };
  room: {
    id: string;
    name: string;
    kind: "general" | "seated";
    capacity: number;
    rows: number;
    cols: number;
  };
  category: { id: string; slug: string; name: string; icon: string; parent_id: string | null } | null;
  price_tiers: PriceTier[];
  speakers: { id: string; name: string; affiliation: string }[];
};

export type Seat = {
  id: string;
  row_label: string;
  col_number: number;
  state: "free" | "held" | "sold";
};

export type SeatMap = {
  event_id: string;
  room: EventDetail["room"];
  seats: Seat[];
};

/** Slim shape returned by the order-create endpoint. */
export type Ticket = {
  id: string;
  event_id: string;
  seat_id: string | null;
  first_name: string;
  last_name: string;
  status: string;
  issued_at: string;
  qr_payload: string | null;
};

/** Enriched shape for /me/tickets — every render-able field is materialised
 *  by the backend SQL join, so the page does not need a second round trip. */
export type MyTicket = {
  id: string;
  event_id: string;
  event_title: string;
  event_starts_at: string;
  venue_name: string;
  venue_city: string;
  room_name: string;
  seat_label: string | null;
  first_name: string;
  last_name: string;
  status: string;
  issued_at: string;
  price_cents: number;
  currency: string;
};

export type Order = {
  id: string;
  event_id: string;
  status: string;
  total_cents: number;
  currency: string;
  paid_at: string | null;
  card_last4: string | null;
  card_brand: string | null;
  tickets: Ticket[];
};

export type DashboardKPI = {
  organisation_id: string;
  event_count: number;
  tickets_sold: number;
  tickets_scanned: number;
  gross_cents: number;
  refunds_cents: number;
  refreshed_at: string;
};

export type OrgEvent = {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  venue_name: string;
  venue_city: string;
  room_name: string;
  status: string;
  attendee_count: number;
  scanned_count: number;
  capacity: number;
  gross_cents: number;
  currency: string;
};

export type Attendee = {
  ticket_id: string;
  order_id: string;
  seat_label: string | null;
  first_name: string;
  last_name: string;
  buyer_email: string;
  status: string;
  issued_at: string;
};

export type AdminTicket = {
  ticket_id: string;
  order_id: string;
  event_title: string;
  event_slug: string;
  buyer_email: string;
  buyer_full_name: string;
  holder_first_name: string;
  holder_last_name: string;
  seat_label: string | null;
  price_cents: number;
  currency: string;
  ticket_status: string;
  order_status: string;
  issued_at: string;
};

export type ScanResult = {
  result: "ok" | "replay" | "invalid";
  ticket_id: string | null;
  event_id: string | null;
  detail: string;
};

export type ProposalStatus = "pending" | "approved" | "rejected";

export type EventProposal = {
  id: string;
  organisation_id: string;
  submitted_by_user_id: string;
  title: string;
  description: string;
  city: string;
  venue_name: string;
  tags: string[];
  cover_image_url: string;
  seats: number;
  price_cents: number;
  currency: string;
  category_slug: string;
  starts_at: string;
  ends_at: string;
  status: ProposalStatus;
  reject_reason: string;
  created_at: string;
  decided_at: string | null;
  decided_by_user_id: string | null;
  created_event_id: string | null;
  organisation_name: string | null;
  submitter_email: string | null;
};

export type EventProposalCreate = {
  title: string;
  description: string;
  city: string;
  venue_name: string;
  tags: string[];
  cover_image_url: string;
  seats: number;
  price_cents: number;
  currency: string;
  category_slug: string;
  starts_at: string;
  ends_at: string;
};
