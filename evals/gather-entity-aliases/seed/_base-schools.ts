/**
 * Base seed: 把 _base-schools.txt 里的 200 行 canonical_name 灌进 worker DB
 * 的 entities 表,模拟"产线已积累几百条 school entity"的真实背景。
 *
 * 用法 (case-N seed 脚本里调):
 *   bun evals/gather-entity-aliases/seed/_base-schools.ts
 *
 * 不挂 alias、不挂 description——alias / 层级 / 错挂 等 case-specific 状态由
 * 调用方在 base 之上 layer (走真实 CLI, 走 normalize/conflict 检测)。
 *
 * DATABASE_URL 由 better-skills per_run_setup 注入,指向某个 worker DB。
 *
 * 走原生 pg 而非 drizzle template:drizzle 的 sql`...${array}` 会把数组展开成
 * 多个独立 placeholder($1, $2, ..., $200),让 unnest($1::text[]) 失效。
 * pg.Client.query(text, [array]) 把整个数组绑成一个 array 参数,SQL 干净。
 */

import { Client } from "pg";
import * as fs from "node:fs";
import * as path from "node:path";

if (!process.env.DATABASE_URL) {
  console.error("error: DATABASE_URL not set (per_run_setup should inject it)");
  process.exit(1);
}

const namesPath = path.join(import.meta.dir, "_base-schools.txt");
const names = fs
  .readFileSync(namesPath, "utf-8")
  .split("\n")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

if (names.length === 0) {
  console.error(`error: ${namesPath} is empty`);
  process.exit(1);
}

const client = new Client(process.env.DATABASE_URL);
await client.connect();
try {
  const result = await client.query(
    `INSERT INTO entities (entity_type, canonical_name)
     SELECT 'school', n
     FROM unnest($1::text[]) AS n
     ON CONFLICT (entity_type, canonical_name) DO NOTHING`,
    [names],
  );
  console.error(`[base-seed] inserted ${result.rowCount} of ${names.length} school entities`);
} finally {
  await client.end();
}
process.exit(0);
