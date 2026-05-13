import { Controller, Get } from '@nestjs/common';
import { CurrentTenant, RequirePermissions } from '@forge-core/core';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @RequirePermissions('agents:read')
  getDashboardMetrics(@CurrentTenant() orgId: string) {
    return this.metricsService.getDashboardMetrics(orgId);
  }
}
