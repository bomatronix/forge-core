import { Module } from '@nestjs/common';
import { CoreModule } from '@forge-core/core';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    CoreModule.forRoot({
      clerkSecretKey: process.env.CLERK_SECRET_KEY,
      allowedOrgIds: process.env.ALLOWED_ORG_IDS?.split(',').filter(Boolean),
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
