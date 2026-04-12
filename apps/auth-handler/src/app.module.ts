import { Module } from '@nestjs/common';
import { CoreModule } from '@forge-core/core';
import { AuthHandlerController } from './auth-handler.controller';
import { AuthHandlerConfigService } from './auth-handler.config';
import { AuthPersistenceStore } from './auth-store';
import { OidcProviderService } from './oidc-provider.service';
import { UpstreamOidcService } from './upstream-oidc.service';

@Module({
  imports: [
    CoreModule.forRoot({
      authProvider:
        (process.env.AUTH_PROVIDER as import('@forge-core/core').AuthProviderKey) ?? 'dev',
      authSecretKey: process.env.AUTH_SECRET_KEY,
      authPublishableKey: process.env.AUTH_PUBLISHABLE_KEY,
    }),
  ],
  controllers: [AuthHandlerController],
  providers: [
    AuthHandlerConfigService,
    AuthPersistenceStore,
    UpstreamOidcService,
    OidcProviderService,
  ],
})
export class AppModule {}
