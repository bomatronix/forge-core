import { Body, Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import { CurrentTenant } from '@forge-core/core';
import type { Response } from 'express';
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

  @Post('stream')
  async streamChat(
    @Param('id') id: string,
    @Body() dto: ChatMessageDto,
    @CurrentTenant() orgId: string,
    @Res() res: Response,
  ): Promise<void> {
    // Await eagerly — throws 404 here if agent not found, before headers are flushed
    const stream = await this.chatService.streamChat(orgId, id, dto.messages);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    for await (const chunk of stream) {
      if (res.destroyed) break;
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    if (!res.destroyed) res.end();
  }
}
