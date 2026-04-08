import { Module } from '@nestjs/common';
import { CoreModule } from '@forge-core/core';
import { HealthController } from './health/health.controller';
import { AuthController } from './auth/auth.controller';

@Module({
  imports: [
    CoreModule.forRoot({
      // Production (Lambda + API Gateway): AUTH_PROVIDER=lambda-authorizer
      // Local dev (no API Gateway):        AUTH_PROVIDER=clerk (or next-auth, okta)
      authProvider:
        (process.env.AUTH_PROVIDER as import('@forge-core/core').AuthProviderKey) ??
        'lambda-authorizer',
      authSecretKey: process.env.AUTH_SECRET_KEY,
      authPublishableKey: process.env.AUTH_PUBLISHABLE_KEY,
      allowedOrgIds: process.env.ALLOWED_ORG_IDS?.split(',').filter(Boolean),
    }),
  ],
  controllers: [HealthController, AuthController],
})
export class AppModule {}
