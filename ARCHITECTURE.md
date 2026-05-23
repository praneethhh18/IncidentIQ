# Architecture

This document explains how IncidentIQ is wired together end-to-end.

## High-level

```
┌──────────────────────────┐    HTTP/JSON    ┌──────────────────────────────┐
│  Next.js 14 (App Router) │ ──────────────▶ │  FastAPI + Pydantic v2       │
│  TypeScript + Tailwind   │ ◀────────────── │  Python 3.11+                │
│  React Server Components │                 │                              │
└──────────────────────────┘                 └─────┬────────────────────────┘
                                                   │
                  ┌────────────────────────────────┼──────────────────────────┐
                  ▼                                ▼                          ▼
        ┌──────────────────┐            ┌────────────────────┐      ┌──────────────────┐
        │  AWS Bedrock     │            │  Monitoring        │      │  PDF Reports     │
        │  Nova Pro        │            │  Integrations      │      │  ReportLab       │
        │  (Converse API)  │            │  Datadog/Grafana/  │      │                  │
        │                  │            │  New Relic         │      │                  │
        └──────────────────┘            └────────────────────┘      └──────────────────┘
```

## Request lifecycle: "Analyze incident"

IncidentIQ is built as a four-phase **agent**, not a one-shot LLM call.

1. **Frontend** — user opens `/dashboard`, pastes logs or chooses a sample,
   clicks **Analyze incident**.
2. **POST `/api/v1/analyze`** — JSON body shaped like `AnalyzeRequest`.
3. **Phase 1 · Perceive** (`Analyzer._resolve_logs`) — for paste/upload
   the body already has logs; for integration sources we call the
   integration's `fetch_logs()` (which falls back to seeded fixtures when
   not configured).
4. **Phase 2 · Plan & observe** (`IncidentAgent.plan_and_observe`) — the
   agent runs a deterministic multi-step loop, calling tools from
   `agent_tools.py` to inventory entities, correlate the timeline, infer
   service roles, test the strongest signal as a hypothesis, and search
   the local store for similar past incidents. Each step is appended to
   a visible trail.
5. **Phase 3 · Synthesise** (`Analyzer._run_inference`) — the agent's
   grounded briefing + raw telemetry is handed to `BedrockClient.converse_json`.
   If Bedrock is unavailable, the analyzer selects a hand-crafted demo
   analysis via `demo_data.fallback_analysis()`. If parsing fails, we
   again degrade to the demo fallback rather than 500.
6. **Phase 4 · Self-check** (`IncidentAgent.audit_and_annotate`) — the
   agent verifies that every service named in the analysis was observed
   in the raw telemetry. If not, confidence is reduced by 15% and an
   audit step is appended to the trail.
7. **Persist** — the result (including the full `agent_steps` trail) is
   saved to the in-process `AnalysisStore` so the dashboard "History"
   page and the PDF export endpoint can read it.
8. **Render** — the frontend `<AnalysisResult>` lays out the root cause,
   confidence, timeline, services, fixes, evidence, and the agent's
   reasoning trail.

## Demo mode

IncidentIQ never returns a 500 because credentials are missing. Three layers
of graceful degradation work in concert:

| Layer | Without keys, returns... |
| --- | --- |
| `BedrockClient` | Marks `enabled=False` at startup |
| `Analyzer.run_inference` | Picks the closest hand-crafted demo analysis |
| `*Integration.fetch_logs` | Returns a seeded log stream that matches that integration's "personality" |

This makes the application demoable in five seconds on a fresh machine and
keeps the failure surface small in production.

## Module layout

### Backend

```
backend/app/
  main.py                 — FastAPI factory, CORS, startup logging
  core/
    config.py             — typed settings via pydantic-settings + .env
    logging.py            — single stdout handler
  api/
    deps.py               — per-request singletons
    analyze.py            — POST /api/v1/analyze, /analyze/upload
    incidents.py          — GET /api/v1/incidents, /incidents/{id}
    integrations.py       — GET /api/v1/integrations
    samples.py            — GET /api/v1/samples
    export.py             — GET /api/v1/incidents/{id}/export.pdf
  models/
    incident.py           — Pydantic models (request, response, summary)
  prompts/
    root_cause.py         — system & user prompt templates + JSON schema
  services/
    agent.py              — IncidentAgent: think → act → observe → decide loop
    agent_tools.py        — Five tools the agent can call
    bedrock.py            — boto3 wrapper around Bedrock Converse API
    analyzer.py           — orchestration: perceive → agent → bedrock → audit
    pdf_export.py         — ReportLab post-mortem template (includes agent trail)
    store.py              — thread-safe in-memory analysis store
    demo_data.py          — hand-crafted incidents (cascading / OOM / DB)
    integrations/
      base.py             — MonitoringIntegration ABC
      datadog.py          — Logs Search API v2
      grafana.py          — Loki query_range
      newrelic.py         — NerdGraph + NRQL
```

### Frontend

```
frontend/src/
  app/
    layout.tsx            — shared nav/footer, dark theme
    page.tsx              — landing
    dashboard/page.tsx    — main analyze flow (server component)
    incidents/page.tsx    — history list
    incidents/[id]/page.tsx — individual analysis view
  components/
    AnalyzePanel.tsx      — tabbed input UI (paste/upload/integrations)
    AnalysisResult.tsx    — the full result layout
    IncidentTimeline.tsx
    ServiceGraph.tsx
    FixRecommendations.tsx
    RootCauseCard.tsx
    EvidenceList.tsx
    SeverityBadge.tsx
    IntegrationCard.tsx
  lib/
    api.ts                — typed fetch wrapper
    types.ts              — mirrors backend Pydantic models
    utils.ts              — cn() and date helpers
```

## Why these choices

| Decision | Reason |
| --- | --- |
| **AWS Bedrock Converse API** | One code path supports Nova Pro today and any model swap tomorrow. |
| **Pydantic v2** | Strict request/response validation gives us the option of doing structured output in one round-trip without retries. |
| **In-memory store** | Hackathon-friendly. Swappable with SQLite/Postgres by replacing `AnalysisStore` only. |
| **Demo fallback at every layer** | Removes the "but it doesn't work without keys" failure mode that kills demos. |
| **Next.js App Router + RSC** | Most of the read-side pages are SSR with zero client JS until you reach interactive panels. |
| **Tailwind + handcrafted CSS** | No UI kit dependency. Keeps the visual style cohesive and the bundle small. |
| **ReportLab** | Pure Python, no system deps — works on Vercel / Lambda without extra build steps. |

## Deployment

- **Frontend → Vercel.** Set `NEXT_PUBLIC_API_URL` to your backend URL.
- **Backend → AWS Lambda + API Gateway** via the bundled Mangum adapter,
  or any container host (Fly.io, Render, Railway). `requirements.txt`
  is the only Python dependency manifest.

## Future work

- Persistent storage (SQLite for single-host, Postgres for multi-instance).
- SSE-streamed analysis so users watch the AI think.
- Webhook intake from PagerDuty / Opsgenie to auto-analyze on page.
- Slack / Teams notifications attached to each analysis.
