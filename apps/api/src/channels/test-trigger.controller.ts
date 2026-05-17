import {
  Controller,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { CurrentTenant, RequirePermissions } from '@forge-core/core';
import { ChannelsService } from '@forge-core/channels';
import { InboundService } from './inbound.service';

class TestTriggerDto {
  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsString()
  @IsOptional()
  fromId?: string;
}

/**
 * Authenticated endpoint to trigger the Test channel inbound pipeline.
 *
 * Route: POST /api/channels/test/:id/trigger
 *
 * Only works for channels with channelType === 'test'.
 */
@Controller('channels/test')
export class TestTriggerController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly inboundService: InboundService,
  ) {}

  @Post(':channelId/trigger')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('agents:write')
  async triggerTest(
    @CurrentTenant() orgId: string,
    @Param('channelId') channelId: string,
    @Body() dto: TestTriggerDto,
  ) {
    // Verify channel belongs to org + is test type
    const channel = await this.channelsService.findOne(orgId, channelId);
    if (channel.channelType !== 'test') {
      throw new BadRequestException('Test trigger is only available for channels of type "test"');
    }

    // Build fake rawBody that the TestAdapter expects: { text, fromId }
    const rawBody = { text: dto.text, fromId: dto.fromId ?? 'test-user' };

    const result = await this.inboundService.handleInbound(channelId, rawBody, {});

    if (!result) {
      return { ok: false, reason: 'No routing rule matched or no-op' };
    }

    return {
      ok: true,
      conversationId: result.conversationId,
      reply: result.reply,
      agentId: result.agentId,
    };
  }
}
