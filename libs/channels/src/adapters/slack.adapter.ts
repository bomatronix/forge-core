import type {
  IChannelAdapter,
  ChannelType,
  ChannelConfig,
  InboundMessage,
  OutboundMessage,
} from './channel.adapter';

/** Phase 2 — Slack Events API inbound + Web API outbound */
export class SlackAdapter implements IChannelAdapter {
  readonly type: ChannelType = 'slack';
  readonly name = 'Slack';
  readonly iconSlug = 'slack';
  readonly capabilities: ('send' | 'receive')[] = ['send', 'receive'];
  readonly configSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      botToken: { type: 'string', title: 'Bot Token', format: 'password' },
      signingSecret: { type: 'string', title: 'Signing Secret', format: 'password' },
      defaultChannelId: { type: 'string', title: 'Default Channel ID (optional)' },
    },
    required: ['botToken', 'signingSecret'],
  };
  readonly setupInstructions = `
## Slack Setup

1. Create a Slack App at https://api.slack.com/apps
2. Enable **Event Subscriptions** and paste your webhook URL
3. Subscribe to **message.im** and **message.channels** bot events
4. Copy the **Bot OAuth Token** and **Signing Secret** above
`.trim();

  parseInbound(
    _raw: unknown,
    _secret: string | null,
    _config: ChannelConfig,
  ): InboundMessage | null {
    throw new Error('SlackAdapter: Not implemented (Phase 2)');
  }

  async send(_message: OutboundMessage, _config: ChannelConfig): Promise<void> {
    throw new Error('SlackAdapter: Not implemented (Phase 2)');
  }

  async validate(_config: ChannelConfig): Promise<{ ok: boolean; error?: string }> {
    throw new Error('SlackAdapter: Not implemented (Phase 2)');
  }

  getWebhookUrl(channelId: string, baseUrl: string): string {
    return `${baseUrl}/api/public/webhook/${channelId}`;
  }
}
