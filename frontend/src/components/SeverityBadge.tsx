import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/types";

const STYLES: Record<Severity, string> = {
  P1: "bg-sev-p1/15 text-sev-p1 border-sev-p1/30",
  P2: "bg-sev-p2/15 text-sev-p2 border-sev-p2/30",
  P3: "bg-sev-p3/15 text-sev-p3 border-sev-p3/30",
};

const DOT_CLASS: Record<Severity, string> = {
  P1: "sev-dot-p1",
  P2: "sev-dot-p2",
  P3: "sev-dot-p3",
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border tracking-wide",
        STYLES[severity],
        className,
      )}
    >
      <span className={cn("sev-dot", DOT_CLASS[severity])} />
      {severity}
    </span>
  );
}
