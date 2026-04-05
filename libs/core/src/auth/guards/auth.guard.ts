import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AUTH_TOKEN_VERIFIER } from '../auth.constants';
import type { AuthTokenVerifier } from '../contracts';

/**
 * Global auth guard — provider-agnostic.
 *
 * Validates the Bearer token using the injected AuthTokenVerifier adapter
 * (Clerk, NextAuth, Okta, etc.) and attaches user + tenantId to the request.
 *
 * Routes decorated with @Public() skip authentication.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_TOKEN_VERIFIER) private readonly verifier: AuthTokenVerifier,
  ) {}

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

    const session = await this.verifier.verifyToken(token, request);

    if (!session) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Attach session data to request for @CurrentUser() and @CurrentTenant()
    const req = request as unknown as Record<string, unknown>;
    req['user'] = session.user;
    req['tenantId'] = session.tenantId;

    return true;
  }

  private extractToken(request: Request): string | null {
    const authorization = request.headers.authorization;
    if (!authorization) return null;

    const [type, token] = authorization.split(' ');
    return type === 'Bearer' && token ? token : null;
  }
}
