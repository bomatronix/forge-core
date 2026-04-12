import type { Request } from 'express';
import type { AuthTokenVerifier } from '../../contracts';
import type { AuthSession } from '../../types';

/**
 * Lambda Authorizer context reader — production adapter for API Gateway deployments.
 *
 * Reads the user claims injected by the apps/authorizer Lambda Authorizer into
 * event.requestContext.authorizer. Does NOT call any auth provider SDK.
 *
 * API Gateway REST API caches the authorizer result (default 300s TTL), so
 * there is zero per-request verification cost on cache hits.
 *
 * Only valid when running behind an API Gateway REST API with the Lambda Authorizer
 * configured. Use AUTH_PROVIDER=clerk (or another direct provider) for local dev.
 */
export class LambdaAuthorizerContextReader implements AuthTokenVerifier {
  async verifyToken(_token: string, request?: Request): Promise<AuthSession | null> {
    // @codegenie/serverless-express exposes the raw Lambda event on req.apiGateway
    const apiGateway = (request as unknown as Record<string, unknown>)?.['apiGateway'] as
      | { event?: { requestContext?: { authorizer?: Record<string, string> } } }
      | undefined;

    const context = apiGateway?.event?.requestContext?.authorizer;

    if (!context?.userId) {
      return null;
    }

    return {
      user: {
        id: context.userId,
        email: context.email || null,
        name: context.name || null,
        avatarUrl: context.avatarUrl || null,
      },
      tenantId: context.orgId || null,
      permissions: context.permissions ? context.permissions.split(',').filter(Boolean) : [],
    };
  }
}

// Compile-time check: ensures this class satisfies the contract
const _typeCheck: AuthTokenVerifier = new LambdaAuthorizerContextReader();
void _typeCheck;
