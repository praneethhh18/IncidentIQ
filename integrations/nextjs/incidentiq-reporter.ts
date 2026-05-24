/**
 * IncidentIQ reporter for Next.js (App Router or Pages Router).
 *
 * Drop this file into your Next.js project at:
 *   src/lib/incidentiq-reporter.ts
 *
 * Then either:
 *   - Wrap your error-prone server actions / route handlers with
 *     `withIncidentReporting(handler)`
 *   - Or call `reportIncident({ title, logs })` directly when you
 *     catch an error you want analysed.
 *
 * The reporter is "fan-out": every error simultaneously ships to up to
 * four destinations, gated by env vars. Any subset can be configured.
 *
 *   INCIDENTIQ_WEBHOOK_URL   -> POSTs to IncidentIQ's webhook directly
 *   DATADOG_API_KEY          -> ships log entries to Datadog Logs HTTP intake
 *   GRAFANA_LOKI_URL +
 *   GRAFANA_LOKI_AUTH        -> pushes to Loki's HTTP push endpoint
 *   NEW_RELIC_LICENSE_KEY    -> ships to New Relic Logs HTTP API
 *
 * The four shippers run in parallel (Promise.allSettled) and are
 * fire-and-forget: none of them block your route handler's response.
 *
 * This is what makes the architecture match the problem statement -
 * your real app's logs flow into the same monitoring tools (Datadog,
 * Grafana, New Relic) that IncidentIQ then connects to and analyses.
 */

interface ReportArgs {
  /** Short human title shown in IncidentIQ's incident list. */
  title: string;
  /** Free-form log payload (one or more lines). */
  logs: string;
  /** Optional service hint to focus the agent. */
  service?: string;
}

// In-process ring buffer so a single error can ship the surrounding
// context, not just the error line itself.
const RECENT_LOGS: string[] = [];
const RECENT_LIMIT = 80;

function pushLog(line: string): void {
  RECENT_LOGS.push(line);
  if (RECENT_LOGS.length > RECENT_LIMIT) {
    RECENT_LOGS.splice(0, RECENT_LOGS.length - RECENT_LIMIT);
  }
}

function fmtLine(level: "INFO" | "WARN" | "ERROR" | "FATAL", service: string, message: string): string {
  const ts = new Date().toISOString();
  return `${ts} ${level.padEnd(5)} ${service.padEnd(20)} ${message}`;
}

/** Hook console.error into the ring buffer so casual `console.error` calls
 *  contribute to incident context automatically. Call once at app startup. */
let consolePatched = false;
export function installConsolePatch(service = "next-app"): void {
  if (consolePatched) return;
  consolePatched = true;

  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const message = args
      .map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ""}` : String(a)))
      .join(" ");
    pushLog(fmtLine("ERROR", service, message));
    origError(...args);
  };

  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const message = args
      .map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ""}` : String(a)))
      .join(" ");
    pushLog(fmtLine("WARN", service, message));
    origWarn(...args);
  };

  const origLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    const message = args.map((a) => String(a)).join(" ");
    pushLog(fmtLine("INFO", service, message));
    origLog(...args);
  };
}

/** Returns the current ring-buffer of log lines (newest last). */
export function recentLogs(): string[] {
  return [...RECENT_LOGS];
}

/** Force-add a structured log line (useful for manual instrumentation). */
export function note(
  level: "INFO" | "WARN" | "ERROR" | "FATAL",
  service: string,
  message: string,
): void {
  pushLog(fmtLine(level, service, message));
}

// ── Destination shippers ────────────────────────────────────────────────
// Each shipper is best-effort. Failures are swallowed in production.

async function shipIncidentIQ(args: ReportArgs, lines: string[]): Promise<void> {
  const url =
    process.env.INCIDENTIQ_WEBHOOK_URL ||
    process.env.NEXT_PUBLIC_INCIDENTIQ_WEBHOOK_URL ||
    "";
  if (!url) return;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: args.title.slice(0, 240),
      logs: `${lines.join("\n")}\n${args.logs}`.trim(),
      ...(args.service ? { service_hint: args.service } : {}),
    }),
    keepalive: true,
  });
}

async function shipDatadog(args: ReportArgs, lines: string[]): Promise<void> {
  const key = process.env.DATADOG_API_KEY;
  if (!key) return;
  const site = process.env.DATADOG_SITE || "datadoghq.com";
  const service = args.service || "next-app";

  // Datadog accepts an array of structured log entries. Each line in
  // the ring buffer becomes one entry so they can be filtered and
  // queried individually in Datadog's Logs Explorer.
  const allLines = [...lines, ...args.logs.split("\n").filter(Boolean)];
  const entries = allLines.map((line) => {
    const level =
      /\bFATAL\b/i.test(line)
        ? "fatal"
        : /\bERROR\b/i.test(line)
        ? "error"
        : /\bWARN\b/i.test(line)
        ? "warn"
        : "info";
    return {
      message: line,
      ddsource: "nodejs",
      service,
      hostname: process.env.VERCEL_URL || "local",
      ddtags: `env:${process.env.NODE_ENV ?? "development"},source:incidentiq-reporter`,
      status: level,
    };
  });

  await fetch(`https://http-intake.logs.${site}/api/v2/logs`, {
    method: "POST",
    headers: {
      "DD-API-KEY": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entries),
    keepalive: true,
  });
}

async function shipGrafanaLoki(args: ReportArgs, lines: string[]): Promise<void> {
  // GRAFANA_LOKI_URL e.g. https://logs-prod-006.grafana.net
  // GRAFANA_LOKI_AUTH must be "<userId>:<apiToken>" for Grafana Cloud
  const lokiUrl = process.env.GRAFANA_LOKI_URL;
  const lokiAuth = process.env.GRAFANA_LOKI_AUTH;
  if (!lokiUrl || !lokiAuth) return;

  const service = args.service || "next-app";
  const allLines = [...lines, ...args.logs.split("\n").filter(Boolean)];
  const nowNs = (Date.now() * 1_000_000).toString();

  // Loki "push" format: one stream with labels + many values.
  const body = {
    streams: [
      {
        stream: {
          service,
          source: "incidentiq-reporter",
          env: process.env.NODE_ENV ?? "development",
        },
        values: allLines.map(
          (line, i) =>
            [(BigInt(nowNs) + BigInt(i)).toString(), line] as [string, string],
        ),
      },
    ],
  };

  await fetch(`${lokiUrl.replace(/\/$/, "")}/loki/api/v1/push`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(lokiAuth).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    keepalive: true,
  });
}

async function shipNewRelic(args: ReportArgs, lines: string[]): Promise<void> {
  // NEW_RELIC_LICENSE_KEY is the license/ingest key (NRII-... or NRAK-...)
  // Different from the user key used by IncidentIQ to query NerdGraph.
  const key = process.env.NEW_RELIC_LICENSE_KEY;
  if (!key) return;

  // Default to US. Use NEW_RELIC_EU=1 if you're in EU region.
  const host =
    process.env.NEW_RELIC_EU === "1"
      ? "https://log-api.eu.newrelic.com"
      : "https://log-api.newrelic.com";

  const service = args.service || "next-app";
  const allLines = [...lines, ...args.logs.split("\n").filter(Boolean)];
  const payload = [
    {
      common: {
        attributes: {
          service,
          source: "incidentiq-reporter",
          env: process.env.NODE_ENV ?? "development",
          hostname: process.env.VERCEL_URL || "local",
        },
      },
      logs: allLines.map((line) => ({
        message: line,
        timestamp: Date.now(),
      })),
    },
  ];

  await fetch(`${host}/log/v1`, {
    method: "POST",
    headers: {
      "Api-Key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: true,
  });
}

/**
 * Ship an incident report to every configured destination. Best-effort and
 * non-blocking: any failure is swallowed and never breaks the caller's flow.
 *
 * Destinations are gated by environment variables, so configuring only
 * one (or zero) is fine - the others stay dormant.
 *
 * Returns a Promise but you generally don't need to await it. The typical
 * pattern is `void reportIncident({...})` from inside a catch block.
 */
export async function reportIncident(args: ReportArgs): Promise<void> {
  const ring = recentLogs().slice(-30);

  const tasks: Array<Promise<void>> = [
    shipIncidentIQ(args, ring),
    shipDatadog(args, ring),
    shipGrafanaLoki(args, ring),
    shipNewRelic(args, ring),
  ];

  const results = await Promise.allSettled(tasks);
  if (process.env.NODE_ENV !== "production") {
    const names = ["incidentiq", "datadog", "grafana-loki", "new-relic"];
    results.forEach((res, i) => {
      if (res.status === "rejected") {
        // eslint-disable-next-line no-console
        console.error(`[incidentiq-reporter] ${names[i]} ship failed:`, res.reason);
      }
    });
  }
}

/**
 * Wrap a Next.js route handler or server action so any thrown error is
 * automatically reported to all configured destinations before being re-thrown.
 *
 * Usage (App Router):
 *
 *   import { withIncidentReporting } from "@/lib/incidentiq-reporter";
 *
 *   async function GET(req: Request) {
 *     // your code, may throw
 *   }
 *   export const GET = withIncidentReporting(GET, { service: "fashion-aura-api" });
 */
export function withIncidentReporting<TArgs extends unknown[], TReturn>(
  handler: (...args: TArgs) => Promise<TReturn>,
  options: { service?: string; titlePrefix?: string } = {},
): (...args: TArgs) => Promise<TReturn> {
  const service = options.service ?? "next-app";
  const titlePrefix = options.titlePrefix ?? "Unhandled error";

  return async (...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      note("ERROR", service, `${e.name}: ${e.message}`);
      if (e.stack) note("ERROR", service, e.stack.split("\n").slice(0, 6).join("\n"));

      void reportIncident({
        title: `${titlePrefix} - ${e.message.slice(0, 120)}`,
        logs: `${e.name}: ${e.message}\n${e.stack ?? ""}`,
        service,
      });

      throw error;
    }
  };
}
