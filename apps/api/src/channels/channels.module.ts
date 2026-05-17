import { Module } from '@nestjs/common';
import {
  ChannelsModule as ChannelsCoreModule,
  InboundService,
  INBOUND_AGENTS_SERVICE,
  INBOUND_CHAT_SERVICE,
  INBOUND_KNOWLEDGE_SERVICE,
} from '@forge-core/channels';
import { AgentsModule } from '../agents/agents.module';
import { AgentsService } from '../agents/agents.service';
import { ChatService } from '../agents/chat/chat.service';
import { KnowledgeService } from '../agents/knowledge/knowledge.service';
import { ChannelsController } from './channels.controller';
import { InboundController } from './inbound.controller';
import { TestTriggerController } from './test-trigger.controller';

@Module({
  imports: [
    ChannelsCoreModule, // provides ChannelsService, ChannelConversationService
    AgentsModule, // provides AgentsService, ChatService, KnowledgeService
  ],
  controllers: [ChannelsController, InboundController, TestTriggerController],
  providers: [
    // Wire concrete app-layer services to the InboundService injection tokens
    { provide: INBOUND_AGENTS_SERVICE, useExisting: AgentsService },
    { provide: INBOUND_CHAT_SERVICE, useExisting: ChatService },
    { provide: INBOUND_KNOWLEDGE_SERVICE, useExisting: KnowledgeService },
    InboundService,
  ],
  exports: [InboundService],
})
export class AppChannelsModule {}
