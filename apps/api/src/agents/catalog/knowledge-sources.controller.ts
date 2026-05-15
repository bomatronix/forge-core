import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { CurrentTenant, RequirePermissions } from '@forge-core/core';
import { KnowledgeSourcesService } from './knowledge-sources.service';
import { UpdateAgentKnowledgeSourcesDto } from './dto/update-agent-knowledge-sources.dto';

@Controller('knowledge-source-options')
export class KnowledgeSourceOptionsController {
  constructor(private readonly knowledgeSourcesService: KnowledgeSourcesService) {}

  @Get()
  @RequirePermissions('agents:read')
  list(@CurrentTenant() orgId: string, @Query('agentType') agentType?: string) {
    return this.knowledgeSourcesService.listOptions(orgId, agentType);
  }
}

@Controller('agent-types/:agentType/knowledge-sources')
export class AgentTypeKnowledgeSourcesController {
  constructor(private readonly knowledgeSourcesService: KnowledgeSourcesService) {}

  @Get()
  @RequirePermissions('agents:read')
  list(@CurrentTenant() orgId: string, @Param('agentType') agentType: string) {
    return this.knowledgeSourcesService.listOptionsForAgentType(orgId, agentType);
  }

  @Put()
  @RequirePermissions('agents:write')
  update(
    @CurrentTenant() orgId: string,
    @Param('agentType') agentType: string,
    @Body() dto: UpdateAgentKnowledgeSourcesDto,
  ) {
    return this.knowledgeSourcesService.updateAgentTypeOptions(
      orgId,
      agentType,
      dto.sourceSlugs ?? [],
    );
  }
}

@Controller('agents/:id/knowledge-sources')
export class AgentKnowledgeSourcesController {
  constructor(private readonly knowledgeSourcesService: KnowledgeSourcesService) {}

  @Get()
  @RequirePermissions('agents:read')
  list(@CurrentTenant() orgId: string, @Param('id') id: string) {
    return this.knowledgeSourcesService.findSelections(orgId, id);
  }

  @Put()
  @RequirePermissions('agents:write')
  update(
    @CurrentTenant() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAgentKnowledgeSourcesDto,
  ) {
    return this.knowledgeSourcesService.updateSelections(orgId, id, dto.sourceSlugs ?? []);
  }
}
