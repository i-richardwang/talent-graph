// Drop all test DBs (template + workers). 容器本身保留(volume 也保留)。
// 用法: bun tools/test/teardown-pool.ts
import { config } from "dotenv";
config({ path: ".env.test", quiet: true });

import { Client } from "pg";

const BASE_URL_RAW = process.env.TEST_DATABASE_URL_BASE;
const TEMPLATE_DB =
  process.env.TEST_TEMPLATE_DB ?? "talent_graph_test_template";

if (!BASE_URL_RAW) {
  console.error("error: TEST_DATABASE_URL_BASE not set in .env.test");
  process.exit(1);
}
const BASE = BASE_URL_RAW.replace(/\/$/, "");

const SAFE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
if (!SAFE_NAME.test(TEMPLATE_DB)) {
  console.error(
    `error: TEST_TEMPLATE_DB must match ${SAFE_NAME}, got "${TEMPLATE_DB}"`,
  );
  process.exit(1);
}

const MAX_WORKER_DROP = 16;

async function main() {
  const mgmt = new Client(`${BASE}/postgres`);
  await mgmt.connect();
  try {
    console.error("[teardown-pool] dropping all test DBs...");
    for (let i = 1; i <= MAX_WORKER_DROP; i++) {
      await mgmt.query(
        `DROP DATABASE IF EXISTS "talent_graph_test_w${i}" WITH (FORCE)`,
      );
    }
    await mgmt.query(`DROP DATABASE IF EXISTS "${TEMPLATE_DB}" WITH (FORCE)`);
    console.error("[teardown-pool] done.");
  } finally {
    await mgmt.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
