import { Module } from '@nestjs/common';

/**
 * Auth module placeholder.
 * Guards are registered globally via CoreModule.forRoot() — not here.
 * This module will hold auth-related services (token verification, session management)
 * once Clerk SDK integration is added.
 */
@Module({})
export class AuthModule {}
