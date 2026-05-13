export interface DashboardMetrics {
  totalAgents: number;
  activeAgents: number;
  totalMessages: number;
  period: 'all-time';
}

export interface UnresolvedIntent {
  label: string;
  percentage: number;
  severity: 'high' | 'medium' | 'low';
}

export interface Recommendation {
  type: 'warning' | 'info' | 'success';
  message: string;
  cta: string;
  agentId: string;
}

export interface MetricsData {
  metrics: DashboardMetrics;
  unresolvedIntents: UnresolvedIntent[];
  recommendation: Recommendation;
}
