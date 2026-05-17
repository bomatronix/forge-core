import type {
  IChannelAdapter,
  ChannelType,
  ChannelConfig,
  InboundMessage,
  OutboundMessage,
} from './channel.adapter';

/** Phase 2 — generic HTTP POST outbound only */
export class WebhookAdapter implements IChannelAdapter {
  readonly type: ChannelType = 'webhook';
  readonly name = 'Webhook';
  readonly iconSlug = 'webhook';
  readonly capabilities: ('send' | 'receive')[] = ['send'];
  readonly configSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      webhookUrl: { type: 'string', title: 'Webhook URL' },
      secret: { type: 'string', title: 'Secret (optional)' },
      method: { type: 'string', enum: ['POST', 'PUT'], default: 'POST' },
    },
    required: ['webhookUrl'],
  };
  readonly setupInstructions = 'Enter the URL to receive outbound messages via HTTP POST.';

  parseInbound(
    _raw: unknown,
    _secret: string | null,
    _config: ChannelConfig,
  ): InboundMessage | null {
    throw new Error('WebhookAdapter.parseInbound: Not implemented (Phase 2)');
  }

  async send(_message: OutboundMessage, _config: ChannelConfig): Promise<void> {
    throw new Error('WebhookAdapter.send: Not implemented (Phase 2)');
  }

  async validate(_config: ChannelConfig): Promise<{ ok: boolean; error?: string }> {
    throw new Error('WebhookAdapter.validate: Not implemented (Phase 2)');
  }

  getWebhookUrl(_channelId: string, _baseUrl: string): string {
    return '';
  }
}
