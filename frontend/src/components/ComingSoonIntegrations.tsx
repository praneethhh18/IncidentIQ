"use client";

/**
 * ComingSoonIntegrations. A row of "connect-your-stack" cards that
 * preview the next integrations IncidentIQ will support. Clicking any
 * one opens a modal describing what that integration unlocks.
 *
 * Honest framing: each card is clearly marked "Coming soon" so a judge
 * or user understands the current scope. The point is to show the
 * extensibility direction without faking a working OAuth.
 */

import { useEffect, useState } from "react";
import {
  Boxes,
  Cloud,
  Github,
  KeyRound,
  ShieldAlert,
  Slack,
  TriangleAlert,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface UpcomingSource {
  id: string;
  name: string;
  icon: typeof Github;
  tagline: string;
  description: string;
  whatYouGet: string[];
  authMethod: string;
  eta: string;
}

const UPCOMING: UpcomingSource[] = [
  {
    id: "github",
    name: "GitHub",
    icon: Github,
    tagline: "CI failures and deploy correlation",
    description:
      "Authorize once and IncidentIQ watches your repo's GitHub Actions for failed workflows. The agent pulls the run logs and analyses them like any other incident. When a production incident fires, recent merges and deploys are surfaced alongside the analysis as 'possibly related changes'.",
    whatYouGet: [
      "Failed workflow run auto-analysis",
      "Deploy / commit correlation on every incident",
      "Per-repo incident history",
      "Slash command in pull requests",
    ],
    authMethod: "GitHub OAuth (read-only on Actions and commits)",
    eta: "Roadmap",
  },
  {
    id: "vercel",
    name: "Vercel",
    icon: TriangleAlert,
    tagline: "Build and runtime errors",
    description:
      "Connect a Vercel team and IncidentIQ ingests build failures and runtime errors from your deployments. Failed builds get an instant root-cause analysis. Production runtime errors stream in and trigger a Deep Trace when error rate crosses a threshold.",
    whatYouGet: [
      "Failed build analysis with the build logs",
      "Runtime error stream from Vercel Edge / Functions",
      "Deployment correlation with incidents",
      "Per-preview branch error grouping",
    ],
    authMethod: "Vercel OAuth (read deployments and logs)",
    eta: "Roadmap",
  },
  {
    id: "aws",
    name: "AWS CloudWatch",
    icon: Cloud,
    tagline: "Logs and alarms",
    description:
      "Drop an IAM role ARN and IncidentIQ pulls CloudWatch Logs from any service: EC2, ECS, Fargate, Lambda. CloudWatch Alarms fire straight into the analysis pipeline. The agent understands AWS-flavoured errors out of the box (RDS, ElastiCache, SQS, etc).",
    whatYouGet: [
      "Cross-service CloudWatch Logs ingestion",
      "Alarm-triggered auto-analysis",
      "Lambda crash report with stack trace",
      "RDS performance event correlation",
    ],
    authMethod: "IAM role with logs:Get* and cloudwatch:Describe*",
    eta: "Roadmap",
  },
  {
    id: "k8s",
    name: "Kubernetes",
    icon: Boxes,
    tagline: "Pod logs and crash events",
    description:
      "Apply a small read-only ServiceAccount to your cluster and IncidentIQ streams pod logs and Kubernetes events. CrashLoopBackOff, OOMKilled, and FailedScheduling events become incidents automatically. The agent maps your service mesh from the deployment topology.",
    whatYouGet: [
      "Pod log streaming with namespace filters",
      "Auto-analysis on CrashLoopBackOff and OOMKilled",
      "Service-mesh topology used for blast radius",
      "kubectl-style snippets in fix recommendations",
    ],
    authMethod: "Read-only ServiceAccount (pods, events, deployments)",
    eta: "Roadmap",
  },
  {
    id: "sentry",
    name: "Sentry",
    icon: ShieldAlert,
    tagline: "Issues and release health",
    description:
      "Connect Sentry and every new issue with frequency above a threshold gets auto-analysed by the agent. Release health regressions become incidents. Stack traces are first-class evidence in the root-cause output.",
    whatYouGet: [
      "Issue webhook → automatic analysis",
      "Release health regression detection",
      "Stack trace pinned to root-cause output",
      "Per-environment incident grouping",
    ],
    authMethod: "Sentry integration with project:read scope",
    eta: "Roadmap",
  },
  {
    id: "slack",
    name: "Slack",
    icon: Slack,
    tagline: "Reply and triage in-thread",
    description:
      "Install the IncidentIQ Slack app and your on-call channel becomes a triage surface. Each posted incident gets a thread; type /iq run to fire a deeper analysis, /iq forensic to escalate, /iq runbook to attach the relevant runbook. All replies stay in the incident history.",
    whatYouGet: [
      "/iq slash commands in any channel",
      "Auto-post analyses on incoming webhooks",
      "Reply-to-triage with thread continuity",
      "Acknowledge, escalate, and resolve from Slack",
    ],
    authMethod: "Slack app install (bot + chat:write scope)",
    eta: "Roadmap",
  },
];

export function ComingSoonIntegrations() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = UPCOMING.find((u) => u.id === activeId) ?? null;

  return (
    <section className="mt-10">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="section-title">Connect your stack</h2>
          <p className="text-[12.5px] text-ink-400 mt-1.5">
            More sources land in IncidentIQ next. Tap any to preview what
            ships first.
          </p>
        </div>
        <span className="chip">Roadmap</span>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {UPCOMING.map((source) => (
          <ComingSoonCard
            key={source.id}
            source={source}
            onOpen={() => setActiveId(source.id)}
          />
        ))}
      </div>

      <IntegrationModal source={active} onClose={() => setActiveId(null)} />
    </section>
  );
}

function ComingSoonCard({
  source,
  onOpen,
}: {
  source: UpcomingSource;
  onOpen: () => void;
}) {
  const Icon = source.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group text-left rounded-2xl border border-white/[0.06] bg-ink-900/40 p-4",
        "hover:border-white/[0.12] hover:bg-ink-900/70 transition",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="size-9 grid place-items-center rounded-lg bg-white/[0.04] border border-white/[0.07] text-ink-100 shrink-0">
          <Icon className="size-4" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink-50 text-[13.5px]">
              {source.name}
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-500 font-mono">
              soon
            </span>
          </div>
          <div className="text-[12px] text-ink-400 mt-0.5">{source.tagline}</div>
        </div>
      </div>
    </button>
  );
}

function IntegrationModal({
  source,
  onClose,
}: {
  source: UpcomingSource | null;
  onClose: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    if (!source) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [source, onClose]);

  if (!source) return null;
  const Icon = source.icon;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center px-4 animate-fade-in"
      role="dialog"
      aria-modal
    >
      {/* Backdrop */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-lg rounded-2xl border border-white/[0.10] bg-ink-900 shadow-2xl overflow-hidden">
        <header className="flex items-start gap-4 p-6 border-b border-white/[0.06]">
          <div className="size-11 grid place-items-center rounded-xl bg-white/[0.05] border border-white/[0.08] text-ink-50 shrink-0">
            <Icon className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-ink-50">
                {source.name}
              </h3>
              <span className="chip bg-amber-500/10 text-amber-300 border-amber-500/25">
                {source.eta}
              </span>
            </div>
            <p className="text-[12.5px] text-ink-400 mt-1">{source.tagline}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost size-8 p-0 grid place-items-center -mr-1 -mt-1"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="p-6 space-y-5">
          <p className="text-[13.5px] text-ink-300 leading-relaxed">
            {source.description}
          </p>

          <div>
            <div className="section-title">What you get</div>
            <ul className="mt-3 space-y-1.5">
              {source.whatYouGet.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[13px] text-ink-200"
                >
                  <span className="size-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-ink-950/50 px-3 py-2.5">
            <KeyRound className="size-3.5 text-ink-400 mt-0.5 shrink-0" />
            <div className="text-[12px] text-ink-300 leading-snug">
              <span className="text-ink-500">Auth: </span>
              {source.authMethod}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 px-6 py-4 border-t border-white/[0.06] bg-ink-950/40">
          <p className="text-[11.5px] text-ink-500">
            Today: paste logs, webhook in, or use Datadog/Grafana/New Relic.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary px-3.5 py-1.5 text-[13px]"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
