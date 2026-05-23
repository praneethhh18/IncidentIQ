import { Check, Plug2, XCircle } from "lucide-react";
import type { IntegrationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, string> = {
  Datadog: "🐶",
  "Grafana / Loki": "📊",
  "New Relic": "🟢",
};

export function IntegrationCard({ status }: { status: IntegrationStatus }) {
  const stateClass = status.connected
    ? "border-emerald-500/30 bg-emerald-500/5"
    : status.enabled
    ? "border-amber-500/30 bg-amber-500/5"
    : "border-white/[0.06] bg-ink-900/40";

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition hover:bg-ink-900/70",
        stateClass,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-9 grid place-items-center rounded-lg bg-white/[0.05] border border-white/[0.06] text-base">
            {ICONS[status.name] ?? <Plug2 className="size-4 text-ink-400" />}
          </div>
          <div>
            <div className="font-medium text-ink-50 text-sm">{status.name}</div>
            <div className="text-[11px] text-ink-500 mt-0.5">
              {status.connected
                ? "Connected"
                : status.enabled
                ? "Configured · not reachable"
                : "Not configured"}
            </div>
          </div>
        </div>
        <StatusPill status={status} />
      </div>
      {status.detail ? (
        <div className="mt-3 text-[11.5px] text-ink-400 leading-snug">
          {status.detail}
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: IntegrationStatus }) {
  if (status.connected) {
    return (
      <span className="chip bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
        <Check className="size-3" /> live
      </span>
    );
  }
  if (status.enabled) {
    return (
      <span className="chip bg-amber-500/15 text-amber-300 border-amber-500/30">
        <XCircle className="size-3" /> error
      </span>
    );
  }
  return <span className="chip">demo fallback</span>;
}
