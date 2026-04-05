import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import serverlessExpress from '@codegenie/serverless-express';
import express from 'express';
import type { Handler, Context, APIGatewayProxyEvent } from 'aws-lambda';
import { AppModule } from './app.module';

let cachedHandler: Handler;

async function bootstrap(): Promise<Handler> {
  if (cachedHandler) {
    return cachedHandler;
  }

  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
    credentials: true,
  });

  app.setGlobalPrefix('api');

  await app.init();

  cachedHandler = serverlessExpress({ app: expressApp });
  return cachedHandler;
}

// Bootstrap in global scope — runs during Lambda Init phase (burst CPU, not billed for first 10s)
const handlerPromise = bootstrap();

export const handler: Handler = async (event: APIGatewayProxyEvent, context: Context, callback) => {
  const resolvedHandler = await handlerPromise;
  return resolvedHandler(event, context, callback);
};
