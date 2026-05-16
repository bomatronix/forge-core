import * as crypto from 'crypto';

export type ChannelType =
  | 'test'
  | 'webhook'
  | 'slack'
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'website';

export interface InboundMessage {
  channelType: ChannelType;
  workspaceChannelId: string;
  fromId: string;           // stable user identifier in the external platform
  threadRef?: string;       // Slack thread_ts, WhatsApp wa_id, etc.
  text: string;
  attachments?: { type: string; url?: string; content?: string }[];
  raw: unknown;             // original platform payload, stored in message metadata
}

export interface OutboundMessage {
  text: string;
  threadRef?: string;       // reply in-thread where supported
  conversationId: string;
}

export type ChannelConfig = Record<string, unknown>;

export interface IChannelAdapter {
  readonly type: ChannelType;
  readonly name: string;                                // display name, e.g. "Slack"
  readonly iconSlug: string;                            // for UI icon lookup
  readonly capabilities: ('send' | 'receive')[];
  readonly configSchema: Record<string, unknown>;       // JSON Schema — drives setup form
  readonly setupInstructions: string;                   // markdown shown in setup wizard

  /** Normalize raw webhook payload. Return null if invalid or should be ignored. */
  parseInbound(
    raw: unknown,
    secret: string | null,
    config: ChannelConfig,
  ): InboundMessage | null;

  /** Publish a reply back to the external platform. */
  send(message: OutboundMessage, config: ChannelConfig): Promise<void>;

  /** Test credentials live. Called after setup form submit. */
  validate(config: ChannelConfig): Promise<{ ok: boolean; error?: string }>;

  /** Return the webhook URL to show the user during setup (if applicable). */
  getWebhookUrl?(channelId: string, baseUrl: string): string;
}

/**
 * Timing-safe HMAC verification helper.
 * Use in every adapter that verifies webhook signatures.
 *
 * IMPORTANT — strip platform-specific prefixes before calling this function.
 * The `signature` parameter must be the raw hex digest only:
 *   - Slack:  `X-Slack-Signature: v0=<hex>`  → strip `"v0="`
 *   - Twilio: `X-Twilio-Signature: sha1=<hex>` → strip `"sha1="`
 *   - Mailgun: `X-Mailgun-Signature: <hex>`   → no prefix (pass as-is)
 * Passing the prefix-included string will always fail the length check.
 */
export function verifyHmac(
  secret: string,
  payload: string,
  signature: string,
  algo: 'sha1' | 'sha256',
): boolean {
  try {
    const expected = crypto
      .createHmac(algo, secret)
      .update(payload)
      .digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(expBuf, sigBuf);
  } catch {
    return false;
  }
}
