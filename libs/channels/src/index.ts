export { ChannelsModule } from './channels.module';
export { ChannelsService } from './channels.service';
export { ChannelConversationService } from './conversation.service';
export { resolveChannelAdapter, getChannelCatalog } from './channel-registry';
export {
  InboundService,
  INBOUND_AGENTS_SERVICE,
  INBOUND_CHAT_SERVICE,
  INBOUND_KNOWLEDGE_SERVICE,
} from './inbound.service';
export type {
  InboundResult,
  IInboundAgentsService,
  IInboundChatService,
  IInboundKnowledgeService,
} from './inbound.service';
export type {
  CreateChannelDto,
  UpdateChannelDto,
  UpsertRoutingRuleDto,
  ReplaceRoutingRulesDto,
  ChannelRow,
  RoutingRuleRow,
  ChannelCatalogItem,
} from './channels.service';
export type { HistoryMessage, ChannelConversationSummary, ChannelConversationMessage } from './conversation.service';
export type {
  IChannelAdapter,
  ChannelType,
  ChannelConfig,
  InboundMessage,
  OutboundMessage,
} from './adapters/channel.adapter';
