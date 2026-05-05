import { Module, Global, DynamicModule } from '@nestjs/common';
import { createDbClient } from './client';

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
