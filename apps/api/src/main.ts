import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Forge Core API')
    .setDescription('Backend API for the Agent Forge platform')
    .setVersion('0.0.1')
    // OAuth2 client_credentials — Swagger calls /api/auth/token automatically
    .addOAuth2({
      type: 'oauth2',
      flows: {
        clientCredentials: {
          tokenUrl: '/api/auth/token',
          scopes: {},
        },
      },
    })
    // Bearer fallback — paste a token manually if preferred
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      // Pre-fill client_id/secret so user just clicks Authorize (values are ignored by the endpoint)
      initOAuth: {
        clientId: 'forge-dev',
        clientSecret: 'forge-dev',
      },
    },
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`forge-core API running on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
