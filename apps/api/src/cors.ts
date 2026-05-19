import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { ChannelsService } from '@forge-core/channels';

type OriginCallback = (err: Error | null, allow?: boolean) => void;

export function parseStaticCorsOrigins(
  raw = process.env.CORS_ORIGIN,
  nodeEnv = process.env.NODE_ENV,
): Set<string> {
  const fallback = nodeEnv === 'production' ? '' : 'http://localhost:3000';
  return new Set(
    (raw ?? fallback)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function isStaticCorsOriginAllowed(origin: string | undefined | null): boolean {
  if (!origin) return false;

  const staticOrigins = parseStaticCorsOrigins();
  return staticOrigins.has('*') || staticOrigins.has(origin);
}

export function createCorsOptions(
  channelsService: Pick<ChannelsService, 'isCorsOriginAllowed'>,
): CorsOptions {
  const staticOrigins = parseStaticCorsOrigins();

  return {
    origin(origin: string | undefined, callback: OriginCallback) {
      void (async () => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (staticOrigins.has('*') || staticOrigins.has(origin)) {
          callback(null, true);
          return;
        }

        const isConfiguredWidgetOrigin = await channelsService.isCorsOriginAllowed(origin);
        callback(null, isConfiguredWidgetOrigin);
      })().catch((err: unknown) => {
        callback(err instanceof Error ? err : new Error(String(err)), false);
      });
    },
    credentials: true,
  };
}
