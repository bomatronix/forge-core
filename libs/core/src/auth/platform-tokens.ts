import { createHash, createPublicKey, randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import type { AuthSession } from './types';
import type { BrowserSession, IssuedTokenClaims, UserInfoResponse } from './oauth.types';

type Jwk = Record<string, string | string[] | undefined>;

const DEV_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCz097LLcjS41NT
//n5niKcOjjG1jegtgrc1LeiMoTQR5D4bJAd1fWVrNAbWUiuFZJ4gKF1Lot7eejg
Ma0M5hGrVeR7orZYg9eHj2qTNWUdHuIMfQRXt/vQkxHhbdn7DWWd78ZUYoC1t0P3
Q0Slg3wIshTb0cjU2oIB6Jfu6EUgbrl73tKBPhd1TxBmegCryiOUPfpd7+PF3HG2
QzdJRfbGgddTdCIJ5gF+zlVYzXzbGvYZW3OQFS7v75DSj7wczV6vZEH3nVgMfdcO
TMIGkt8moKIpTTIZIIscT/xfn0YWYLoYzrZgzH/gD6PdCf6uwz9Q1/stTgR217JY
RZLk6TCpAgMBAAECggEAJj1kZ+fXR/Mjzd3F2j00pmyiFLRKdYAonK+WUiU0hXbm
ftFVLycHt3mdcmdg03YOZNYTn2/TpOD2crBVmIPXF4xnDxx5cqasnyzR8LZex1vB
HX87PG0JHSAdIgciXqbJaFWr4tdkf9/WEd9J2nl0l4PI+Dqq3oqNsVq07k6RnpTZ
i1060sI8ykWLJgM5YKj14erJvaOmdM4iW+7b44ZYadp53+nQNvsqikBJ5gromMna
tp1lZ09cXI8gcHvFxuMt9cOTRNcjtuZgDbsY68JTg7Jmt2Qicx1VMY2p/NBJd7WD
ulyLG6Z3lbGswsBC8E5tgtfDyKWEQ3z5/mZGkf5vJQKBgQDomJRXE0C5K8pfcmpM
ygGzvds8Ey6z/nNuIY7GgjuH7oHJtWVJElwB8akxBCTVLtNijIZY8ITyXkoNkmaY
prnbcD49NQI87rk6heAzSRodju2Yof4aBGqXMkY74iEHV/n9b1s5NcmW5qz4SYkL
KEvfOPOSV5UxfQRoao5rn/l+DQKBgQDF7AjJB/4jkJQjAMssVio+Zgfudl/rS1B4
MWQ4YGNyi85eezsXpaCvG91IZuvnE2bIAk1vzrLttx/1UoRYx6tMAtPVXmhEiKvk
SUkpYEP/vYOlV14fhUAC4M42Ix66etbRmvK4ZFFbT7BpAcnRrIL/UY2cqTnR7JTK
vcxxrIxyDQKBgQDdapoTxhUf8OrGL5G3pbk3FK3Fo3EbEUdq+HEE0WbAQLC2hoJz
rBGAHD92lL5HXjsGHkWqFtRIMLAH+WzHNjfJCDGHbJXD0XDsoBLMX3OH3c6aNONC
ex/I7KflS58rcXld44qQjH5psw/Hj6DwyRxo07syfUNeB+eRSpZnJ7OGZQKBgFg2
3auMTm9Xj08SmXvHY8iv/TUBubrLtK/9g6fE/k4dlftyfWIKxlWF29jbVqWFdjgL
HqyIuiNNjYbwImDXjbexQu1EyMBTEhoLt/ojF+uyciyNhjwSTfd6by6d9KI1Ae4m
W6xnugMyv3PuAh/b/f8CQFXk7wprod3DPo4j0+05AoGBAIbyrwMhlJw7oALLzYDF
RF72odVgV8KLI7Vj7Bfg96eH/UdJ3TPVdXzPe0tLrSgJyZkoy4C1aFa/y1y/1ixC
cVr9wBlCi8dA9z1L5cDOujxA39PBLisw4PvFjHUw7b1iSxL+BE5RBDXO9nQjrcLm
xMe4D1kbn9XcAsQKWKlEB4bU
-----END PRIVATE KEY-----`;

const DEV_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs9Peyy3I0uNTU//5+Z4i
nDo4xtY3oLYK3NS3ojKE0EeQ+GyQHdX1lazQG1lIrhWSeIChdS6Le3no4DGtDOYR
q1Xke6K2WIPXh49qkzVlHR7iDH0EV7f70JMR4W3Z+w1lne/GVGKAtbdD90NEpYN8
CLIU29HI1NqCAeiX7uhFIG65e97SgT4XdU8QZnoAq8ojlD36Xe/jxdxxtkM3SUX2
xoHXU3QiCeYBfs5VWM182xr2GVtzkBUu7++Q0o+8HM1er2RB951YDH3XDkzCBpLf
JqCiKU0yGSCLHE/8X59GFmC6GM62YMx/4A+j3Qn+rsM/UNf7LU4EdteyWEWS5Okw
qQIDAQAB
-----END PUBLIC KEY-----`;

export interface AuthHandlerRuntimeConfig {
  issuer: string;
  audience: string;
  cookieSecret: string;
  privateKey: string;
  publicKey: string;
  accessTokenTtlSeconds: number;
  idTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
}

export interface AccessTokenSubject {
  subject: string;
  clientId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  orgId: string | null;
  permissions: string[];
  scope: string[];
  tokenKind: 'user' | 'machine';
}

export function normalizePem(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/\\n/g, '\n').trim();
}

export function getAuthHandlerRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): AuthHandlerRuntimeConfig {
  const issuer = env.AUTH_HANDLER_ISSUER?.trim() || 'http://localhost:3002/auth';
  const audience = env.AUTH_HANDLER_AUDIENCE?.trim() || 'forge-core-api';
  const cookieSecret =
    env.AUTH_HANDLER_COOKIE_SECRET?.trim() || 'forge-core-auth-handler-cookie-secret';
  const privateKey = normalizePem(env.AUTH_HANDLER_PRIVATE_KEY) || DEV_PRIVATE_KEY;
  const publicKey = normalizePem(env.AUTH_HANDLER_PUBLIC_KEY) || DEV_PUBLIC_KEY;

  // Fail fast in production if signing keys haven't been provisioned.
  // The DEV_PRIVATE_KEY/DEV_PUBLIC_KEY fallbacks are committed to source — they must
  // never be used to sign tokens in a production environment.
  if (
    env.NODE_ENV === 'production' &&
    (!env.AUTH_HANDLER_PRIVATE_KEY || !env.AUTH_HANDLER_PUBLIC_KEY)
  ) {
    throw new Error(
      'AUTH_HANDLER_PRIVATE_KEY and AUTH_HANDLER_PUBLIC_KEY must be set in production. ' +
        'The dev key fallback is committed to source and is not safe for production use.',
    );
  }

  return {
    issuer,
    audience,
    cookieSecret,
    privateKey,
    publicKey,
    accessTokenTtlSeconds: Number(env.AUTH_HANDLER_ACCESS_TOKEN_TTL_SECONDS ?? 900),
    idTokenTtlSeconds: Number(env.AUTH_HANDLER_ID_TOKEN_TTL_SECONDS ?? 900),
    refreshTokenTtlSeconds: Number(env.AUTH_HANDLER_REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 30),
  };
}

export function getSigningKeyId(publicKey: string): string {
  return createHash('sha256').update(publicKey).digest('base64url').slice(0, 16);
}

export function buildJwksDocument(publicKey: string): {
  keys: Array<Jwk & { kid: string; use: 'sig'; alg: 'RS256' }>;
} {
  const key = createPublicKey(publicKey);
  const jwk = key.export({ format: 'jwk' }) as Jwk;

  return {
    keys: [
      {
        ...jwk,
        kid: getSigningKeyId(publicKey),
        use: 'sig',
        alg: 'RS256',
      },
    ],
  };
}

export function issueAccessToken(
  config: AuthHandlerRuntimeConfig,
  subject: AccessTokenSubject,
): string {
  const claims: Omit<IssuedTokenClaims, 'iss' | 'aud' | 'exp' | 'iat'> = {
    sub: subject.subject,
    azp: subject.clientId,
    scope: subject.scope.join(' '),
    permissions: subject.permissions,
    email: subject.email,
    name: subject.name,
    avatar_url: subject.avatarUrl,
    org_id: subject.orgId,
    token_use: 'access',
    token_kind: subject.tokenKind,
  };

  return jwt.sign(claims, config.privateKey, {
    algorithm: 'RS256',
    issuer: config.issuer,
    audience: config.audience,
    expiresIn: config.accessTokenTtlSeconds,
    keyid: getSigningKeyId(config.publicKey),
    jwtid: randomUUID(),
  });
}

export function issueIdToken(
  config: AuthHandlerRuntimeConfig,
  params: {
    clientId: string;
    subject: string;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
    orgId: string | null;
    permissions: string[];
    nonce?: string;
  },
): string {
  const claims: Omit<IssuedTokenClaims, 'iss' | 'aud' | 'exp' | 'iat'> = {
    sub: params.subject,
    azp: params.clientId,
    email: params.email,
    name: params.name,
    avatar_url: params.avatarUrl,
    org_id: params.orgId,
    permissions: params.permissions,
    token_use: 'id',
    token_kind: 'user',
    nonce: params.nonce,
  };

  return jwt.sign(claims, config.privateKey, {
    algorithm: 'RS256',
    issuer: config.issuer,
    audience: params.clientId,
    expiresIn: config.idTokenTtlSeconds,
    keyid: getSigningKeyId(config.publicKey),
    jwtid: randomUUID(),
  });
}

export function verifyIssuedToken(
  token: string,
  config: Pick<AuthHandlerRuntimeConfig, 'issuer' | 'audience' | 'publicKey'> & {
    audience?: string;
    expectedUse?: 'access' | 'id';
  },
): IssuedTokenClaims {
  const claims = jwt.verify(token, config.publicKey, {
    algorithms: ['RS256'],
    issuer: config.issuer,
    audience: config.audience,
  }) as IssuedTokenClaims;

  if (config.expectedUse && claims.token_use !== config.expectedUse) {
    throw new Error(`Unexpected token_use: '${claims.token_use}'`);
  }

  return claims;
}

export function authSessionFromClaims(claims: IssuedTokenClaims): AuthSession {
  return {
    user: {
      id: claims.sub,
      email: claims.email ?? null,
      name: claims.name ?? null,
      avatarUrl: claims.avatar_url ?? null,
    },
    tenantId: claims.org_id ?? null,
    permissions: claims.permissions ?? claims.scope?.split(' ').filter(Boolean) ?? [],
  };
}

export function browserSessionFromClaims(
  claims: Pick<
    IssuedTokenClaims,
    'sub' | 'email' | 'name' | 'avatar_url' | 'org_id' | 'permissions'
  > & {
    provider: string;
  },
): BrowserSession {
  return {
    sub: claims.sub,
    email: claims.email ?? null,
    name: claims.name ?? null,
    avatarUrl: claims.avatar_url ?? null,
    orgId: claims.org_id ?? null,
    permissions: claims.permissions ?? [],
    provider: claims.provider,
    createdAt: new Date().toISOString(),
  };
}

export function buildUserInfo(claims: IssuedTokenClaims): UserInfoResponse {
  return {
    sub: claims.sub,
    email: claims.email ?? null,
    name: claims.name ?? null,
    picture: claims.avatar_url ?? null,
    org_id: claims.org_id ?? null,
    permissions: claims.permissions ?? [],
  };
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}
