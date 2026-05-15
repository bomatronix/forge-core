import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentTenant, RequirePermissions } from '@forge-core/core';
import { AgentTemplatesService } from './agent-templates.service';

@Controller('agent-templates')
export class AgentTemplatesController {
  constructor(private readonly agentTemplatesService: AgentTemplatesService) {}

  @Get()
  @RequirePermissions('agents:read')
  list(@CurrentTenant() orgId: string, @Query('category') category?: string) {
    return this.agentTemplatesService.list(orgId, category);
  }

  @Get(':slug')
  @RequirePermissions('agents:read')
  findOne(@CurrentTenant() orgId: string, @Param('slug') slug: string) {
    return this.agentTemplatesService.findOne(orgId, slug);
  }
}
