import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { ChatController } from './chat/chat.controller';
import { PublicChatController } from './chat/public-chat.controller';
import { ChatService } from './chat/chat.service';

@Module({
  controllers: [AgentsController, ChatController, PublicChatController],
  providers: [AgentsService, ChatService],
})
export class AgentsModule {}
