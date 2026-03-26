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
}

export interface AgentTemplate {
  id: string;
  name: string;
  emoji: string;
  category: string;
  description: string;
  identity: TemplateIdentity;
  behaviour: TemplateBehaviour;
  actions: string[];
  knowledge: string[];
  channels: string[];
}
