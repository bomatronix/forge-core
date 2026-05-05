import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequireTenantGuard } from './require-tenant.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

function buildGuard(opts: { tenantId?: string | null; isPublic?: boolean }) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
    if (key === IS_PUBLIC_KEY) return opts.isPublic ?? false;
    return null;
  });

  const request = { tenantId: opts.tenantId } as unknown;

  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  const guard = new RequireTenantGuard(reflector);
  return { guard, ctx };
}

describe('RequireTenantGuard', () => {
  it('allows when tenantId is present', () => {
    const { guard, ctx } = buildGuard({ tenantId: 'org_abc123' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when tenantId is null', () => {
    const { guard, ctx } = buildGuard({ tenantId: null });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when tenantId is undefined (token has no org claim)', () => {
    const { guard, ctx } = buildGuard({ tenantId: undefined });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('skips the check for @Public() routes', () => {
    const { guard, ctx } = buildGuard({ tenantId: null, isPublic: true });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
