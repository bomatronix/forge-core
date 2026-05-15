import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentTenant, RequirePermissions } from '@forge-core/core';
import { KnowledgeService } from './knowledge.service';
import { UpdateKnowledgeItemDto, UpsertKnowledgeItemDto } from './dto/upsert-knowledge-item.dto';

@Controller('agents/:id/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  @RequirePermissions('agents:read')
  list(@CurrentTenant() orgId: string, @Param('id') id: string) {
    return this.knowledgeService.findAll(orgId, id);
  }

  @Post()
  @RequirePermissions('agents:write')
  create(
    @CurrentTenant() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpsertKnowledgeItemDto,
  ) {
    return this.knowledgeService.create(orgId, id, dto);
  }

  @Put(':itemId')
  @RequirePermissions('agents:write')
  update(
    @CurrentTenant() orgId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateKnowledgeItemDto,
  ) {
    return this.knowledgeService.update(orgId, id, itemId, dto);
  }

  @Delete(':itemId')
  @RequirePermissions('agents:write')
  remove(@CurrentTenant() orgId: string, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.knowledgeService.remove(orgId, id, itemId);
  }
}
