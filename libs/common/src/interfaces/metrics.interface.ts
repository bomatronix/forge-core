export interface DashboardMetrics {
  totalConversations: number;
  totalConversationsChange: number;
  resolutionRate: number;
  resolutionRateChange: number;
  handoffRate: number;
  handoffRateChange: number;
  avgResponseTime: string;
  avgResponseTimeChange: number;
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
