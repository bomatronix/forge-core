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
      allowedDomains: {
        type: 'array',
        items: { type: 'string' },
        title: 'Allowed domains (e.g. yoursite.com)',
      },
      agentId: { type: 'string', title: 'Agent ID' },
      brandName: { type: 'string', title: 'Brand name' },
      brandColor: { type: 'string', title: 'Primary color (hex)' },
      mode: { type: 'string', enum: ['floating', 'inline'], title: 'Display mode' },
      position: { type: 'string', enum: ['bottom-right', 'bottom-left'], title: 'Position' },
    },
  };
  readonly setupInstructions =
    'Add the embed snippet to your website. Widget appears as a chat button in the bottom-right corner.';

  parseInbound(
    _raw: unknown,
    _secret: string | null,
    _config: ChannelConfig,
  ): InboundMessage | null {
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
