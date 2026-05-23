// Tiny typed wrapper around the IncidentIQ backend API.
//
// All calls go through `request`, which centralises base URL handling,
// JSON parsing, and error normalisation. Server actions, page components,
// and client components share the same surface.

import type {
  AnalyzeRequest,
  AnalyzeResponse,
  IncidentSummary,
  IntegrationStatus,
  SampleIncident,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...rest,
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = await response.json();
      detail = payload.detail ?? detail;
    } catch {
      // Ignore body-parse errors — fall back to status text.
    }
    throw new ApiError(detail, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  health: () => request<{ status: string; bedrock_enabled: boolean; model: string }>("/health"),

  integrations: () => request<IntegrationStatus[]>("/api/v1/integrations"),

  samples: () => request<SampleIncident[]>("/api/v1/samples"),

  samplePayload: (id: string) =>
    request<{ title: string; logs: string; service_hint: string }>(
      `/api/v1/samples/${id}`,
    ),

  analyze: (body: AnalyzeRequest) =>
    request<AnalyzeResponse>("/api/v1/analyze", {
      method: "POST",
      json: body,
    }),

  recent: (limit = 25) =>
    request<IncidentSummary[]>(`/api/v1/incidents?limit=${limit}`),

  incident: (id: string) =>
    request<AnalyzeResponse>(`/api/v1/incidents/${id}`),

  exportPdfUrl: (id: string) =>
    `${API_BASE}/api/v1/incidents/${id}/export.pdf`,
};
