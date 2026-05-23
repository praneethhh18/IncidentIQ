import { Suspense } from "react";

import { api } from "@/lib/api";
import type { IntegrationStatus, SampleIncident } from "@/lib/types";
import { AnalyzePanel } from "@/components/AnalyzePanel";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [samples, integrations] = await Promise.all([
    api.samples().catch<SampleIncident[]>(() => []),
    api.integrations().catch<IntegrationStatus[]>(() => []),
  ]);

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-7">
        <div className="chip">Dashboard</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-50">
          Analyze an incident
        </h1>
        <p className="mt-2 text-ink-300 max-w-2xl">
          Paste logs, upload a file, or pull straight from a connected
          monitoring tool. IncidentIQ returns a senior-SRE-grade root-cause
          analysis in seconds.
        </p>
      </header>

      <Suspense>
        <AnalyzePanel samples={samples} integrations={integrations} />
      </Suspense>
    </section>
  );
}
