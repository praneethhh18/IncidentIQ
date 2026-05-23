import Link from "next/link";
import { ArrowRight, History, Inbox } from "lucide-react";

import { api } from "@/lib/api";
import type { IncidentSummary } from "@/lib/types";
import { SeverityBadge } from "@/components/SeverityBadge";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const incidents = await api.recent(50).catch<IncidentSummary[]>(() => []);

  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="chip">
            <History className="size-3" /> History
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-50">
            Recent incidents
          </h1>
          <p className="mt-2 text-ink-300">
            Every analysis run on this server, newest first.
          </p>
        </div>
        <Link href="/dashboard" className="btn-primary px-4 py-2 text-[13.5px]">
          Analyze a new incident <ArrowRight className="size-3.5" />
        </Link>
      </header>

      {incidents.length === 0 ? <EmptyState /> : <IncidentList incidents={incidents} />}
    </section>
  );
}

function IncidentList({ incidents }: { incidents: IncidentSummary[] }) {
  return (
    <div className="card divide-y divide-white/[0.05]">
      {incidents.map((incident) => (
        <Link
          key={incident.incident_id}
          href={`/incidents/${incident.incident_id}`}
          className="grid grid-cols-[auto,1fr,auto] items-start gap-4 p-4 hover:bg-white/[0.03] transition"
        >
          <SeverityBadge severity={incident.severity} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-ink-50 font-medium truncate">
                {incident.title}
              </span>
              <span className="font-mono text-[11px] text-ink-500">
                {incident.incident_id}
              </span>
            </div>
            <div className="text-[13px] text-ink-400 mt-1 line-clamp-2">
              {incident.root_cause}
            </div>
            <div className="mt-1.5 text-[11px] text-ink-500">
              {incident.affected_service_count} affected service
              {incident.affected_service_count === 1 ? "" : "s"} ·{" "}
              {formatRelative(incident.created_at)}
            </div>
          </div>
          <ArrowRight className="size-4 text-ink-500 mt-1.5" />
        </Link>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card-pad text-center py-20">
      <Inbox className="size-8 mx-auto text-ink-500" />
      <div className="mt-3 text-ink-200 font-medium">No incidents yet</div>
      <div className="mt-1 text-sm text-ink-500">
        Run your first analysis to see it here.
      </div>
      <Link
        href="/dashboard"
        className="btn-primary mt-5 px-4 py-2 text-[13.5px]"
      >
        Open the dashboard <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
