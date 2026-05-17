import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createPublicKey } from 'crypto';
import * as jwt from 'jsonwebtoken';
import type { UpstreamConnectionConfig, UpstreamProfile } from '@forge-core/core/auth/oauth.types';

type Jwk = Record<string, string | string[] | undefined>;

interface OidcMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
}

interface UpstreamTokenResponse {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
}

@Injectable()
export class UpstreamOidcService {
  private readonly metadataCache = new Map<string, OidcMetadata>();
  private readonly jwksCache = new Map<string, Jwk[]>();

  async buildAuthorizationUrl(
    connection: UpstreamConnectionConfig,
    params: {
      redirectUri: string;
      state: string;
      nonce: string;
    },
  ): Promise<string> {
    const metadata = await this.getMetadata(connection);

    const search = new URLSearchParams({
      response_type: 'code',
      client_id: connection.clientId ?? '',
      redirect_uri: params.redirectUri,
      scope: (connection.scopes ?? ['openid', 'profile', 'email']).join(' '),
      state: params.state,
      nonce: params.nonce,
    });

    return `${metadata.authorization_endpoint}?${search.toString()}`;
  }

  async exchangeCodeForProfile(
    connection: UpstreamConnectionConfig,
    params: {
      code: string;
      redirectUri: string;
      nonce?: string;
    },
  ): Promise<UpstreamProfile> {
    const metadata = await this.getMetadata(connection);
    const tokenResponse = await this.exchangeCode(
      connection,
      metadata,
      params.code,
      params.redirectUri,
    );
    const idTokenClaims = tokenResponse.id_token
      ? await this.verifyIdToken(connection, metadata, tokenResponse.id_token, params.nonce)
      : null;

    const userInfoClaims =
      (!idTokenClaims || !idTokenClaims.email || !idTokenClaims.name) &&
      tokenResponse.access_token &&
      metadata.userinfo_endpoint
        ? await this.fetchUserInfo(metadata.userinfo_endpoint, tokenResponse.access_token)
        : null;

    const claims = { ...(userInfoClaims ?? {}), ...(idTokenClaims ?? {}) } as Record<
      string,
      unknown
    >;
    if (!claims.sub) {
      throw new UnauthorizedException('Upstream identity provider did not return a subject claim.');
    }

    return {
      sub: String(claims.sub),
      email: this.getStringClaim(claims, ['email']),
      name: this.getStringClaim(claims, ['name', 'preferred_username']),
      avatarUrl: this.getStringClaim(claims, ['picture', 'image_url']),
      orgId: this.getStringClaim(claims, ['org_id', 'organization_id']),
    };
  }

  private async getMetadata(connection: UpstreamConnectionConfig): Promise<OidcMetadata> {
    if (connection.type === 'dev') {
      throw new BadRequestException('The dev connection does not use upstream OIDC metadata.');
    }

    const cacheKey = connection.id;
    const cached = this.metadataCache.get(cacheKey);
    if (cached) return cached;

    if (connection.discoveryUrl) {
      const response = await fetch(connection.discoveryUrl);
      if (!response.ok) {
        throw new UnauthorizedException(
          `Failed to fetch OIDC discovery document for '${connection.id}'.`,
        );
      }
      const metadata = (await response.json()) as OidcMetadata;
      this.metadataCache.set(cacheKey, metadata);
      return metadata;
    }

    if (!connection.authorizeUrl || !connection.tokenUrl || !connection.issuer) {
      throw new BadRequestException(
        `Connection '${connection.id}' is missing OIDC endpoint configuration.`,
      );
    }

    const metadata: OidcMetadata = {
      issuer: connection.issuer,
      authorization_endpoint: connection.authorizeUrl,
      token_endpoint: connection.tokenUrl,
      userinfo_endpoint: connection.userinfoUrl,
      jwks_uri: connection.jwksUrl,
    };
    this.metadataCache.set(cacheKey, metadata);
    return metadata;
  }

  private async exchangeCode(
    connection: UpstreamConnectionConfig,
    metadata: OidcMetadata,
    code: string,
    redirectUri: string,
  ): Promise<UpstreamTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: connection.clientId ?? '',
    });

    if (connection.clientSecret) {
      body.set('client_secret', connection.clientSecret);
    }

    const response = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new UnauthorizedException(`Upstream token exchange failed for '${connection.id}'.`);
    }

    return (await response.json()) as UpstreamTokenResponse;
  }

  private async verifyIdToken(
    connection: UpstreamConnectionConfig,
    metadata: OidcMetadata,
    token: string,
    nonce?: string,
  ): Promise<Record<string, unknown>> {
    if (!metadata.jwks_uri) {
      throw new UnauthorizedException(
        `OIDC connection '${connection.id}' does not expose a JWKS URI.`,
      );
    }

    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      throw new UnauthorizedException('Unable to decode upstream id_token.');
    }

    const key = await this.getPublicKeyForKid(metadata.jwks_uri, String(decoded.header.kid ?? ''));
    const verified = jwt.verify(token, key, {
      algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'],
      issuer: metadata.issuer,
      audience: connection.clientId,
    }) as jwt.JwtPayload;

    if (nonce && verified['nonce'] !== nonce) {
      throw new UnauthorizedException('OIDC nonce mismatch.');
    }

    return verified as Record<string, unknown>;
  }

  private async fetchUserInfo(
    userinfoEndpoint: string,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(userinfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException('Failed to fetch upstream userinfo.');
    }

    return (await response.json()) as Record<string, unknown>;
  }

  private async getPublicKeyForKid(jwksUri: string, kid: string) {
    const jwks = await this.getJwks(jwksUri);
    const jwk = jwks.find((item) => item.kid === kid) ?? jwks[0];
    if (!jwk) {
      throw new UnauthorizedException('Unable to find a matching upstream JWKS key.');
    }

    return createPublicKey({ key: jwk, format: 'jwk' });
  }

  private async getJwks(jwksUri: string): Promise<Jwk[]> {
    const cached = this.jwksCache.get(jwksUri);
    if (cached) return cached;

    const response = await fetch(jwksUri);
    if (!response.ok) {
      throw new UnauthorizedException('Failed to fetch upstream JWKS.');
    }

    const document = (await response.json()) as { keys?: Jwk[] };
    const keys = document.keys ?? [];
    this.jwksCache.set(jwksUri, keys);
    return keys;
  }

  private getStringClaim(claims: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = claims[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
    return null;
  }
}
