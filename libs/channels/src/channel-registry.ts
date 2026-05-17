import type { IChannelAdapter, ChannelType } from './adapters/channel.adapter';
import { TestAdapter } from './adapters/test.adapter';
import { WebhookAdapter } from './adapters/webhook.adapter';
import { SlackAdapter } from './adapters/slack.adapter';
import { EmailAdapter } from './adapters/email.adapter';
import { SmsAdapter } from './adapters/sms.adapter';
import { WhatsAppAdapter } from './adapters/whatsapp.adapter';
import { WebsiteAdapter } from './adapters/website.adapter';

/**
 * Static adapter registry.
 * Using Record<ChannelType, IChannelAdapter> ensures TypeScript will raise a compile error
 * if any member of the ChannelType union is missing from this object.
 */
const ADAPTERS: Record<ChannelType, IChannelAdapter> = {
  test: new TestAdapter(),
  webhook: new WebhookAdapter(),
  slack: new SlackAdapter(),
  email: new EmailAdapter(),
  sms: new SmsAdapter(),
  whatsapp: new WhatsAppAdapter(),
  website: new WebsiteAdapter(),
};

/**
 * Resolves the adapter for the given channel type.
 * Throws at runtime if an unknown type string is passed (e.g. from raw DB read).
 */
export function resolveChannelAdapter(type: ChannelType): IChannelAdapter {
  const adapter = ADAPTERS[type];
  if (!adapter) {
    throw new Error(`No adapter registered for channel type: ${type}`);
  }
  return adapter;
}

/** Returns the full catalog — one entry per registered adapter. */
export function getChannelCatalog(): IChannelAdapter[] {
  return Object.values(ADAPTERS);
}
