import type {
  IChannelAdapter,
  ChannelType,
  ChannelConfig,
  InboundMessage,
  OutboundMessage,
} from './channel.adapter';

/** Phase 3 — WhatsApp via Twilio or Meta Cloud API */
export class WhatsAppAdapter implements IChannelAdapter {
  readonly type: ChannelType = 'whatsapp';
  readonly name = 'WhatsApp';
  readonly iconSlug = 'message-circle';
  readonly capabilities: ('send' | 'receive')[] = ['send', 'receive'];
  readonly configSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      provider: { type: 'string', enum: ['twilio', 'meta'], title: 'Provider' },
      accountSid: { type: 'string', title: 'Twilio Account SID (Twilio only)' },
      authToken: { type: 'string', title: 'Auth Token (Twilio only)', format: 'password' },
      fromNumber: { type: 'string', title: 'WhatsApp From Number (Twilio only)' },
      accessToken: { type: 'string', title: 'Access Token (Meta only)', format: 'password' },
      phoneNumberId: { type: 'string', title: 'Phone Number ID (Meta only)' },
      verifyToken: { type: 'string', title: 'Verify Token (Meta only)' },
    },
    required: ['provider'],
  };
  readonly setupInstructions = 'Choose your WhatsApp provider (Twilio or Meta Cloud API) and fill in the credentials.';

  parseInbound(_raw: unknown, _secret: string | null, _config: ChannelConfig): InboundMessage | null {
    throw new Error('WhatsAppAdapter: Not implemented (Phase 3)');
  }

  async send(_message: OutboundMessage, _config: ChannelConfig): Promise<void> {
    throw new Error('WhatsAppAdapter: Not implemented (Phase 3)');
  }

  async validate(_config: ChannelConfig): Promise<{ ok: boolean; error?: string }> {
    throw new Error('WhatsAppAdapter: Not implemented (Phase 3)');
  }

  getWebhookUrl(channelId: string, baseUrl: string): string {
    return `${baseUrl}/api/public/webhook/${channelId}`;
  }
}
