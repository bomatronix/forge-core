import { Controller, Get } from '@nestjs/common';
import { CurrentTenant, RequirePermissions } from '@forge-core/core';
import { AgentTypesService } from './agent-types.service';

@Controller('agent-types')
export class AgentTypesController {
  constructor(private readonly agentTypesService: AgentTypesService) {}

  @Get()
  @RequirePermissions('agents:read')
  list(@CurrentTenant() orgId: string) {
    return this.agentTypesService.list(orgId);
  }
}
