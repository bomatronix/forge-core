import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import serverlessExpress from '@codegenie/serverless-express';
import express from 'express';
import type { Handler, Context, APIGatewayProxyEvent } from 'aws-lambda';
import { resolveSecretsToEnv } from '@forge-core/core';
import { AppModule } from './app.module';

let cachedHandler: Handler;

async function bootstrap(): Promise<Handler> {
  if (cachedHandler) {
    return cachedHandler;
  }

  await resolveSecretsToEnv();

  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
    credentials: true,
  });

  app.setGlobalPrefix('auth');

  await app.init();

  cachedHandler = serverlessExpress({ app: expressApp });
  return cachedHandler;
}

// Bootstrap in global scope — runs during Lambda Init phase
const handlerPromise = bootstrap();

export const handler: Handler = async (event: APIGatewayProxyEvent, context: Context, callback) => {
  // @codegenie/serverless-express prefers event.pathParameters.proxy over event.path.
  // For a nested {proxy+} resource (e.g. "auth/{proxy+}"), the proxy param captures only
  // the sub-path (e.g. ".well-known/openid-configuration"), stripping the "auth/" prefix.
  // Clearing it forces serverless-express to fall back to event.path (full path including /auth).
  const normalizedEvent = {
    ...event,
    pathParameters: { ...event.pathParameters, proxy: undefined },
  };
  const resolvedHandler = await handlerPromise;
  return resolvedHandler(normalizedEvent as typeof event, context, callback);
};
