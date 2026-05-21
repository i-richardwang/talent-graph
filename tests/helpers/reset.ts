// TRUNCATE all public-schema tables in a worker DB to bring it back to empty state.
// Drizzle 的 migration 表在 `drizzle` schema,所以 schemaname='public' 过滤
// 自然把它排除了——migrations 不会被清,clone 出来的 schema 状态保留。

import { Client } from "pg";

export async function truncateAll(dbUrl: string): Promise<void> {
  const client = new Client(dbUrl);
  await client.connect();
  try {
    const res = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    if (res.rows.length === 0) return;
    const tables = res.rows.map((r) => `"${r.tablename}"`).join(", ");
    await client.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
}
