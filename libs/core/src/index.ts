// Core module
export { CoreModule } from './core.module';

// Lambda utilities
export { resolveSecretsToEnv } from './lambda/resolve-secrets';
export type { CoreModuleOptions } from './core.module';
export { CORE_MODULE_OPTIONS } from './core.constants';

// Auth — contracts & types
export type { AuthProviderKey, AuthTokenVerifier, AuthTokenIssuer, TokenResponse } from './auth/contracts';
export type { AuthUser, AuthSession } from './auth/types';
export { AUTH_TOKEN_VERIFIER, AUTH_TOKEN_ISSUER } from './auth/auth.constants';
export { NotImplementedError } from './auth/not-implemented.error';
export { resolveAuthAdapter, resolveAuthIssuer } from './auth/auth-registry';

// Auth — guards
export { AuthGuard } from './auth/guards/auth.guard';
export { TenantGuard } from './auth/guards/tenant.guard';

// Auth — adapters are intentionally NOT exported from the public barrel.
// Application code must use resolveAuthAdapter() / resolveAuthIssuer() or inject
// via AUTH_TOKEN_VERIFIER / AUTH_TOKEN_ISSUER tokens. Direct adapter imports are
// only allowed in the standalone Lambda handlers (apps/authorizer) where NestJS DI
// is unavailable and bundle size requires targeted deep-path imports.
export {
  buildJwksDocument,
  buildUserInfo,
  getAuthHandlerRuntimeConfig,
  getSigningKeyId,
  hashOpaqueToken,
  issueAccessToken,
  issueIdToken,
  normalizePem,
  verifyIssuedToken,
} from './auth/platform-tokens';
export type {
  AccessTokenSubject,
  AuthHandlerRuntimeConfig,
} from './auth/platform-tokens';
export type {
  AuthClientConfig,
  AuthorizationCodeRecord,
  BrowserSession,
  ConsentRecord,
  IssuedTokenClaims,
  OAuthGrantType,
  OAuthResponseType,
  RefreshTokenRecord,
  UpstreamConnectionConfig,
  UpstreamProfile,
  UserInfoResponse,
} from './auth/oauth.types';

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
