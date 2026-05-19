import { Module } from '@nestjs/common';
import { ChannelsModule as ChannelsCoreModule } from '@forge-core/channels';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { ChatController } from './chat/chat.controller';
import { PublicChatController } from './chat/public-chat.controller';
import { ChatService } from './chat/chat.service';
import { AgentUsageEventsService } from './agent-usage-events.service';
import { KnowledgeController } from './knowledge/knowledge.controller';
import { KnowledgeService } from './knowledge/knowledge.service';
import { AgentTypesController } from './catalog/agent-types.controller';
import { AgentTypesService } from './catalog/agent-types.service';
import { AgentTemplatesController } from './catalog/agent-templates.controller';
import { AgentTemplatesService } from './catalog/agent-templates.service';
import {
  AgentKnowledgeSourcesController,
  AgentTypeKnowledgeSourcesController,
  KnowledgeSourceOptionsController,
} from './catalog/knowledge-sources.controller';
import { KnowledgeSourcesService } from './catalog/knowledge-sources.service';
import { ConversationsController } from './conversations/conversations.controller';
import { ConversationsService } from './conversations/conversations.service';

@Module({
  imports: [ChannelsCoreModule],
  controllers: [
    AgentsController,
    ChatController,
    PublicChatController,
    KnowledgeController,
    AgentTypesController,
    AgentTemplatesController,
    KnowledgeSourceOptionsController,
    AgentTypeKnowledgeSourcesController,
    AgentKnowledgeSourcesController,
    ConversationsController,
  ],
  providers: [
    AgentsService,
    ChatService,
    AgentUsageEventsService,
    KnowledgeService,
    AgentTypesService,
    AgentTemplatesService,
    KnowledgeSourcesService,
    ConversationsService,
  ],
  exports: [ChatService, AgentsService, KnowledgeService],
})
export class AgentsModule {}
