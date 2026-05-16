import {
  Controller,
  Post,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '@forge-core/core';
import { InboundService } from './inbound.service';

/**
 * Public webhook endpoint — no auth required, sits behind HMAC/signature
 * verification performed inside the adapter's parseInbound().
 *
 * Route: POST /api/public/webhook/:channelId
 */
@Controller('public/webhook')
export class InboundController {
  private readonly logger = new Logger(InboundController.name);

  constructor(private readonly inboundService: InboundService) {}

  @Post(':channelId')
  @Public()
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(
    @Param('channelId') channelId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Extract all headers as lowercase string map (for HMAC helpers)
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : (value ?? '');
    }

    // rawBody is attached by NestFactory.create({ rawBody: true })
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? req.body;

    try {
      const result = await this.inboundService.handleInbound(channelId, rawBody, headers);

      if (!result) {
        // Challenge ping or no routing match — respond with empty 200
        return {};
      }

      return { ok: true, conversationId: result.conversationId };
    } catch (err) {
      this.logger.error(
        `[webhook] channel=${channelId} error: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Always return 200 to prevent retry storms from external providers
      res.status(HttpStatus.OK);
      return { ok: false };
    }
  }
}
