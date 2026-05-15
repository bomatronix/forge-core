export interface TemplateIdentity {
  name: string;
  welcomeMessage: string;
  tone: 'professional' | 'friendly' | 'formal' | 'casual';
  language: string;
}

export interface TemplateBehaviour {
  systemPrompt: string;
  responseStyle: number; // 0–100 (concise → detailed)
  fallback: 'handoff' | 'ticket' | 'email';
  tonePreset?: 'neutral' | 'friendly' | 'formal' | 'custom';
  customToneInstructions?: string;
  useEmojis?: boolean;
  showSourceLinks?: boolean;
  guidanceRules?: unknown[];
}

export interface KnowledgeSourceOption {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  description: string;
  category: string;
  uiSchema: Record<string, unknown>;
  enabled: boolean;
  position: number;
}

export interface AgentType {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  description: string;
  enabled: boolean;
  position: number;
}

export interface AgentTemplate {
  id: string;
  name: string;
  emoji: string;
  category: string;
  agentType: string;
  description: string;
  identity: TemplateIdentity;
  behaviour: TemplateBehaviour;
  actions: string[];
  knowledge: string[];
  knowledgeSourceSlugs?: string[];
  knowledgeSources?: KnowledgeSourceOption[];
  channels: string[];
}
