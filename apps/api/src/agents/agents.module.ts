import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { ChatController } from './chat/chat.controller';
import { PublicChatController } from './chat/public-chat.controller';
import { ChatService } from './chat/chat.service';
import { AgentUsageEventsService } from './agent-usage-events.service';

@Module({
  controllers: [AgentsController, ChatController, PublicChatController],
  providers: [AgentsService, ChatService, AgentUsageEventsService],
})
export class AgentsModule {}
