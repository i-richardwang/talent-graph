// 把行业/商业模式受控词表 upsert 进 DATABASE_URL 指向的库。
// 单一事实源 = ./industry-taxonomy.json(prod 与 eval 共用本 applier)。
//
//   eval(纯 upsert 进刚 reset 的 worker 库,无副作用):
//     bun tools/seed/apply-industry-taxonomy.mjs
//   prod(带备份 + 删旧 internet 桶):
//     bun --env-file=.env.local tools/seed/apply-industry-taxonomy.mjs \
//        --backup backups/tags-pre-0017-backup.json --delete-internet
//   演练(备份/打印计划,不写库):
//     ... --dry-run
//
// 只动 facet ∈ {industry,business_model} 的桶定义;DO UPDATE 只改 tag_name/facet/
// description(mode/kind 是不可变身份,不动)。纯行级 DML,无 schema 变更。
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const deleteInternet = args.has("--delete-internet");
const backupArg = process.argv.find((a) => a.startsWith("--backup="))?.split("=")[1]
  ?? (args.has("--backup") ? process.argv[process.argv.indexOf("--backup") + 1] : null);
const DELETE_CODE = "ind_internet";

const { buckets } = JSON.parse(
  fs.readFileSync(path.join(HERE, "industry-taxonomy.json"), "utf8"),
);
const indN = buckets.filter((b) => b.facet === "industry").length;
const mdlN = buckets.filter((b) => b.facet === "business_model").length;
if (indN !== 25 || mdlN !== 1) {
  console.error(`[abort] taxonomy 数量异常:${indN} 行业 + ${mdlN} 模式`);
  process.exit(1);
}
console.log(`[source] industry-taxonomy.json:${indN} 行业 + ${mdlN} 模式 = ${buckets.length} 桶`);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

if (backupArg) {
  const all = (await c.query("SELECT * FROM tags ORDER BY tag_code")).rows;
  fs.writeFileSync(path.resolve(backupArg), JSON.stringify(all, null, 2));
  console.log(`[backup] tags 全表 ${all.length} 行 → ${path.resolve(backupArg)}`);
}

if (dryRun) {
  const existing = new Map(
    (await c.query("SELECT tag_code,tag_name,facet,description FROM tags")).rows.map(
      (r) => [r.tag_code, r],
    ),
  );
  const add = buckets.filter((b) => !existing.has(b.code)).map((b) => b.code);
  const upd = buckets.filter(
    (b) =>
      existing.has(b.code) &&
      (existing.get(b.code).description !== b.description ||
        existing.get(b.code).tag_name !== b.name ||
        existing.get(b.code).facet !== b.facet),
  ).map((b) => b.code);
  console.log(`[dry-run] 新增 ${add.length}: ${add.join(", ")}`);
  console.log(`[dry-run] 改名/描述 ${upd.length}: ${upd.join(", ")}`);
  console.log(
    `[dry-run] 删除: ${deleteInternet && existing.has(DELETE_CODE) ? DELETE_CODE : "(无)"}`,
  );
  console.log("[dry-run] 未写库。");
  await c.end();
  process.exit(0);
}

await c.query("BEGIN");
try {
  for (const b of buckets) {
    await c.query(
      `INSERT INTO tags (tag_code,tag_name,mode,kind,facet,description)
       VALUES ($1,$2,'list','company',$3,$4)
       ON CONFLICT (tag_code) DO UPDATE SET
         tag_name=EXCLUDED.tag_name, facet=EXCLUDED.facet,
         description=EXCLUDED.description, updated_at=now()`,
      [b.code, b.name, b.facet, b.description],
    );
  }
  let delN = 0;
  if (deleteInternet) {
    delN = (await c.query("DELETE FROM tags WHERE tag_code=$1", [DELETE_CODE])).rowCount;
  }
  await c.query("COMMIT");
  console.log(`[apply] 提交:upsert ${buckets.length} 桶,删除 ${delN} 行。`);
} catch (e) {
  await c.query("ROLLBACK");
  console.error("[apply] 出错已回滚:", e.message);
  await c.end();
  process.exit(1);
}

const ind = (await c.query("SELECT 1 FROM tags WHERE facet='industry'")).rowCount;
const mdl = (await c.query("SELECT 1 FROM tags WHERE facet='business_model'")).rowCount;
console.log(`[verify] facet=industry ${ind} | business_model ${mdl}`);
await c.end();
