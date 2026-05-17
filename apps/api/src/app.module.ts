import { Module } from '@nestjs/common';
import { CoreModule, DrizzleModule } from '@forge-core/core';
import { AuthController } from './auth/auth.controller';
import { HealthController } from './health/health.controller';
import { AgentsModule } from './agents/agents.module';
import { MetricsModule } from './metrics/metrics.module';
import { AppChannelsModule } from './channels/channels.module';

@Module({
  imports: [
    CoreModule.forRoot({
      // Production (Lambda + API Gateway): AUTH_PROVIDER=lambda-authorizer
      // Local dev with auth-handler:       AUTH_PROVIDER=auth-handler
      authProvider:
        (process.env.AUTH_PROVIDER as import('@forge-core/core').AuthProviderKey) ??
        (process.env.AWS_LAMBDA_FUNCTION_NAME ? 'lambda-authorizer' : 'auth-handler'),
      authSecretKey: process.env.AUTH_SECRET_KEY,
      authPublishableKey: process.env.AUTH_PUBLISHABLE_KEY,
      allowedOrgIds: process.env.ALLOWED_ORG_IDS?.split(',').filter(Boolean),
    }),
    DrizzleModule.forRootAsync(),
    AgentsModule,
    MetricsModule,
    AppChannelsModule,
  ],
  controllers: [AuthController, HealthController],
})
export class AppModule {}
