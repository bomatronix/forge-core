import { createCorsOptions, isStaticCorsOriginAllowed, parseStaticCorsOrigins } from './cors';

function resolveOrigin(
  origin: string | undefined,
  allowedWidgetOrigin = false,
): Promise<boolean> {
  const options = createCorsOptions({
    isCorsOriginAllowed: jest.fn().mockResolvedValue(allowedWidgetOrigin),
  });
  const delegate = options.origin as (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => void;

  return new Promise((resolve, reject) => {
    delegate(origin, (err, allow) => {
      if (err) reject(err);
      else resolve(Boolean(allow));
    });
  });
}

describe('API CORS options', () => {
  const originalCorsOrigin = process.env.CORS_ORIGIN;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = originalCorsOrigin;

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('allows static env origins', async () => {
    process.env.CORS_ORIGIN = 'https://app.mindrithm.ai,https://admin.mindrithm.ai';

    await expect(resolveOrigin('https://app.mindrithm.ai')).resolves.toBe(true);
    expect(isStaticCorsOriginAllowed('https://admin.mindrithm.ai')).toBe(true);
  });

  it('allows configured widget origins', async () => {
    process.env.CORS_ORIGIN = 'https://app.mindrithm.ai';

    await expect(resolveOrigin('https://client.example', true)).resolves.toBe(true);
  });

  it('blocks unknown browser origins', async () => {
    process.env.CORS_ORIGIN = 'https://app.mindrithm.ai';

    await expect(resolveOrigin('https://unknown.example')).resolves.toBe(false);
  });

  it('allows requests without an Origin header', async () => {
    process.env.CORS_ORIGIN = 'https://app.mindrithm.ai';

    await expect(resolveOrigin(undefined)).resolves.toBe(true);
  });

  it('does not default to localhost in production', () => {
    delete process.env.CORS_ORIGIN;
    expect(parseStaticCorsOrigins(undefined, 'production')).toEqual(new Set());
  });
});
