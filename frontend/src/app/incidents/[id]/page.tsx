"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Hash,
  Clock,
  History as HistoryIcon,
  Loader2,
} from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { AnalyzeResponse } from "@/lib/types";
import { AnalysisResult } from "@/components/AnalysisResult";
import { SeverityBadge } from "@/components/SeverityBadge";
import { formatDateTime } from "@/lib/utils";

/**
 * Incident detail page. Renders client-side so the fetch carries the
 * X-IIQ-User header from localStorage - the backend then matches the
 * row's owner to the caller, which is what gives the per-user history
 * isolation. Server rendering would skip the header and fall through to
 * the anonymous shared-pool branch, breaking actions like Deep Trace
 * and Code Fix that the rest of the page hosts.
 */
export default function IncidentDetail() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "missing" | "error">(
    "loading",
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await api.incident(id);
        if (!cancelled) {
          setAnalysis(result);
          setStatus("loading");
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setStatus("missing");
        } else {
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!analysis) {
    return (
      <section className="mx-auto max-w-7xl px-6 py-20 text-center">
        {status === "loading" ? (
          <>
            <Loader2 className="size-6 mx-auto text-ink-400 animate-spin" />
            <div className="mt-3 text-ink-300 text-sm">
              Loading incident…
            </div>
          </>
        ) : status === "missing" ? (
          <>
            <div className="text-ink-200 font-medium">Incident not found</div>
            <div className="mt-1 text-sm text-ink-500 max-w-md mx-auto">
              This incident may belong to a different account, or it was
              created before the per-user store was migrated. Try opening
              one from your own history.
            </div>
            <Link
              href="/incidents"
              className="btn-primary mt-5 inline-flex px-4 py-2 text-[13.5px]"
            >
              <ArrowLeft className="size-3.5" />
              Back to history
            </Link>
          </>
        ) : (
          <>
            <div className="text-ink-200 font-medium">Couldn&apos;t load incident</div>
            <div className="mt-1 text-sm text-ink-500 max-w-md mx-auto">
              The backend returned an error. Refresh the page or go back to
              history.
            </div>
            <button
              onClick={() => router.refresh()}
              className="btn-secondary mt-5 px-4 py-2 text-[13.5px]"
            >
              Refresh
            </button>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-8">
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

      <AnalysisResult
        analysis={analysis}
        showAgentTrail={true}
        showOpenDetail={false}
      />

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
