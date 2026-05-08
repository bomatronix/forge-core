import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Signer } from '@aws-sdk/rds-signer';
import type { Handler } from 'aws-lambda';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import path from 'path';
import * as schema from '@forge-core/core/db/schema';

type MigrationAction = 'migrate' | 'bootstrap-and-migrate';

interface MigrationEvent {
  action?: MigrationAction;
}

interface MigrationResult {
  ok: boolean;
  action: MigrationAction;
  migrationsFolder: string;
  bootstrapped: boolean;
}

interface RdsSecret {
  username?: string;
  password?: string;
  host?: string;
  port?: number | string;
  dbname?: string;
}

export interface BootstrapRolesParams {
  appUsername: string;
  migratorUsername: string;
  database: string;
  adminUsername: string;
}

type QueryablePool = Pick<Pool, 'query'>;
type MigrationClient = Pool | PoolClient;

interface AdminPool {
  pool: Pool;
  username: string;
  authMode: 'password' | 'iam';
}

interface DirectIamPoolConfig {
  rawHost: string;
  fallbackPort: number;
  username: string;
  database: string;
}

export interface MigratorSessionParams {
  appUsername: string;
}

const secrets = new SecretsManagerClient({});

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function quoteIdent(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function splitHostPort(host: string, fallbackPort: number): { host: string; port: number } {
  const match = host.match(/^([^:]+):(\d+)$/);
  if (!match) {
    return { host, port: fallbackPort };
  }

  return { host: match[1], port: Number(match[2]) };
}

function describeDatabaseError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const details: string[] = [error.message];
  const dbError = error as Error &
    Partial<{
      code: string;
      detail: string;
      hint: string;
      schema: string;
      table: string;
      routine: string;
    }>;

  for (const [key, value] of Object.entries(dbError)) {
    if (
      ['code', 'detail', 'hint', 'schema', 'table', 'routine'].includes(key) &&
      typeof value === 'string' &&
      value.trim() !== ''
    ) {
      details.push(`${key}=${value}`);
    }
  }

  return details.join('; ');
}

function isPamAuthenticationError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('PAM authentication failed');
}

async function createDirectIamPool({
  rawHost,
  fallbackPort,
  username,
  database,
}: DirectIamPoolConfig): Promise<Pool> {
  const { host, port } = splitHostPort(rawHost, fallbackPort);
  const signer = new Signer({ hostname: host, port, region: process.env.AWS_REGION, username });
  const token = await signer.getAuthToken();

  return new Pool({
    host,
    port,
    user: username,
    database,
    password: token,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
}

async function createIamPool(): Promise<Pool> {
  if (process.env.DATABASE_URL?.trim()) {
    return new Pool({ connectionString: process.env.DATABASE_URL });
  }

  const hostname = requiredEnv('DB_PROXY_ENDPOINT');
  const username = requiredEnv('DB_USERNAME');
  const database = requiredEnv('DB_NAME');
  const port = Number(process.env.DB_PORT ?? 5432);
  const signer = new Signer({ hostname, port, region: process.env.AWS_REGION, username });
  const token = await signer.getAuthToken();

  return new Pool({
    host: hostname,
    port,
    user: username,
    database,
    password: token,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
}

async function loadAdminSecret(): Promise<RdsSecret> {
  const secretArn = requiredEnv('DB_ADMIN_SECRET_ARN');
  const response = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const secretString = response.SecretString;
  if (!secretString) {
    throw new Error(`Secret ${secretArn} has no SecretString`);
  }

  return JSON.parse(secretString) as RdsSecret;
}

async function createAdminPool(): Promise<AdminPool> {
  const secret = await loadAdminSecret();
  const rawHost = process.env.DB_ADMIN_HOST?.trim() || secret.host;
  if (!rawHost) {
    throw new Error('DB_ADMIN_HOST or secret.host is required');
  }

  const fallbackPort = Number(secret.port ?? process.env.DB_PORT ?? 5432);
  const { host, port } = splitHostPort(rawHost, fallbackPort);
  const username = process.env.DB_ADMIN_USERNAME?.trim() || secret.username;
  const config: PoolConfig = {
    host,
    port,
    user: username,
    password: secret.password,
    database: process.env.DB_NAME?.trim() || secret.dbname,
    ssl: { rejectUnauthorized: false },
    max: 1,
  };

  if (!username || !config.password || !config.database) {
    throw new Error('Admin DB connection requires username, password, and database');
  }

  const passwordPool = new Pool(config);

  try {
    await passwordPool.query('select 1');
    return { pool: passwordPool, username, authMode: 'password' };
  } catch (error) {
    await passwordPool.end().catch(() => undefined);

    if (!isPamAuthenticationError(error)) {
      throw error;
    }

    const iamPool = await createDirectIamPool({
      rawHost,
      fallbackPort: port,
      username,
      database: config.database,
    });

    try {
      await iamPool.query('select 1');
      console.warn(
        `[migrate] admin password auth failed for ${username}; using IAM fallback to repair rds_iam membership`,
      );
      return { pool: iamPool, username, authMode: 'iam' };
    } catch (iamError) {
      await iamPool.end().catch(() => undefined);
      throw new Error(
        `Admin password auth failed and IAM fallback failed. Ensure the migrator Lambda can rds-db:connect as ${username}. Password error: ${describeDatabaseError(error)}. IAM error: ${describeDatabaseError(iamError)}`,
      );
    }
  }
}

async function ensureRole(pool: QueryablePool, roleName: string): Promise<void> {
  const existing = await pool.query('select 1 from pg_roles where rolname = $1', [roleName]);
  if ((existing.rowCount ?? 0) === 0) {
    await pool.query(`CREATE ROLE ${quoteIdent(roleName)} LOGIN`);
  }
}

export async function bootstrapRolesForPool(
  pool: QueryablePool,
  { appUsername, migratorUsername, database, adminUsername }: BootstrapRolesParams,
): Promise<void> {
  const app = quoteIdent(appUsername);
  const migrator = quoteIdent(migratorUsername);
  const db = quoteIdent(database);
  const admin = quoteIdent(adminUsername);

  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await ensureRole(pool, appUsername);

  const appUserSecretArn = process.env.DB_APP_USER_SECRET_ARN?.trim();
  if (appUserSecretArn) {
    const appSecretResp = await secrets.send(new GetSecretValueCommand({ SecretId: appUserSecretArn }));
    const { password } = JSON.parse(appSecretResp.SecretString!) as { password: string };
    await pool.query(`ALTER USER ${app} WITH PASSWORD '${password.replace(/'/g, "''")}'`);
  }

  await ensureRole(pool, migratorUsername);

  // Keep the password-authenticated admin user out of rds_iam, including
  // indirect membership through app/migrator, or RDS forces IAM/PAM auth.
  if (adminUsername !== appUsername) {
    await pool.query(`REVOKE ${app} FROM ${admin}`);
  }

  if (adminUsername !== migratorUsername) {
    await pool.query(`REVOKE ${migrator} FROM ${admin}`);
  }

  if (adminUsername !== appUsername && adminUsername !== migratorUsername) {
    await pool.query(`REVOKE rds_iam FROM ${admin}`);
  }

  await pool.query(`REVOKE rds_iam FROM ${app}`);
  await pool.query(`GRANT rds_iam TO ${migrator}`);
  await pool.query(`GRANT CONNECT ON DATABASE ${db} TO ${app}, ${migrator}`);
  await pool.query(`GRANT CREATE ON DATABASE ${db} TO ${migrator}`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${app}, ${migrator}`);
  await pool.query(`GRANT CREATE ON SCHEMA public TO ${migrator}`);
  await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${app}`);
  await pool.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${app}`);
  await pool.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${migrator}`);
  await pool.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${migrator}`);

  const drizzleSchema = await pool.query("select to_regnamespace('drizzle') as schema_oid");
  if (drizzleSchema.rows[0]?.schema_oid) {
    await pool.query(`GRANT USAGE, CREATE ON SCHEMA drizzle TO ${migrator}`);
  }
}

export async function prepareMigratorSessionForPool(
  pool: QueryablePool,
  { appUsername }: MigratorSessionParams,
): Promise<void> {
  const app = quoteIdent(appUsername);

  await pool.query('CREATE SCHEMA IF NOT EXISTS drizzle');
  await pool.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app}`,
  );
  await pool.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${app}`,
  );
  await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${app}`);
  await pool.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${app}`);
}

function describeMigrationError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const details: string[] = [error.message];
  const cause = (error as Error & { cause?: unknown }).cause;

  if (cause instanceof Error) {
    details.push(`cause=${cause.message}`);
  }

  if (cause && typeof cause === 'object') {
    const pgCause = cause as Partial<{
      code: string;
      detail: string;
      hint: string;
      schema: string;
      table: string;
      routine: string;
    }>;

    for (const [key, value] of Object.entries(pgCause)) {
      if (
        ['code', 'detail', 'hint', 'schema', 'table', 'routine'].includes(key) &&
        typeof value === 'string' &&
        value.trim() !== ''
      ) {
        details.push(`${key}=${value}`);
      }
    }
  }

  return details.join('; ');
}

async function logMigrationPreflight(client: MigrationClient): Promise<void> {
  const result = await client.query(`
    select
      current_user,
      session_user,
      current_database(),
      has_database_privilege(current_user, current_database(), 'CREATE') as can_create_database,
      to_regnamespace('drizzle') is not null as drizzle_schema_exists
  `);

  console.log('[migrate] database preflight', JSON.stringify(result.rows[0] ?? {}));
}

async function migrateWithClient(client: MigrationClient, migrationsFolder: string): Promise<void> {
  const db = drizzle(client, { schema });

  try {
    await logMigrationPreflight(client);
    await migrate(db, { migrationsFolder });
  } catch (error) {
    throw new Error(`Drizzle migration failed: ${describeMigrationError(error)}`);
  }
}

async function createMigrationPool(): Promise<Pool> {
  if (process.env.DATABASE_URL?.trim()) {
    return new Pool({ connectionString: process.env.DATABASE_URL });
  }

  const directHost = process.env.DB_MIGRATOR_HOST?.trim() || process.env.DB_ADMIN_HOST?.trim();
  if (!directHost) {
    return createIamPool();
  }

  return createDirectIamPool({
    rawHost: directHost,
    fallbackPort: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_MIGRATOR_USERNAME?.trim() || requiredEnv('DB_USERNAME'),
    database: requiredEnv('DB_NAME'),
  });
}

async function runMigrations(migrationsFolder: string): Promise<void> {
  const pool = await createMigrationPool();

  try {
    if (process.env.DB_APP_USERNAME?.trim()) {
      await prepareMigratorSessionForPool(pool, {
        appUsername: process.env.DB_APP_USERNAME.trim(),
      });
    }

    await migrateWithClient(pool, migrationsFolder);
  } finally {
    await pool.end();
  }
}

async function bootstrapAndRunMigrations(migrationsFolder: string): Promise<void> {
  const admin = await createAdminPool();
  const params = {
    appUsername: requiredEnv('DB_APP_USERNAME'),
    migratorUsername: requiredEnv('DB_MIGRATOR_USERNAME'),
    database: requiredEnv('DB_NAME'),
    adminUsername: admin.username,
  };

  try {
    await bootstrapRolesForPool(admin.pool, params);
  } finally {
    await admin.pool.end();
  }

  const migrationPool = await createMigrationPool();
  try {
    await prepareMigratorSessionForPool(migrationPool, {
      appUsername: params.appUsername,
    });
    await migrateWithClient(migrationPool, migrationsFolder);
  } finally {
    await migrationPool.end();
  }
}

export const handler: Handler<MigrationEvent, MigrationResult> = async (event = {}) => {
  const action = event.action ?? 'migrate';
  if (action !== 'migrate' && action !== 'bootstrap-and-migrate') {
    throw new Error(`Unsupported migration action: ${action}`);
  }

  const migrationsFolder =
    process.env.DRIZZLE_MIGRATIONS_FOLDER?.trim() ?? path.join(__dirname, 'drizzle', 'migrations');

  if (action === 'bootstrap-and-migrate') {
    await bootstrapAndRunMigrations(migrationsFolder);
  } else {
    await runMigrations(migrationsFolder);
  }

  return {
    ok: true,
    action,
    migrationsFolder,
    bootstrapped: action === 'bootstrap-and-migrate',
  };
};
