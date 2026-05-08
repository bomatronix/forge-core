import { bootstrapRolesForPool, type BootstrapRolesParams } from './handler';

type QueryablePool = Parameters<typeof bootstrapRolesForPool>[0];

const baseParams: BootstrapRolesParams = {
  appUsername: 'app',
  migratorUsername: 'migrator',
  database: 'forge_agents',
  adminUsername: 'dbadmin',
};

function createPoolMock(roleExists = false) {
  const query = jest.fn(async (sql: string) => {
    if (sql === 'select 1 from pg_roles where rolname = $1') {
      return { rowCount: roleExists ? 1 : 0, rows: roleExists ? [{ '?column?': 1 }] : [] };
    }

    return { rowCount: 0, rows: [] };
  });

  return {
    pool: { query } as unknown as QueryablePool,
    query,
  };
}

function sqlCalls(query: jest.Mock): string[] {
  return query.mock.calls.map(([sql]) => sql);
}

describe('migrator bootstrapRolesForPool', () => {
  it('creates missing app and migrator roles', async () => {
    const { pool, query } = createPoolMock(false);

    await bootstrapRolesForPool(pool, baseParams);

    expect(query).toHaveBeenCalledWith('select 1 from pg_roles where rolname = $1', ['app']);
    expect(query).toHaveBeenCalledWith('select 1 from pg_roles where rolname = $1', ['migrator']);
    expect(sqlCalls(query)).toEqual(
      expect.arrayContaining(['CREATE ROLE "app" LOGIN', 'CREATE ROLE "migrator" LOGIN']),
    );
  });

  it('grants rds_iam to app and migrator roles', async () => {
    const { pool, query } = createPoolMock(true);

    await bootstrapRolesForPool(pool, baseParams);

    expect(sqlCalls(query)).toEqual(
      expect.arrayContaining(['GRANT rds_iam TO "app"', 'GRANT rds_iam TO "migrator"']),
    );
  });

  it('grants app and migrator memberships to the admin backend user', async () => {
    const { pool, query } = createPoolMock(true);

    await bootstrapRolesForPool(pool, baseParams);

    expect(sqlCalls(query)).toEqual(
      expect.arrayContaining(['GRANT "app" TO "dbadmin"', 'GRANT "migrator" TO "dbadmin"']),
    );
  });

  it('skips only the self-grant when the admin user matches a target role', async () => {
    const { pool, query } = createPoolMock(true);

    await bootstrapRolesForPool(pool, { ...baseParams, adminUsername: 'migrator' });

    expect(sqlCalls(query)).toEqual(expect.arrayContaining(['GRANT "app" TO "migrator"']));
    expect(sqlCalls(query)).not.toContain('GRANT "migrator" TO "migrator"');
  });

  it('preserves drizzle schema and default privilege setup', async () => {
    const { pool, query } = createPoolMock(true);

    await bootstrapRolesForPool(pool, baseParams);

    expect(sqlCalls(query)).toEqual(
      expect.arrayContaining([
        'CREATE SCHEMA IF NOT EXISTS drizzle AUTHORIZATION "migrator"',
        'ALTER SCHEMA drizzle OWNER TO "migrator"',
        'GRANT USAGE, CREATE ON SCHEMA drizzle TO "migrator"',
        'ALTER DEFAULT PRIVILEGES FOR ROLE "migrator" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "app"',
        'ALTER DEFAULT PRIVILEGES FOR ROLE "migrator" IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "app"',
      ]),
    );
  });

  it('rejects unsafe SQL identifiers before executing bootstrap SQL', async () => {
    const { pool, query } = createPoolMock(true);

    await expect(
      bootstrapRolesForPool(pool, { ...baseParams, migratorUsername: 'migrator;drop' }),
    ).rejects.toThrow('Unsafe SQL identifier: migrator;drop');
    expect(query).not.toHaveBeenCalled();
  });
});
