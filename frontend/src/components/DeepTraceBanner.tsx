"use client";

import { Loader2, ScanSearch, ShieldAlert } from "lucide-react";

export function DeepTraceBanner({
  reason,
  running,
  onRun,
}: {
  reason: string;
  running: boolean;
  onRun: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/[0.10] via-red-500/[0.08] to-amber-500/[0.10] p-5 animate-fade-in">
      <div className="absolute inset-0 bg-dots opacity-30 pointer-events-none" />
      <div className="absolute -inset-x-1 -top-1 h-1 bg-gradient-to-r from-amber-400 via-red-400 to-amber-400 animate-pulse-slow" />

      <div className="relative flex items-start gap-4 flex-wrap">
        <div className="size-11 grid place-items-center rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 shrink-0">
          <ShieldAlert className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] uppercase tracking-[0.22em] text-amber-300 font-bold">
              Deep Trace Recommended
            </span>
            <span className="size-1.5 rounded-full bg-amber-400 animate-pulse-slow" />
          </div>
          <h3 className="mt-1 text-base font-semibold text-ink-50">
            The regular pass is uncertain. Escalate to the deep investigator?
          </h3>
          <p className="mt-1.5 text-[13px] text-ink-300 leading-snug max-w-2xl">
            <span className="text-amber-200 font-medium">Reason: </span>
            {reason}
          </p>
          <p className="mt-1.5 text-[12px] text-ink-500 leading-snug max-w-2xl">
            Deep Trace runs four hidden-signal scanners, performs a per-service deep probe,
            and re-prompts Nova Pro with extended reasoning to surface bugs the surface pass missed.
          </p>
        </div>
        <button
          onClick={onRun}
          disabled={running}
          className="btn px-4 py-2.5 bg-amber-500 text-ink-950 hover:bg-amber-400 font-semibold text-[13.5px] shrink-0 shadow-[0_0_30px_-6px_rgba(245,158,11,0.5)]"
        >
          {running ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Investigating…
            </>
          ) : (
            <>
              <ScanSearch className="size-4" /> Run Deep Trace
            </>
          )}
        </button>
      </div>
    </div>
  );
}
