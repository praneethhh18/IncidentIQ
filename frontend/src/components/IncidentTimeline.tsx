import type { TimelineEvent } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

const DOT: Record<TimelineEvent["severity"], string> = {
  P1: "sev-dot-p1",
  P2: "sev-dot-p2",
  P3: "sev-dot-p3",
};

export function IncidentTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="text-sm text-ink-500 italic">
        No timeline events extracted.
      </div>
    );
  }

  return (
    <ol className="relative">
      <span className="absolute left-[6.5rem] top-1 bottom-1 w-px bg-gradient-to-b from-white/[0.04] via-white/[0.08] to-white/[0.04]" />
      {events.map((event, idx) => (
        <li
          key={`${event.timestamp}-${idx}`}
          className="relative grid grid-cols-[6rem,auto,1fr] gap-4 py-3 first:pt-1 last:pb-1"
        >
          <span className="text-[11.5px] font-mono text-ink-500 tabular-nums text-right pr-1 pt-1">
            {formatTime(event.timestamp)}
          </span>
          <span className="relative grid place-items-center w-5">
            <span
              className={cn(
                "sev-dot size-2.5 rounded-full ring-4 ring-ink-950",
                DOT[event.severity],
              )}
            />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-ink-50">
                {event.label}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-ink-500">
                {event.severity}
              </span>
            </div>
            <div className="text-[13px] text-ink-400 mt-0.5 leading-snug">
              {event.detail}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
