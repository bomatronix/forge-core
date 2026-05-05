import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

/**
 * Opt-in guard that enforces required permissions on a route.
 *
 * Apply @RequirePermissions('scope:action') to a handler to restrict access.
 * Routes without the decorator are allowed through (guard is additive, not default-deny).
 * A wildcard '*' in the token's permissions grants access to all scopes.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No permissions required on this route — allow
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const permissions = (request as unknown as Record<string, unknown>)['permissions'] as
      | string[]
      | undefined;

    if (!permissions) {
      throw new ForbiddenException('No permissions in token');
    }

    // Wildcard — dev mode / superuser
    if (permissions.includes('*')) {
      return true;
    }

    // Normalize Clerk's org:-prefixed permissions (e.g. org:agents:read → agents:read)
    // so Clerk-direct tokens and auth-handler-issued tokens (which use agents:read) both match.
    const normalize = (p: string) => p.replace(/^org:/, '');
    const hasPermission = required.some((perm) =>
      permissions.some((p) => normalize(p) === perm),
    );
    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
