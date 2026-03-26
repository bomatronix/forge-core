import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ClerkAuthGuard } from './auth/guards/clerk-auth.guard';
import { TenantGuard } from './auth/guards/tenant.guard';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { createValidationPipe } from './pipes/validation.pipe';
import { CORE_MODULE_OPTIONS } from './core.constants';

export interface CoreModuleOptions {
  /** Clerk secret key for JWT verification */
  clerkSecretKey?: string;
  /** Allowed organization IDs for this deployment (defense-in-depth) */
  allowedOrgIds?: string[];
}

/**
 * Shared core module providing auth, logging, error handling, and validation.
 *
 * Usage in client app.module.ts:
 * ```
 * CoreModule.forRoot({
 *   clerkSecretKey: process.env.CLERK_SECRET_KEY,
 *   allowedOrgIds: [process.env.CLIENT_ORG_ID],
 * })
 * ```
 */
@Module({})
export class CoreModule {
  static forRoot(options: CoreModuleOptions = {}): DynamicModule {
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
          provide: APP_GUARD,
          useClass: ClerkAuthGuard,
        },
        {
          provide: APP_GUARD,
          useClass: TenantGuard,
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
    };
  }
}
