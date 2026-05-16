import type {
  IChannelAdapter,
  ChannelType,
  ChannelConfig,
  InboundMessage,
  OutboundMessage,
} from './channel.adapter';

export class TestAdapter implements IChannelAdapter {
  readonly type: ChannelType = 'test';
  readonly name = 'Test Channel';
  readonly iconSlug = 'flask-conical';
  readonly capabilities: ('send' | 'receive')[] = ['send', 'receive'];
  readonly configSchema: Record<string, unknown> = {};
  readonly setupInstructions = `
## Test Channel

No setup required. Use the **Test Console** to simulate inbound messages and verify your agent's responses.

### How it works
1. Add a routing rule pointing to an agent
2. Open the Test Console
3. Type a message and hit Send
4. The agent will respond — no external platform needed
`.trim();

  parseInbound(
    raw: unknown,
    _secret: string | null,
    _config: ChannelConfig,
  ): InboundMessage | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const body = raw as Record<string, unknown>;
    const text = typeof body['text'] === 'string' ? body['text'] : null;
    if (!text) return null;
    const fromId = typeof body['fromId'] === 'string' ? body['fromId'] : 'test-user';
    return {
      channelType: 'test',
      workspaceChannelId: '',
      fromId,
      text,
      raw,
    };
  }

  async send(_message: OutboundMessage, _config: ChannelConfig): Promise<void> {
    // Test channel: reply is read from DB via TestConsole, no external send needed
  }

  async validate(_config: ChannelConfig): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  getWebhookUrl(_channelId: string, _baseUrl: string): string {
    return '';
  }
}
