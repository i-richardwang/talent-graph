/**
 * 一次性脚本: 为 gather-entity-aliases eval 8 case 各生成 100 条 csv 输入。
 *
 * 数据源: employee_educations.school distinct 池。该表由上游 parquet
 *   同步入库,normalizeName 仅剥首尾空白 + 零宽字符,语义上等价于
 *   parquet 原生 raw_name。
 *
 * 用法:
 *   bun evals/gather-entity-aliases/seed/build-csv.ts
 *
 * 设计准则:
 *   - 每份 100 条
 *   - 1-10 条真正归属 target (hits) — 期望 alias add
 *   - 0-5 条 case-specific 干扰 (distractors) — 期望跳过 / conflict 处理
 *   - 余条 noise: 从其他高校随机抽,排除 target 关键字回避错噪
 *   - 固定 RANDOM_SEED,csv 进 git。改 case 池后重跑覆盖
 *
 * 输出: seed/csv/case-N-<slug>.csv (单列 raw_name + header)
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";

const RANDOM_SEED = 42;
const TARGET_CSV_LEN = 100;

interface Case {
  slug: string;
  description: string;
  hits: string[];
  distractors: string[];
  noiseExclude: RegExp[];
}

const cases: Case[] = [
  {
    slug: "case-1-tsinghua-baseline",
    description: "target=清华大学; prompt example execution case (prompt 已列归属例子,验证模型照办)",
    hits: [
      "清华大学",
      "Tsinghua University",
      "Tsinghua Univ.",
      "Tsinghua Unverisity",
      "Tsinghua (清华)",
    ],
    distractors: [],
    noiseExclude: [/清华/, /清華/, /Tsinghua/i, /THU/i, /清大/, /水木/, /五道口/, /Tsing\s*Hua/i],
  },
  {
    slug: "case-2-tsinghua-tw-distractor",
    description: "target=清华大学; 含台湾清华同名跨地区干扰",
    hits: [
      "清华大学",
      "Tsinghua University",
      "清华大学美术学院",
      "清华大学新闻与传播学院",
    ],
    distractors: ["国立清华大学", "台湾国立清华大学"],
    noiseExclude: [/清华/, /清華/, /Tsinghua/i, /THU/i, /清大/, /水木/, /五道口/, /Tsing\s*Hua/i],
  },
  {
    slug: "case-3-pku-attached-school",
    description: "target=北京大学; 含附中/中学同名跨层级干扰",
    hits: [
      "北京大学",
      "Peking University",
      "北京大学光华管理学院",
      "北京大学深圳研究生院",
    ],
    distractors: ["北京大学附属中学", "北大附中", "北大附中河南分校"],
    noiseExclude: [/北京大学/, /北大/, /Peking/i, /PKU/i],
  },
  {
    slug: "case-4-pku-affiliated-biz",
    description: "target=北京大学; 含北大青鸟/方正/资源等关联企业挂名干扰 (prompt 给 domain 定义)",
    hits: [
      "北京大学",
      "Peking University",
      "北京大学医学部(原北京医科大学)",
    ],
    distractors: [
      "北大青鸟",
      "北大方正软件技术学院",
      "北大资源研修学院",
      "北京北大方正软件技术学院",
      "北京北大资源研修学院",
    ],
    noiseExclude: [/北京大学/, /北大/, /Peking/i, /PKU/i],
  },
  {
    slug: "case-5-tsinghua-children-art",
    description: "target=清华大学; DB 已挂 child「清华大学美术学院」+ 同 raw alias -> CSV 同 raw 触发 conflict,Agent 应跳过 force(parentId 指 target)",
    hits: [
      "清华大学",
      "Tsinghua University",
      "Tsinghua Univ.",
      "清华大学新闻与传播学院",
    ],
    distractors: [
      "清华大学美术学院",
    ],
    noiseExclude: [/清华/, /清華/, /Tsinghua/i, /THU/i, /清大/, /水木/, /五道口/, /Tsing\s*Hua/i],
  },
  {
    slug: "case-6-tsinghua-conflict-skip",
    description: "target=清华大学; DB child 医学部 + alias 协和已挂 -> CSV 同 raw 触发 conflict_needs_force,Agent 应跳过",
    hits: [
      "清华大学",
      "Tsinghua University",
    ],
    distractors: [
      "清华大学医学部(北京协和医学院)",
    ],
    noiseExclude: [/清华/, /Tsinghua/i, /THU/i, /清大/, /协和/, /医学部/],
  },
  {
    slug: "case-7-tsinghua-conflict-force",
    description: "target=清华大学; DB 故意把「清华大学苏世民书院」错挂到 MIT 实体 -> CSV 同 raw 触发 conflict,Agent 应 --force 覆盖(MIT 与清华无层级关系,书院明确归清华)",
    hits: [
      "清华大学",
      "Tsinghua University",
      "Tsinghua Univ.",
    ],
    distractors: [
      "清华大学苏世民书院",
    ],
    noiseExclude: [/清华/, /Tsinghua/i, /THU/i, /MIT/i, /清大/, /水木/, /五道口/, /苏世民/],
  },
  {
    slug: "case-8-pku-incremental",
    description: "target=北京大学; DB 已 add + 部分 alias 已写 -> 测增量幂等 + 新增",
    hits: [
      "北京大学",
      "Peking University",
      "北京大学光华管理学院",
      "北京大学医学部(原北京医科大学)",
      "北京大学深圳研究生院",
    ],
    distractors: [],
    noiseExclude: [/北京大学/, /北大/, /Peking/i, /PKU/i],
  },
  {
    slug: "case-9-zhejiang-method-baseline",
    description: "target=浙江大学 (prompt 未列 example); 测纯方法层字符变体推断 + raw=target 字面登记",
    hits: [
      "浙江大学",
      "Zhejiang University",
      "Zhejiang Univ.",
      "ZJU",
      "浙大",
    ],
    distractors: [],
    noiseExclude: [/浙江/, /Zhejiang/i, /浙大/, /ZJU/i],
  },
];

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set (load .env.local first)");
  }
  const db = drizzle(process.env.DATABASE_URL);

  const result = await db.execute(sql`
    SELECT DISTINCT school
    FROM employee_educations
    WHERE school IS NOT NULL AND school <> ''
  `);
  const all = (result.rows as Array<{ school: string }>).map((r) => r.school);
  console.error(`[build-csv] loaded ${all.length} distinct schools`);

  const allSet = new Set(all);
  const outDir = path.join(import.meta.dir, "csv");
  fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const rng = makeRng(RANDOM_SEED + i);

    const fixed = [...c.hits, ...c.distractors];
    const missing = fixed.filter((x) => !allSet.has(x));
    if (missing.length > 0) {
      console.warn(`[build-csv] WARN ${c.slug}: ${missing.length} fixed entries not found in DB (will still be written): ${missing.join(", ")}`);
    }

    const fixedSet = new Set(fixed);
    const noisePool = all.filter(
      (s) => !c.noiseExclude.some((re) => re.test(s)) && !fixedSet.has(s),
    );
    const noiseCount = TARGET_CSV_LEN - fixed.length;
    if (noiseCount > noisePool.length) {
      throw new Error(`${c.slug}: noise pool too small (${noisePool.length} < ${noiseCount})`);
    }
    const noise = shuffleInPlace([...noisePool], rng).slice(0, noiseCount);

    const final = shuffleInPlace([...fixed, ...noise], rng);

    const outPath = path.join(outDir, `${c.slug}.csv`);
    fs.writeFileSync(outPath, ["raw_name", ...final].join("\n") + "\n");
    console.error(
      `[build-csv] wrote ${path.relative(process.cwd(), outPath)} ` +
        `(${final.length} rows: ${c.hits.length} hit + ${c.distractors.length} distractor + ${noise.length} noise)`,
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
