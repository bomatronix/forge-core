import type { TemplateIdentity, TemplateBehaviour } from './agent-template.interface';

export type AgentStatus = 'live' | 'draft' | 'paused';

export type AgentChannel = 'Web' | 'WhatsApp' | 'Slack' | 'Email' | 'SMS';

export interface Agent {
  id: string;
  name: string;
  channels: AgentChannel[];
  conversations: number;
  resolution: number | null;
  csat: number | null;
  status: AgentStatus;
  shareToken?: string | null;
}

export interface DraftAgent {
  templateId: string | null;
  identity: TemplateIdentity;
  behaviour: TemplateBehaviour;
  actions: string[];
  knowledge: string[];
  channels: string[];
}
