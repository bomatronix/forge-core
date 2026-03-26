import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public — skips ClerkAuthGuard and TenantGuard.
 * Use for health checks, public endpoints, etc.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
