import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Public } from '@forge-core/core';
import type { DraftAgent } from '@forge-core/common';
import type { Request, Response } from 'express';
import { AgentsService } from '../agents.service';
import { ChatService } from './chat.service';
import { ChatMessageDto } from './dto/chat-message.dto';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function queryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? '';
  return value?.trim() ?? '';
}

function clientIp(req: Request): string {
  // req.ip is set by Express from the last trusted proxy hop when
  // app.set('trust proxy', 1) is configured in the bootstrap. This prevents
  // callers from spoofing their IP via a crafted X-Forwarded-For header.
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function assertWithinRateLimit(req: Request): void {
  const now = Date.now();
  const key = clientIp(req);
  const current = rateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    // Opportunistic sweep of a few expired entries to prevent unbounded growth.
    if (rateLimitBuckets.size > 500) {
      for (const [k, v] of rateLimitBuckets) {
        if (v.resetAt <= now) rateLimitBuckets.delete(k);
        if (rateLimitBuckets.size <= 400) break;
      }
    }
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }

  if (current.count >= RATE_LIMIT_MAX) {
    throw new HttpException('Too many public chat requests', HttpStatus.TOO_MANY_REQUESTS);
  }

  current.count += 1;
}

function welcomeMessage(uiConfig: unknown): string | null {
  const ui = uiConfig as Partial<DraftAgent> | null;
  const welcome = ui?.identity?.welcomeMessage;
  return typeof welcome === 'string' && welcome.trim() ? welcome : null;
}

@Public()
@Controller('public/agents/:id')
export class PublicChatController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly chatService: ChatService,
  ) {}

  @Get()
  async getPublicAgent(
    @Param('id') id: string,
    @Query('token') token: string | string[] | undefined,
  ) {
    const row = await this.agentsService.findPublicLive(id, queryValue(token));

    return {
      id: row.id,
      name: row.name,
      welcomeMessage: welcomeMessage(row.uiConfig),
      status: 'live' as const,
    };
  }

  @Post('chat/stream')
  @HttpCode(200)
  async streamPublicChat(
    @Param('id') id: string,
    @Query('token') token: string | string[] | undefined,
    @Body() dto: ChatMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    assertWithinRateLimit(req);

    // Await eagerly so 404/429 validation happens before committing streaming headers.
    const stream = await this.chatService.streamPublicChat(id, queryValue(token), dto.messages);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      for await (const chunk of stream) {
        if (res.destroyed) break;
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } finally {
      if (!res.destroyed) res.end();
    }
  }
}
