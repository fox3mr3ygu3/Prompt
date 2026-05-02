import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiErr,
  EventDetail as EventDetailT,
  SeatMap,
  api,
} from "@/lib/api";
import { useCheckout } from "@/lib/checkout-context";
import { useAuth } from "@/lib/auth-context";
import { useDocumentTitle } from "@/lib/use-document-title";
import { fmtMoney } from "@/lib/format";
import { SeatedHall } from "@/components/seats/SeatedHall";
import { GAPicker } from "@/components/seats/GAPicker";

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
      ws.onmessage = () =>
        qc.invalidateQueries({ queryKey: ["seats", slug] });
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
    setPicked((cur) =>
      cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id],
    );
  }

  const tier = detail?.price_tiers[0];
  const seatPriceCents = tier?.price_cents ?? 0;
  const currency = tier?.currency ?? "USD";

  const totalCents = useMemo(() => {
    if (!detail) return 0;
    if (detail.room.kind === "seated") return picked.length * seatPriceCents;
    return seatPriceCents * gaQty;
  }, [detail, picked, gaQty, seatPriceCents]);

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
          seat_id: isSeated ? picked[i] ?? null : null,
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

  if (!detail)
    return <p className="mx-auto max-w-4xl px-4 py-12 text-slate-400">Loading…</p>;

  const isSeated = detail.room.kind === "seated";
  const canContinue = isSeated ? picked.length > 0 : gaQty > 0;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-32 pt-6 text-slate-100">
      <button
        type="button"
        onClick={() => nav(`/events/${slug}`)}
        className="text-sm text-slate-400 hover:text-white"
      >
        ← back to event
      </button>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{detail.title}</h1>
      <p className="text-slate-400">
        {detail.venue.name} · {detail.venue.city} · {detail.room.name}
      </p>
      {tier && (
        <p className="mt-1 text-sm text-slate-400">
          All seats:{" "}
          <span className="font-semibold text-sky-300">
            {fmtMoney(tier.price_cents, tier.currency)}
          </span>{" "}
          each
        </p>
      )}

      {isSeated ? (
        <div className="mt-6">
          <SeatedHall
            seatMap={seatMap}
            picked={picked}
            onToggle={toggleSeat}
          />
        </div>
      ) : (
        <GAPicker
          tierPriceCents={seatPriceCents}
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
        canContinue={canContinue}
        busy={busy}
        error={error}
        onContinue={onContinue}
      />
    </main>
  );
}

function ContinueBar({
  isSeated,
  pickedCount,
  gaQty,
  total,
  currency,
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
  canContinue: boolean;
  busy: boolean;
  error: string | null;
  onContinue: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="text-sm text-slate-300">
          {isSeated ? (
            <>
              Selected:{" "}
              <span className="font-semibold text-white">{pickedCount}</span>{" "}
              seat{pickedCount === 1 ? "" : "s"}
            </>
          ) : (
            <>
              Quantity: <span className="font-semibold text-white">{gaQty}</span>
            </>
          )}
          {total > 0 && (
            <>
              {" "}· Total{" "}
              <span className="font-semibold text-sky-300">
                {fmtMoney(total, currency)}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          disabled={!canContinue || busy}
          onClick={onContinue}
          className="rounded-lg bg-sky-500 px-5 py-2.5 font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {busy ? "Holding…" : "Continue →"}
        </button>
      </div>
      {error && (
        <p className="mx-auto mt-2 max-w-6xl text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
