import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const authIssuer = process.env.AUTH_HANDLER_ISSUER?.trim() || 'http://localhost:3002/auth';

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  // Trust the last proxy hop (ALB/API Gateway) so req.ip reflects the real client IP.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Forge Core API')
    .setDescription('Backend API for the Agent Forge platform')
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

  // NestJS always embeds the spec inline (swaggerDoc), which makes Swagger UI
  // ignore the `urls` option. We use customJsStr to reinitialize the UI with
  // a proper multi-spec dropdown after the default init has run.
  const multiSpecJs = `
    window.addEventListener('load', function () {
      setTimeout(function () {
        window.ui = SwaggerUIBundle({
          urls: [
            { url: '/api/docs-json',                         name: 'API (forge-core)' },
            { url: '${authIssuer}/docs-json',                name: 'Auth Handler'     },
          ],
          'urls.primaryName': 'API (forge-core)',
          dom_id: '#swagger-ui',
          deepLinking: true,
          persistAuthorization: true,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          plugins: [SwaggerUIBundle.plugins.DownloadUrl],
          layout: 'StandaloneLayout',
        });
        window.ui.initOAuth({
          clientId: 'forge-swagger-ui',
          appName: 'Forge Swagger UI',
          scopes: 'openid profile email offline_access agents:read agents:write',
          usePkceWithAuthorizationCodeGrant: true,
        });
      }, 0);
    });
  `;

  SwaggerModule.setup('api/docs', app, document, {
    customJsStr: multiSpecJs,
    // NestJS injects `display:none` on .download-url-wrapper by default (hides the Explore bar).
    // That same element hosts the multi-spec <select> dropdown, so we must un-hide it.
    // We re-hide just the text input so the URL bar doesn't appear, only the spec selector.
    customCss: `
      .swagger-ui .topbar .download-url-wrapper { display: flex !important; }
      .swagger-ui .topbar .download-url-wrapper input.download-url-input { display: none; }
    `,
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`forge-core API running on http://localhost:${port}/api/docs`);
}

bootstrap();
