import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Signer } from '@aws-sdk/rds-signer';
import * as schema from './schema';

export type DbClient = NodePgDatabase<typeof schema>;

/**
 * Creates a Drizzle database client.
 *
 * Two modes:
 * - Local dev: uses DATABASE_URL (standard postgres connection string)
 * - Lambda:    uses DB_PROXY_ENDPOINT + DB_USERNAME + DB_NAME with RDS IAM auth
 *              (DB_AUTH_MODE=iam — password is a short-lived IAM token)
 */
export async function createDbClient(): Promise<DbClient> {
  const iamMode = process.env.DB_AUTH_MODE === 'iam';

  if (iamMode) {
    const hostname = process.env.DB_PROXY_ENDPOINT!;
    const username = process.env.DB_USERNAME!;
    const database = process.env.DB_NAME!;
    const port = 5432;

    const signer = new Signer({ hostname, port, username });
    const token = await signer.getAuthToken();

    const pool = new Pool({
      host: hostname,
      port,
      user: username,
      database,
      password: token,
      ssl: { rejectUnauthorized: false },
      max: 1, // Lambda: keep pool small
    });

    return drizzle(pool, { schema });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL must be set when DB_AUTH_MODE is not "iam"');
  }

  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}
