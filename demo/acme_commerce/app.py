"""Acme Commerce - a small but credible demo service for IncidentIQ.

WHY THIS EXISTS
---------------
IncidentIQ ingests logs from real production apps. For a hackathon demo
that has to land in 3 minutes, we need a target app the judges can
*see* working, failing, and recovering. This is that app.

It simulates the checkout flow of an e-commerce site (Acme Commerce)
with five internal services:

  * checkout-api      - the front door
  * payments-worker   - charges the card
  * redis-cache       - session + rate-limit storage
  * db-primary        - Postgres-shaped order persistence
  * notifications-svc - emails the user

Each "service" is just a function in this file, but they all log with
proper service names, request IDs, and severity levels - the exact
shape of logs a real production system would emit.

CHAOS MODES
-----------
The /admin/chaos endpoint toggles failure modes:

  * db_pool_exhausted    - DB calls start failing with pool exhaustion
  * redis_clusterdown    - Redis goes CLUSTERDOWN
  * payments_oom         - payments-worker OOMs
  * circuit_breaker_open - api-gateway trips the breaker

When chaos is on, the corresponding endpoints fail with error logs
that look exactly like the failure cascade the IncidentIQ demo data
was modelled on. Those error logs are auto-shipped to IncidentIQ's
generic webhook so the judges can watch the analysis appear live.

RUNNING
-------
    cd demo/acme_commerce
    pip install -r requirements.txt
    python app.py

The admin UI opens at http://localhost:8002.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import time
import uuid
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List

import httpx
from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

# ── Logging ──────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)sZ %(levelname)-5s %(name)-20s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

# Per-service loggers so log lines carry a real service name.
LOGGERS = {
    name: logging.getLogger(name)
    for name in (
        "checkout-api",
        "payments-worker",
        "redis-cache",
        "db-primary",
        "notifications-svc",
        "api-gateway",
    )
}


# ── In-process state ────────────────────────────────────────────────────


class State:
    """All the mutable state for the demo app.

    Lives in memory. Resets every time the process restarts, which is
    desirable for a demo.
    """

    def __init__(self) -> None:
        self.chaos: Dict[str, bool] = {
            "db_pool_exhausted": False,
            "redis_clusterdown": False,
            "payments_oom": False,
            "circuit_breaker_open": False,
        }
        self.metrics: Dict[str, int] = {
            "orders_placed": 0,
            "orders_succeeded": 0,
            "orders_failed": 0,
        }
        self.latency_samples_ms: Deque[float] = deque(maxlen=200)
        self.recent_logs: Deque[str] = deque(maxlen=300)
        self.recent_orders: Deque[Dict[str, Any]] = deque(maxlen=20)

    def reset(self) -> None:
        for key in self.chaos:
            self.chaos[key] = False
        self.metrics = {"orders_placed": 0, "orders_succeeded": 0, "orders_failed": 0}
        self.latency_samples_ms.clear()
        self.recent_logs.clear()
        self.recent_orders.clear()


state = State()

# IncidentIQ webhook target. Defaults to localhost which matches our
# default backend. The admin UI can flip this at runtime.
INCIDENTIQ_WEBHOOK = os.environ.get(
    "INCIDENTIQ_WEBHOOK_URL", "http://localhost:8000/api/v1/webhook/generic"
)


# ── Log helpers ─────────────────────────────────────────────────────────


def _emit(service: str, level: str, message: str) -> str:
    """Log to stdout, the in-memory ring buffer, and return the line."""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z"
    line = f"{ts} {level:<5} {service:<20} {message}"
    state.recent_logs.append(line)
    log = LOGGERS.get(service, logging.getLogger("acme"))
    if level == "FATAL":
        log.critical(message)
    elif level == "ERROR":
        log.error(message)
    elif level == "WARN":
        log.warning(message)
    else:
        log.info(message)
    return line


def _new_request_id() -> str:
    return f"req_{uuid.uuid4().hex[:10]}"


# ── Service simulation ─────────────────────────────────────────────────


async def call_db(req_id: str, query: str) -> None:
    """Pretend to query Postgres. Fails if db_pool_exhausted is set."""
    if state.chaos["db_pool_exhausted"]:
        # Realistic Postgres-shaped failure cascade.
        _emit("db-primary", "WARN",
              f"req={req_id} Postgres pool getConnection waited 1.8s host=db-primary.internal")
        await asyncio.sleep(0.05)
        _emit("checkout-api", "ERROR",
              f"req={req_id} Postgres pool exhausted: 200/200 connections in use, 47 waiting")
        raise RuntimeError("Postgres pool exhausted")
    await asyncio.sleep(random.uniform(0.01, 0.04))


async def call_redis(req_id: str, key: str) -> None:
    """Pretend to use Redis."""
    if state.chaos["redis_clusterdown"]:
        _emit("redis-cache", "ERROR",
              f"req={req_id} CLUSTERDOWN The cluster is down")
        _emit("payments-worker", "ERROR",
              f"req={req_id} Failed to acquire order lock - Redis CLUSTERDOWN")
        raise RuntimeError("Redis CLUSTERDOWN")
    await asyncio.sleep(random.uniform(0.002, 0.008))


async def call_payments(req_id: str, amount_cents: int) -> None:
    """Pretend to charge a card."""
    if state.chaos["payments_oom"]:
        _emit("payments-worker", "ERROR",
              f"req={req_id} Out of memory: heap=512MiB rss=731MiB, killing process")
        _emit("payments-worker", "FATAL",
              f"req={req_id} OOMKilled, CrashLoopBackOff (restart 3)")
        raise RuntimeError("payments-worker OOM")
    await asyncio.sleep(random.uniform(0.04, 0.12))


async def call_notifications(req_id: str) -> None:
    """Pretend to send an email."""
    await asyncio.sleep(random.uniform(0.005, 0.02))
    _emit("notifications-svc", "INFO",
          f"req={req_id} notification queued for delivery")


def maybe_circuit_breaker(req_id: str) -> None:
    """If the breaker is open, trip and stop the request."""
    if state.chaos["circuit_breaker_open"]:
        _emit("api-gateway", "WARN",
              f"req={req_id} Circuit breaker OPEN for upstream: payments-worker (50/50 fails)")
        raise RuntimeError("Circuit breaker open")


# ── Webhook ship-out ────────────────────────────────────────────────────

# Shape of the cascade lines we send to IncidentIQ when an order fails.
# We capture the actual log lines from the in-memory ring buffer so
# IncidentIQ analyses real telemetry, not fabricated text.


async def ship_failure_to_incidentiq(req_id: str, reason: str) -> None:
    """Fire a 'generic' webhook at IncidentIQ with the recent error logs."""
    # Grab the last ~25 lines so the agent has cascade context.
    recent = list(state.recent_logs)[-25:]
    payload = {
        "title": f"Acme Commerce checkout failure - {reason}",
        "logs": "\n".join(recent),
    }
    try:
        async with httpx.AsyncClient(timeout=4) as client:
            await client.post(INCIDENTIQ_WEBHOOK, json=payload)
    except Exception:  # noqa: BLE001
        # The demo target running IncidentIQ may not be up. Don't break
        # the order pipeline because of that - just log it locally.
        LOGGERS["api-gateway"].warning(
            "Failed to ship logs to IncidentIQ webhook (%s)", INCIDENTIQ_WEBHOOK
        )


# ── App setup ──────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"\n  Acme Commerce demo is up on http://localhost:8002")
    print(f"  Shipping incidents to: {INCIDENTIQ_WEBHOOK}\n")
    yield


app = FastAPI(title="Acme Commerce (Demo)", lifespan=lifespan)


# ── Public endpoints ────────────────────────────────────────────────────


class CheckoutRequest(BaseModel):
    sku: str = "SKU-COFFEE-001"
    qty: int = 1
    user_id: str | None = None


@app.post("/api/orders")
async def place_order(body: CheckoutRequest = Body(default_factory=CheckoutRequest)):
    req_id = _new_request_id()
    user = body.user_id or f"u_{random.randint(1000, 9999)}"
    start = time.perf_counter()
    state.metrics["orders_placed"] += 1
    _emit("checkout-api", "INFO",
          f"req={req_id} POST /api/orders user={user} sku={body.sku} qty={body.qty}")

    try:
        maybe_circuit_breaker(req_id)
        await call_redis(req_id, f"session:{user}")
        await call_db(req_id, "INSERT INTO orders ...")
        await call_payments(req_id, body.qty * 1200)
        await call_db(req_id, "UPDATE orders SET status='paid' ...")
        await call_notifications(req_id)
    except Exception as exc:  # noqa: BLE001
        # Failed order: record metrics, ship to IncidentIQ.
        latency_ms = (time.perf_counter() - start) * 1000
        state.latency_samples_ms.append(latency_ms)
        state.metrics["orders_failed"] += 1
        _emit("checkout-api", "ERROR",
              f"req={req_id} status=503 took {int(latency_ms)}ms ({exc})")
        await ship_failure_to_incidentiq(req_id, str(exc))
        return JSONResponse(
            status_code=503,
            content={
                "request_id": req_id,
                "status": "failed",
                "error": str(exc),
                "latency_ms": int(latency_ms),
            },
        )

    latency_ms = (time.perf_counter() - start) * 1000
    state.latency_samples_ms.append(latency_ms)
    state.metrics["orders_succeeded"] += 1
    order = {
        "id": f"ord_{uuid.uuid4().hex[:8]}",
        "request_id": req_id,
        "user": user,
        "sku": body.sku,
        "qty": body.qty,
        "amount_cents": body.qty * 1200,
        "status": "paid",
        "latency_ms": int(latency_ms),
    }
    state.recent_orders.appendleft(order)
    _emit("checkout-api", "INFO",
          f"req={req_id} order placed id={order['id']} took {int(latency_ms)}ms")
    return order


@app.get("/api/orders")
def list_orders():
    return list(state.recent_orders)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "chaos": state.chaos,
        "uptime": "demo",
    }


# ── Admin endpoints ─────────────────────────────────────────────────────


class ChaosUpdate(BaseModel):
    chaos: Dict[str, bool]


@app.post("/admin/chaos")
def set_chaos(body: ChaosUpdate):
    for key, value in body.chaos.items():
        if key in state.chaos:
            state.chaos[key] = bool(value)
    return {"chaos": state.chaos}


class BurstRequest(BaseModel):
    count: int = 20


@app.post("/admin/burst")
async def burst(body: BurstRequest):
    """Fire N orders in quick succession - used by the 'send traffic' button."""
    results = []
    for _ in range(min(body.count, 200)):
        try:
            res = await place_order(CheckoutRequest())
            if isinstance(res, JSONResponse):
                results.append({"ok": False, "status": res.status_code})
            else:
                results.append({"ok": True, "status": 200})
        except Exception:  # noqa: BLE001
            results.append({"ok": False, "status": 500})
        await asyncio.sleep(0.02)
    return {"sent": len(results), "results": results}


@app.post("/admin/reset")
def reset():
    state.reset()
    return {"ok": True}


@app.get("/admin/metrics")
def metrics():
    samples = list(state.latency_samples_ms)
    p50 = sorted(samples)[len(samples) // 2] if samples else 0
    p99 = sorted(samples)[int(len(samples) * 0.99)] if samples else 0
    total = state.metrics["orders_placed"]
    error_rate = (state.metrics["orders_failed"] / total) if total > 0 else 0
    return {
        "orders": state.metrics,
        "error_rate": round(error_rate, 4),
        "latency_p50_ms": round(p50, 1),
        "latency_p99_ms": round(p99, 1),
        "chaos": state.chaos,
        "incidentiq_webhook": INCIDENTIQ_WEBHOOK,
    }


@app.get("/admin/logs")
def get_logs():
    return {"lines": list(state.recent_logs)[-80:]}


# ── UI ──────────────────────────────────────────────────────────────────


@app.get("/", response_class=HTMLResponse)
def index():
    return HTMLResponse(_HTML)


# Inline HTML - kept in one file so the demo is `python app.py` and
# nothing else. Visually matches IncidentIQ's dark / neutral palette.
_HTML = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Acme Commerce - demo console</title>
<style>
  * { box-sizing: border-box; }
  :root {
    --bg: #09090b;
    --surface: #18181b;
    --surface-2: #27272a;
    --line: rgba(255,255,255,0.07);
    --text: #fafafa;
    --muted: #a1a1aa;
    --dim: #71717a;
    --p1: #f43f5e;
    --p2: #f59e0b;
    --p3: #22c55e;
    --accent: #a78bfa;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  }
  html,body { background:var(--bg); color:var(--text); font-family:var(--sans); margin:0; }
  body { min-height:100vh; padding:32px 24px; max-width:1180px; margin:auto; }
  h1, h2, h3 { letter-spacing:-0.01em; margin:0; }
  h1 { font-size:22px; }
  h2 { font-size:11px; font-weight:600; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted); }
  a { color:var(--accent); text-decoration:none; }
  .row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  header { display:flex; align-items:center; justify-content:space-between; padding-bottom:18px; border-bottom:1px solid var(--line); margin-bottom:24px; }
  .brand { display:flex; align-items:center; gap:10px; }
  .brand-mark {
    width:30px; height:30px; border-radius:8px;
    background:linear-gradient(135deg, #fb7185, #f59e0b);
    display:grid; place-items:center; color:#0a0a0a; font-weight:700; font-size:14px;
  }
  .brand-name { font-weight:600; }
  .brand-sub { color:var(--dim); font-size:11px; margin-left:6px; }
  .pill {
    display:inline-flex; align-items:center; gap:6px;
    padding:4px 10px; border-radius:999px; font-size:11px; font-weight:500;
    border:1px solid var(--line); background:rgba(255,255,255,0.04); color:var(--muted);
  }
  .pill .dot { width:6px; height:6px; border-radius:999px; background:var(--p3); }
  .pill.warn .dot { background:var(--p2); }
  .pill.err .dot { background:var(--p1); }
  .grid { display:grid; gap:16px; grid-template-columns: repeat(12, 1fr); }
  .card {
    grid-column: span 12;
    background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:18px;
  }
  .card.col-4 { grid-column: span 4; }
  .card.col-6 { grid-column: span 6; }
  .card.col-8 { grid-column: span 8; }
  @media (max-width: 800px) {
    .card.col-4, .card.col-6, .card.col-8 { grid-column: span 12; }
  }
  .stat .val { font-size:28px; font-weight:600; font-variant-numeric:tabular-nums; margin-top:4px; }
  .stat .sub { font-size:11px; color:var(--dim); margin-top:6px; font-family:var(--mono); }
  .btn {
    padding:8px 14px; border-radius:8px; border:1px solid var(--line);
    background:var(--surface-2); color:var(--text); font-size:13px; font-weight:500;
    cursor:pointer; transition:background .15s, border-color .15s;
  }
  .btn:hover { border-color: rgba(255,255,255,0.18); background:#3f3f46; }
  .btn:disabled { opacity:0.5; cursor:not-allowed; }
  .btn.primary { background:var(--text); color:#09090b; border-color:var(--text); }
  .btn.primary:hover { background:#e4e4e7; }
  .btn.danger { background:rgba(244,63,94,0.10); border-color:rgba(244,63,94,0.25); color:#fda4af; }
  .btn.danger:hover { background:rgba(244,63,94,0.18); }
  .toggle { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-radius:10px; border:1px solid var(--line); background:#0f0f11; }
  .toggle.on { border-color:rgba(244,63,94,0.3); background:rgba(244,63,94,0.06); }
  .toggle .label { font-size:13px; }
  .toggle .desc { font-size:11px; color:var(--dim); margin-top:2px; font-family:var(--mono); }
  .switch { width:36px; height:20px; border-radius:999px; background:#3f3f46; position:relative; cursor:pointer; transition:background .2s; }
  .switch.on { background:#f43f5e; }
  .switch::after { content:""; position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:999px; background:white; transition:left .2s; }
  .switch.on::after { left:18px; }
  .log {
    font-family:var(--mono); font-size:11.5px; line-height:1.55; color:var(--muted);
    max-height:280px; overflow:auto; padding:12px 14px;
    background:#08080a; border-radius:10px; border:1px solid var(--line);
  }
  .log .ERROR, .log .FATAL { color:#fca5a5; }
  .log .WARN { color:#fcd34d; }
  .log .INFO { color:#a1a1aa; }
  .log line { display:block; }
  .order-row {
    display:grid; grid-template-columns: 1fr auto auto; gap:10px; padding:8px 0;
    border-bottom:1px solid var(--line); font-size:12.5px;
  }
  .order-row .id { font-family:var(--mono); color:var(--muted); }
  .order-row .latency { font-family:var(--mono); color:var(--dim); }
  .status-ok { color:#86efac; }
  .status-fail { color:#fca5a5; }
  .footer { margin-top:24px; padding-top:16px; border-top:1px solid var(--line); color:var(--dim); font-size:11px; }
</style>
</head><body>

<header>
  <div class="brand">
    <div class="brand-mark">A</div>
    <div>
      <div class="brand-name">Acme Commerce</div>
      <div class="brand-sub">demo console - monitored by IncidentIQ</div>
    </div>
  </div>
  <div class="row">
    <span class="pill" id="health-pill"><span class="dot"></span><span id="health-label">healthy</span></span>
    <a href="http://localhost:3000/incidents" target="_blank" class="pill">Open IncidentIQ <span style="opacity:.6">&#8599;</span></a>
  </div>
</header>

<div class="grid">

  <div class="card col-4 stat">
    <h2>Orders processed</h2>
    <div class="val" id="m-orders">0</div>
    <div class="sub" id="m-orders-detail">0 ok / 0 failed</div>
  </div>
  <div class="card col-4 stat">
    <h2>Error rate</h2>
    <div class="val" id="m-error">0.0%</div>
    <div class="sub">last window</div>
  </div>
  <div class="card col-4 stat">
    <h2>Latency p99</h2>
    <div class="val" id="m-p99">0 ms</div>
    <div class="sub" id="m-p50">p50: 0 ms</div>
  </div>

  <div class="card col-8">
    <div class="row" style="justify-content:space-between; margin-bottom:14px;">
      <h2>Generate traffic</h2>
      <span class="pill" id="webhook-pill"><span class="dot"></span><span id="webhook-label">webhook ready</span></span>
    </div>
    <p style="color:var(--muted); font-size:13px; line-height:1.5; margin-top:0;">
      Send orders through the checkout pipeline (checkout-api -> redis-cache -> db-primary -> payments-worker -> notifications-svc).
      Failures auto-ship to IncidentIQ via webhook.
    </p>
    <div class="row" style="margin-top:14px;">
      <button class="btn primary" id="btn-place-1">Place 1 order</button>
      <button class="btn" id="btn-burst-20">Send 20 orders</button>
      <button class="btn" id="btn-burst-100">Send 100 orders</button>
      <button class="btn danger" id="btn-reset" style="margin-left:auto;">Reset state</button>
    </div>
  </div>

  <div class="card col-4">
    <h2>Recent orders</h2>
    <div id="orders" style="margin-top:10px;"></div>
  </div>

  <div class="card col-12">
    <div class="row" style="justify-content:space-between; margin-bottom:12px;">
      <h2>Chaos engineering</h2>
      <span class="pill" id="chaos-pill"><span class="dot"></span><span id="chaos-label">all systems normal</span></span>
    </div>
    <p style="color:var(--muted); font-size:13px; line-height:1.5; margin-top:0;">
      Flip a toggle to simulate a production failure. Logs ship to IncidentIQ which posts the analysis to its dashboard / Slack.
    </p>
    <div class="grid" style="margin-top:14px; gap:12px;">
      <div class="card col-6" style="padding:0;">
        <div class="toggle" data-key="db_pool_exhausted">
          <div>
            <div class="label">Postgres pool exhaustion</div>
            <div class="desc">db-primary connections saturate at 200/200</div>
          </div>
          <div class="switch"></div>
        </div>
      </div>
      <div class="card col-6" style="padding:0;">
        <div class="toggle" data-key="redis_clusterdown">
          <div>
            <div class="label">Redis CLUSTERDOWN</div>
            <div class="desc">cache layer goes unavailable</div>
          </div>
          <div class="switch"></div>
        </div>
      </div>
      <div class="card col-6" style="padding:0;">
        <div class="toggle" data-key="payments_oom">
          <div>
            <div class="label">payments-worker OOM</div>
            <div class="desc">heap=512MiB, OOMKilled + CrashLoop</div>
          </div>
          <div class="switch"></div>
        </div>
      </div>
      <div class="card col-6" style="padding:0;">
        <div class="toggle" data-key="circuit_breaker_open">
          <div>
            <div class="label">api-gateway breaker open</div>
            <div class="desc">all upstream calls short-circuit</div>
          </div>
          <div class="switch"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="card col-12">
    <h2>Live logs</h2>
    <div class="log" id="log"></div>
  </div>

</div>

<div class="footer">
  Acme Commerce is a demo target service. It produces realistic logs that IncidentIQ ingests and analyses.
  Source: demo/acme_commerce/app.py
</div>

<script>
const $ = (id) => document.getElementById(id);

async function refresh() {
  try {
    const [m, lg, od] = await Promise.all([
      fetch('/admin/metrics').then(r => r.json()),
      fetch('/admin/logs').then(r => r.json()),
      fetch('/api/orders').then(r => r.json()),
    ]);

    $('m-orders').textContent = m.orders.orders_placed.toLocaleString();
    $('m-orders-detail').textContent = `${m.orders.orders_succeeded} ok / ${m.orders.orders_failed} failed`;
    const errPct = (m.error_rate * 100).toFixed(1) + '%';
    $('m-error').textContent = errPct;
    const errEl = $('m-error');
    errEl.style.color = m.error_rate > 0.05 ? '#fca5a5' : m.error_rate > 0 ? '#fcd34d' : 'inherit';
    $('m-p99').textContent = Math.round(m.latency_p99_ms) + ' ms';
    $('m-p50').textContent = 'p50: ' + Math.round(m.latency_p50_ms) + ' ms';

    // Chaos state
    const anyChaos = Object.values(m.chaos).some(Boolean);
    const chaosLabel = anyChaos ? Object.keys(m.chaos).filter(k => m.chaos[k]).length + ' fault(s) injected' : 'all systems normal';
    $('chaos-label').textContent = chaosLabel;
    $('chaos-pill').className = 'pill ' + (anyChaos ? 'err' : '');

    const healthOk = m.error_rate < 0.05 && !anyChaos;
    $('health-label').textContent = healthOk ? 'healthy' : anyChaos ? 'fault injected' : 'degraded';
    $('health-pill').className = 'pill ' + (!healthOk ? 'err' : '');

    document.querySelectorAll('.toggle').forEach(el => {
      const k = el.dataset.key;
      const on = m.chaos[k];
      el.classList.toggle('on', on);
      el.querySelector('.switch').classList.toggle('on', on);
    });

    // Logs
    const logEl = $('log');
    logEl.innerHTML = lg.lines.map(line => {
      const m2 = line.match(/\\s(ERROR|WARN|INFO|DEBUG|FATAL)\\s/);
      const cls = m2 ? m2[1] : 'INFO';
      return `<line class="${cls}">${line}</line>`;
    }).join('');
    logEl.scrollTop = logEl.scrollHeight;

    // Orders
    $('orders').innerHTML = od.slice(0, 8).map(o => `
      <div class="order-row">
        <div class="id">${o.id}</div>
        <div class="status-${o.status === 'paid' ? 'ok' : 'fail'}">${o.status}</div>
        <div class="latency">${o.latency_ms}ms</div>
      </div>
    `).join('') || '<div style="color:var(--dim); font-size:12.5px;">No orders yet</div>';
  } catch (e) {
    console.error(e);
  }
}

async function postJson(url, body) {
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body || {}) });
  return r.json();
}

// Wire toggles
document.querySelectorAll('.toggle').forEach(el => {
  el.addEventListener('click', async () => {
    const key = el.dataset.key;
    const on = !el.classList.contains('on');
    await postJson('/admin/chaos', { chaos: { [key]: on } });
    await refresh();
    // Send one order right after a toggle so the cascade triggers visibly.
    if (on) {
      await postJson('/api/orders', {});
      await refresh();
    }
  });
});

$('btn-place-1').onclick = async () => {
  $('btn-place-1').disabled = true;
  await postJson('/api/orders', {});
  $('btn-place-1').disabled = false;
  refresh();
};
$('btn-burst-20').onclick = async () => {
  $('btn-burst-20').disabled = true;
  await postJson('/admin/burst', { count: 20 });
  $('btn-burst-20').disabled = false;
  refresh();
};
$('btn-burst-100').onclick = async () => {
  $('btn-burst-100').disabled = true;
  await postJson('/admin/burst', { count: 100 });
  $('btn-burst-100').disabled = false;
  refresh();
};
$('btn-reset').onclick = async () => {
  await postJson('/admin/reset', {});
  refresh();
};

refresh();
setInterval(refresh, 1500);
</script>
</body></html>
"""


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8002, log_level="warning")
