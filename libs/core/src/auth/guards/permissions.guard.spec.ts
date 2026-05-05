import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

function makeCtx(opts: {
  permissions?: string[] | undefined;
  required?: string[];
  isPublic?: boolean;
}): ExecutionContext {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
    if (key === IS_PUBLIC_KEY) return opts.isPublic ?? false;
    if (key === PERMISSIONS_KEY) return opts.required ?? null;
    return null;
  });

  const request = { permissions: opts.permissions } as unknown;

  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { ctx, reflector } as unknown as ExecutionContext & { reflector: Reflector };
}

function buildGuard(opts: Parameters<typeof makeCtx>[0]) {
  const { ctx, reflector } = makeCtx(opts) as unknown as {
    ctx: ExecutionContext;
    reflector: Reflector;
  };
  const guard = new PermissionsGuard(reflector);
  return { guard, ctx };
}

describe('PermissionsGuard', () => {
  it('allows public routes regardless of permissions', () => {
    const { guard, ctx } = buildGuard({ isPublic: true });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows routes with no @RequirePermissions metadata', () => {
    const { guard, ctx } = buildGuard({ permissions: [] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when token carries the wildcard * permission', () => {
    const { guard, ctx } = buildGuard({
      required: ['agents:read'],
      permissions: ['*'],
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows exact permission match', () => {
    const { guard, ctx } = buildGuard({
      required: ['agents:read'],
      permissions: ['agents:read', 'agents:write'],
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('normalizes org: prefix — org:agents:read matches requirement agents:read', () => {
    const { guard, ctx } = buildGuard({
      required: ['agents:read'],
      permissions: ['org:agents:read'],
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('normalizes org: prefix — org:agents:write matches requirement agents:write', () => {
    const { guard, ctx } = buildGuard({
      required: ['agents:write'],
      permissions: ['org:agents:write'],
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when permissions claim is absent', () => {
    const { guard, ctx } = buildGuard({
      required: ['agents:read'],
      permissions: undefined,
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when no required permission is present', () => {
    const { guard, ctx } = buildGuard({
      required: ['agents:write'],
      permissions: ['agents:read'],
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when org:-prefixed token lacks required permission', () => {
    const { guard, ctx } = buildGuard({
      required: ['agents:write'],
      permissions: ['org:agents:read'],
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows when at least one required permission matches (any-of semantics)', () => {
    const { guard, ctx } = buildGuard({
      required: ['agents:admin', 'agents:write'],
      permissions: ['agents:write'],
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
