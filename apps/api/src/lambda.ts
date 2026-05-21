import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import serverlessExpress from '@codegenie/serverless-express';
import express, { type Request, type Response } from 'express';
import type { Handler, Context, APIGatewayProxyEvent } from 'aws-lambda';
import { ChannelsService } from '@forge-core/channels';
import { AppModule } from './app.module';
import { createCorsOptions } from './cors';

let cachedHandler: Handler;

function attachRawBody(req: Request, _res: Response, buf: Buffer): void {
  (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
}

async function bootstrap(): Promise<Handler> {
  if (cachedHandler) {
    return cachedHandler;
  }

  const rawCorsOrigin = process.env.CORS_ORIGIN;
  if (rawCorsOrigin?.startsWith('arn:aws:secretsmanager:')) {
    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({});
    const result = await client.send(new GetSecretValueCommand({ SecretId: rawCorsOrigin }));
    process.env.CORS_ORIGIN = result.SecretString ?? '';
  }

  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    bodyParser: false,
  });

  expressApp.use(express.json({ verify: attachRawBody }));
  expressApp.use(express.urlencoded({ extended: true, verify: attachRawBody }));
  app.enableCors(createCorsOptions(app.get(ChannelsService)));

  // Trust the last proxy hop (ALB/API Gateway) so req.ip reflects the real client IP.
  expressApp.set('trust proxy', 1);
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
