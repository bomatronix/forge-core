import {
  bootstrapRolesForPool,
  prepareMigratorSessionForPool,
  type BootstrapRolesParams,
} from './handler';

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

    if (sql === "select to_regnamespace('drizzle') as schema_oid") {
      return { rowCount: 1, rows: [{ schema_oid: 'drizzle' }] };
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

  it('repairs accidental app, migrator, and rds_iam memberships from the admin user', async () => {
    const { pool, query } = createPoolMock(true);

    await bootstrapRolesForPool(pool, baseParams);

    expect(sqlCalls(query)).toEqual(
      expect.arrayContaining([
        'REVOKE "app" FROM "dbadmin"',
        'REVOKE "migrator" FROM "dbadmin"',
        'REVOKE rds_iam FROM "dbadmin"',
      ]),
    );
  });

  it('does not grant IAM-authenticated roles to the password admin user', async () => {
    const { pool, query } = createPoolMock(true);

    await bootstrapRolesForPool(pool, baseParams);

    expect(sqlCalls(query)).not.toContain('GRANT "app" TO "dbadmin"');
    expect(sqlCalls(query)).not.toContain('GRANT "migrator" TO "dbadmin"');
  });

  it('skips only the self-revoke when the admin user matches a target role', async () => {
    const { pool, query } = createPoolMock(true);

    await bootstrapRolesForPool(pool, { ...baseParams, adminUsername: 'migrator' });

    expect(sqlCalls(query)).toEqual(expect.arrayContaining(['REVOKE "app" FROM "migrator"']));
    expect(sqlCalls(query)).not.toContain('REVOKE "migrator" FROM "migrator"');
  });

  it('grants migrator access to an existing drizzle schema without creating it as admin', async () => {
    const { pool, query } = createPoolMock(true);

    await bootstrapRolesForPool(pool, baseParams);

    expect(sqlCalls(query)).toEqual(
      expect.arrayContaining(['GRANT USAGE, CREATE ON SCHEMA drizzle TO "migrator"']),
    );
    expect(sqlCalls(query)).not.toContain(
      'CREATE SCHEMA IF NOT EXISTS drizzle AUTHORIZATION "migrator"',
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

describe('migrator prepareMigratorSessionForPool', () => {
  it('creates drizzle schema and applies app default privileges as migrator', async () => {
    const { pool, query } = createPoolMock(true);

    await prepareMigratorSessionForPool(pool, { appUsername: 'app' });

    expect(sqlCalls(query)).toEqual(
      expect.arrayContaining([
        'CREATE SCHEMA IF NOT EXISTS drizzle',
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "app"',
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "app"',
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "app"',
        'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO "app"',
      ]),
    );
  });

  it('rejects unsafe app identifiers before executing migrator session SQL', async () => {
    const { pool, query } = createPoolMock(true);

    await expect(prepareMigratorSessionForPool(pool, { appUsername: 'bad-user' })).rejects.toThrow(
      'Unsafe SQL identifier: bad-user',
    );
    expect(query).not.toHaveBeenCalled();
  });
});
