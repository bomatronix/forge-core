import type {
  IChannelAdapter,
  ChannelType,
  ChannelConfig,
  InboundMessage,
  OutboundMessage,
} from './channel.adapter';

/** Phase 3 — Twilio SMS inbound + outbound */
export class SmsAdapter implements IChannelAdapter {
  readonly type: ChannelType = 'sms';
  readonly name = 'SMS';
  readonly iconSlug = 'message-square';
  readonly capabilities: ('send' | 'receive')[] = ['send', 'receive'];
  readonly configSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      accountSid: { type: 'string', title: 'Twilio Account SID' },
      authToken: { type: 'string', title: 'Auth Token', format: 'password' },
      fromNumber: { type: 'string', title: 'From Number (E.164 format, e.g. +14155552671)' },
    },
    required: ['accountSid', 'authToken', 'fromNumber'],
  };
  readonly setupInstructions =
    'Configure your Twilio number webhook URL to point to the URL below.';

  parseInbound(
    _raw: unknown,
    _secret: string | null,
    _config: ChannelConfig,
  ): InboundMessage | null {
    throw new Error('SmsAdapter: Not implemented (Phase 3)');
  }

  async send(_message: OutboundMessage, _config: ChannelConfig): Promise<void> {
    throw new Error('SmsAdapter: Not implemented (Phase 3)');
  }

  async validate(_config: ChannelConfig): Promise<{ ok: boolean; error?: string }> {
    throw new Error('SmsAdapter: Not implemented (Phase 3)');
  }

  getWebhookUrl(channelId: string, baseUrl: string): string {
    return `${baseUrl}/api/public/webhook/${channelId}`;
  }
}
