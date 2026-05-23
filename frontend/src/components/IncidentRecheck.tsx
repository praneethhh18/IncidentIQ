"use client";

/**
 * IncidentRecheck. The lifecycle panel for an incident.
 *
 * Shows the current status (open / investigating / recovering / resolved)
 * with a clear badge and timestamps. Lets the user re-pull fresh logs
 * (paste, or hit the same integration) to verify whether the original
 * error pattern is still active. When the status flips to resolved, the
 * backend emails the configured recipient automatically.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  RotateCcw,
  ShieldCheck,
  TrendingDown,
  TriangleAlert,
} from "lucide-react";

import { api } from "@/lib/api";
import type { AnalyzeResponse } from "@/lib/types";
import { cn, formatRelative } from "@/lib/utils";

type StatusKey = "open" | "investigating" | "recovering" | "resolved";

interface StatusMeta {
  label: string;
  icon: typeof Activity;
  chip: string;
  ring: string;
}

const STATUS_META: Record<StatusKey, StatusMeta> = {
  open: {
    label: "Open",
    icon: TriangleAlert,
    chip: "bg-red-500/10 text-red-300 border-red-500/30",
    ring: "ring-red-500/20",
  },
  investigating: {
    label: "Investigating",
    icon: Activity,
    chip: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    ring: "ring-amber-500/20",
  },
  recovering: {
    label: "Recovering",
    icon: TrendingDown,
    chip: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
    ring: "ring-cyan-500/20",
  },
  resolved: {
    label: "Resolved",
    icon: ShieldCheck,
    chip: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    ring: "ring-emerald-500/20",
  },
};

export function IncidentRecheck({
  initial,
  rawLogs,
}: {
  initial: AnalyzeResponse;
  rawLogs?: string;
}) {
  const [analysis, setAnalysis] = useState<AnalyzeResponse>(initial);
  const [pasted, setPasted] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<{
    status: string;
    summary: string;
  } | null>(null);

  const rawStatus = (analysis.status || "open") as string;
  const statusKey: StatusKey =
    rawStatus in STATUS_META ? (rawStatus as StatusKey) : "open";
  const meta = STATUS_META[statusKey];
  const Icon = meta.icon;

  const run = async (freshLogs?: string) => {
    setRunning(true);
    setError(null);
    try {
      const result = await api.recheck(analysis.incident_id, freshLogs);
      setAnalysis(result.incident);
      setLastOutcome({
        status: result.outcome_status,
        summary: result.outcome_summary,
      });
      setEmailSent(result.email_sent);
      if (freshLogs === undefined) setPasted("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="card overflow-hidden">
      <header className="flex items-start gap-3 px-5 py-4 border-b border-white/[0.06]">
        <motion.div
          key={statusKey}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "size-9 grid place-items-center rounded-lg border ring-4",
            meta.chip,
            meta.ring,
          )}
        >
          <Icon className="size-4" />
        </motion.div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold border tracking-wide",
                meta.chip,
              )}
            >
              <span className={cn("size-1.5 rounded-full", chipDot(statusKey))} />
              {meta.label.toUpperCase()}
            </span>
            <span className="section-title text-ink-100">Incident lifecycle</span>
          </div>
          <p className="text-[12.5px] text-ink-400 mt-1 leading-snug">
            {analysis.resolution_summary ||
              "Run a recheck after applying your fix to verify the incident is gone."}
          </p>
          <div className="mt-2 flex items-center gap-3 flex-wrap text-[11px] text-ink-500 font-mono">
            <span className="inline-flex items-center gap-1">
              <RotateCcw className="size-3" />
              rechecks: <span className="text-ink-300 tabular-nums">{analysis.recheck_count}</span>
            </span>
            {analysis.last_checked_at ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                last: <span className="text-ink-300">{formatRelative(analysis.last_checked_at)}</span>
              </span>
            ) : null}
            {analysis.resolved_at ? (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="size-3 text-emerald-400" />
                resolved: <span className="text-ink-300">{formatRelative(analysis.resolved_at)}</span>
              </span>
            ) : null}
          </div>
        </div>

        {rawLogs ? (
          <button
            type="button"
            onClick={() => run(rawLogs)}
            disabled={running}
            title="Re-run the recheck against the original logs you pasted"
            className="btn-secondary px-3 py-1.5 text-[12.5px] shrink-0"
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            Recheck
          </button>
        ) : null}
      </header>

      {/* Composer: paste fresh logs */}
      <div className="px-5 py-4">
        <label className="section-title text-ink-200 mb-2 block">
          Paste fresh logs to recheck
        </label>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="Paste a fresh log sample (last 10-15 minutes). The agent compares it to the original signature and decides if the incident is gone."
          className="textarea min-h-[120px]"
          disabled={running}
        />
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11.5px] text-ink-500 max-w-md">
            Or click <span className="text-ink-300 font-medium">Recheck</span> above
            to re-pull from the original source.
          </p>
          <button
            type="button"
            onClick={() => run(pasted)}
            disabled={running || !pasted.trim()}
            className="btn-primary px-4 py-2 text-[13px]"
          >
            {running ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Checking...
              </>
            ) : (
              <>
                <RotateCcw className="size-3.5" /> Run recheck
              </>
            )}
          </button>
        </div>

        {error ? (
          <div className="mt-3 text-[12px] text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
            {error}
          </div>
        ) : null}

        {lastOutcome ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
              "mt-3 rounded-lg border px-3 py-2.5 text-[12.5px] leading-snug",
              lastOutcome.status === "resolved" &&
                "border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-100",
              lastOutcome.status === "recovering" &&
                "border-cyan-500/30 bg-cyan-500/[0.05] text-cyan-100",
              (lastOutcome.status === "still_active" ||
                lastOutcome.status === "investigating") &&
                "border-amber-500/30 bg-amber-500/[0.05] text-amber-100",
            )}
          >
            <span className="font-semibold uppercase tracking-wider text-[10.5px] mr-2">
              {lastOutcome.status.replace("_", " ")}
            </span>
            {lastOutcome.summary}
            {emailSent ? (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-emerald-300">
                <Mail className="size-3" />
                resolution email sent
              </span>
            ) : null}
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}

function chipDot(status: string): string {
  switch (status) {
    case "resolved":
      return "bg-emerald-400";
    case "recovering":
      return "bg-cyan-400";
    case "investigating":
      return "bg-amber-400";
    default:
      return "bg-red-400";
  }
}
