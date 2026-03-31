import { type DashboardMetricKey, type DashboardTableColumnKey } from "@/lib/dashboard-builder";

export const METRIC_LABELS: Record<DashboardMetricKey, string> = {
  tickets_created: "Tickets created",
  ticket_replies: "Ticket replies",
  hours_worked: "Hours worked",
  interactions_per_hour_worked: "Tickets per hour",
  replies_per_hour_worked: "Replies per hour",
  replies_per_ticket: "Replies per ticket",
  avg_first_reply_minutes: "Avg first reply",
  avg_full_resolution_minutes: "Avg resolution",
  median_first_reply_minutes: "Median first reply",
  median_full_resolution_minutes: "Median resolution",
  p90_first_reply_minutes: "P90 first reply",
  p90_full_resolution_minutes: "P90 resolution",
  agent_utilisation_ratio: "Utilisation",
  requester_wait_time_minutes: "Requester wait",
  reopens: "Reopens",
  reopens_per_agent: "Reopens per agent",
  sla_first_reply_compliance: "First reply SLA",
  sla_full_resolution_compliance: "Resolution SLA"
};

export const METRIC_FORMATS: Record<DashboardMetricKey, "number" | "percent" | "minutes"> = {
  tickets_created: "number",
  ticket_replies: "number",
  hours_worked: "number",
  interactions_per_hour_worked: "number",
  replies_per_hour_worked: "number",
  replies_per_ticket: "number",
  avg_first_reply_minutes: "minutes",
  avg_full_resolution_minutes: "minutes",
  median_first_reply_minutes: "minutes",
  median_full_resolution_minutes: "minutes",
  p90_first_reply_minutes: "minutes",
  p90_full_resolution_minutes: "minutes",
  agent_utilisation_ratio: "percent",
  requester_wait_time_minutes: "minutes",
  reopens: "number",
  reopens_per_agent: "number",
  sla_first_reply_compliance: "percent",
  sla_full_resolution_compliance: "percent"
};

export const TABLE_COLUMN_LABELS: Record<DashboardTableColumnKey, string> = {
  name: "Name",
  client: "Client",
  tickets_created: "Tickets",
  ticket_replies: "Replies",
  hours_worked: "Hours",
  interactions_per_hour_worked: "Tickets/hr",
  replies_per_ticket: "Replies/ticket",
  avg_first_reply_minutes: "First reply",
  avg_full_resolution_minutes: "Resolution",
  agent_utilisation_ratio: "Utilisation",
  sla_first_reply_compliance: "First reply SLA",
  sla_full_resolution_compliance: "Resolution SLA",
  reopens: "Reopens"
};

export const KPI_METRIC_OPTIONS: DashboardMetricKey[] = [
  "tickets_created",
  "ticket_replies",
  "hours_worked",
  "interactions_per_hour_worked",
  "replies_per_hour_worked",
  "replies_per_ticket",
  "avg_first_reply_minutes",
  "avg_full_resolution_minutes",
  "median_first_reply_minutes",
  "median_full_resolution_minutes",
  "p90_first_reply_minutes",
  "p90_full_resolution_minutes",
  "agent_utilisation_ratio",
  "requester_wait_time_minutes",
  "reopens",
  "reopens_per_agent",
  "sla_first_reply_compliance",
  "sla_full_resolution_compliance"
];

export const LINE_METRIC_OPTIONS: DashboardMetricKey[] = [
  "tickets_created",
  "hours_worked",
  "avg_first_reply_minutes",
  "avg_full_resolution_minutes"
];

export const BAR_METRIC_OPTIONS_BY_DIMENSION = {
  agent: [
    "tickets_created",
    "ticket_replies",
    "hours_worked",
    "interactions_per_hour_worked",
    "avg_first_reply_minutes",
    "avg_full_resolution_minutes",
    "agent_utilisation_ratio",
    "reopens"
  ],
  channel: ["tickets_created"],
  client: [
    "tickets_created",
    "hours_worked",
    "interactions_per_hour_worked",
    "avg_first_reply_minutes",
    "avg_full_resolution_minutes",
    "agent_utilisation_ratio",
    "replies_per_ticket",
    "sla_first_reply_compliance",
    "sla_full_resolution_compliance"
  ]
} as const satisfies Record<"agent" | "channel" | "client", DashboardMetricKey[]>;

export const TABLE_COLUMNS_BY_DATASET = {
  agents: [
    "name",
    "client",
    "tickets_created",
    "ticket_replies",
    "hours_worked",
    "interactions_per_hour_worked",
    "avg_first_reply_minutes",
    "avg_full_resolution_minutes",
    "agent_utilisation_ratio",
    "reopens"
  ],
  clients: [
    "name",
    "tickets_created",
    "hours_worked",
    "interactions_per_hour_worked",
    "replies_per_ticket",
    "avg_first_reply_minutes",
    "avg_full_resolution_minutes",
    "agent_utilisation_ratio",
    "sla_first_reply_compliance",
    "sla_full_resolution_compliance"
  ]
} as const satisfies Record<"agents" | "clients", DashboardTableColumnKey[]>;

export const TABLE_LIMIT_OPTIONS = [5, 10, 25, 50] as const;
