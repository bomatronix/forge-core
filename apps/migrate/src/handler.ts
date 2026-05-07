import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Signer } from '@aws-sdk/rds-signer';
import type { Handler } from 'aws-lambda';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolConfig } from 'pg';
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

async function createAdminPool(): Promise<Pool> {
  const secret = await loadAdminSecret();
  const rawHost = process.env.DB_ADMIN_HOST?.trim() || secret.host;
  if (!rawHost) {
    throw new Error('DB_ADMIN_HOST or secret.host is required');
  }

  const fallbackPort = Number(secret.port ?? process.env.DB_PORT ?? 5432);
  const { host, port } = splitHostPort(rawHost, fallbackPort);
  const config: PoolConfig = {
    host,
    port,
    user: process.env.DB_ADMIN_USERNAME?.trim() || secret.username,
    password: secret.password,
    database: process.env.DB_NAME?.trim() || secret.dbname,
    ssl: { rejectUnauthorized: false },
    max: 1,
  };

  if (!config.user || !config.password || !config.database) {
    throw new Error('Admin DB connection requires username, password, and database');
  }

  return new Pool(config);
}

async function ensureRole(pool: Pool, roleName: string): Promise<void> {
  const existing = await pool.query('select 1 from pg_roles where rolname = $1', [roleName]);
  if ((existing.rowCount ?? 0) === 0) {
    await pool.query(`CREATE ROLE ${quoteIdent(roleName)} LOGIN`);
  }
}

async function bootstrapRoles(): Promise<void> {
  const appUsername = requiredEnv('DB_APP_USERNAME');
  const migratorUsername = requiredEnv('DB_MIGRATOR_USERNAME');
  const database = requiredEnv('DB_NAME');
  const pool = await createAdminPool();

  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await ensureRole(pool, appUsername);
    await ensureRole(pool, migratorUsername);

    const app = quoteIdent(appUsername);
    const migrator = quoteIdent(migratorUsername);
    const db = quoteIdent(database);

    await pool.query(`GRANT rds_iam TO ${app}`);
    await pool.query(`GRANT rds_iam TO ${migrator}`);
    await pool.query(`GRANT CONNECT ON DATABASE ${db} TO ${app}, ${migrator}`);
    await pool.query(`GRANT USAGE ON SCHEMA public TO ${app}, ${migrator}`);
    await pool.query(`GRANT CREATE ON SCHEMA public TO ${migrator}`);
    await pool.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${app}`,
    );
    await pool.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${app}`);
    await pool.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${migrator}`);
    await pool.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${migrator}`);
    await pool.query('CREATE SCHEMA IF NOT EXISTS drizzle');
    await pool.query(`ALTER SCHEMA drizzle OWNER TO ${migrator}`);
    await pool.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app}`,
    );
    await pool.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator} IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${app}`,
    );
  } finally {
    await pool.end();
  }
}

async function runMigrations(migrationsFolder: string): Promise<void> {
  const pool = await createIamPool();
  const db = drizzle(pool, { schema });

  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
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
    await bootstrapRoles();
  }

  await runMigrations(migrationsFolder);

  return {
    ok: true,
    action,
    migrationsFolder,
    bootstrapped: action === 'bootstrap-and-migrate',
  };
};
