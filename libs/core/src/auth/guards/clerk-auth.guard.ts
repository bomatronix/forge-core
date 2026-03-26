import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global guard that validates Clerk JWT Bearer tokens.
 *
 * Extracts `user` and `tenantId` (org_id) from the JWT and attaches
 * them to the request object for downstream use via @CurrentUser()
 * and @CurrentTenant() decorators.
 *
 * Routes decorated with @Public() skip authentication.
 *
 * TODO: Implement actual Clerk JWT verification using @clerk/backend.
 * Currently a stub that extracts the Authorization header and marks
 * the structure — real verification will be added when Clerk is configured.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    // TODO: Replace with actual Clerk JWT verification:
    // import { verifyToken } from '@clerk/backend';
    // const payload = await verifyToken(token, { secretKey: this.clerkSecretKey });
    // For now, stub — the guard structure is in place.
    this.logger.warn('Clerk JWT verification not yet implemented — accepting all tokens');

    // Attach stub user/tenant to request (will come from JWT claims)
    const req = request as unknown as Record<string, unknown>;
    req['user'] = {
      id: 'stub-user-id',
      email: null,
      name: null,
      avatarUrl: null,
    };
    req['tenantId'] = null; // Will be extracted from JWT org_id claim

    return true;
  }

  private extractToken(request: Request): string | null {
    const authorization = request.headers.authorization;
    if (!authorization) return null;

    const [type, token] = authorization.split(' ');
    return type === 'Bearer' && token ? token : null;
  }
}
