import {
  Controller,
  Post,
  Headers,
  HttpCode,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiProperty,
  ApiConsumes,
} from '@nestjs/swagger';
import { Public, resolveAuthAdapter, DevTokenVerifier } from '@forge-core/core';
import type { AuthProviderKey } from '@forge-core/core';

// ─── DTOs ────────────────────────────────────────────────────────────────────

class TokenResponseDto {
  @ApiProperty({ example: 'eyJhbGci...' })
  access_token!: string;

  @ApiProperty({ example: 'bearer' })
  token_type!: string;

  @ApiProperty({ example: 60, description: 'Seconds until expiry' })
  expires_in!: number;
}

class AuthorizerContextDto {
  @ApiProperty({ example: 'user_abc123' })
  userId!: string;

  @ApiProperty({ example: 'alice@example.com' })
  email!: string;

  @ApiProperty({ example: 'Alice' })
  name!: string;

  @ApiProperty({ example: 'https://example.com/avatar.jpg' })
  avatarUrl!: string;

  @ApiProperty({ example: 'org_xyz' })
  orgId!: string;
}

class AuthorizerResultDto {
  @ApiProperty({ enum: ['Allow', 'Deny'], example: 'Allow' })
  effect!: string;

  @ApiProperty({ example: 'user_abc123' })
  principalId!: string;

  @ApiProperty({ type: AuthorizerContextDto, required: false, nullable: true })
  context!: AuthorizerContextDto | null;
}

// ─── Controller ──────────────────────────────────────────────────────────────

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  /**
   * OAuth2 client_credentials token endpoint — dev only (sk_test_ keys).
   *
   * Swagger UI calls this automatically when you click Authorize → Authorize.
   * Wraps Clerk's Testing Tokens API so no browser sign-in is needed locally.
   */
  @Post('token')
  @Public()
  @HttpCode(200)
  @ApiConsumes('application/x-www-form-urlencoded', 'application/json')
  @ApiOperation({
    summary: 'Get an access token (dev only)',
    description:
      'OAuth2 client_credentials token endpoint backed by Clerk Testing Tokens. ' +
      'Only available with `sk_test_` secret keys. ' +
      'Swagger calls this automatically — just click **Authorize → Authorize**.',
  })
  @ApiResponse({ status: 200, type: TokenResponseDto })
  @ApiResponse({ status: 403, description: 'Not available with live keys' })
  async token(): Promise<TokenResponseDto> {
    const provider = (process.env.AUTH_PROVIDER ?? 'dev') as AuthProviderKey;

    if (provider === 'dev') {
      return {
        access_token: DevTokenVerifier.issueToken(),
        token_type: 'bearer',
        expires_in: 3600,
      };
    }

    // Clerk testing token path (sk_test_ only)
    const secretKey = process.env.AUTH_SECRET_KEY ?? '';
    if (!secretKey.startsWith('sk_test_')) {
      throw new ForbiddenException(
        'Token endpoint only available with AUTH_PROVIDER=dev or sk_test_ keys.',
      );
    }

    const res = await fetch('https://api.clerk.com/v1/testing_tokens', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}` },
    });

    if (!res.ok) {
      throw new UnauthorizedException(
        `Clerk testing tokens API returned ${res.status}.`,
      );
    }

    const data = (await res.json()) as { token: string; expires_at: number };
    return {
      access_token: data.token,
      token_type: 'bearer',
      expires_in: Math.max(0, data.expires_at - Math.floor(Date.now() / 1000)),
    };
  }

  /**
   * Verify a token and return the context the Lambda Authorizer would inject.
   * Useful for debugging token claims without deploying to AWS.
   */
  @Post('verify')
  @Public()
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Inspect a token',
    description:
      'Verifies the Bearer token and returns the exact context object ' +
      'the Lambda Authorizer would inject into requestContext.authorizer.',
  })
  @ApiResponse({ status: 200, type: AuthorizerResultDto })
  async verify(@Headers('authorization') authorization: string): Promise<AuthorizerResultDto> {
    const provider = (process.env.AUTH_PROVIDER ?? 'clerk') as AuthProviderKey;
    const effectiveProvider: AuthProviderKey =
      provider === 'lambda-authorizer' ? 'clerk' : provider;

    const token = authorization?.replace(/^Bearer\s+/i, '') ?? '';

    if (!token) {
      return { effect: 'Deny', principalId: 'unauthorized', context: null };
    }

    try {
      const adapter = resolveAuthAdapter(effectiveProvider, process.env.AUTH_SECRET_KEY, process.env.AUTH_PUBLISHABLE_KEY);
      const session = await adapter.verifyToken(token);

      if (!session) {
        return { effect: 'Deny', principalId: 'unauthorized', context: null };
      }

      return {
        effect: 'Allow',
        principalId: session.user.id,
        context: {
          userId: session.user.id,
          email: session.user.email ?? '',
          name: session.user.name ?? '',
          avatarUrl: session.user.avatarUrl ?? '',
          orgId: session.tenantId ?? '',
        },
      };
    } catch (err) {
      console.error('[auth/verify] Token verification error:', err);
      throw new UnauthorizedException('Token verification failed');
    }
  }
}
