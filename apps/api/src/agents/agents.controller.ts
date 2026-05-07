import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentTenant, RequirePermissions } from '@forge-core/core';
import { CreateAgentDto, UpdateAgentDto, UpdateStatusDto } from '@forge-core/common';
import { AgentsService } from './agents.service';

@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  @RequirePermissions('agents:read')
  list(@CurrentTenant() orgId: string) {
    return this.agentsService.list(orgId);
  }

  @Get(':id')
  @RequirePermissions('agents:read')
  findOne(@CurrentTenant() orgId: string, @Param('id') id: string) {
    return this.agentsService.findOne(orgId, id);
  }

  @Post()
  @RequirePermissions('agents:write')
  create(@CurrentTenant() orgId: string, @Body() dto: CreateAgentDto) {
    return this.agentsService.create(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions('agents:write')
  update(@CurrentTenant() orgId: string, @Param('id') id: string, @Body() dto: UpdateAgentDto) {
    return this.agentsService.update(orgId, id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('agents:write')
  updateStatus(
    @CurrentTenant() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.agentsService.updateStatus(orgId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('agents:write')
  remove(@CurrentTenant() orgId: string, @Param('id') id: string) {
    return this.agentsService.remove(orgId, id);
  }
}
