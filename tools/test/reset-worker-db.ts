// Standalone wrapper around tests/helpers/reset.ts truncateAll(),供 better-skills
// 的 per_run_setup.script 调用——bash 拿不到 TS 函数,所以薄壳脚本接 DATABASE_URL
// 环境变量,转发给 truncateAll。
//
// 用法:DATABASE_URL=postgres://... bun tools/test/reset-worker-db.ts
import { truncateAll } from "../../tests/helpers/reset";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("error: DATABASE_URL not set");
  process.exit(1);
}

await truncateAll(dbUrl);
