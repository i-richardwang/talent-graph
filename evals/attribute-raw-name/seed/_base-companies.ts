/**
 * Base seed: 把 _base-companies.txt 里的 60 行 canonical_name 灌进 worker DB
 * 的 entities 表 (entity_type='company'),模拟"产线已积累几十条 company entity"
 * 的真实背景——entity search 看到的不是只有 case 相关的极简盆景。
 *
 * 用法 (case-N seed 脚本里调):
 *   bun evals/attribute-raw-name/seed/_base-companies.ts
 *
 * 不挂 alias、不挂 description—— alias / 层级 / 错挂 等 case-specific 状态由
 * 调用方在 base 之上 layer (走真实 CLI, 走 normalize/conflict 检测)。
 *
 * DATABASE_URL 由 better-skills per_run_setup 注入,指向某个 worker DB。
 */

import { Client } from "pg";
import * as fs from "node:fs";
import * as path from "node:path";

if (!process.env.DATABASE_URL) {
  console.error("error: DATABASE_URL not set (per_run_setup should inject it)");
  process.exit(1);
}

const namesPath = path.join(import.meta.dir, "_base-companies.txt");
const names = fs
  .readFileSync(namesPath, "utf-8")
  .split("\n")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

if (names.length === 0) {
  console.error(`error: ${namesPath} is empty`);
  process.exit(1);
}

// 项目级常驻占位 entity:让 Agent 把无效 / 不可识别的 raw 集中收容,
// 既不污染下游标签查询(占位 entity 不挂任何 tag),又能让数据治理盘点
// 未识别经历的分布。两个名都自带"承认判决失败"的贬义,Agent 不会乱挂。
const PLACEHOLDERS: Array<{ canonical: string; description: string }> = [
  {
    canonical: "（无效输入）",
    description:
      "项目级常驻占位 entity。装占位词 / 隐去名等本身就不指向真实主体的 raw(如 `某公司` / `XX 集团` / `不知道`)。不挂任何 tag,下游 JOIN 不命中。",
  },
  {
    canonical: "（无法识别）",
    description:
      "项目级常驻占位 entity。装 Agent 已外部核实但仍判不出来的 raw(乱码 / 内部代号 / 搜后查无源 / 各源口径冲突)。不挂任何 tag,下游 JOIN 不命中。",
  },
];

const client = new Client(process.env.DATABASE_URL);
await client.connect();
try {
  const result = await client.query(
    `INSERT INTO entities (entity_type, canonical_name)
     SELECT 'company', n
     FROM unnest($1::text[]) AS n
     ON CONFLICT (entity_type, canonical_name) DO NOTHING`,
    [names],
  );
  console.error(`[base-seed] inserted ${result.rowCount} of ${names.length} company entities`);

  for (const ph of PLACEHOLDERS) {
    await client.query(
      `INSERT INTO entities (entity_type, canonical_name, description)
       VALUES ('company', $1, $2)
       ON CONFLICT (entity_type, canonical_name) DO NOTHING`,
      [ph.canonical, ph.description],
    );
  }
  console.error(`[base-seed] ensured ${PLACEHOLDERS.length} placeholder entities`);
} finally {
  await client.end();
}

// 给 base 60 公司补 embedding,让 entity search 的 similar 召回(跨语言/简称)生效。
// 不灌 embedding 时 entity search 退化为字面精确匹配——eval 跨语言场景测不准。
if (process.env.EMBEDDING_BASE_URL && process.env.EMBEDDING_MODEL) {
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("talent-graph", ["embedding", "backfill"], {
      env: { ...process.env, TALENT_GRAPH_MODE: "full" },
      stdio: ["ignore", "ignore", "inherit"],
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`embedding backfill exited ${code}`));
    });
  });
  console.error(`[base-seed] backfilled embeddings for base entities`);
} else {
  console.error(`[base-seed] EMBEDDING_* not set, skipping embedding backfill`);
}

process.exit(0);
