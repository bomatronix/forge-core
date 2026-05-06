import { getCurrentInvoke } from '@codegenie/serverless-express';
import type { AuthTokenVerifier } from '../../contracts';
import type { AuthSession } from '../../types';

/**
 * Lambda Authorizer context reader — production adapter for API Gateway deployments.
 *
 * Reads the user claims injected by the apps/authorizer Lambda Authorizer into
 * event.requestContext.authorizer. Does NOT call any auth provider SDK.
 *
 * Uses getCurrentInvoke() from @codegenie/serverless-express to access the raw
 * Lambda event without requiring the eventContext() middleware to be registered.
 *
 * Only valid when running behind an API Gateway REST API with the Lambda Authorizer
 * configured. Use AUTH_PROVIDER=clerk (or another direct provider) for local dev.
 */
export class LambdaAuthorizerContextReader implements AuthTokenVerifier {
  async verifyToken(_token: string): Promise<AuthSession | null> {
    const { event } = getCurrentInvoke();
    const context = (event?.requestContext?.authorizer) as Record<string, string> | undefined;

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
