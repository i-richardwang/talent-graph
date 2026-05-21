// Worker DB pool: 通过 advisory lock 在 N 个预克隆的 worker DB 之间分配 lease。
// 一个 spec 文件 beforeAll 调一次 acquire,afterAll 调 release。
//
// 锁实现:在 ${BASE}/postgres 管理库上 pg_try_advisory_lock(LOCK_NS, workerId)。
// 每个 lease 持有自己的 coordinator 连接,session 关闭时锁自动释放,所以即使
// 测试进程崩了也不会死锁。

import { config } from "dotenv";
config({ path: ".env.test", quiet: true });

import { Client } from "pg";

const BASE_URL_RAW = process.env.TEST_DATABASE_URL_BASE;
if (!BASE_URL_RAW) {
  throw new Error(
    "TEST_DATABASE_URL_BASE not set. Did you create .env.test and run `bun run test:setup`?",
  );
}
const BASE = BASE_URL_RAW.replace(/\/$/, "");

const WORKER_COUNT = Number(process.env.TEST_WORKER_COUNT ?? 4);

// 任意常量,够偏门避免和别的项目同库 advisory lock 撞。
const LOCK_NS = 0x7a1e7fad;

const ACQUIRE_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 50;

export interface Lease {
  workerId: number;
  dbUrl: string;
  release: () => Promise<void>;
}

/**
 * 占住一个 worker DB 直到 release()。如 30s 内拿不到就抛(意味着 N 个都被占,
 * 调高 TEST_WORKER_COUNT 或检查是否有泄漏的 lease)。
 */
export async function acquire(): Promise<Lease> {
  const client = new Client(`${BASE}/postgres`);
  await client.connect();

  const start = Date.now();
  try {
    while (true) {
      for (let id = 1; id <= WORKER_COUNT; id++) {
        const res = await client.query<{ got: boolean }>(
          `SELECT pg_try_advisory_lock($1, $2) AS got`,
          [LOCK_NS, id],
        );
        if (res.rows[0].got) {
          let released = false;
          return {
            workerId: id,
            dbUrl: `${BASE}/talent_graph_test_w${id}`,
            release: async () => {
              if (released) return;
              released = true;
              try {
                await client.query(
                  `SELECT pg_advisory_unlock($1, $2)`,
                  [LOCK_NS, id],
                );
              } finally {
                await client.end();
              }
            },
          };
        }
      }
      if (Date.now() - start > ACQUIRE_TIMEOUT_MS) {
        throw new Error(
          `pool.acquire: no worker DB available after ${ACQUIRE_TIMEOUT_MS}ms ` +
            `(WORKER_COUNT=${WORKER_COUNT}). Either bump TEST_WORKER_COUNT and ` +
            `re-run test:setup, or check for leaked leases.`,
        );
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  } catch (e) {
    await client.end().catch(() => {});
    throw e;
  }
}
