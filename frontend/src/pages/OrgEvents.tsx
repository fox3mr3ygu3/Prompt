import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, CircleDollarSign, Plus, Send, Users, X } from "lucide-react";
import { ApiErr, EventProposal, EventProposalCreate, OrgEvent, api } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { useDocumentTitle } from "@/lib/use-document-title";
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  MetricCard,
  PageHeader,
  PageShell,
  Panel,
  StatusPill,
  TextInput,
  TextareaInput,
} from "@/components/ui";

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    queryFn: async () => (await api.get<EventProposal[]>("/org/proposals")).data,
    refetchInterval: 5_000,
  });

  if (isLoading) return <LoadingState label="Loading organizer events" />;
  if (error) return <ErrorState label="Failed to load events." />;

  const totalAttendees = data?.reduce((acc, e) => acc + e.attendee_count, 0) ?? 0;
  const totalGross = data?.reduce((acc, e) => acc + e.gross_cents, 0) ?? 0;
  const ccy = data?.[0]?.currency ?? "USD";

  return (
    <PageShell>
      <PageHeader
        eyebrow="organizer console"
        title="My events"
        description="Live ticket counts, gross revenue, proposals, and attendee access from one operational dashboard."
        action={
          <Button type="button" onClick={() => setShowForm(true)} icon={Plus}>
            Add event
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Events"
          value={(data?.length ?? 0).toLocaleString()}
          icon={CalendarDays}
        />
        <MetricCard
          label="Attendees"
          value={totalAttendees.toLocaleString()}
          icon={Users}
          tone="fern"
        />
        <MetricCard
          label="Gross"
          value={fmtMoney(totalGross, ccy)}
          icon={CircleDollarSign}
          tone="brass"
        />
      </div>

      {data && data.length === 0 ? (
        <EmptyState
          title="No live events yet"
          description="Submit a proposal and approved events become visible to attendees."
          action={
            <Button type="button" onClick={() => setShowForm(true)} icon={Plus}>
              Submit proposal
            </Button>
          }
        />
      ) : (
        <ul className="mt-7 grid gap-4">
          {data?.map((event) => (
            <LiveEventCard key={event.id} event={event} />
          ))}
        </ul>
      )}

      <section className="mt-12">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-aqua">approval queue</p>
          <h2 className="mt-1 font-display text-3xl font-bold text-ivory">My proposals</h2>
          <p className="mt-2 text-sm text-ivory-muted">
            Approved proposals turn into live events visible to attendees.
          </p>
        </div>
        {proposalsQ.isLoading && <LoadingState label="Loading proposals" />}
        {proposalsQ.data && proposalsQ.data.length === 0 && (
          <EmptyState
            title="No proposals yet"
            description="Draft an event proposal when you are ready."
          />
        )}
        <ul className="space-y-3">
          {proposalsQ.data?.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} compact />
          ))}
        </ul>
      </section>

      {showForm && <AddEventModal onClose={() => setShowForm(false)} />}
    </PageShell>
  );
}

function LiveEventCard({ event }: { event: OrgEvent }) {
  const capacityPct =
    event.capacity > 0
      ? Math.min(100, Math.round((event.attendee_count / event.capacity) * 100))
      : 0;
  return (
    <li>
      <Panel className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link
              to={`/org/events/${event.slug}/attendees`}
              className="font-display text-2xl font-bold text-ivory hover:text-aqua"
            >
              {event.title}
            </Link>
            <div className="mt-1 text-sm font-semibold text-ivory-muted">
              {fmtWhen(event.starts_at)} · {event.venue_name} · {event.room_name}
            </div>
          </div>
          <StatusPill status={event.status}>{event.status}</StatusPill>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <Field label="Attendees" value={`${event.attendee_count} / ${event.capacity}`} />
          <Field label="Scanned in" value={event.scanned_count.toLocaleString()} />
          <Field label="Gross" value={fmtMoney(event.gross_cents, event.currency)} />
          <Link
            to={`/org/events/${event.slug}/attendees`}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-aqua/20 bg-aqua/10 px-3 py-2 text-sm font-bold text-aqua transition hover:bg-aqua/16"
          >
            View attendees
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-ivory/8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-aqua to-brass"
            style={{ width: `${capacityPct}%` }}
          />
        </div>
      </Panel>
    </li>
  );
}

function ProposalCard({
  proposal,
  compact = false,
}: {
  proposal: EventProposal;
  compact?: boolean;
}) {
  return (
    <li>
      <Panel className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="truncate font-display text-xl font-bold text-ivory">
              {proposal.title}
            </div>
            <div className="mt-1 text-xs font-semibold text-ivory-muted">
              {fmtWhen(proposal.starts_at)} · {proposal.venue_name} · {proposal.city} ·{" "}
              {proposal.seats} seats
            </div>
          </div>
          <StatusPill status={proposal.status}>{proposal.status}</StatusPill>
        </div>
        {!compact && proposal.description && (
          <p className="mt-3 text-sm leading-6 text-ivory-muted">{proposal.description}</p>
        )}
        {proposal.status === "rejected" && proposal.reject_reason && (
          <p className="mt-3 rounded-xl border border-red-300/24 bg-red-400/12 px-3 py-2 text-sm font-semibold text-red-100">
            Reason: {proposal.reject_reason}
          </p>
        )}
      </Panel>
    </li>
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

  function handleSubmit(ev: FormEvent) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/82 p-4 backdrop-blur"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="glass-panel max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[1.75rem] p-6 text-ivory shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-aqua">new proposal</p>
            <h2 className="mt-1 font-display text-3xl font-bold">Add event</h2>
            <p className="mt-2 text-sm leading-6 text-ivory-muted">
              Submitted for admin approval. Once approved, it goes live with the seat count and
              price you set here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-ivory/12 text-ivory-muted transition hover:bg-ivory/8 hover:text-ivory"
            aria-label="Close"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput
            label="Title *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. PyConf Tashkent 2026"
            required
          />
          <TextInput
            label="Category slug"
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
            placeholder="e.g. tech, music, sports"
          />
          <TextInput
            label="City *"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Tashkent"
            required
          />
          <TextInput
            label="Venue name *"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            placeholder="e.g. Inha Auditorium"
            required
          />
          <TextInput
            label="Tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="python, backend, db"
          />
          <TextInput
            label="Cover image URL"
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            placeholder="https://..."
          />
          <TextInput
            label="Number of seats *"
            type="number"
            value={seats}
            min={1}
            max={100000}
            onChange={(e) => setSeats(Number(e.target.value))}
            required
          />
          <TextInput
            label="Price (cents) *"
            type="number"
            value={priceCents}
            min={0}
            onChange={(e) => setPriceCents(Number(e.target.value))}
            required
          />
          <TextInput
            label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="USD"
          />
          <TextInput
            label="Starts at *"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
          <TextInput
            label="Ends at *"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            required
          />
        </div>

        <TextareaInput
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="mt-4"
          placeholder="What is this event about?"
        />

        {errMsg && (
          <p className="mt-4 rounded-xl border border-red-300/24 bg-red-400/12 px-3 py-2 text-sm font-semibold text-red-100">
            {errMsg}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button type="submit" disabled={submit.isPending} icon={Send}>
            {submit.isPending ? "Submitting…" : "Submit for approval"}
          </Button>
        </div>
      </form>
    </div>
  );
}
