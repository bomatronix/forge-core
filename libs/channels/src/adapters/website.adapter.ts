import type {
  IChannelAdapter,
  ChannelType,
  ChannelConfig,
  InboundMessage,
  OutboundMessage,
} from './channel.adapter';

/** Phase 4 — Embeddable website widget, SSE bridge */
export class WebsiteAdapter implements IChannelAdapter {
  readonly type: ChannelType = 'website';
  readonly name = 'Website Widget';
  readonly iconSlug = 'globe';
  readonly capabilities: ('send' | 'receive')[] = ['send', 'receive'];
  readonly configSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      allowedOrigins: {
        type: 'array',
        items: { type: 'string' },
        title: 'Allowed Origins (e.g. https://yoursite.com)',
      },
      widgetTitle: { type: 'string', title: 'Widget Title' },
      widgetColor: { type: 'string', title: 'Primary Color (hex)' },
    },
    required: ['allowedOrigins'],
  };
  readonly setupInstructions = 'Add the embed snippet to your website. Widget appears as a chat button in the bottom-right corner.';

  parseInbound(_raw: unknown, _secret: string | null, _config: ChannelConfig): InboundMessage | null {
    throw new Error('WebsiteAdapter: Not implemented (Phase 4)');
  }

  async send(_message: OutboundMessage, _config: ChannelConfig): Promise<void> {
    throw new Error('WebsiteAdapter: Not implemented (Phase 4)');
  }

  async validate(_config: ChannelConfig): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  getWebhookUrl(channelId: string, baseUrl: string): string {
    return `${baseUrl}/api/public/widget/${channelId}`;
  }
}
