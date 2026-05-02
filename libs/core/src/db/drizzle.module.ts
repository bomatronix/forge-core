import { Module, Global, DynamicModule, OnApplicationShutdown } from '@nestjs/common';
import { createDbClient, DbClient } from './client';

export const DRIZZLE_CLIENT = Symbol('DRIZZLE_CLIENT');

@Global()
@Module({})
export class DrizzleModule {
  static forRootAsync(): DynamicModule {
    return {
      module: DrizzleModule,
      providers: [
        {
          provide: DRIZZLE_CLIENT,
          useFactory: () => createDbClient(),
        },
      ],
      exports: [DRIZZLE_CLIENT],
    };
  }
}
