import { Module } from '@nestjs/common';
import { CoreModule } from '@forge-core/core';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    CoreModule.forRoot({
      authProvider:
        (process.env.AUTH_PROVIDER as import('@forge-core/core').AuthProviderKey) ??
        undefined,
      authSecretKey: process.env.AUTH_SECRET_KEY,
      allowedOrgIds: process.env.ALLOWED_ORG_IDS?.split(',').filter(Boolean),
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
