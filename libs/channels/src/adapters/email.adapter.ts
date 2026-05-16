import type {
  IChannelAdapter,
  ChannelType,
  ChannelConfig,
  InboundMessage,
  OutboundMessage,
} from './channel.adapter';

/** Phase 3 — Mailgun inbound + outbound */
export class EmailAdapter implements IChannelAdapter {
  readonly type: ChannelType = 'email';
  readonly name = 'Email';
  readonly iconSlug = 'mail';
  readonly capabilities: ('send' | 'receive')[] = ['send', 'receive'];
  readonly configSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      provider: { type: 'string', enum: ['mailgun'], default: 'mailgun' },
      apiKey: { type: 'string', title: 'API Key', format: 'password' },
      domain: { type: 'string', title: 'Mailgun Domain' },
      fromAddress: { type: 'string', title: 'From Address' },
      webhookSigningKey: { type: 'string', title: 'Webhook Signing Key', format: 'password' },
    },
    required: ['provider', 'apiKey', 'domain', 'fromAddress'],
  };
  readonly setupInstructions = 'Configure Mailgun inbound routing to point to your webhook URL.';

  parseInbound(_raw: unknown, _secret: string | null, _config: ChannelConfig): InboundMessage | null {
    throw new Error('EmailAdapter: Not implemented (Phase 3)');
  }

  async send(_message: OutboundMessage, _config: ChannelConfig): Promise<void> {
    throw new Error('EmailAdapter: Not implemented (Phase 3)');
  }

  async validate(_config: ChannelConfig): Promise<{ ok: boolean; error?: string }> {
    throw new Error('EmailAdapter: Not implemented (Phase 3)');
  }

  getWebhookUrl(channelId: string, baseUrl: string): string {
    return `${baseUrl}/api/public/webhook/${channelId}`;
  }
}
