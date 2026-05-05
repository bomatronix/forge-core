import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER, APP_PIPE } from '@nestjs/core';
import type { AuthProviderKey } from './auth/contracts';
import { resolveAuthAdapter, resolveAuthIssuer } from './auth/auth-registry';
import { AUTH_TOKEN_VERIFIER, AUTH_TOKEN_ISSUER } from './auth/auth.constants';
import { AuthGuard } from './auth/guards/auth.guard';
import { TenantGuard } from './auth/guards/tenant.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { RequireTenantGuard } from './auth/guards/require-tenant.guard';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { createValidationPipe } from './pipes/validation.pipe';
import { CORE_MODULE_OPTIONS } from './core.constants';

export interface CoreModuleOptions {
  /** Auth provider to use (default: 'clerk') */
  authProvider?: AuthProviderKey;
  /** Provider-specific secret key for token verification */
  authSecretKey?: string;
  /** Publishable key — required by Clerk when verifying testing tokens locally */
  authPublishableKey?: string;
  /** Allowed organization IDs for this deployment (defense-in-depth) */
  allowedOrgIds?: string[];
}

/**
 * Shared core module providing auth, logging, error handling, and validation.
 *
 * Uses the adapter pattern for auth — switch providers via `authProvider` option.
 * The active adapter is resolved once at startup via the registry.
 *
 * Usage:
 * ```
 * CoreModule.forRoot({
 *   authProvider: (process.env.AUTH_PROVIDER as AuthProviderKey) ?? 'clerk',
 *   authSecretKey: process.env.CLERK_SECRET_KEY,
 *   allowedOrgIds: process.env.ALLOWED_ORG_IDS?.split(','),
 * })
 * ```
 */
@Module({})
export class CoreModule {
  static forRoot(options: CoreModuleOptions = {}): DynamicModule {
    const provider = options.authProvider ?? 'clerk';
    const adapter = resolveAuthAdapter(provider, options.authSecretKey, options.authPublishableKey);
    const issuer = resolveAuthIssuer(provider, options.authSecretKey);

    return {
      module: CoreModule,
      global: true,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
      ],
      providers: [
        {
          provide: CORE_MODULE_OPTIONS,
          useValue: options,
        },
        {
          provide: AUTH_TOKEN_VERIFIER,
          useValue: adapter,
        },
        {
          provide: AUTH_TOKEN_ISSUER,
          useValue: issuer,
        },
        {
          provide: APP_GUARD,
          useClass: AuthGuard,
        },
        {
          provide: APP_GUARD,
          useClass: TenantGuard,
        },
        {
          provide: APP_GUARD,
          useClass: PermissionsGuard,
        },
        {
          provide: APP_GUARD,
          useClass: RequireTenantGuard,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: LoggingInterceptor,
        },
        {
          provide: APP_FILTER,
          useClass: AllExceptionsFilter,
        },
        {
          provide: APP_PIPE,
          useValue: createValidationPipe(),
        },
      ],
      exports: [AUTH_TOKEN_VERIFIER, AUTH_TOKEN_ISSUER],
    };
  }
}
