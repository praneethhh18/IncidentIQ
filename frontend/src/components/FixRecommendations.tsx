"use client";

import { useState } from "react";
import { Check, ClipboardCopy, Wrench } from "lucide-react";
import type { FixRecommendation } from "@/lib/types";

export function FixRecommendations({ fixes }: { fixes: FixRecommendation[] }) {
  if (fixes.length === 0) {
    return (
      <div className="text-sm text-ink-500 italic">No fix recommendations.</div>
    );
  }
  const sorted = [...fixes].sort((a, b) => a.priority - b.priority);
  return (
    <div className="space-y-3">
      {sorted.map((fix, idx) => (
        <FixCard key={idx} fix={fix} />
      ))}
    </div>
  );
}

function FixCard({ fix }: { fix: FixRecommendation }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!fix.snippet) return;
    try {
      await navigator.clipboard.writeText(fix.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* no-op */
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-ink-900/60 p-4 hover:bg-ink-900/80 transition">
      <div className="flex items-start gap-3">
        <div className="size-8 grid place-items-center rounded-lg bg-brand-500/15 text-brand-300 border border-brand-500/30 font-mono text-xs">
          #{fix.priority}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Wrench className="size-3.5 text-brand-300" />
            <span className="font-medium text-ink-50 text-sm">{fix.title}</span>
          </div>
          <p className="text-[12.5px] text-ink-400 mt-1 leading-snug">
            {fix.rationale}
          </p>
          <p className="mt-2.5 text-[13px] text-ink-200">
            <span className="text-ink-500 mr-1.5">Action:</span> {fix.action}
          </p>
          {fix.snippet ? (
            <div className="mt-3 relative">
              <pre className="rounded-lg bg-ink-950/80 border border-white/[0.06] p-3 text-[12px] font-mono text-ink-200 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                {fix.snippet}
              </pre>
              <button
                type="button"
                onClick={copy}
                className="absolute top-2 right-2 btn-ghost px-2 py-1 text-[11px]"
              >
                {copied ? (
                  <>
                    <Check className="size-3" /> Copied
                  </>
                ) : (
                  <>
                    <ClipboardCopy className="size-3" /> Copy
                  </>
                )}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
