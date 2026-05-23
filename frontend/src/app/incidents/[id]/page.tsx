import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Hash, Clock, History as HistoryIcon } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { AnalysisResult } from "@/components/AnalysisResult";
import { SeverityBadge } from "@/components/SeverityBadge";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function IncidentDetail({
  params,
}: {
  params: { id: string };
}) {
  let analysis;
  try {
    analysis = await api.incident(params.id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12px] text-ink-400 font-medium">
        <Link href="/" className="hover:text-ink-50 transition">
          IncidentIQ
        </Link>
        <span className="text-ink-700">/</span>
        <Link href="/incidents" className="hover:text-ink-50 transition">
          History
        </Link>
        <span className="text-ink-700">/</span>
        <span className="text-ink-200 font-mono">{analysis.incident_id}</span>
      </nav>

      {/* Detail-page header. This is the visible signal that you've
          navigated into a specific incident. */}
      <header className="mt-4 mb-7 grid md:grid-cols-[1fr,auto] gap-4 items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={analysis.severity} />
            <span className="chip">
              <Hash className="size-3" />
              {analysis.incident_id}
            </span>
            <span className="chip">
              <Clock className="size-3" />
              {formatDateTime(analysis.created_at)}
            </span>
            <span className="chip">{analysis.source}</span>
            <span className="chip">{analysis.model}</span>
          </div>
          <h1 className="mt-3 text-2xl md:text-3xl font-semibold tracking-tight text-ink-50 leading-tight">
            {analysis.title}
          </h1>
        </div>
        <Link
          href="/incidents"
          className="btn-secondary px-3.5 py-2 text-[13px] shrink-0"
        >
          <ArrowLeft className="size-3.5" />
          Back to history
        </Link>
      </header>

      {/* Full analysis. showAgentTrail=true here since we want the
          permanent record to include the reasoning trail. Hide the
          'Open detail' link because we are already on the detail page. */}
      <AnalysisResult
        analysis={analysis}
        showAgentTrail={true}
        showOpenDetail={false}
      />

      {/* Footer link back to history so long pages don't trap the user
          at the bottom. */}
      <div className="mt-10 pt-6 border-t border-white/[0.06] flex items-center justify-between text-[12.5px]">
        <Link
          href="/incidents"
          className="text-ink-400 hover:text-ink-50 transition inline-flex items-center gap-1.5"
        >
          <HistoryIcon className="size-3.5" />
          All incidents
        </Link>
        <Link
          href="/dashboard"
          className="text-ink-400 hover:text-ink-50 transition inline-flex items-center gap-1.5"
        >
          Analyze another incident
        </Link>
      </div>
    </section>
  );
}
