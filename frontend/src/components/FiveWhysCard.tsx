import { GitMerge, HelpCircle, Lightbulb, Target } from "lucide-react";

import type { FiveWhys } from "@/lib/types";

export function FiveWhysCard({ whys }: { whys: FiveWhys }) {
  if (!whys.steps.length) return null;
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <div className="size-8 grid place-items-center rounded-lg bg-brand-500/15 border border-brand-500/30 text-brand-300">
          <GitMerge className="size-4" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold tracking-wide text-ink-50 uppercase">
            The 5 Whys
          </h3>
          <p className="text-[12px] text-ink-400 mt-0.5">
            Recursive root-cause questioning — keep asking &apos;why&apos; until
            you reach the systemic cause.
          </p>
        </div>
      </header>

      <ol className="relative px-5 py-5 space-y-3">
        <span className="absolute left-[2.35rem] top-7 bottom-7 w-px bg-gradient-to-b from-brand-500/40 via-brand-500/20 to-transparent" />
        {whys.steps.map((step) => (
          <li key={step.n} className="relative grid grid-cols-[2.5rem,1fr] gap-3">
            <span className="relative z-10 size-7 grid place-items-center rounded-full bg-brand-500/15 border border-brand-500/40 text-brand-300 ring-4 ring-ink-950 font-mono text-[12px] font-semibold mt-0.5">
              {step.n}
            </span>
            <div>
              <div className="flex items-start gap-2">
                <HelpCircle className="size-3.5 text-ink-500 mt-0.5 shrink-0" />
                <span className="text-[13.5px] text-ink-100 font-medium leading-snug">
                  {step.question}
                </span>
              </div>
              <p className="text-[13px] text-ink-300 mt-1 leading-relaxed pl-5">
                {step.answer}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="px-5 pb-5 grid lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-emerald-300 font-semibold">
            <Target className="size-3.5" /> Systemic root cause
          </div>
          <p className="text-[13px] text-ink-200 mt-1.5 leading-snug">
            {whys.final_root_cause}
          </p>
        </div>
        {whys.counter_factual ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-300 font-semibold">
              <Lightbulb className="size-3.5" /> Counter-factual — what would have prevented this
            </div>
            <p className="text-[13px] text-ink-200 mt-1.5 leading-snug">
              {whys.counter_factual}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
