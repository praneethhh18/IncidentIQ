# Acme Commerce (demo target for IncidentIQ)

A small but credible "production" service used to demo IncidentIQ end-to-end. Simulates an e-commerce checkout pipeline with five internal services (`checkout-api`, `payments-worker`, `redis-cache`, `db-primary`, `notifications-svc`).

When you toggle a chaos mode, the relevant service starts failing with **real log lines** in production-shaped format. Those logs are automatically shipped to IncidentIQ's generic webhook, where the agent analyses them and posts the result to your dashboard / Slack.

Use it during the demo to show: **app working → fault injected → IncidentIQ catches it → fix applied → recheck confirms resolved.**

## Run it

From this directory:

```bash
pip install -r requirements.txt
python app.py
```

Open the console at <http://localhost:8002>.

The default webhook target is `http://localhost:8000/api/v1/webhook/generic` (the IncidentIQ backend's generic webhook). Override with `INCIDENTIQ_WEBHOOK_URL` if you point it elsewhere.

## The demo flow

1. **Open <http://localhost:8002>**. The console shows zero orders, all systems healthy.
2. **Click "Place 1 order"** a few times. Orders process successfully, latency low, error rate 0%.
3. **Click "Send 20 orders"** to generate baseline traffic.
4. **Flip the "Postgres pool exhaustion" toggle.** Within seconds the app starts failing. The order placed on toggle generates the cascade.
5. **Switch to IncidentIQ (`http://localhost:3000/incidents`)**. The webhook just arrived. Open the new incident. The agent has already analysed the failure end-to-end (root cause, blast radius, fix).
6. **Optional: ask a follow-up** in the chat at the bottom of the incident page. *"Simplify this in plain English"* / *"give me the kubectl command"*.
7. **Apply the fix** = turn the chaos toggle off in Acme Commerce.
8. **Click "Place 1 order"** again to generate clean traffic.
9. **In IncidentIQ, click "Run recheck"** on the incident. Paste the clean logs from Acme (or just trigger another order — the live log buffer will be clean now). Status flips to **Resolved**.
10. **If SendGrid is configured**, a resolution email lands in the configured inbox.

## What it deliberately does

- **Realistic log shapes**: timestamps in ISO-8601, level-aligned columns, service names matching what the agent's demo data already understands. The same shapes engineers see from real microservices.
- **Cascade simulation**: chaos toggles trigger the exact failure patterns the agent is best at analysing (pool exhaustion → cluster down → circuit breaker open → OOM).
- **Auto-ship**: every failed order ships the last 25 log lines to IncidentIQ. No manual log copy-paste during the demo.

## What it is NOT

- Not a real e-commerce app — orders are just records in a deque, no DB, no payment gateway.
- Not connected to actual Datadog/Grafana/New Relic — those integrations are wired in IncidentIQ itself. Acme uses IncidentIQ's webhook receiver, which is the same code path Datadog's webhook would hit.
- Not multi-user — single in-memory state, resets on restart.

The point is to give judges a believable target app they can see *failing in real time*, so the IncidentIQ analysis lands on logs they just watched being produced. Not synthetic logs, not pre-canned samples — current state of a running service they can see on their screen.
