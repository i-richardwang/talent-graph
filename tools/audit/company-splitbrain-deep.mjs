// Read-only deep audit: root-cause signals + split-brain candidates the cross-ref
// pass missed (two entities for the same company where NEITHER name is the other's
// alias, so a name-leak cross-ref never surfaces them).
// Run: bun --env-file=.env.local run tools/audit/company-splitbrain-deep.mjs
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, params) => (await pool.query(sql, params)).rows;
const section = (t) => console.log(`\n===== ${t} =====`);

try {
  // --- ROOT-CAUSE SIGNAL 1: embedding 空值率 -------------------------------
  // 第二路查重(向量 similar_exists)依赖 name_embedding。批跑期间嵌入 API 系统性
  // fetch failed → 大量 NULL 向量 → 第二路对这些实体静默失效,只剩字面精确兜底。
  section("RC1. company 实体 name_embedding 空值率");
  const [emb] = await q(`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE name_embedding IS NULL) AS null_vec,
           count(*) FILTER (WHERE name_embedding IS NOT NULL) AS has_vec
    FROM entities WHERE entity_type='company'`);
  console.table([{ ...emb, null_pct: ((emb.null_vec / emb.total) * 100).toFixed(1) + "%" }]);

  // --- ROOT-CAUSE SIGNAL 2: 别名向量空值率(entity search 召回也靠它)----------
  section("RC2. company 别名 name_embedding 空值率");
  const [aemb] = await q(`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE name_embedding IS NULL) AS null_vec
    FROM entity_aliases WHERE entity_type='company'`);
  console.table([{ ...aemb, null_pct: ((aemb.null_vec / aemb.total) * 100).toFixed(1) + "%" }]);

  // --- CANDIDATE A: 子串包含裂脑 -------------------------------------------
  // A.canonical 是 B.canonical 的子串(如 高德 ⊂ 高德地图、中能东道 ⊂ 中能东道集团)。
  // 高精度信号:同 company 域、互不为对方别名、互非父子、两边都有任职量(member 信号)。
  // 限制 len>=3 去掉单字噪音;按两边 member 总量排序,先看影响面大的。
  section("CAND-A. 子串包含裂脑候选 (canonical 互含, 非父子, 互非别名)");
  const subset = await q(`
    WITH co AS (
      SELECT id, canonical_name, parent_id,
             (SELECT count(*) FROM entity_aliases a WHERE a.entity_id=e.id) AS n_alias
      FROM entities e WHERE entity_type='company'
    )
    SELECT a.canonical_name AS shorter, a.id AS short_id, a.n_alias AS short_alias,
           b.canonical_name AS longer,  b.id AS long_id,  b.n_alias AS long_alias
    FROM co a JOIN co b
      ON b.canonical_name LIKE '%' || a.canonical_name || '%'
     AND a.id <> b.id
     AND char_length(a.canonical_name) >= 3
     AND char_length(a.canonical_name) < char_length(b.canonical_name)
    WHERE COALESCE(a.parent_id,'00000000-0000-0000-0000-000000000000') <> b.id
      AND COALESCE(b.parent_id,'00000000-0000-0000-0000-000000000000') <> a.id
      AND (a.n_alias + b.n_alias) >= 2
    ORDER BY (a.n_alias + b.n_alias) DESC
    LIMIT 80`);
  console.log(`命中 ${subset.length} 对 (LIMIT 80,按别名总量降序)`);
  console.table(subset.map(r => ({
    shorter: r.shorter, sA: r.short_alias, longer: r.longer, lA: r.long_alias,
  })));

  // --- CANDIDATE B: 向量近邻裂脑(仅在 has_vec 足够时跑)----------------------
  // 对每个有向量的 company 实体,取其最近的另一个 company 实体;similarity>=0.85
  // 且互非父子 → 当年第二路本该拦住的同义实体(中文同名变体/近义)。走 LATERAL 逐行
  // 最近邻,依赖向量索引;无索引会慢,故 LIMIT 源行数并设 statement_timeout。
  if (emb.has_vec > 200) {
    section("CAND-B. 向量近邻裂脑候选 (sim>=0.85, 非父子)");
    await pool.query(`SET statement_timeout = '90s'`);
    try {
      const vec = await q(`
        WITH src AS (
          SELECT id, canonical_name, parent_id, name_embedding
          FROM entities
          WHERE entity_type='company' AND name_embedding IS NOT NULL
        )
        SELECT s.canonical_name AS a, s.id AS a_id,
               nn.canonical_name AS b, nn.id AS b_id,
               round((1 - (s.name_embedding <=> nn.name_embedding))::numeric, 4) AS sim
        FROM src s
        CROSS JOIN LATERAL (
          SELECT t.id, t.canonical_name, t.parent_id, t.name_embedding
          FROM src t
          WHERE t.id <> s.id
          ORDER BY t.name_embedding <=> s.name_embedding
          LIMIT 1
        ) nn
        WHERE (1 - (s.name_embedding <=> nn.name_embedding)) >= 0.85
          AND COALESCE(s.parent_id,'00000000-0000-0000-0000-000000000000') <> nn.id
          AND COALESCE(nn.parent_id,'00000000-0000-0000-0000-000000000000') <> s.id
          AND s.id < nn.id
        ORDER BY sim DESC
        LIMIT 80`);
      console.log(`命中 ${vec.length} 对 (LIMIT 80,sim 降序;s.id<nn.id 去镜像)`);
      console.table(vec.map(r => ({ a: r.a, b: r.b, sim: r.sim })));
    } catch (e) {
      console.log(`向量近邻查询失败/超时(可能无向量索引): ${e.message}`);
    }
  } else {
    section("CAND-B. 跳过:有向量实体不足");
  }
} finally {
  await pool.end();
}
