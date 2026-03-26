import { ValidationPipe as NestValidationPipe } from '@nestjs/common';

/**
 * Pre-configured validation pipe for use as a global pipe.
 * Strips unknown properties and transforms payloads to DTO instances.
 */
export function createValidationPipe(): NestValidationPipe {
  return new NestValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  });
}
