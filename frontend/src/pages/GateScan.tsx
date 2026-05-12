import { FormEvent, useState } from "react";
import { ScanLine, ShieldAlert, ShieldCheck } from "lucide-react";
import { api, ScanResult } from "@/lib/api";
import { useDocumentTitle } from "@/lib/use-document-title";
import {
  Button,
  Field,
  PageHeader,
  PageShell,
  Panel,
  StatusPill,
  TextareaInput,
} from "@/components/ui";
import { cn } from "@/lib/cn";

export function GateScan() {
  useDocumentTitle("Gate scan");
  const [payload, setPayload] = useState("");
  const [last, setLast] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!payload) return;
    setBusy(true);
    try {
      const res = await api.post<ScanResult>("/tickets/scan", { qr_payload: payload });
      setLast(res.data);
      setPayload("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "scan failed";
      setLast({ result: "invalid", ticket_id: null, event_id: null, detail: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell narrow>
      <PageHeader
        eyebrow="gate mode"
        title="Gate scan"
        description="Paste the QR payload from a ticket. A valid ticket flips to used exactly once."
      />

      <Panel className="overflow-hidden p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
          <form onSubmit={onSubmit} className="space-y-4">
            <TextareaInput
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={6}
              label="QR payload"
              placeholder="Paste QR payload (JWT)"
              textareaClassName="font-mono text-xs"
            />
            <Button type="submit" disabled={busy || !payload} className="w-full" icon={ScanLine}>
              {busy ? "Scanning…" : "Scan ticket"}
            </Button>
          </form>

          <div className="relative flex min-h-56 items-center justify-center rounded-2xl border border-ivory/12 bg-ink-2/72">
            <div className="absolute inset-4 rounded-xl border border-aqua/25" />
            <div className="absolute inset-x-8 top-1/2 h-px bg-aqua shadow-glow animate-soft-pulse" />
            <ScanLine aria-hidden className="h-20 w-20 text-aqua/70" />
          </div>
        </div>
      </Panel>

      {last && <ScanResultCard result={last} />}
    </PageShell>
  );
}

function ScanResultCard({ result }: { result: ScanResult }) {
  const success = result.result === "ok";
  return (
    <Panel
      className={cn(
        "mt-6 p-5",
        success
          ? "border-emerald-300/24 bg-emerald-400/10"
          : result.result === "replay"
            ? "border-amber-300/24 bg-amber-400/10"
            : "border-red-300/24 bg-red-400/10",
      )}
    >
      <div className="flex items-start gap-3">
        {success ? (
          <ShieldCheck aria-hidden className="mt-1 h-6 w-6 text-emerald-200" />
        ) : (
          <ShieldAlert aria-hidden className="mt-1 h-6 w-6 text-amber-200" />
        )}
        <div className="min-w-0 flex-1">
          <StatusPill status={result.result}>{result.result}</StatusPill>
          <p className="mt-3 text-sm font-semibold text-ivory">{result.detail}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Ticket" value={result.ticket_id ?? "—"} mono />
            <Field label="Event" value={result.event_id ?? "—"} mono />
          </div>
        </div>
      </div>
    </Panel>
  );
}
