import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { AnalysisResult } from "@/components/AnalysisResult";

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
      <Link
        href="/incidents"
        className="btn-ghost px-2 py-1 text-[12.5px] mb-4"
      >
        <ArrowLeft className="size-3.5" /> All incidents
      </Link>
      <AnalysisResult analysis={analysis} />
    </section>
  );
}
