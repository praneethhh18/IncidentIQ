import { Brain, Gauge } from "lucide-react";
import type { AnalyzeResponse } from "@/lib/types";

export function RootCauseCard({ analysis }: { analysis: AnalyzeResponse }) {
  const pct = Math.round(analysis.confidence * 100);
  return (
    <div className="card-pad space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="size-4 text-brand-300" />
        <h3 className="section-title text-ink-100">Root cause</h3>
      </div>

      <p className="text-[15px] text-ink-100 leading-relaxed">
        {analysis.root_cause}
      </p>

      <ConfidenceBar pct={pct} />

      <div className="pt-3 border-t border-white/[0.05]">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-500">
          <Gauge className="size-3" /> Why this severity
        </div>
        <p className="text-[13.5px] text-ink-300 mt-1 leading-relaxed">
          {analysis.severity_rationale}
        </p>
      </div>
    </div>
  );
}

function ConfidenceBar({ pct }: { pct: number }) {
  const label = pct >= 85 ? "High" : pct >= 60 ? "Medium" : "Low";
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-ink-500 uppercase tracking-wider">
        <span>Model confidence</span>
        <span className="text-ink-300 font-mono normal-case tracking-normal">
          {pct}% · {label}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-400 via-brand-300 to-emerald-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
