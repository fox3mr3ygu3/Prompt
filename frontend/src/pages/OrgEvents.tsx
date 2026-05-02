import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ApiErr,
  EventProposal,
  EventProposalCreate,
  OrgEvent,
  api,
} from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { useDocumentTitle } from "@/lib/use-document-title";

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(status: string): string {
  switch (status) {
    case "approved":
    case "published":
      return "bg-emerald-500/15 text-emerald-300";
    case "pending":
      return "bg-amber-500/15 text-amber-300";
    case "rejected":
      return "bg-red-500/15 text-red-300";
    default:
      return "bg-slate-500/15 text-slate-300";
  }
}

export function OrgEvents() {
  useDocumentTitle("My events");
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["org-events"],
    queryFn: async () => (await api.get<OrgEvent[]>("/org/events")).data,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });

  const proposalsQ = useQuery({
    queryKey: ["org-proposals"],
    queryFn: async () =>
      (await api.get<EventProposal[]>("/org/proposals")).data,
    refetchInterval: 5_000,
  });

  if (isLoading) return <p className="p-8 text-slate-400">Loading…</p>;
  if (error) return <p className="p-8 text-red-400">Failed to load events.</p>;

  const totalAttendees = data?.reduce((acc, e) => acc + e.attendee_count, 0) ?? 0;
  const totalGross = data?.reduce((acc, e) => acc + e.gross_cents, 0) ?? 0;
  const ccy = data?.[0]?.currency ?? "USD";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 text-slate-100">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My events</h1>
          <p className="mt-1 text-sm text-slate-400">
            Live counts — attendees and gross are recomputed from the tickets
            table on every request.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"
        >
          + Add event
        </button>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Kpi label="Events" value={(data?.length ?? 0).toLocaleString()} />
        <Kpi label="Attendees" value={totalAttendees.toLocaleString()} />
        <Kpi label="Gross" value={fmtMoney(totalGross, ccy)} />
      </div>

      {data && data.length === 0 && (
        <p className="mt-12 text-center text-slate-500">
          No events yet — click “Add event” to submit one for admin approval.
        </p>
      )}

      <ul className="mt-8 space-y-3">
        {data?.map((e) => (
          <li
            key={e.id}
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  to={`/org/events/${e.slug}/attendees`}
                  className="truncate text-lg font-semibold text-white hover:text-sky-300"
                >
                  {e.title}
                </Link>
                <div className="mt-1 text-xs text-slate-400">
                  {fmtWhen(e.starts_at)} · {e.venue_name} · {e.room_name}
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge(e.status)}`}
              >
                {e.status}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field
                label="Attendees"
                value={`${e.attendee_count} / ${e.capacity}`}
              />
              <Field label="Scanned in" value={e.scanned_count.toLocaleString()} />
              <Field
                label="Gross"
                value={fmtMoney(e.gross_cents, e.currency)}
              />
              <Link
                to={`/org/events/${e.slug}/attendees`}
                className="self-end rounded-lg bg-sky-500/15 px-3 py-1.5 text-center text-sm font-semibold text-sky-300 hover:bg-sky-500/25"
              >
                View attendees →
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-12">
        <h2 className="text-lg font-bold">My proposals</h2>
        <p className="mt-1 text-xs text-slate-500">
          Submitted to the admin for approval. Approved proposals turn into
          live events visible to attendees.
        </p>
        {proposalsQ.isLoading && (
          <p className="mt-4 text-sm text-slate-400">Loading…</p>
        )}
        {proposalsQ.data && proposalsQ.data.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">
            No proposals yet.
          </p>
        )}
        <ul className="mt-4 space-y-3">
          {proposalsQ.data?.map((p) => (
            <li
              key={p.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-white">
                    {p.title}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {fmtWhen(p.starts_at)} · {p.venue_name} · {p.city} ·{" "}
                    {p.seats} seats
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge(p.status)}`}
                >
                  {p.status}
                </span>
              </div>
              {p.status === "rejected" && p.reject_reason && (
                <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  <span className="font-semibold">Reason:</span>{" "}
                  {p.reject_reason}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {showForm && <AddEventModal onClose={() => setShowForm(false)} />}
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-white">{value}</div>
    </div>
  );
}

function AddEventModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [venueName, setVenueName] = useState("");
  const [tags, setTags] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [seats, setSeats] = useState(50);
  const [priceCents, setPriceCents] = useState(2500);
  const [currency, setCurrency] = useState("USD");
  const [categorySlug, setCategorySlug] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async (payload: EventProposalCreate) => {
      await api.post("/org/proposals", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-proposals"] });
      onClose();
    },
    onError: (e: unknown) => {
      const detail = (e as ApiErr).response?.data?.detail;
      setErrMsg(typeof detail === "string" ? detail : "Failed to submit proposal.");
    },
  });

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setErrMsg(null);

    if (!title.trim() || !city.trim() || !venueName.trim() || !startsAt || !endsAt) {
      setErrMsg("Please fill all required fields.");
      return;
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      setErrMsg("End time must be after start time.");
      return;
    }
    if (seats <= 0) {
      setErrMsg("Seat count must be at least 1.");
      return;
    }

    submit.mutate({
      title: title.trim(),
      description: description.trim(),
      city: city.trim(),
      venue_name: venueName.trim(),
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      cover_image_url: coverUrl.trim(),
      seats,
      price_cents: priceCents,
      currency: currency.trim().toUpperCase().slice(0, 3) || "USD",
      category_slug: categorySlug.trim().toLowerCase(),
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">Add event</h2>
            <p className="mt-1 text-xs text-slate-400">
              Submitted for admin approval. Once approved, it goes live for
              attendees with the seat count you set here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Title *"
            value={title}
            onChange={setTitle}
            placeholder="e.g. PyConf Tashkent 2026"
            required
          />
          <Input
            label="Category slug"
            value={categorySlug}
            onChange={setCategorySlug}
            placeholder="e.g. tech, music, sports"
          />
          <Input
            label="City *"
            value={city}
            onChange={setCity}
            placeholder="e.g. Tashkent"
            required
          />
          <Input
            label="Venue name *"
            value={venueName}
            onChange={setVenueName}
            placeholder="e.g. Inha Auditorium"
            required
          />
          <Input
            label="Tags (comma-separated)"
            value={tags}
            onChange={setTags}
            placeholder="python, backend, db"
          />
          <Input
            label="Cover image URL"
            value={coverUrl}
            onChange={setCoverUrl}
            placeholder="https://…"
          />
          <NumberInput
            label="Number of seats *"
            value={seats}
            onChange={setSeats}
            min={1}
            max={100000}
          />
          <NumberInput
            label="Price (cents) *"
            value={priceCents}
            onChange={setPriceCents}
            min={0}
          />
          <Input
            label="Currency"
            value={currency}
            onChange={setCurrency}
            placeholder="USD"
          />
          <DateTimeInput
            label="Starts at *"
            value={startsAt}
            onChange={setStartsAt}
          />
          <DateTimeInput
            label="Ends at *"
            value={endsAt}
            onChange={setEndsAt}
          />
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
            placeholder="What is this event about?"
          />
        </label>

        {errMsg && (
          <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errMsg}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submit.isPending}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {submit.isPending ? "Submitting…" : "Submit for approval"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <input
        type="text"
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
      />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
      />
    </label>
  );
}

function DateTimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <input
        type="datetime-local"
        value={value}
        required
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
      />
    </label>
  );
}
