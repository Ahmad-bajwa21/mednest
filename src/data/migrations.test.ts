import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as schema from './schema';
import { MIGRATIONS, migrate, type SqlRunner } from './migrations';

const tables: SQLiteTable[] = (Object.values(schema) as unknown[]).filter((v): v is SQLiteTable => v instanceof SQLiteTable);

describe('migrations', () => {
  const allSql = MIGRATIONS.flat().join('\n');

  it.each(tables.map((t) => [getTableConfig(t).name, t] as const))('creates table %s with every schema column', (name, t) => {
    const create = MIGRATIONS.flat().find((s) => new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\(`).test(s));
    expect(create).toBeDefined();
    for (const col of getTableConfig(t).columns) expect(create).toMatch(new RegExp(`\\b${col.name}\\b`));
  });

  it('dose keys are unique so a dose can never be logged twice', () => {
    expect(allSql).toMatch(/dose_key TEXT NOT NULL UNIQUE/);
  });

  it('applies pending versions once, inside a transaction', async () => {
    const log: string[] = [];
    let version = 0;
    const db: SqlRunner = {
      async execute(sql) {
        log.push(sql);
        if (sql === 'PRAGMA user_version') return { rows: [{ user_version: version }] };
        const m = sql.match(/PRAGMA user_version = (\d+)/);
        if (m) version = +m[1]!;
        return { rows: [] };
      },
    };
    await migrate(db);
    expect(version).toBe(MIGRATIONS.length);
    expect(log[1]).toBe('BEGIN');
    expect(log.at(-1)).toBe('COMMIT');
    const n = log.length;
    await migrate(db); // already current: only the version check runs
    expect(log.length).toBe(n + 1);
  });
});
