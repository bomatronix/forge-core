import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentTenant } from '@forge-core/core';
import { ChatService, ChatResponse } from './chat.service';
import { ChatMessageDto } from './dto/chat-message.dto';

@Controller('agents/:id/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(200)
  chat(
    @Param('id') id: string,
    @Body() dto: ChatMessageDto,
    @CurrentTenant() orgId: string,
  ): Promise<ChatResponse> {
    return this.chatService.chat(orgId, id, dto.messages);
  }
}
