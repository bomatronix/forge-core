import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const authIssuer = process.env.AUTH_HANDLER_ISSUER?.trim() || 'http://localhost:3002/auth';

  // TODO [P1 — CORS] Replace static allowlist with origin-echo pattern used by
  // all other Lambdas in this stack. Static list breaks on cold starts when
  // CORS_ORIGIN isn't set and on rotating Vercel preview URLs.
  // Fix: origin: (origin, callback) => callback(null, origin ?? '*')
  // Centralise into a shared NestJS CORS factory in libs/core so api/ and
  // auth-handler/ stay in sync (both Lambdas need the same rule).
  app.enableCors({
    origin: [
      process.env.CORS_ORIGIN ?? 'http://localhost:3000',
      'http://localhost:3001', // allow api Swagger UI to fetch this spec
    ],
    credentials: true,
  });

  app.setGlobalPrefix('auth');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Forge Core — Auth Handler')
    .setDescription(
      'OAuth 2.0 / OIDC gateway for Forge Core. These routes are public and mint or verify auth-handler-issued platform tokens.',
    )
    .setVersion('0.0.1')
    .addOAuth2({
      type: 'oauth2',
      flows: {
        authorizationCode: {
          authorizationUrl: `${authIssuer}/authorize`,
          tokenUrl: `${authIssuer}/token`,
          scopes: {
            openid: 'OpenID Connect identity claims',
            profile: 'Basic user profile',
            email: 'User email address',
            offline_access: 'Refresh token support',
            'agents:read': 'Read agent resources',
            'agents:write': 'Write agent resources',
          },
        },
        clientCredentials: {
          tokenUrl: `${authIssuer}/token`,
          scopes: {
            'agents:read': 'Read agent resources',
            'agents:write': 'Write agent resources',
          },
        },
      },
    })
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('auth/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT ?? 3002;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`forge-core auth-handler running on http://localhost:${port}/auth/docs`);
}

bootstrap();
