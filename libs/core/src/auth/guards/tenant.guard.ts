import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CORE_MODULE_OPTIONS } from '../../core.constants';
import type { CoreModuleOptions } from '../../core.module';

/**
 * Defense-in-depth guard that validates the tenant/org from the JWT
 * is in the allowedOrgIds list for this deployment.
 *
 * Even if a valid JWT for org-B hits the Lambda for org-A, this guard rejects it.
 * Skipped for @Public() routes and when allowedOrgIds is empty (no restriction).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CORE_MODULE_OPTIONS) private readonly options: CoreModuleOptions,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // If no org restrictions configured, allow all authenticated requests
    if (!this.options.allowedOrgIds || this.options.allowedOrgIds.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const tenantId = (request as unknown as Record<string, unknown>)['tenantId'] as string | null;

    if (!tenantId) {
      throw new ForbiddenException('No organization context in token');
    }

    if (!this.options.allowedOrgIds.includes(tenantId)) {
      throw new ForbiddenException('Organization not authorized for this deployment');
    }

    return true;
  }
}
