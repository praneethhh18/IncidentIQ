import { Database, Network, Server, Workflow, Boxes } from "lucide-react";
import type { AffectedService } from "@/lib/types";
import { cn } from "@/lib/utils";

const HEALTH_COLOR: Record<string, string> = {
  healthy: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
  degraded: "border-amber-500/30 bg-amber-500/5 text-amber-300",
  down: "border-red-500/30 bg-red-500/5 text-red-300",
};

const HEALTH_DOT: Record<string, string> = {
  healthy: "bg-emerald-400 shadow-[0_0_10px] shadow-emerald-400/60",
  degraded: "bg-amber-400 shadow-[0_0_10px] shadow-amber-400/60",
  down: "bg-red-400 shadow-[0_0_10px] shadow-red-400/60",
};

function roleIcon(role: string) {
  const r = role.toLowerCase();
  if (r.includes("db") || r.includes("database")) return Database;
  if (r.includes("gateway") || r.includes("proxy")) return Network;
  if (r.includes("worker") || r.includes("queue")) return Workflow;
  if (r.includes("cache")) return Boxes;
  return Server;
}

export function ServiceGraph({ services }: { services: AffectedService[] }) {
  if (services.length === 0) {
    return (
      <div className="text-sm text-ink-500 italic">No services identified.</div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-2.5">
      {services.map((service) => {
        const Icon = roleIcon(service.role);
        const healthClass =
          HEALTH_COLOR[service.health.toLowerCase()] ??
          "border-white/[0.06] bg-white/[0.02] text-ink-300";
        const dotClass =
          HEALTH_DOT[service.health.toLowerCase()] ?? "bg-ink-500";

        return (
          <div
            key={service.name}
            className={cn(
              "rounded-xl border p-3.5 transition hover:bg-ink-900/60",
              healthClass,
            )}
          >
            <div className="flex items-start gap-3">
              <div className="size-9 grid place-items-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink-50 text-sm truncate">
                    {service.name}
                  </span>
                  <span
                    className={cn("size-1.5 rounded-full inline-block", dotClass)}
                  />
                </div>
                <div className="text-[11px] uppercase tracking-wider text-ink-500 mt-0.5">
                  {service.role}
                </div>
                <div className="text-[12.5px] text-ink-300 mt-1.5 leading-snug">
                  {service.impact}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
