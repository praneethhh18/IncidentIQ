// Types mirror app/models/incident.py on the backend. Keep these in sync.

export type Severity = "P1" | "P2" | "P3";

export type SourceKind =
  | "paste"
  | "upload"
  | "datadog"
  | "grafana"
  | "newrelic"
  | "demo"
  | "webhook";

export interface AffectedService {
  name: string;
  role: string;
  impact: string;
  health: "healthy" | "degraded" | "down" | string;
}

export interface TimelineEvent {
  timestamp: string;
  label: string;
  detail: string;
  severity: Severity;
}

export interface FixRecommendation {
  title: string;
  rationale: string;
  action: string;
  snippet: string | null;
  priority: number;
}

export interface AgentStep {
  step: number;
  kind: "thought" | "tool_call" | "observation" | "decision" | string;
  title: string;
  detail: string;
  tool?: string | null;
  output?: unknown;
}

export interface BlastRadiusEntity {
  kind: "service" | "user_segment" | "region" | "dependency" | "data" | string;
  name: string;
  impact: string;
  severity: Severity | null;
}

export interface ForensicReport {
  patient_zero: TimelineEvent;
  propagation_path: string[];
  blast_radius: BlastRadiusEntity[];
  trigger_hypothesis: string;
  trigger_confidence: number;
  minutes_to_detection: number | null;
}

export interface BusinessImpact {
  affected_users_estimate: number;
  affected_users_label: string;
  revenue_at_risk_usd: number;
  revenue_basis: string;
  sla_breached: boolean;
  sla_detail: string;
  estimated_mttr_minutes: number;
  customer_communication_required: boolean;
  user_segments: string[];
}

export interface HiddenSignal {
  category:
    | "silent_failure"
    | "timing_anomaly"
    | "order_anomaly"
    | "service_silence"
    | "hidden_dependency"
    | string;
  title: string;
  detail: string;
  evidence: string[];
  severity: Severity | null;
}

export interface ServiceProbe {
  service: string;
  role: string;
  line_count: number;
  first_seen: string | null;
  last_seen: string | null;
  went_silent: boolean;
  error_burst_rate: number;
  findings: string[];
  suspected_role_in_cascade: "primary" | "propagator" | "bystander" | "sink" | string;
}

export interface DeepTraceReport {
  triggered_reason: string;
  auto_triggered: boolean;
  extended_model_used: string;
  duration_ms: number;
  hidden_signals: HiddenSignal[];
  service_probes: ServiceProbe[];
  expert_insights: string[];
  revised_root_cause: string;
  revised_confidence: number;
}

export interface WhyStep {
  n: number;
  question: string;
  answer: string;
}

export interface FiveWhys {
  steps: WhyStep[];
  final_root_cause: string;
  counter_factual: string;
}

export interface AnalyzeResponse {
  incident_id: string;
  created_at: string;
  title: string;
  summary: string;
  root_cause: string;
  confidence: number;
  severity: Severity;
  severity_rationale: string;
  affected_services: AffectedService[];
  timeline: TimelineEvent[];
  fixes: FixRecommendation[];
  evidence: string[];
  source: SourceKind;
  model: string;
  duration_ms: number;
  agent_steps: AgentStep[];
  forensic: ForensicReport | null;
  business_impact: BusinessImpact | null;
  five_whys: FiveWhys | null;
  deep_trace: DeepTraceReport | null;
  should_escalate: boolean;
  escalation_reason: string;
}

export interface IncidentSummary {
  incident_id: string;
  title: string;
  created_at: string;
  severity: Severity;
  root_cause: string;
  affected_service_count: number;
}

export interface IntegrationStatus {
  name: string;
  connected: boolean;
  enabled: boolean;
  detail: string;
}

export interface SampleIncident {
  id: string;
  title: string;
  service_hint: string;
}

export interface AnalyzeRequest {
  source: SourceKind;
  title?: string;
  logs?: string;
  service_hint?: string;
  integration_query?: string;
  time_window_minutes?: number;
}
