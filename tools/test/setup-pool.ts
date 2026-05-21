// Build the test DB pool: drop existing → create template → migrate → clone N workers.
// 幂等:多次跑会先 drop 再重建,所以"刷新 template"和"初始化"是同一脚本。
//
// 用法:
//   bun tools/test/setup-pool.ts                # workers 取 .env.test 的 TEST_WORKER_COUNT
//   bun tools/test/setup-pool.ts --workers 8     # 手动覆盖
//
// 前提:`docker compose --profile test up -d postgres-test` 已起。

import { config } from "dotenv";
config({ path: ".env.test", quiet: true });

import { Client } from "pg";
import { spawn } from "bun";

const BASE_URL_RAW = process.env.TEST_DATABASE_URL_BASE;
const TEMPLATE_DB =
  process.env.TEST_TEMPLATE_DB ?? "talent_graph_test_template";

if (!BASE_URL_RAW) {
  console.error("error: TEST_DATABASE_URL_BASE not set in .env.test");
  process.exit(1);
}
const BASE = BASE_URL_RAW.replace(/\/$/, "");

// Database 名直接拼进 SQL(`CREATE DATABASE "..."`),env 来源不可信时校验防注入。
const SAFE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
if (!SAFE_NAME.test(TEMPLATE_DB)) {
  console.error(
    `error: TEST_TEMPLATE_DB must match ${SAFE_NAME}, got "${TEMPLATE_DB}"`,
  );
  process.exit(1);
}

// 同时清理可能残留的更高 worker 编号(用户从 8 改回 4 时 w5..w8 还在)。
// 16 是个保守上限,基本不会被超过。
const MAX_WORKER_DROP = 16;

function workerCount(): number {
  const idx = process.argv.indexOf("--workers");
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = Number(process.argv[idx + 1]);
    if (!Number.isFinite(n) || n < 1) {
      console.error(`error: --workers must be a positive integer, got ${process.argv[idx + 1]}`);
      process.exit(1);
    }
    return n;
  }
  return Number(process.env.TEST_WORKER_COUNT ?? 4);
}

async function dropAll(mgmt: Client): Promise<void> {
  for (let i = 1; i <= MAX_WORKER_DROP; i++) {
    await mgmt.query(
      `DROP DATABASE IF EXISTS "talent_graph_test_w${i}" WITH (FORCE)`,
    );
  }
  await mgmt.query(`DROP DATABASE IF EXISTS "${TEMPLATE_DB}" WITH (FORCE)`);
}

async function main() {
  const n = workerCount();

  const mgmt = new Client(`${BASE}/postgres`);
  await mgmt.connect();

  try {
    console.error("[setup-pool] dropping existing template + workers...");
    await dropAll(mgmt);

    console.error(`[setup-pool] creating template "${TEMPLATE_DB}"...`);
    await mgmt.query(`CREATE DATABASE "${TEMPLATE_DB}"`);

    // pgvector 需要在每个数据库里独立 CREATE EXTENSION。docker init 的
    // 01-extensions.sql 只对默认 POSTGRES_DB(我们的 postgres-test 是 'postgres')有效。
    console.error("[setup-pool] enabling pgvector in template...");
    const tpl = new Client(`${BASE}/${TEMPLATE_DB}`);
    await tpl.connect();
    await tpl.query("CREATE EXTENSION IF NOT EXISTS vector");
    await tpl.end();

    console.error("[setup-pool] running drizzle migrations on template...");
    const proc = spawn({
      cmd: ["bun", "x", "drizzle-kit", "migrate"],
      env: {
        ...process.env,
        DATABASE_URL: `${BASE}/${TEMPLATE_DB}`,
      },
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await proc.exited;
    if (code !== 0) {
      console.error(`error: drizzle-kit migrate failed (exit ${code})`);
      process.exit(1);
    }

    console.error(`[setup-pool] cloning ${n} worker DB(s)...`);
    for (let i = 1; i <= n; i++) {
      const name = `talent_graph_test_w${i}`;
      await mgmt.query(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DB}"`);
      console.error(`  ✓ ${name}`);
    }

    console.error(`[setup-pool] done. ${n} worker DB(s) ready.`);
  } finally {
    await mgmt.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
