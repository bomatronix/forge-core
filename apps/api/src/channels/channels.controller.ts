import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CurrentTenant, RequirePermissions } from '@forge-core/core';
import { ChannelsService, ChannelConversationService } from '@forge-core/channels';
import type {
  CreateChannelDto,
  UpdateChannelDto,
  UpsertRoutingRuleDto,
  ReplaceRoutingRulesDto,
} from '@forge-core/channels';

@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly channelConvService: ChannelConversationService,
  ) {}

  // ─── Catalog ────────────────────────────────────────────────────────────────

  @Get('catalog')
  @RequirePermissions('agents:read')
  getCatalog() {
    return this.channelsService.getCatalog();
  }

  // ─── Workspace Channels CRUD ────────────────────────────────────────────────

  @Get()
  @RequirePermissions('agents:read')
  findAll(@CurrentTenant() orgId: string) {
    return this.channelsService.findAll(orgId);
  }

  @Get(':id')
  @RequirePermissions('agents:read')
  findOne(@CurrentTenant() orgId: string, @Param('id') id: string) {
    return this.channelsService.findOne(orgId, id);
  }

  @Post()
  @RequirePermissions('agents:write')
  create(@CurrentTenant() orgId: string, @Body() dto: CreateChannelDto) {
    return this.channelsService.create(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions('agents:write')
  update(@CurrentTenant() orgId: string, @Param('id') id: string, @Body() dto: UpdateChannelDto) {
    return this.channelsService.update(orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('agents:write')
  remove(@CurrentTenant() orgId: string, @Param('id') id: string) {
    return this.channelsService.remove(orgId, id);
  }

  // ─── Validate config ────────────────────────────────────────────────────────

  @Post(':id/validate')
  @RequirePermissions('agents:write')
  validateConfig(@CurrentTenant() orgId: string, @Param('id') id: string) {
    return this.channelsService.validateConfig(orgId, id);
  }

  // ─── Webhook URL ─────────────────────────────────────────────────────────────

  @Get(':id/webhook-url')
  @RequirePermissions('agents:read')
  getWebhookUrl(@CurrentTenant() orgId: string, @Param('id') id: string) {
    const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3001';
    return { webhookUrl: `${baseUrl}/api/public/webhook/${id}` };
  }

  // ─── Routing Rules ───────────────────────────────────────────────────────────

  @Get(':channelId/routing-rules')
  @RequirePermissions('agents:read')
  findRoutingRules(@CurrentTenant() orgId: string, @Param('channelId') channelId: string) {
    return this.channelsService.findRoutingRules(orgId, channelId);
  }

  @Post(':channelId/routing-rules')
  @RequirePermissions('agents:write')
  upsertRoutingRule(
    @CurrentTenant() orgId: string,
    @Param('channelId') channelId: string,
    @Body() dto: UpsertRoutingRuleDto,
  ) {
    return this.channelsService.upsertRoutingRule(orgId, channelId, dto);
  }

  @Delete(':channelId/routing-rules/:ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('agents:write')
  deleteRoutingRule(
    @CurrentTenant() orgId: string,
    @Param('channelId') channelId: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.channelsService.deleteRoutingRule(orgId, channelId, ruleId);
  }

  @Put(':channelId/routing-rules')
  @RequirePermissions('agents:write')
  replaceRoutingRules(
    @CurrentTenant() orgId: string,
    @Param('channelId') channelId: string,
    @Body() dto: ReplaceRoutingRulesDto,
  ) {
    return this.channelsService.replaceRoutingRules(orgId, channelId, dto);
  }

  @Get(':channelId/conversations')
  @RequirePermissions('agents:read')
  getChannelConversations(
    @CurrentTenant() orgId: string,
    @Param('channelId') channelId: string,
    @Query('page') page?: string,
  ) {
    return this.channelConvService.findByChannel(orgId, channelId, page ? Number(page) : 1);
  }

  @Get('conversations/:convId/messages')
  @RequirePermissions('agents:read')
  getConversationMessages(@CurrentTenant() orgId: string, @Param('convId') convId: string) {
    return this.channelConvService.findMessagesByConversation(orgId, convId);
  }
}
