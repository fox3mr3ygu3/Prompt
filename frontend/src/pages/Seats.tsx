import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, ShieldCheck, Ticket } from "lucide-react";
import { ApiErr, EventDetail as EventDetailT, Seat as SeatT, SeatMap, api } from "@/lib/api";
import { useCheckout } from "@/lib/checkout-context";
import { useAuth } from "@/lib/auth-context";
import { useDocumentTitle } from "@/lib/use-document-title";
import { fmtMoney } from "@/lib/format";
import { SeatedHall } from "@/components/seats/SeatedHall";
import { GAPicker } from "@/components/seats/GAPicker";
import { BackLink, Button, Field, LoadingState, PageShell, Panel } from "@/components/ui";
import { cn } from "@/lib/cn";

export function Seats() {
  const { slug = "" } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { me } = useAuth();
  const { set } = useCheckout();

  const { data: detail } = useQuery({
    queryKey: ["event", slug],
    queryFn: async () => (await api.get<EventDetailT>(`/events/${slug}`)).data,
    enabled: !!slug,
  });

  const { data: seatMap } = useQuery({
    queryKey: ["seats", slug],
    queryFn: async () => (await api.get<SeatMap>(`/events/${slug}/seats`)).data,
    enabled: !!slug && detail?.room.kind === "seated",
    refetchInterval: 30_000,
  });

  useDocumentTitle(detail ? `Pick seats — ${detail.title}` : "");

  // WebSocket — refresh seat map whenever someone holds/releases/sells a
  // seat. Capped exponential backoff on disconnect.
  useEffect(() => {
    if (!detail || detail.room.kind !== "seated") return;
    const wsUrl =
      (location.protocol === "https:" ? "wss://" : "ws://") +
      location.host +
      `/ws/events/${slug}/seats`;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        attempt = 0;
      };
      ws.onmessage = () => qc.invalidateQueries({ queryKey: ["seats", slug] });
      ws.onclose = () => {
        if (cancelled) return;
        const delay = Math.min(15_000, 500 * 2 ** attempt);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    };
  }, [detail, slug, qc]);

  const [picked, setPicked] = useState<string[]>([]);
  const [gaQty, setGaQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSeat(s: { id: string; state: string }) {
    if (s.state !== "free") return;
    setPicked((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]));
  }

  // For GA rooms there's still one effective price; for seated rooms each
  // picked seat carries its own tier price (closer rows cost more).
  const tier = detail?.price_tiers[0];
  const gaPriceCents = tier?.price_cents ?? 0;
  const currency = tier?.currency ?? seatMap?.seats[0]?.currency ?? "USD";

  const pickedSeats = useMemo<SeatT[]>(() => {
    if (!seatMap) return [];
    const set = new Set(picked);
    return seatMap.seats.filter((s) => set.has(s.id));
  }, [seatMap, picked]);

  const totalCents = useMemo(() => {
    if (!detail) return 0;
    if (detail.room.kind === "seated")
      return pickedSeats.reduce((acc, s) => acc + s.price_cents, 0);
    return gaPriceCents * gaQty;
  }, [detail, pickedSeats, gaQty, gaPriceCents]);

  const tierBreakdown = useMemo(() => {
    if (!detail || detail.room.kind !== "seated") return [];
    const counts = new Map<string, number>();
    for (const s of pickedSeats) {
      const k = s.tier_name ?? "Seat";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [detail, pickedSeats]);

  async function onContinue() {
    if (!detail) return;
    if (!me) {
      sessionStorage.setItem("qc.redirect", `/events/${slug}/seats`);
      nav("/login");
      return;
    }
    if (!tier) {
      setError("This event has no price tier configured.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const isSeated = detail.room.kind === "seated";
      const body = {
        seat_ids: isSeated ? picked : [],
        quantity: isSeated ? 0 : gaQty,
        price_tier_id: tier.id,
      };
      const r = await api.post<{ hold_token: string }>(`/events/${slug}/hold`, body);
      const holderCount = isSeated ? picked.length : gaQty;
      set({
        event_id: slug,
        hold_token: r.data.hold_token,
        seat_ids: isSeated ? picked.slice() : [],
        ga_quantity: isSeated ? 0 : gaQty,
        total_cents: totalCents,
        currency: tier.currency,
        holders: Array.from({ length: holderCount }, (_, i) => ({
          seat_id: isSeated ? (picked[i] ?? null) : null,
          first_name: "",
          last_name: "",
        })),
      });
      nav(`/events/${slug}/holders`);
    } catch (e: unknown) {
      const msg = (e as ApiErr).response?.data?.detail ?? "Could not hold seats";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!detail) return <LoadingState label="Loading seat selection" />;

  const isSeated = detail.room.kind === "seated";
  const canContinue = isSeated ? picked.length > 0 : gaQty > 0;

  return (
    <PageShell className="pb-36">
      <BackLink to={`/events/${slug}`}>Back to event</BackLink>
      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-aqua">
            ticket hold
          </p>
          <h1 className="font-display text-4xl font-bold leading-tight text-ivory sm:text-5xl">
            {detail.title}
          </h1>
          <p className="mt-2 text-sm font-semibold text-ivory-muted">
            {detail.venue.name} · {detail.venue.city} · {detail.room.name}
          </p>
        </div>
        <Panel className="p-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Mode" value={isSeated ? "Seat map" : "General"} />
            <Field label="Hold" value="5 min" />
            <Field
              label="Base"
              value={tier ? fmtMoney(tier.price_cents, tier.currency, { compact: true }) : "—"}
            />
          </div>
        </Panel>
      </div>

      <Panel className="mb-6 p-4">
        <div className="grid gap-3 text-sm text-ivory-muted sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="h-4 w-4 text-aqua" />
            Atomic hold prevents double-booking.
          </div>
          <div className="flex items-center gap-2">
            <Clock3 aria-hidden className="h-4 w-4 text-brass" />
            Price updates from selected seats.
          </div>
          <div className="flex items-center gap-2">
            <Ticket aria-hidden className="h-4 w-4 text-ember" />
            Named tickets are collected next.
          </div>
        </div>
      </Panel>

      {isSeated ? (
        <div className="mt-6">
          <SeatedHall seatMap={seatMap} picked={picked} onToggle={toggleSeat} />
        </div>
      ) : (
        <GAPicker
          tierPriceCents={gaPriceCents}
          tierCurrency={currency}
          qty={gaQty}
          onChange={setGaQty}
        />
      )}

      <ContinueBar
        isSeated={isSeated}
        pickedCount={picked.length}
        gaQty={gaQty}
        total={totalCents}
        currency={currency}
        tierBreakdown={tierBreakdown}
        canContinue={canContinue}
        busy={busy}
        error={error}
        onContinue={onContinue}
      />
    </PageShell>
  );
}

function ContinueBar({
  isSeated,
  pickedCount,
  gaQty,
  total,
  currency,
  tierBreakdown,
  canContinue,
  busy,
  error,
  onContinue,
}: {
  isSeated: boolean;
  pickedCount: number;
  gaQty: number;
  total: number;
  currency: string;
  tierBreakdown: [string, number][];
  canContinue: boolean;
  busy: boolean;
  error: string | null;
  onContinue: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ivory/10 bg-ink/90 px-4 py-3 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-semibold text-ivory-muted">
          {isSeated ? (
            <>
              Selected: <span className="font-bold text-ivory">{pickedCount}</span> seat
              {pickedCount === 1 ? "" : "s"}
              {tierBreakdown.length > 0 && (
                <span className="ml-2 text-xs text-ivory-muted">
                  ({tierBreakdown.map(([name, n]) => `${n} ${name}`).join(" · ")})
                </span>
              )}
            </>
          ) : (
            <>
              Quantity: <span className="font-bold text-ivory">{gaQty}</span>
            </>
          )}
          {total > 0 && (
            <>
              {" "}
              · Total <span className="font-bold text-aqua">{fmtMoney(total, currency)}</span>
            </>
          )}
        </div>
        <Button
          type="button"
          disabled={!canContinue || busy}
          onClick={onContinue}
          icon={Ticket}
          className={cn("w-full sm:w-auto", !canContinue && "shadow-none")}
        >
          {busy ? "Holding seats" : "Continue"}
        </Button>
      </div>
      {error && (
        <p className="mx-auto mt-2 max-w-7xl rounded-xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-sm font-semibold text-red-100">
          {error}
        </p>
      )}
    </div>
  );
}
