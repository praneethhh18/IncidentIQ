# IncidentIQ Backend

FastAPI service that powers IncidentIQ. Wraps AWS Bedrock (Amazon Nova Pro)
for AI inference, exposes integrations for Datadog / Grafana / New Relic,
and produces PDF post-mortem reports.

## Run locally

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Swagger UI: <http://localhost:8000/docs>

> No credentials configured? Everything still works — see "demo mode" in
> [../ARCHITECTURE.md](../ARCHITECTURE.md).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness + feature flags |
| `GET` | `/api/v1/integrations` | Datadog/Grafana/New Relic status |
| `GET` | `/api/v1/samples` | Sample-incident metadata |
| `GET` | `/api/v1/samples/{id}` | Sample incident raw payload |
| `POST` | `/api/v1/analyze` | Run analysis (paste / integration) |
| `POST` | `/api/v1/analyze/upload` | Run analysis on an uploaded file |
| `GET` | `/api/v1/incidents` | Recent incidents (history) |
| `GET` | `/api/v1/incidents/{id}` | Full analysis by id |
| `GET` | `/api/v1/incidents/{id}/export.pdf` | PDF post-mortem |

## Tests

```bash
pytest -q                 # (add tests under tests/)
```

## Deploy to AWS Lambda

The module exposes a Mangum `handler` for Lambda + API Gateway.

```bash
pip install -r requirements.txt -t build/
cp -r app build/
cd build && zip -r ../incidentiq.zip . && cd ..
aws lambda update-function-code --function-name incidentiq --zip-file fileb://incidentiq.zip
```

Configure the Lambda handler as `app.main.handler`.
