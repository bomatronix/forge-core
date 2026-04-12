import { Controller, Get } from '@nestjs/common';
import { Public } from '@forge-core/core';

@Controller()
export class HealthController {
  @Public()
  @Get()
  root() {
    return this.health();
  }

  @Public()
  @Get('health')
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'forge-core',
    };
  }

  @Get('health/protected')
  protectedHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'forge-core',
      authenticated: true,
    };
  }
}
