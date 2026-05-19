export type ChannelType = 'test' | 'webhook' | 'slack' | 'email' | 'sms' | 'whatsapp' | 'website';

export interface ChannelCatalogItem {
  type: ChannelType;
  name: string;
  iconSlug: string;
  capabilities: ('send' | 'receive')[];
  configSchema: Record<string, unknown>;
  setupInstructions: string; // markdown
}

export interface WorkspaceChannel {
  id: string;
  orgId: string;
  channelType: ChannelType;
  name: string;
  config: Record<string, unknown>;
  webhookSecret: string | null;
  status: 'active' | 'paused' | 'error';
  workspaceInstructions: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteChannelConfig {
  agentId?: string;
  brandName?: string;
  brandColor?: string;
  mode?: 'floating' | 'inline';
  position?: 'bottom-right' | 'bottom-left';
  allowedDomains?: string[];
}

export interface RoutingRule {
  id: string;
  workspaceChannelId: string;
  orgId: string;
  priority: number;
  conditionType: 'keyword' | 'always' | 'user_attribute';
  conditionValue: Record<string, unknown>;
  agentId: string;
  agentInstructions: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  orgId: string;
  agentId: string;
  workspaceChannelId: string | null;
  externalUserRef: string | null;
  externalThreadRef: string | null;
  title: string | null;
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
