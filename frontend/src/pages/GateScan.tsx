import { FormEvent, useState } from "react";
import { api, ScanResult } from "@/lib/api";
import { useDocumentTitle } from "@/lib/use-document-title";

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

  const colour =
    last?.result === "ok"
      ? "border-emerald-500 text-emerald-400"
      : last?.result === "replay"
        ? "border-amber-500 text-amber-300"
        : last
          ? "border-red-500 text-red-400"
          : "border-slate-800";

  return (
    <main className="mx-auto max-w-md px-4 py-12 text-slate-100">
      <h1 className="text-2xl font-bold">Gate scan</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          rows={4}
          placeholder="Paste QR payload (JWT)"
          className="w-full rounded bg-slate-800 p-3 font-mono text-xs"
        />
        <button
          type="submit"
          disabled={busy || !payload}
          className="w-full rounded bg-sky-500 px-3 py-2 font-semibold text-white disabled:bg-slate-700"
        >
          {busy ? "Scanning…" : "Scan"}
        </button>
      </form>
      {last && (
        <div className={`mt-6 rounded border p-4 ${colour}`}>
          <div className="font-bold uppercase">{last.result}</div>
          <div className="mt-1 text-sm">{last.detail}</div>
          {last.ticket_id && (
            <div className="mt-2 font-mono text-xs">ticket {last.ticket_id}</div>
          )}
        </div>
      )}
    </main>
  );
}
