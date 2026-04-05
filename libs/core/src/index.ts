// Core module
export { CoreModule } from './core.module';
export type { CoreModuleOptions } from './core.module';
export { CORE_MODULE_OPTIONS } from './core.constants';

// Auth — contracts & types
export type { AuthProviderKey, AuthTokenVerifier } from './auth/contracts';
export type { AuthUser, AuthSession } from './auth/types';
export { AUTH_TOKEN_VERIFIER } from './auth/auth.constants';
export { NotImplementedError } from './auth/not-implemented.error';
export { resolveAuthAdapter } from './auth/auth-registry';

// Auth — guards
export { AuthGuard } from './auth/guards/auth.guard';
export { TenantGuard } from './auth/guards/tenant.guard';

// Auth — adapters
export { ClerkTokenVerifier } from './auth/adapters/clerk/token-verifier';
export { NextAuthTokenVerifier } from './auth/adapters/next-auth/token-verifier';
export { OktaTokenVerifier } from './auth/adapters/okta/token-verifier';
export { LambdaAuthorizerContextReader } from './auth/adapters/lambda-authorizer/context-reader';
export { DevTokenVerifier } from './auth/adapters/dev/token-verifier';

// Decorators
export { CurrentUser } from './auth/decorators/current-user.decorator';
export { CurrentTenant } from './auth/decorators/current-tenant.decorator';
export { Public, IS_PUBLIC_KEY } from './auth/decorators/public.decorator';

// Interceptors
export { LoggingInterceptor } from './interceptors/logging.interceptor';
export { TransformInterceptor } from './interceptors/transform.interceptor';
export type { ApiResponse } from './interceptors/transform.interceptor';

// Filters
export { AllExceptionsFilter } from './filters/all-exceptions.filter';

// Pipes
export { createValidationPipe } from './pipes/validation.pipe';
