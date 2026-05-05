import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard that enforces tenant context is present on the request.
 *
 * Necessary because TenantGuard skips the tenantId null-check when
 * allowedOrgIds is empty — a valid token with no org_id would otherwise
 * reach the service and hit the DB org_id NOT NULL constraint.
 *
 * Apply at the class level on any controller whose routes are tenant-scoped.
 */
@Injectable()
export class RequireTenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const tenantId = (request as unknown as Record<string, unknown>)['tenantId'] as string | null;

    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    return true;
  }
}
