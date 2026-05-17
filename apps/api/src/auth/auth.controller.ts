import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { CurrentTenant, CurrentUser } from '@forge-core/core';
import type { AuthUser } from '@forge-core/core';
import type { Request } from 'express';

class AuthenticatedUserDto {
  @ApiProperty({ example: 'dev-user-id' })
  id!: string;

  @ApiProperty({ example: 'dev@example.com', nullable: true })
  email!: string | null;

  @ApiProperty({ example: 'Dev User', nullable: true })
  name!: string | null;

  @ApiProperty({ example: null, nullable: true })
  avatarUrl!: string | null;
}

class AuthSessionDto {
  @ApiProperty({ type: AuthenticatedUserDto })
  user!: AuthenticatedUserDto;

  @ApiProperty({ example: 'dev-org-id', nullable: true })
  tenantId!: string | null;

  @ApiProperty({ example: ['agents:read'], type: [String] })
  permissions!: string[];
}

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  @Get('me')
  @ApiOperation({ summary: 'Return the current authenticated API session' })
  me(
    @CurrentUser() user: AuthUser | null,
    @CurrentTenant() tenantId: string | null,
    @Req() request: Request,
  ): AuthSessionDto {
    const permissions =
      ((request as unknown as Record<string, unknown>)['permissions'] as string[] | undefined) ??
      [];

    return {
      user: {
        id: user?.id ?? '',
        email: user?.email ?? null,
        name: user?.name ?? null,
        avatarUrl: user?.avatarUrl ?? null,
      },
      tenantId,
      permissions,
    };
  }
}
