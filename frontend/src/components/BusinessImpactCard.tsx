import {
  AlertOctagon,
  BadgeDollarSign,
  Clock4,
  Megaphone,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";

import type { BusinessImpact } from "@/lib/types";

export function BusinessImpactCard({ impact }: { impact: BusinessImpact }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <div className="size-8 grid place-items-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
          <BadgeDollarSign className="size-4" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold tracking-wide text-ink-50 uppercase">
            Business impact
          </h3>
          <p className="text-[12px] text-ink-400 mt-0.5">
            What this incident is costing the business right now.
          </p>
        </div>
        {impact.customer_communication_required ? (
          <span className="chip bg-amber-500/15 text-amber-300 border-amber-500/30">
            <Megaphone className="size-3" /> Customer comms recommended
          </span>
        ) : null}
      </header>

      <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
        <Metric
          icon={<Users className="size-4 text-cyan-300" />}
          label="Users affected"
          value={impact.affected_users_label}
          sub={`~${impact.affected_users_estimate.toLocaleString()} estimated`}
        />
        <Metric
          icon={<BadgeDollarSign className="size-4 text-emerald-300" />}
          label="Revenue at risk"
          value={`$${impact.revenue_at_risk_usd.toLocaleString()}`}
          sub={impact.revenue_basis}
        />
        <Metric
          icon={<Clock4 className="size-4 text-brand-300" />}
          label="Est. MTTR"
          value={`${impact.estimated_mttr_minutes}m`}
          sub="With top remediation applied"
        />
      </div>

      <div className="px-5 py-4 grid md:grid-cols-2 gap-4 border-t border-white/[0.06]">
        <div
          className={
            "rounded-xl border p-3 " +
            (impact.sla_breached
              ? "border-red-500/30 bg-red-500/[0.06]"
              : "border-emerald-500/30 bg-emerald-500/[0.04]")
          }
        >
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold">
            {impact.sla_breached ? (
              <>
                <AlertOctagon className="size-3.5 text-red-300" />
                <span className="text-red-300">SLA breached</span>
              </>
            ) : (
              <>
                <ShieldCheck className="size-3.5 text-emerald-300" />
                <span className="text-emerald-300">Within SLA</span>
              </>
            )}
          </div>
          <p className="text-[13px] text-ink-200 mt-1.5 leading-snug">
            {impact.sla_detail}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-ink-950/40 p-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
            <ShieldAlert className="size-3.5 text-amber-300" />
            User segments touched
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {impact.user_segments.length === 0 ? (
              <span className="text-[12.5px] text-ink-500 italic">
                None identified.
              </span>
            ) : (
              impact.user_segments.map((segment) => (
                <span key={segment} className="chip">
                  {segment}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-ink-50">
        {value}
      </div>
      <div className="mt-1 text-[11.5px] text-ink-500 leading-snug">{sub}</div>
    </div>
  );
}
